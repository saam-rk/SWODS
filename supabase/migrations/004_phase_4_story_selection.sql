-- Phase 4: private story marks and guarded team story selection.
-- A mark is a participant's quiet candidate for later discussion. A selection
-- is a team's ordered final story photograph.

create table if not exists public.story_marks (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (participant_id, photo_id)
);

create index if not exists story_marks_experience_idx
  on public.story_marks(experience_id, team_id, created_at desc);

alter table public.story_marks enable row level security;

create or replace function public.experience_allows_story_mark(target_experience_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.experiences
    where id = target_experience_id
      and state = 'active'
      and current_phase in ('exploration', 'selection')
  );
$$;

create policy story_marks_member_select on public.story_marks for select using (
  public.is_experience_member(experience_id)
);

create policy story_marks_owner_insert on public.story_marks for insert with check (
  public.experience_allows_story_mark(experience_id)
  and exists (
    select 1
    from public.participants p
    where p.id = public.story_marks.participant_id
      and p.experience_id = public.story_marks.experience_id
      and p.user_id = auth.uid()
      and p.is_active = true
  )
  and exists (
    select 1
    from public.photos p
    where p.id = public.story_marks.photo_id
      and p.experience_id = public.story_marks.experience_id
      and p.status = 'visible'
  )
);

create policy story_marks_owner_delete on public.story_marks for delete using (
  exists (
    select 1
    from public.participants p
    where p.id = public.story_marks.participant_id
      and p.user_id = auth.uid()
      and p.is_active = true
  )
);

create or replace function public.toggle_story_mark(
  p_experience_id uuid,
  p_participant_id uuid,
  p_photo_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_team_id uuid;
  photo_experience_id uuid;
  was_marked boolean;
begin
  if auth.uid() is null then
    raise exception 'An authenticated session is required';
  end if;

  select tm.team_id
    into participant_team_id
  from public.team_members tm
  join public.participants p on p.id = tm.participant_id
  where tm.participant_id = p_participant_id
    and p.experience_id = p_experience_id
    and p.user_id = auth.uid()
    and p.is_active = true;

  if participant_team_id is null or not public.experience_allows_story_mark(p_experience_id) then
    raise exception 'Story marks are not open for this experience';
  end if;

  select p.experience_id
    into photo_experience_id
  from public.photos p
  where p.id = p_photo_id
    and p.status = 'visible';

  if photo_experience_id is null or photo_experience_id <> p_experience_id then
    raise exception 'This photograph does not belong to the experience';
  end if;

  select exists (
    select 1
    from public.story_marks sm
    where sm.participant_id = p_participant_id
      and sm.photo_id = p_photo_id
  ) into was_marked;

  if was_marked then
    delete from public.story_marks
    where participant_id = p_participant_id
      and photo_id = p_photo_id;
    return false;
  end if;

  insert into public.story_marks (experience_id, participant_id, team_id, photo_id)
  values (p_experience_id, p_participant_id, participant_team_id, p_photo_id);
  return true;
end;
$$;

revoke all on function public.toggle_story_mark(uuid, uuid, uuid) from public;
grant execute on function public.toggle_story_mark(uuid, uuid, uuid) to authenticated;

-- Team selections must go through the capped RPC below. Direct team inserts
-- and updates would otherwise be able to bypass story_count and ordering.
drop policy if exists story_selections_team_insert on public.story_selections;
drop policy if exists story_selections_team_update on public.story_selections;

create policy story_selections_admin_insert on public.story_selections for insert with check (
  public.is_experience_admin(experience_id)
);

create policy story_selections_admin_update on public.story_selections for update using (
  public.is_experience_admin(experience_id)
) with check (
  public.is_experience_admin(experience_id)
);

create or replace function public.select_story_photo(
  p_experience_id uuid,
  p_team_id uuid,
  p_photo_id uuid
)
returns table (id uuid, team_id uuid, photo_id uuid, "position" smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  story_limit smallint;
  next_position smallint;
  photo_experience_id uuid;
  photo_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'An authenticated session is required';
  end if;

  select e.story_count
    into story_limit
  from public.experiences e
  where e.id = p_experience_id
    and e.state = 'active'
    and e.current_phase = 'selection'
    and e.selection_enabled = true;

  if story_limit is null or not public.is_team_member(p_team_id) then
    raise exception 'Team story selection is not open';
  end if;

  select p.experience_id, p.team_id
    into photo_experience_id, photo_team_id
  from public.photos p
  where p.id = p_photo_id
    and p.status = 'visible';

  if photo_experience_id is null
    or photo_experience_id <> p_experience_id
    or photo_team_id is distinct from p_team_id then
    raise exception 'Choose a visible photograph from your team';
  end if;

  if exists (
    select 1
    from public.story_selections ss
    where ss.team_id = p_team_id
      and ss.photo_id = p_photo_id
  ) then
    return query
    select ss.id, ss.team_id, ss.photo_id, ss.position
    from public.story_selections ss
    where ss.team_id = p_team_id
      and ss.photo_id = p_photo_id;
    return;
  end if;

  if (
    select count(*)
    from public.story_selections ss
    where ss.experience_id = p_experience_id
      and ss.team_id = p_team_id
  ) >= story_limit then
    raise exception 'Your team has chosen its full story';
  end if;

  select gs::smallint
    into next_position
  from generate_series(1, story_limit) gs
  where not exists (
    select 1
    from public.story_selections ss
    where ss.team_id = p_team_id
      and ss.position = gs
  )
  order by gs
  limit 1;

  return query
  insert into public.story_selections (experience_id, team_id, photo_id, position)
  values (p_experience_id, p_team_id, p_photo_id, next_position)
  returning story_selections.id, story_selections.team_id, story_selections.photo_id, story_selections.position;
end;
$$;

revoke all on function public.select_story_photo(uuid, uuid, uuid) from public;
grant execute on function public.select_story_photo(uuid, uuid, uuid) to authenticated;

create or replace function public.move_story_selection(
  p_experience_id uuid,
  p_team_id uuid,
  p_photo_id uuid,
  p_direction smallint
)
returns table (id uuid, team_id uuid, photo_id uuid, "position" smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_id uuid;
  current_position smallint;
  target_id uuid;
  target_photo_id uuid;
  target_position smallint;
  current_created_at timestamptz;
begin
  if auth.uid() is null or p_direction not in (-1, 1) then
    raise exception 'The story order could not be changed';
  end if;
  if not public.is_team_member(p_team_id)
    or not exists (
      select 1
      from public.experiences e
      where e.id = p_experience_id
        and e.state = 'active'
        and e.current_phase = 'selection'
        and e.selection_enabled = true
    ) then
    raise exception 'You are not a member of this team';
  end if;

  select ss.id, ss.position, ss.created_at
    into current_id, current_position, current_created_at
  from public.story_selections ss
  where ss.experience_id = p_experience_id
    and ss.team_id = p_team_id
    and ss.photo_id = p_photo_id
  for update;

  if current_id is null then
    raise exception 'This photograph is not in the team story';
  end if;

  target_position := current_position + p_direction;
  if target_position < 1 or target_position > 12 then
    return query select current_id, p_team_id, p_photo_id, current_position;
    return;
  end if;

  select ss.id, ss.photo_id
    into target_id, target_photo_id
  from public.story_selections ss
  where ss.experience_id = p_experience_id
    and ss.team_id = p_team_id
    and ss.position = target_position
  for update;

  if target_id is null then
    update public.story_selections
    set position = target_position
    where id = current_id;
  else
    delete from public.story_selections where id = current_id;
    update public.story_selections
    set position = current_position
    where id = target_id;
    insert into public.story_selections (id, experience_id, team_id, photo_id, position, created_at)
    values (current_id, p_experience_id, p_team_id, p_photo_id, target_position, current_created_at);
  end if;

  return query
  select ss.id, ss.team_id, ss.photo_id, ss.position
  from public.story_selections ss
  where ss.id = current_id;
end;
$$;

revoke all on function public.move_story_selection(uuid, uuid, uuid, smallint) from public;
grant execute on function public.move_story_selection(uuid, uuid, uuid, smallint) to authenticated;
