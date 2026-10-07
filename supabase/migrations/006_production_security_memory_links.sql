-- Production security boundaries and revocable cross-device memory links.
--
-- Memory URLs use a 256-bit bearer token in the URL fragment. Only its
-- SHA-256 digest is stored. The public resolver returns a deliberately narrow
-- snapshot and never exposes participant identities, join codes, or hashes.

create table public.memory_links (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  token_hash bytea not null unique,
  token_hint text not null check (token_hint ~ '^[0-9a-f]{8}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references public.participants(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  check (expires_at > created_at)
);

create index memory_links_experience_idx
  on public.memory_links(experience_id, created_at desc);
create index memory_links_active_expiry_idx
  on public.memory_links(expires_at)
  where revoked_at is null;

alter table public.memory_links enable row level security;

-- No direct table policies are intentional. Link lifecycle and resolution are
-- RPC-only so token hashes cannot be selected through PostgREST.

create or replace function public.issue_memory_link(
  p_experience_id uuid,
  p_valid_for_days integer default 30
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  issuer_id uuid;
  raw_token text;
  link_id uuid;
  link_expiry timestamptz;
begin
  if p_valid_for_days is null or p_valid_for_days < 1 or p_valid_for_days > 365 then
    raise exception 'Memory links must be valid for between 1 and 365 days';
  end if;

  select p.id into issuer_id
  from public.participants p
  where p.experience_id = p_experience_id
    and p.user_id = auth.uid()
    and p.is_admin = true
    and p.is_active = true;

  if issuer_id is null then
    raise exception 'Administrator access is required';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  link_expiry := timezone('utc', now()) + make_interval(days => p_valid_for_days);

  insert into public.memory_links (
    experience_id,
    token_hash,
    token_hint,
    expires_at,
    created_by
  )
  values (
    p_experience_id,
    digest(raw_token, 'sha256'),
    right(raw_token, 8),
    link_expiry,
    issuer_id
  )
  returning memory_links.id into link_id;

  return query select link_id, raw_token, link_expiry;
end;
$$;

revoke all on function public.issue_memory_link(uuid, integer) from public;
grant execute on function public.issue_memory_link(uuid, integer) to authenticated;

create or replace function public.list_memory_links(p_experience_id uuid)
returns table (
  id uuid,
  token_hint text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ml.id, ml.token_hint, ml.expires_at, ml.revoked_at, ml.created_at
  from public.memory_links ml
  where ml.experience_id = p_experience_id
    and public.is_experience_admin(p_experience_id)
  order by ml.created_at desc;
$$;

revoke all on function public.list_memory_links(uuid) from public;
grant execute on function public.list_memory_links(uuid) to authenticated;

create or replace function public.revoke_memory_link(
  p_experience_id uuid,
  p_link_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_experience_admin(p_experience_id) then
    raise exception 'Administrator access is required';
  end if;

  update public.memory_links
  set revoked_at = timezone('utc', now())
  where id = p_link_id
    and experience_id = p_experience_id
    and revoked_at is null;
  return found;
end;
$$;

revoke all on function public.revoke_memory_link(uuid, uuid) from public;
grant execute on function public.revoke_memory_link(uuid, uuid) to authenticated;

create or replace function public.resolve_memory_link(
  p_slug text,
  p_token text,
  p_locale text default 'en'
)
returns table (payload jsonb)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'experience', jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'title', e.title,
      'description', coalesce(e.description, ''),
      'place', e.place,
      'startDate', e.start_date,
      'endDate', e.end_date,
      'phase', e.current_phase,
      'mosaicVisible', e.mosaic_visible
    ),
    'generatedMosaicPath', (
      select m.generated_image_path
      from public.mosaics m
      where m.experience_id = e.id
        and m.status = 'ready'
        and m.generated_image_path is not null
      order by m.generated_at desc nulls last, m.created_at desc
      limit 1
    ),
    'participantCount', (
      select count(*)
      from public.participants p
      where p.experience_id = e.id
        and p.is_active = true
        and p.is_admin = false
    ),
    'totalPhotos', (
      select count(*)
      from public.photos p
      where p.experience_id = e.id
        and p.status = 'visible'
    ),
    'stories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', ss.position,
          'teamId', t.id,
          'teamName', t.name,
          'teamSymbol', t.symbol,
          'photoId', p.id,
          'challengeId', p.challenge_id,
          'challengeTitle', coalesce(localized.title, english.title, ''),
          'caption', coalesce(p.caption, ''),
          'altText', coalesce(p.alt_text, p.caption, ''),
          'createdAt', p.created_at,
          'storagePath', p.storage_path,
          'thumbnailPath', p.thumbnail_path
        )
        order by t.display_order, ss.position
      )
      from public.story_selections ss
      join public.teams t
        on t.id = ss.team_id
       and t.experience_id = ss.experience_id
      join public.photos p
        on p.id = ss.photo_id
       and p.experience_id = ss.experience_id
       and p.team_id = ss.team_id
       and p.status = 'visible'
      left join public.challenge_translations localized
        on localized.challenge_id = p.challenge_id
       and localized.locale = case when p_locale in ('en', 'es', 'it') then p_locale else 'en' end
      left join public.challenge_translations english
        on english.challenge_id = p.challenge_id
       and english.locale = 'en'
      where ss.experience_id = e.id
    ), '[]'::jsonb)
  )
  from public.memory_links ml
  join public.experiences e on e.id = ml.experience_id
  where char_length(coalesce(p_token, '')) = 64
    and p_token ~ '^[0-9a-f]{64}$'
    and ml.token_hash = digest(p_token, 'sha256')
    and ml.revoked_at is null
    and ml.expires_at > timezone('utc', now())
    and e.slug = lower(trim(p_slug))
    and e.mosaic_visible = true
    and e.current_phase in ('reveal', 'finished');
$$;

revoke all on function public.resolve_memory_link(text, text, text) from public;
grant execute on function public.resolve_memory_link(text, text, text) to anon, authenticated;

-- Participant self-service is intentionally RPC-only. The former broad update
-- policy allowed a participant to set is_admin or move between experiences.
drop policy if exists participants_self_update on public.participants;

create or replace function public.complete_participant_onboarding(p_participant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.participants
  set onboarding_completed = true
  where id = p_participant_id
    and user_id = auth.uid()
    and is_active = true;
  return found;
end;
$$;

revoke all on function public.complete_participant_onboarding(uuid) from public;
grant execute on function public.complete_participant_onboarding(uuid) to authenticated;

-- Rejoining must not undo an administrator suspension. Existing active
-- participants may refresh their display metadata; inactive participants are
-- rejected until an administrator restores access.
create or replace function public.join_experience(
  p_join_code text,
  p_first_name text,
  p_country_code text default null,
  p_preferred_locale text default 'en'
)
returns table (participant_id uuid, experience_id uuid, team_id uuid, onboarding_completed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_experience_id uuid;
  joined_participant_id uuid;
  assigned_team_id uuid;
  has_completed_onboarding boolean;
  participant_is_active boolean;
begin
  if auth.uid() is null then
    raise exception 'An authenticated session is required to join';
  end if;

  select e.id into target_experience_id
  from public.experiences e
  where e.state = 'active'
    and upper(e.join_code) = upper(trim(p_join_code));

  if target_experience_id is null then
    raise exception 'Experience not found';
  end if;

  select p.id, p.is_active, p.onboarding_completed
    into joined_participant_id, participant_is_active, has_completed_onboarding
  from public.participants p
  where p.experience_id = target_experience_id
    and p.user_id = auth.uid()
  for update;

  if joined_participant_id is not null and not participant_is_active then
    raise exception 'Participant access is paused';
  end if;

  if joined_participant_id is null then
    insert into public.participants (experience_id, user_id, first_name, country_code, preferred_locale)
    values (target_experience_id, auth.uid(), trim(p_first_name), p_country_code, coalesce(p_preferred_locale, 'en'))
    returning id, participants.onboarding_completed
      into joined_participant_id, has_completed_onboarding;
  else
    update public.participants
    set first_name = trim(p_first_name),
        country_code = p_country_code,
        preferred_locale = coalesce(p_preferred_locale, 'en')
    where id = joined_participant_id;
  end if;

  select tm.team_id into assigned_team_id
  from public.team_members tm
  where tm.participant_id = joined_participant_id;

  if assigned_team_id is null then
    select t.id into assigned_team_id
    from public.teams t
    where t.experience_id = target_experience_id
    order by (select count(*) from public.team_members tm where tm.team_id = t.id), t.display_order
    limit 1;

    if assigned_team_id is not null then
      insert into public.team_members (team_id, participant_id)
      values (assigned_team_id, joined_participant_id)
      on conflict (participant_id) do nothing;
    end if;
  end if;

  return query select joined_participant_id, target_experience_id, assigned_team_id, has_completed_onboarding;
end;
$$;

revoke all on function public.join_experience(text, text, text, text) from public;
grant execute on function public.join_experience(text, text, text, text) to authenticated;

-- Photo metadata is immutable to participants after creation. Moderation uses
-- the admin policy and participant deletion remains phase-aware.
drop policy if exists photos_owner_update on public.photos;

-- Story marks are private candidates and writes must pass through the guarded
-- toggle RPC, which derives the team from the authenticated participant.
drop policy if exists story_marks_member_select on public.story_marks;
drop policy if exists story_marks_owner_insert on public.story_marks;

create policy story_marks_owner_select on public.story_marks for select using (
  public.is_experience_admin(experience_id)
  or exists (
    select 1
    from public.participants p
    where p.id = public.story_marks.participant_id
      and p.user_id = auth.uid()
      and p.is_active = true
  )
);

drop policy if exists story_selections_team_delete on public.story_selections;
create policy story_selections_team_delete on public.story_selections for delete using (
  public.is_experience_admin(experience_id)
  or (
    public.experience_allows_story(experience_id)
    and public.is_team_member(team_id)
  )
);

-- Restrict uploads to the exact object shapes accepted by create_photo_record
-- and prevent owners from deleting storage after the exploration phase.
drop policy if exists photo_storage_member_upload on storage.objects;
create policy photo_storage_member_upload on storage.objects for insert with check (
  bucket_id = 'photos'
  and array_length(string_to_array(name, '/'), 1) = 4
  and public.safe_uuid(split_part(name, '/', 3)) is not null
  and split_part(name, '/', 4) in (
    'image.webp', 'image.jpg', 'thumbnail.webp', 'thumbnail.jpg'
  )
  and public.is_experience_member(public.safe_uuid(split_part(name, '/', 1)))
  and public.experience_allows_photo(public.safe_uuid(split_part(name, '/', 1)))
  and exists (
    select 1
    from public.participants p
    where p.id = public.safe_uuid(split_part(name, '/', 2))
      and p.user_id = auth.uid()
      and p.is_active = true
      and p.experience_id = public.safe_uuid(split_part(name, '/', 1))
  )
);

drop policy if exists photo_storage_owner_update on storage.objects;
drop policy if exists photo_storage_owner_delete on storage.objects;
create policy photo_storage_owner_delete on storage.objects for delete using (
  bucket_id = 'photos'
  and (
    public.is_experience_admin(public.safe_uuid(split_part(name, '/', 1)))
    or (
      public.experience_allows_photo(public.safe_uuid(split_part(name, '/', 1)))
      and exists (
        select 1
        from public.participants p
        where p.id = public.safe_uuid(split_part(name, '/', 2))
          and p.user_id = auth.uid()
          and p.is_active = true
      )
    )
  )
);

-- Only an already-provisioned, non-anonymous administrator may create another
-- experience. The initial production administrator is provisioned out-of-band.
create or replace function public.create_experience_admin(
  p_slug text,
  p_title text,
  p_place text,
  p_first_name text,
  p_join_code text,
  p_supported_languages text[] default array['en']::text[]
)
returns table (experience_id uuid, participant_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_experience_id uuid;
  new_participant_id uuid;
begin
  if auth.uid() is null
    or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    or not exists (
      select 1 from public.participants p
      where p.user_id = auth.uid()
        and p.is_admin = true
        and p.is_active = true
    ) then
    raise exception 'An existing administrator identity is required';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 1
    or char_length(trim(coalesce(p_place, ''))) < 1 then
    raise exception 'A title and place are required';
  end if;

  insert into public.experiences (
    slug, title, place, join_code, supported_languages, state, current_phase
  )
  values (
    lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g')),
    trim(p_title),
    trim(p_place),
    upper(trim(p_join_code)),
    coalesce(p_supported_languages, array['en']::text[]),
    'draft',
    'welcome'
  )
  returning id into new_experience_id;

  insert into public.participants (
    experience_id, user_id, first_name, is_admin, is_active
  )
  values (
    new_experience_id, auth.uid(), trim(p_first_name), true, true
  )
  returning id into new_participant_id;

  return query select new_experience_id, new_participant_id;
end;
$$;

revoke all on function public.create_experience_admin(text, text, text, text, text, text[]) from public;
grant execute on function public.create_experience_admin(text, text, text, text, text, text[]) to authenticated;

-- Phase changes are delivered to joined clients over Supabase Realtime.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'experiences'
  ) then
    alter publication supabase_realtime add table public.experiences;
  end if;
end;
$$;
