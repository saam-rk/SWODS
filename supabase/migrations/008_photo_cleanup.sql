-- Photo deletion is a DB + object-store operation, not one transaction.
-- Keep a durable cleanup receipt so interrupted clients can safely retry and
-- operators can identify orphaned objects without retaining gallery records.
create table public.photo_file_cleanup (
  photo_id uuid primary key,
  experience_id uuid not null references public.experiences(id) on delete cascade,
  user_id uuid,
  storage_path text not null,
  thumbnail_path text not null,
  created_at timestamptz not null default now()
);
alter table public.photo_file_cleanup enable row level security;
revoke all on public.photo_file_cleanup from anon, authenticated;
grant select, delete on public.photo_file_cleanup to authenticated;
create policy cleanup_owner_read on public.photo_file_cleanup for select using (
  user_id=auth.uid() or public.is_experience_admin(experience_id)
);
create policy cleanup_owner_delete on public.photo_file_cleanup for delete using (
  user_id=auth.uid() or public.is_experience_admin(experience_id)
);
create or replace function public.queue_photo_cleanup() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.photo_file_cleanup(photo_id,experience_id,user_id,storage_path,thumbnail_path)
    select old.id,old.experience_id,p.user_id,old.storage_path,old.thumbnail_path from public.participants p where p.id=old.participant_id
    on conflict(photo_id) do nothing;
  return old;
end; $$;
create trigger photo_delete_cleanup before delete on public.photos for each row execute function public.queue_photo_cleanup();

-- Orphan cleanup is safe after the phase closes: it only grants access to
-- objects whose relational photo has already been deleted. Also permit the
-- uploader to remove incomplete uploads while exploration is open.
create or replace function public.can_cleanup_photo(object_name text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.photo_file_cleanup j where (j.storage_path=object_name or j.thumbnail_path=object_name)
    and (j.user_id=auth.uid() or public.is_experience_admin(j.experience_id)))
  or (not exists(select 1 from public.photos p where p.storage_path=object_name or p.thumbnail_path=object_name)
    and public.experience_allows_photo(public.safe_uuid(split_part(object_name,'/',1)))
    and exists(select 1 from public.participants p where p.id=public.safe_uuid(split_part(object_name,'/',2))
      and p.experience_id=public.safe_uuid(split_part(object_name,'/',1)) and p.user_id=auth.uid() and p.is_active));
$$;
revoke all on function public.can_cleanup_photo(text) from public;
grant execute on function public.can_cleanup_photo(text) to authenticated;
create policy photo_cleanup_read on storage.objects for select using (bucket_id='photos' and public.can_cleanup_photo(name));
create policy photo_cleanup_delete on storage.objects for delete using (bucket_id='photos' and public.can_cleanup_photo(name));

create or replace function public.is_experience_admin(target_experience_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select not coalesce((auth.jwt()->>'is_anonymous')::boolean,true) and exists (
    select 1 from public.participants p where p.experience_id=target_experience_id and p.user_id=auth.uid() and p.is_admin and p.is_active
  );
$$;
-- The client does not use this lookup. Do not leave a public join-code oracle.
revoke execute on function public.lookup_experience_by_join_code(text) from anon, authenticated;

-- Counts include one's own hidden photographs without disclosing moderated
-- file URLs or other people's hidden records.
create or replace function public.participant_photo_counts(p_participant_id uuid)
returns table(challenge_id uuid, photo_count bigint)
language sql stable security definer set search_path=public as $$
  select f.challenge_id,count(*) from public.photos f join public.participants p on p.id=f.participant_id
    where p.id=p_participant_id and p.user_id=auth.uid() and p.is_active and f.status<>'deleted' group by f.challenge_id;
$$;
revoke all on function public.participant_photo_counts(uuid) from public;
grant execute on function public.participant_photo_counts(uuid) to authenticated;
