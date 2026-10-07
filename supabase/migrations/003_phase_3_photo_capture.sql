-- Phase 3: atomically validate and create participant photo records.
-- Storage files are uploaded first, then this function creates the relational record.
-- A failed client operation removes the temporary objects from the private bucket.

drop policy if exists photos_owner_insert on public.photos;

create or replace function public.create_photo_record(
  p_photo_id uuid,
  p_experience_id uuid,
  p_participant_id uuid,
  p_team_id uuid,
  p_challenge_id uuid,
  p_storage_path text,
  p_thumbnail_path text,
  p_caption text default null,
  p_alt_text text default null,
  p_exif_stripped boolean default true
)
returns table (
  id uuid,
  experience_id uuid,
  participant_id uuid,
  team_id uuid,
  challenge_id uuid,
  storage_path text,
  thumbnail_path text,
  caption text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  participant_experience_id uuid;
  participant_team_id uuid;
  challenge_experience_id uuid;
  challenge_team_id uuid;
  challenge_max_photos smallint;
  challenge_unlock_phase public.experience_phase;
  challenge_is_active boolean;
  experience_current_phase public.experience_phase;
  experience_is_active boolean;
  existing_photo_count integer;
  clean_caption text;
begin
  if auth.uid() is null then
    raise exception 'An authenticated session is required';
  end if;

  clean_caption := nullif(trim(coalesce(p_caption, '')), '');
  if clean_caption is not null and char_length(clean_caption) > 200 then
    raise exception 'A reflection can be at most 200 characters';
  end if;

  if p_storage_path not in (
    p_experience_id::text || '/' || p_participant_id::text || '/' || p_photo_id::text || '/image.webp',
    p_experience_id::text || '/' || p_participant_id::text || '/' || p_photo_id::text || '/image.jpg'
  ) or p_thumbnail_path not in (
    p_experience_id::text || '/' || p_participant_id::text || '/' || p_photo_id::text || '/thumbnail.webp',
    p_experience_id::text || '/' || p_participant_id::text || '/' || p_photo_id::text || '/thumbnail.jpg'
  ) or right(p_storage_path, 4) <> right(p_thumbnail_path, 4) then
    raise exception 'Photo storage paths are not valid';
  end if;

  select p.experience_id into participant_experience_id
  from public.participants p
  where p.id = p_participant_id
    and p.user_id = auth.uid()
    and p.is_active = true
  for update;

  if participant_experience_id is null or participant_experience_id <> p_experience_id then
    raise exception 'This participant cannot add a photograph here';
  end if;

  select tm.team_id into participant_team_id
  from public.team_members tm
  where tm.participant_id = p_participant_id;

  if p_team_id is distinct from participant_team_id then
    raise exception 'The photograph team does not match the participant team';
  end if;

  select e.current_phase, e.state = 'active'
    into experience_current_phase, experience_is_active
  from public.experiences e
  where e.id = p_experience_id;

  if not coalesce(experience_is_active, false) or experience_current_phase <> 'exploration' then
    raise exception 'Photographs are closed for this experience';
  end if;

  select c.experience_id, c.assigned_team_id, c.max_photos, c.unlock_phase, c.is_active
    into challenge_experience_id, challenge_team_id, challenge_max_photos, challenge_unlock_phase, challenge_is_active
  from public.challenges c
  where c.id = p_challenge_id;

  if challenge_experience_id is null or challenge_experience_id <> p_experience_id then
    raise exception 'This invitation does not belong to the experience';
  end if;
  if not coalesce(challenge_is_active, false) or challenge_unlock_phase <> experience_current_phase then
    raise exception 'This invitation is not open';
  end if;
  if challenge_team_id is not null and challenge_team_id <> participant_team_id then
    raise exception 'This invitation is for another team';
  end if;

  select count(*) into existing_photo_count
  from public.photos p
  where p.participant_id = p_participant_id
    and p.challenge_id = p_challenge_id
    and p.status <> 'deleted';

  if existing_photo_count >= challenge_max_photos then
    raise exception 'The photograph limit for this invitation has been reached';
  end if;

  return query
  insert into public.photos (
    id,
    experience_id,
    participant_id,
    team_id,
    challenge_id,
    storage_path,
    thumbnail_path,
    caption,
    alt_text,
    exif_stripped
  )
  values (
    p_photo_id,
    p_experience_id,
    p_participant_id,
    p_team_id,
    p_challenge_id,
    p_storage_path,
    p_thumbnail_path,
    clean_caption,
    nullif(trim(coalesce(p_alt_text, '')), ''),
    coalesce(p_exif_stripped, true)
  )
  returning photos.id, photos.experience_id, photos.participant_id, photos.team_id, photos.challenge_id,
    photos.storage_path, photos.thumbnail_path, photos.caption, photos.created_at;
end;
$$;

revoke all on function public.create_photo_record(uuid, uuid, uuid, uuid, uuid, text, text, text, text, boolean) from public;
grant execute on function public.create_photo_record(uuid, uuid, uuid, uuid, uuid, text, text, text, text, boolean) to authenticated;

drop policy if exists photo_storage_member_upload on storage.objects;
create policy photo_storage_member_upload on storage.objects for insert with check (
  bucket_id = 'photos'
  and public.is_experience_member(public.safe_uuid(split_part(name, '/', 1)))
  and public.experience_allows_photo(public.safe_uuid(split_part(name, '/', 1)))
  and exists (
    select 1
    from public.participants p
    where p.id = public.safe_uuid(split_part(name, '/', 2))
      and p.user_id = auth.uid()
      and p.experience_id = public.safe_uuid(split_part(name, '/', 1))
  )
);

drop policy if exists photos_owner_delete on public.photos;
create policy photos_owner_delete on public.photos for delete using (
  public.is_experience_admin(experience_id)
  or (
    public.experience_allows_photo(experience_id)
    and exists (
      select 1 from public.participants p
      where p.id = participant_id
        and p.user_id = auth.uid()
        and p.is_active = true
    )
  )
);
