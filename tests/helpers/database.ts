import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';

// Real PostgreSQL execution via WASM. Auth JWT claims and Storage's catalog are
// modeled here; this is NOT an HTTP/Auth/Storage integration test of Supabase.
export async function database(lastMigration = Infinity) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create extension if not exists pgcrypto;
    create publication supabase_realtime;
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  `);
  for (const name of readdirSync('supabase/migrations').sort()) {
    if (Number(name.split('_')[0]) > lastMigration) continue;
    const sql = readFileSync(`supabase/migrations/${name}`, 'utf8').replace('create extension if not exists "pgcrypto";', '');
    await db.exec(sql);
  }
  await db.exec(readFileSync('supabase/seed.sql', 'utf8'));
  return db;
}

export const ids = {
  experience: '00000000-0000-4000-8000-000000000001',
  participant: '00000000-0000-4000-8000-000000001001',
  peer: '00000000-0000-4000-8000-000000001002',
  team: '00000000-0000-4000-8000-000000000101',
  otherTeam: '00000000-0000-4000-8000-000000000102',
  challenge: '00000000-0000-4000-8000-000000002001',
  user: '10000000-0000-4000-8000-000000000001',
  adminUser: '10000000-0000-4000-8000-000000000002',
  photo: '20000000-0000-4000-8000-000000000001',
};
export async function login(db: PGlite, user = ids.user, anonymous = true) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [user, JSON.stringify({ is_anonymous: anonymous })]);
  await db.exec('set role authenticated');
}
export async function fixture(db: PGlite) {
  await db.query('insert into auth.users values ($1), ($2)', [ids.user, ids.adminUser]);
  await db.query('update participants set user_id=$1 where id=$2', [ids.user, ids.participant]);
  await db.query('update participants set user_id=$1, is_admin=true where id=$2', [ids.adminUser, ids.peer]);
  const path = `${ids.experience}/${ids.participant}/${ids.photo}`;
  await db.query("insert into storage.objects(bucket_id,name) values ('photos',$1),('photos',$2)", [`${path}/image.webp`, `${path}/thumbnail.webp`]);
  await db.query('insert into photos(id, experience_id, participant_id, team_id, challenge_id, storage_path, thumbnail_path, exif_stripped) values ($1,$2,$3,$4,$5,$6,$7,true)', [ids.photo, ids.experience, ids.participant, ids.team, ids.challenge, `${path}/image.webp`, `${path}/thumbnail.webp`]);
}
