-- See What Others Don't See: Phase 1 data model
-- Storage convention: photos/{experience_id}/{participant_id}/{photo_id}/{size}.webp

create extension if not exists "pgcrypto";

create type public.experience_state as enum ('draft', 'active', 'archived');
create type public.experience_phase as enum ('welcome', 'exploration', 'selection', 'presentation', 'reveal', 'finished');
create type public.photo_status as enum ('visible', 'hidden', 'deleted');
create type public.mosaic_status as enum ('draft', 'processing', 'ready', 'failed');

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  place text not null,
  join_code text not null unique,
  start_date date,
  end_date date,
  supported_languages text[] not null default array['en']::text[],
  state public.experience_state not null default 'draft',
  current_phase public.experience_phase not null default 'welcome',
  selection_enabled boolean not null default true,
  story_count smallint not null default 3 check (story_count between 1 and 12),
  mosaic_visible boolean not null default false,
  target_image_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null check (char_length(trim(first_name)) between 1 and 60),
  country_code text check (country_code is null or country_code in ('ES', 'IT')),
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'es', 'it')),
  onboarding_completed boolean not null default false,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index participants_experience_user_idx on public.participants(experience_id, user_id) where user_id is not null;
create index participants_experience_idx on public.participants(experience_id, created_at);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  name text not null,
  symbol text not null default '◌',
  accent text not null default 'wood',
  display_order smallint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (experience_id, name)
);

create index teams_experience_idx on public.teams(experience_id, display_order);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (team_id, participant_id),
  unique (participant_id)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  slug text not null,
  category text not null default 'attention',
  difficulty text,
  required boolean not null default false,
  secret boolean not null default false,
  assigned_team_id uuid references public.teams(id) on delete set null,
  max_photos smallint not null default 1 check (max_photos between 1 and 20),
  unlock_phase public.experience_phase not null default 'exploration',
  is_active boolean not null default true,
  display_order smallint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (experience_id, slug)
);

create index challenges_experience_idx on public.challenges(experience_id, is_active, display_order);

create table public.challenge_translations (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  locale text not null check (locale in ('en', 'es', 'it')),
  title text not null,
  description text not null,
  hint text,
  primary key (challenge_id, locale)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  challenge_id uuid not null references public.challenges(id) on delete restrict,
  storage_path text not null,
  thumbnail_path text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  alt_text text,
  exif_stripped boolean not null default false,
  status public.photo_status not null default 'visible',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index photos_experience_created_idx on public.photos(experience_id, created_at desc);
create index photos_challenge_idx on public.photos(experience_id, challenge_id);
create index photos_team_idx on public.photos(experience_id, team_id);

create table public.story_selections (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  position smallint not null check (position between 1 and 12),
  created_at timestamptz not null default timezone('utc', now()),
  unique (team_id, photo_id),
  unique (team_id, position)
);

create index story_selections_experience_idx on public.story_selections(experience_id, team_id, position);

create table public.mosaics (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  target_image_path text not null,
  generated_image_path text,
  status public.mosaic_status not null default 'draft',
  algorithm_version text not null default 'tone-opacity-v1',
  generation_seed bigint not null default 1,
  generated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index mosaics_one_current_idx on public.mosaics(experience_id) where status <> 'failed';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger experiences_set_updated_at before update on public.experiences for each row execute procedure public.set_updated_at();
create trigger participants_set_updated_at before update on public.participants for each row execute procedure public.set_updated_at();
create trigger teams_set_updated_at before update on public.teams for each row execute procedure public.set_updated_at();
create trigger challenges_set_updated_at before update on public.challenges for each row execute procedure public.set_updated_at();
create trigger photos_set_updated_at before update on public.photos for each row execute procedure public.set_updated_at();
create trigger mosaics_set_updated_at before update on public.mosaics for each row execute procedure public.set_updated_at();

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.is_experience_member(target_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants
    where experience_id = target_experience_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.is_experience_admin(target_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants
    where experience_id = target_experience_id
      and user_id = auth.uid()
      and is_admin = true
      and is_active = true
  );
$$;

create or replace function public.is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.participants p on p.id = tm.participant_id
    where tm.team_id = target_team_id
      and p.user_id = auth.uid()
      and p.is_active = true
  );
$$;

create or replace function public.experience_allows_photo(target_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.experiences
    where id = target_experience_id
      and state = 'active'
      and current_phase = 'exploration'
  );
$$;

create or replace function public.experience_allows_story(target_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.experiences
    where id = target_experience_id
      and state = 'active'
      and current_phase = 'selection'
  );
$$;

-- The join code is only exposed through this narrow lookup, not through a table policy.
create or replace function public.lookup_experience_by_join_code(p_join_code text)
returns table (id uuid, title text, place text, supported_languages text[], current_phase public.experience_phase)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.place, e.supported_languages, e.current_phase
  from public.experiences e
  where e.state = 'active'
    and upper(e.join_code) = upper(trim(p_join_code));
$$;

revoke all on function public.lookup_experience_by_join_code(text) from public;
grant execute on function public.lookup_experience_by_join_code(text) to anon, authenticated;

-- Joining is intentionally a controlled operation. The later anonymous-auth flow calls this RPC after a session exists.
create or replace function public.join_experience(
  p_join_code text,
  p_first_name text,
  p_country_code text default null,
  p_preferred_locale text default 'en'
)
returns table (participant_id uuid, experience_id uuid, team_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_experience_id uuid;
  new_participant_id uuid;
  assigned_team_id uuid;
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

  insert into public.participants (experience_id, user_id, first_name, country_code, preferred_locale)
  values (target_experience_id, auth.uid(), trim(p_first_name), p_country_code, coalesce(p_preferred_locale, 'en'))
  on conflict (experience_id, user_id) where user_id is not null
  do update set first_name = excluded.first_name, country_code = excluded.country_code, preferred_locale = excluded.preferred_locale, is_active = true
  returning id into new_participant_id;

  select t.id into assigned_team_id
  from public.teams t
  where t.experience_id = target_experience_id
  order by (select count(*) from public.team_members tm where tm.team_id = t.id), t.display_order
  limit 1;

  if assigned_team_id is not null then
    insert into public.team_members (team_id, participant_id)
    values (assigned_team_id, new_participant_id)
    on conflict (participant_id) do update set team_id = excluded.team_id;
  end if;

  return query select new_participant_id, target_experience_id, assigned_team_id;
end;
$$;

revoke all on function public.join_experience(text, text, text, text) from public;
grant execute on function public.join_experience(text, text, text, text) to authenticated;

alter table public.experiences enable row level security;
alter table public.participants enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_translations enable row level security;
alter table public.photos enable row level security;
alter table public.story_selections enable row level security;
alter table public.mosaics enable row level security;

create policy experiences_member_select on public.experiences for select using (public.is_experience_member(id));
create policy experiences_admin_insert on public.experiences for insert with check (auth.uid() is not null);
create policy experiences_admin_update on public.experiences for update using (public.is_experience_admin(id)) with check (public.is_experience_admin(id));

create policy participants_member_select on public.participants for select using (public.is_experience_member(experience_id));
create policy participants_self_update on public.participants for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy teams_member_select on public.teams for select using (public.is_experience_member(experience_id));
create policy teams_admin_write on public.teams for all using (public.is_experience_admin(experience_id)) with check (public.is_experience_admin(experience_id));

create policy team_members_member_select on public.team_members for select using (
  exists (select 1 from public.teams t where t.id = team_id and public.is_experience_member(t.experience_id))
);
create policy team_members_admin_write on public.team_members for all using (
  exists (select 1 from public.teams t where t.id = team_id and public.is_experience_admin(t.experience_id))
) with check (
  exists (select 1 from public.teams t where t.id = team_id and public.is_experience_admin(t.experience_id))
);

create policy challenges_member_select on public.challenges for select using (public.is_experience_member(experience_id));
create policy challenges_admin_write on public.challenges for all using (public.is_experience_admin(experience_id)) with check (public.is_experience_admin(experience_id));
create policy challenge_translations_member_select on public.challenge_translations for select using (
  exists (select 1 from public.challenges c where c.id = challenge_id and public.is_experience_member(c.experience_id))
);
create policy challenge_translations_admin_write on public.challenge_translations for all using (
  exists (select 1 from public.challenges c where c.id = challenge_id and public.is_experience_admin(c.experience_id))
) with check (
  exists (select 1 from public.challenges c where c.id = challenge_id and public.is_experience_admin(c.experience_id))
);

create policy photos_member_select on public.photos for select using (
  public.is_experience_member(experience_id) and status <> 'deleted'
);
create policy photos_owner_insert on public.photos for insert with check (
  public.is_experience_member(experience_id)
  and public.experience_allows_photo(experience_id)
  and exists (select 1 from public.participants p where p.id = participant_id and p.experience_id = experience_id and p.user_id = auth.uid() and p.is_active = true)
  and (team_id is null or public.is_team_member(team_id))
);
create policy photos_owner_update on public.photos for update using (
  exists (select 1 from public.participants p where p.id = participant_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.participants p where p.id = participant_id and p.user_id = auth.uid())
);
create policy photos_owner_delete on public.photos for delete using (
  public.is_experience_admin(experience_id)
  or exists (select 1 from public.participants p where p.id = participant_id and p.user_id = auth.uid())
);

create policy story_selections_member_select on public.story_selections for select using (public.is_experience_member(experience_id));
create policy story_selections_team_insert on public.story_selections for insert with check (
  public.is_experience_member(experience_id)
  and public.experience_allows_story(experience_id)
  and public.is_team_member(team_id)
  and exists (select 1 from public.photos p where p.id = photo_id and p.experience_id = experience_id and p.team_id = team_id and p.status = 'visible')
);
create policy story_selections_team_update on public.story_selections for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy story_selections_team_delete on public.story_selections for delete using (public.is_team_member(team_id) or public.is_experience_admin(experience_id));

create policy mosaics_member_select on public.mosaics for select using (
  public.is_experience_admin(experience_id)
  or (public.is_experience_member(experience_id) and exists (select 1 from public.experiences e where e.id = experience_id and (e.mosaic_visible or e.current_phase in ('reveal', 'finished'))))
);
create policy mosaics_admin_write on public.mosaics for all using (public.is_experience_admin(experience_id)) with check (public.is_experience_admin(experience_id));

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false), ('mosaics', 'mosaics', false)
on conflict (id) do update set public = excluded.public;

create policy photo_storage_member_read on storage.objects for select using (
  bucket_id = 'photos'
  and public.is_experience_member(public.safe_uuid(split_part(name, '/', 1)))
);
create policy photo_storage_member_upload on storage.objects for insert with check (
  bucket_id = 'photos'
  and public.is_experience_member(public.safe_uuid(split_part(name, '/', 1)))
  and exists (select 1 from public.participants p where p.id = public.safe_uuid(split_part(name, '/', 2)) and p.user_id = auth.uid() and p.experience_id = public.safe_uuid(split_part(name, '/', 1)))
);
create policy photo_storage_owner_update on storage.objects for update using (
  bucket_id = 'photos'
  and exists (select 1 from public.participants p where p.id = public.safe_uuid(split_part(name, '/', 2)) and p.user_id = auth.uid())
);
create policy photo_storage_owner_delete on storage.objects for delete using (
  bucket_id = 'photos'
  and (public.is_experience_admin(public.safe_uuid(split_part(name, '/', 1))) or exists (select 1 from public.participants p where p.id = public.safe_uuid(split_part(name, '/', 2)) and p.user_id = auth.uid()))
);

create policy mosaic_storage_member_read on storage.objects for select using (
  bucket_id = 'mosaics'
  and public.is_experience_member(public.safe_uuid(split_part(name, '/', 1)))
);
create policy mosaic_storage_admin_write on storage.objects for all using (
  bucket_id = 'mosaics' and public.is_experience_admin(public.safe_uuid(split_part(name, '/', 1)))
) with check (
  bucket_id = 'mosaics' and public.is_experience_admin(public.safe_uuid(split_part(name, '/', 1)))
);
