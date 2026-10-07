-- Phase 2: return enough state for a participant to resume without repeating onboarding.

drop policy if exists experiences_admin_insert on public.experiences;
drop function if exists public.join_experience(text, text, text, text);

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
  new_participant_id uuid;
  assigned_team_id uuid;
  has_completed_onboarding boolean;
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
  returning id, onboarding_completed into new_participant_id, has_completed_onboarding;

  select tm.team_id into assigned_team_id
  from public.team_members tm
  where tm.participant_id = new_participant_id;

  if assigned_team_id is null then
    select t.id into assigned_team_id
    from public.teams t
    where t.experience_id = target_experience_id
    order by (select count(*) from public.team_members tm where tm.team_id = t.id), t.display_order
    limit 1;

    if assigned_team_id is not null then
      insert into public.team_members (team_id, participant_id)
      values (assigned_team_id, new_participant_id)
      on conflict (participant_id) do nothing;
    end if;
  end if;

  return query select new_participant_id, target_experience_id, assigned_team_id, has_completed_onboarding;
end;
$$;

revoke all on function public.join_experience(text, text, text, text) from public;
grant execute on function public.join_experience(text, text, text, text) to authenticated;
