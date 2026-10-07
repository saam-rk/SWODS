-- Phases 5–6: administrator boundaries and reveal-safe mosaic access.
-- The bootstrap RPC creates an experience and makes the current authenticated
-- user its first administrator. All later changes are scoped by that role.

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
  if auth.uid() is null then
    raise exception 'An authenticated session is required';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 1 or char_length(trim(coalesce(p_place, ''))) < 1 then
    raise exception 'A title and place are required';
  end if;
  insert into public.experiences (slug, title, place, join_code, supported_languages, state, current_phase)
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

  insert into public.participants (experience_id, user_id, first_name, is_admin, is_active)
  values (new_experience_id, auth.uid(), trim(p_first_name), true, true)
  returning id into new_participant_id;
  return query select new_experience_id, new_participant_id;
end;
$$;

revoke all on function public.create_experience_admin(text, text, text, text, text, text[]) from public;
grant execute on function public.create_experience_admin(text, text, text, text, text, text[]) to authenticated;

-- Participant/team operations are RPC-only so a client cannot change a
-- participant's experience, auth identity, or team across experience scopes.
drop policy if exists team_members_admin_write on public.team_members;

create policy team_members_admin_write on public.team_members for all using (
  exists (
    select 1
    from public.teams t
    where t.id = team_id
      and public.is_experience_admin(t.experience_id)
      and exists (
        select 1 from public.participants p
        where p.id = participant_id and p.experience_id = t.experience_id
      )
  )
) with check (
  exists (
    select 1
    from public.teams t
    join public.participants p on p.experience_id = t.experience_id
    where t.id = team_id
      and p.id = participant_id
      and public.is_experience_admin(t.experience_id)
  )
);

create or replace function public.admin_update_participant(
  p_experience_id uuid,
  p_participant_id uuid,
  p_first_name text,
  p_is_active boolean
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
  update public.participants
  set first_name = trim(p_first_name), is_active = coalesce(p_is_active, true)
  where id = p_participant_id and experience_id = p_experience_id;
  return found;
end;
$$;

revoke all on function public.admin_update_participant(uuid, uuid, text, boolean) from public;
grant execute on function public.admin_update_participant(uuid, uuid, text, boolean) to authenticated;

create or replace function public.admin_assign_participant(
  p_experience_id uuid,
  p_participant_id uuid,
  p_team_id uuid default null
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
  if not exists (select 1 from public.participants where id = p_participant_id and experience_id = p_experience_id) then
    raise exception 'Participant does not belong to this experience';
  end if;
  if p_team_id is not null and not exists (select 1 from public.teams where id = p_team_id and experience_id = p_experience_id) then
    raise exception 'Team does not belong to this experience';
  end if;
  delete from public.team_members where participant_id = p_participant_id;
  if p_team_id is not null then
    insert into public.team_members (team_id, participant_id) values (p_team_id, p_participant_id);
  end if;
  return true;
end;
$$;

revoke all on function public.admin_assign_participant(uuid, uuid, uuid) from public;
grant execute on function public.admin_assign_participant(uuid, uuid, uuid) to authenticated;

create policy photos_admin_update on public.photos for update using (
  public.is_experience_admin(experience_id)
) with check (
  public.is_experience_admin(experience_id)
);

-- Target and generated mosaic files follow the same visibility rule as the
-- mosaics table. Administrators can always read their own experience.
drop policy if exists mosaic_storage_member_read on storage.objects;
create policy mosaic_storage_member_read on storage.objects for select using (
  bucket_id = 'mosaics'
  and (
    public.is_experience_admin(public.safe_uuid(split_part(name, '/', 1)))
    or exists (
      select 1
      from public.experiences e
      where e.id = public.safe_uuid(split_part(name, '/', 1))
        and public.is_experience_member(e.id)
        and (e.mosaic_visible or e.current_phase in ('reveal', 'finished'))
    )
  )
);
