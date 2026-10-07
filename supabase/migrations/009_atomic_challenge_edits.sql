-- Keep invitation settings and all three translations in one transaction.
create or replace function public.admin_save_challenge(p_experience_id uuid,p_challenge_id uuid,p_settings jsonb,p_translations jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare saved_id uuid; translation jsonb;
begin
  if not public.is_experience_admin(p_experience_id) then raise exception 'Administrator access is required'; end if;
  if p_settings is null or jsonb_typeof(p_translations)<>'array' or jsonb_array_length(p_translations)<>3
    or (select count(distinct t->>'locale') from jsonb_array_elements(p_translations) t where t->>'locale' in ('en','es','it'))<>3
    or nullif(trim(p_settings->>'slug'),'') is null
    or (p_settings->>'display_order')::integer < 1
  then raise exception 'Invalid invitation settings or translations'; end if;
  if p_challenge_id is null then
    insert into public.challenges(experience_id,slug,category,difficulty,required,secret,assigned_team_id,max_photos,unlock_phase,is_active,display_order)
      values(p_experience_id,trim(p_settings->>'slug'),p_settings->>'category',p_settings->>'difficulty',
      (p_settings->>'required')::boolean,(p_settings->>'secret')::boolean,(p_settings->>'assigned_team_id')::uuid,
      (p_settings->>'max_photos')::smallint,(p_settings->>'unlock_phase')::public.experience_phase,
      (p_settings->>'is_active')::boolean,(p_settings->>'display_order')::smallint) returning id into saved_id;
  else
    update public.challenges set slug=trim(p_settings->>'slug'),category=p_settings->>'category',difficulty=p_settings->>'difficulty',
      required=(p_settings->>'required')::boolean,secret=(p_settings->>'secret')::boolean,assigned_team_id=(p_settings->>'assigned_team_id')::uuid,
      max_photos=(p_settings->>'max_photos')::smallint,unlock_phase=(p_settings->>'unlock_phase')::public.experience_phase,
      is_active=(p_settings->>'is_active')::boolean,display_order=(p_settings->>'display_order')::smallint
      where id=p_challenge_id and experience_id=p_experience_id returning id into saved_id;
    if saved_id is null then raise exception 'Invitation not found'; end if;
  end if;
  for translation in select * from jsonb_array_elements(p_translations) loop
    insert into public.challenge_translations(challenge_id,locale,title,description,hint)
      values(saved_id,translation->>'locale',translation->>'title',translation->>'description',translation->>'hint')
      on conflict(challenge_id,locale) do update set title=excluded.title,description=excluded.description,hint=excluded.hint;
  end loop;
  return saved_id;
end; $$;
revoke all on function public.admin_save_challenge(uuid,uuid,jsonb,jsonb) from public;
grant execute on function public.admin_save_challenge(uuid,uuid,jsonb,jsonb) to authenticated;
