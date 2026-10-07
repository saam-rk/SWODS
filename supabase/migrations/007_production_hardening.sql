-- Production audit: enforce permissions at the database boundary, not in UI.
-- Apply after 005. Existing administrators must be reviewed for unauthorized
-- promotion before deployment. This migration does not trust participant input.

-- Only profile fields may be changed directly. Admin operations use definer RPCs.
revoke update on public.participants from authenticated;
grant update (first_name, country_code, preferred_locale, onboarding_completed) on public.participants to authenticated;
drop policy if exists participants_self_update on public.participants;
create policy participants_self_update on public.participants for update
  using (user_id = auth.uid() and is_active) with check (user_id = auth.uid() and is_active);

-- Fix OUT-parameter ambiguity and never reactivate a paused participant on join.
create or replace function public.join_experience(p_join_code text, p_first_name text, p_country_code text default null, p_preferred_locale text default 'en')
returns table (participant_id uuid, experience_id uuid, team_id uuid, onboarding_completed boolean)
language plpgsql security definer set search_path = public as $$
declare
  event_id uuid;
  person public.participants;
  assigned_team uuid;
begin
  if auth.uid() is null then raise exception 'An authenticated session is required'; end if;
  if p_first_name is null or char_length(trim(p_first_name)) not between 2 and 60 then raise exception 'A name of 2–60 characters is required'; end if;
  select e.id into event_id from public.experiences e
    where e.state = 'active' and upper(e.join_code) = upper(trim(p_join_code)) for update;
  if event_id is null then raise exception 'Experience not found'; end if;
  select p.* into person from public.participants p where p.experience_id = event_id and p.user_id = auth.uid();
  if person.id is not null and not person.is_active then raise exception 'Participant access is paused'; end if;
  if person.id is null then
    insert into public.participants as p (experience_id, user_id, first_name, country_code, preferred_locale)
      values (event_id, auth.uid(), trim(p_first_name), p_country_code, coalesce(p_preferred_locale, 'en')) returning p.* into person;
  else
    update public.participants p set first_name = trim(p_first_name), country_code = p_country_code, preferred_locale = coalesce(p_preferred_locale, 'en')
      where p.id = person.id returning p.* into person;
  end if;
  select tm.team_id into assigned_team from public.team_members tm where tm.participant_id = person.id;
  if assigned_team is null then
    select t.id into assigned_team from public.teams t where t.experience_id = event_id
      order by (select count(*) from public.team_members tm where tm.team_id = t.id), t.display_order, t.id limit 1;
    if assigned_team is not null then
      insert into public.team_members(team_id, participant_id) values (assigned_team, person.id);
    end if;
  end if;
  return query select person.id, event_id, assigned_team, person.onboarding_completed;
end; $$;

-- Bootstrap is an operator action. Creating subsequent events requires a
-- non-anonymous identity already provisioned as an administrator.
create or replace function public.create_experience_admin(p_slug text, p_title text, p_place text, p_first_name text, p_join_code text, p_supported_languages text[] default array['en']::text[])
returns table (experience_id uuid, participant_id uuid)
language plpgsql security definer set search_path = public as $$
declare event_id uuid; person_id uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, true)
    or not exists (select 1 from public.participants p where p.user_id=auth.uid() and p.is_admin and p.is_active)
  then raise exception 'A provisioned administrator is required'; end if;
  if trim(p_slug) !~ '^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$' or char_length(trim(p_slug)) > 80
    or char_length(trim(p_title)) not between 1 and 160 or char_length(trim(p_place)) not between 1 and 160
    or upper(trim(p_join_code)) !~ '^[A-Z0-9-]{4,32}$'
    or cardinality(p_supported_languages) not between 1 and 3
    or not p_supported_languages <@ array['en','es','it']::text[]
  then raise exception 'Invalid experience settings'; end if;
  insert into public.experiences(slug,title,place,join_code,supported_languages)
    values(lower(trim(p_slug)),trim(p_title),trim(p_place),upper(trim(p_join_code)),p_supported_languages) returning id into event_id;
  insert into public.participants(experience_id,user_id,first_name,is_admin,onboarding_completed)
    values(event_id,auth.uid(),trim(p_first_name),true,true) returning id into person_id;
  return query select event_id,person_id;
end; $$;

-- Prevent bypassing photo ownership/phase/record validation through UPDATE.
drop policy if exists photos_owner_update on public.photos;
drop policy photos_member_select on public.photos;
create policy photos_member_select on public.photos for select using (
  public.is_experience_admin(experience_id) or (public.is_experience_member(experience_id) and status = 'visible')
);
drop policy challenges_member_select on public.challenges;
create policy challenges_member_select on public.challenges for select using (
  public.is_experience_admin(experience_id) or (public.is_experience_member(experience_id)
    and (not secret or public.is_team_member(assigned_team_id)))
);
-- Translation SELECT inherits the challenge's RLS through its EXISTS query.

-- Private notes are visible only to their author; writes are RPC-only.
drop policy if exists story_marks_member_select on public.story_marks;
drop policy if exists story_marks_owner_select on public.story_marks;
create policy story_marks_owner_select on public.story_marks for select using (
  exists (select 1 from public.participants p where p.id=participant_id and p.user_id=auth.uid() and p.is_active)
);
drop policy if exists story_marks_owner_insert on public.story_marks;
drop policy story_selections_team_delete on public.story_selections;
create policy story_selections_team_delete on public.story_selections for delete using (
  public.is_experience_admin(experience_id) or (public.is_team_member(team_id) and public.experience_allows_story(experience_id)
    and exists(select 1 from public.experiences e where e.id=experience_id and e.selection_enabled))
);

create or replace function public.select_story_photo(p_experience_id uuid,p_team_id uuid,p_photo_id uuid)
returns table (id uuid,team_id uuid,photo_id uuid,"position" smallint)
language plpgsql security definer set search_path=public as $$
declare story_limit smallint; next_position smallint;
begin
  -- One lock per team serializes additions, removal, and ordering.
  perform 1 from public.teams t where t.id=p_team_id and t.experience_id=p_experience_id for update;
  if not found or not public.is_team_member(p_team_id) then raise exception 'Team membership is required'; end if;
  select e.story_count into story_limit from public.experiences e where e.id=p_experience_id and e.state='active' and e.current_phase='selection' and e.selection_enabled;
  if story_limit is null then raise exception 'Team story selection is not open'; end if;
  if not exists(select 1 from public.photos p where p.id=p_photo_id and p.experience_id=p_experience_id and p.team_id=p_team_id and p.status='visible')
    then raise exception 'Choose a visible photograph from your team'; end if;
  if exists(select 1 from public.story_selections s where s.team_id=p_team_id and s.photo_id=p_photo_id) then
    return query select s.id,s.team_id,s.photo_id,s.position from public.story_selections s where s.team_id=p_team_id and s.photo_id=p_photo_id; return;
  end if;
  select n::smallint into next_position from generate_series(1,story_limit) n
    where not exists(select 1 from public.story_selections s where s.team_id=p_team_id and s.position=n) order by n limit 1;
  if next_position is null then raise exception 'Your team has chosen its full story'; end if;
  return query insert into public.story_selections as s(experience_id,team_id,photo_id,position)
    values(p_experience_id,p_team_id,p_photo_id,next_position) returning s.id,s.team_id,s.photo_id,s.position;
end; $$;

create or replace function public.move_story_selection(p_experience_id uuid,p_team_id uuid,p_photo_id uuid,p_direction smallint)
returns table (id uuid,team_id uuid,photo_id uuid,"position" smallint)
language plpgsql security definer set search_path=public as $$
declare current_row public.story_selections; target_row public.story_selections;
begin
  perform 1 from public.teams t where t.id=p_team_id and t.experience_id=p_experience_id for update;
  if not found or not public.is_team_member(p_team_id) or p_direction is null or p_direction not in (-1,1)
    or not public.experience_allows_story(p_experience_id)
    or not exists(select 1 from public.experiences e where e.id=p_experience_id and e.selection_enabled)
    then raise exception 'Team story selection is not open'; end if;
  select s.* into current_row from public.story_selections s where s.team_id=p_team_id and s.photo_id=p_photo_id;
  if current_row.id is null then raise exception 'Photograph is not selected'; end if;
  select s.* into target_row from public.story_selections s where s.team_id=p_team_id
    and (s.position-current_row.position)*p_direction > 0 order by abs(s.position-current_row.position) limit 1;
  if target_row.id is not null then
    delete from public.story_selections s where s.id=current_row.id;
    update public.story_selections s set position=current_row.position where s.id=target_row.id;
    insert into public.story_selections values(current_row.id,current_row.experience_id,current_row.team_id,current_row.photo_id,target_row.position,current_row.created_at);
  end if;
  return query select s.id,s.team_id,s.photo_id,s.position from public.story_selections s where s.id=current_row.id;
end; $$;

-- Hidden files cannot be listed or freshly signed by participants. Already
-- issued signed URLs remain bearer URLs until their short expiry.
drop policy photo_storage_member_read on storage.objects;
create policy photo_storage_member_read on storage.objects for select using (
  bucket_id='photos' and (public.is_experience_admin(public.safe_uuid(split_part(name,'/',1)))
    or exists(select 1 from public.photos p where p.experience_id=public.safe_uuid(split_part(name,'/',1))
      and p.status='visible' and public.is_experience_member(p.experience_id) and (p.storage_path=name or p.thumbnail_path=name)))
);
drop policy if exists photo_storage_owner_update on storage.objects;
drop policy photo_storage_owner_delete on storage.objects;
create policy photo_storage_owner_delete on storage.objects for delete using (
  bucket_id='photos' and (public.is_experience_admin(public.safe_uuid(split_part(name,'/',1)))
    or (public.experience_allows_photo(public.safe_uuid(split_part(name,'/',1))) and exists (
      select 1 from public.participants p where p.id=public.safe_uuid(split_part(name,'/',2))
        and p.experience_id=public.safe_uuid(split_part(name,'/',1)) and p.user_id=auth.uid() and p.is_active)))
);

drop policy mosaics_member_select on public.mosaics;
create policy mosaics_member_select on public.mosaics for select using (
  public.is_experience_admin(experience_id) or (public.is_experience_member(experience_id)
    and status='ready' and exists(select 1 from public.experiences e where e.id=experience_id and e.mosaic_visible and e.current_phase in ('reveal','finished')))
);
drop policy mosaic_storage_member_read on storage.objects;
create policy mosaic_storage_member_read on storage.objects for select using (
  bucket_id='mosaics' and (public.is_experience_admin(public.safe_uuid(split_part(name,'/',1)))
    or exists(select 1 from public.mosaics m join public.experiences e on e.id=m.experience_id
      where m.generated_image_path=name and m.status='ready' and e.mosaic_visible
        and e.current_phase in ('reveal','finished') and public.is_experience_member(e.id)))
);

-- Enforce relational scopes even for administrator API writes.
create or replace function public.validate_challenge_team() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.assigned_team_id is not null and not exists(select 1 from public.teams t where t.id=new.assigned_team_id and t.experience_id=new.experience_id)
    then raise exception 'Team does not belong to this experience'; end if;
  return new;
end; $$;
create trigger challenge_team_scope before insert or update on public.challenges for each row execute function public.validate_challenge_team();

create or replace function public.validate_photo_record() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.challenges;
begin
  select * into c from public.challenges where id=new.challenge_id;
  if c.experience_id is distinct from new.experience_id
    or (c.assigned_team_id is not null and c.assigned_team_id is distinct from new.team_id)
    or (c.secret and c.assigned_team_id is null)
    then raise exception 'This invitation is not available to this team'; end if;
  if not new.exif_stripped then raise exception 'Only processed photographs may be added'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='photos' and o.name=new.storage_path)
    or not exists(select 1 from storage.objects o where o.bucket_id='photos' and o.name=new.thumbnail_path)
    then raise exception 'Both image files must be uploaded before saving'; end if;
  return new;
end; $$;
create trigger photo_record_scope before insert on public.photos for each row execute function public.validate_photo_record();

-- Database validation also covers callers that bypass browser forms.
alter table public.experiences add constraint experience_settings_valid check (
  char_length(trim(title)) between 1 and 160 and char_length(trim(place)) between 1 and 160
  and upper(trim(join_code)) ~ '^[A-Z0-9-]{4,32}$'
  and (start_date is null or end_date is null or end_date>=start_date)
  and cardinality(supported_languages) between 1 and 3 and supported_languages <@ array['en','es','it']::text[]
) not valid;
create unique index experiences_normalized_join_code on public.experiences(upper(trim(join_code)));
alter table public.participants add constraint participant_name_valid check (char_length(trim(first_name)) between 2 and 60) not valid;
alter table public.teams add constraint team_name_valid check (char_length(trim(name)) between 1 and 80) not valid;
alter table public.challenge_translations add constraint translation_valid check (char_length(trim(title)) between 1 and 160 and char_length(trim(description)) between 1 and 2000) not valid;
update storage.buckets set file_size_limit=10485760,allowed_mime_types=array['image/jpeg','image/webp'] where id in ('photos','mosaics');
