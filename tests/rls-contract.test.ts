import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function migration(name: string) {
  return readFileSync(resolve(process.cwd(), "supabase", "migrations", name), "utf8");
}

describe("Supabase permission contracts", () => {
  it("keeps core tables behind row-level security and experience membership", () => {
    const sql = migration("001_initial_schema.sql");
    expect(sql).toMatch(/alter table public\.experiences enable row level security/i);
    expect(sql).toMatch(/alter table public\.photos enable row level security/i);
    expect(sql).toMatch(/create policy photos_member_select[\s\S]*is_experience_member\(experience_id\)/i);
    expect(migration("003_phase_3_photo_capture.sql")).toMatch(/create policy photos_owner_delete[\s\S]*experience_allows_photo\(experience_id\)/i);
  });

  it("exposes only the narrow join lookup to anonymous clients", () => {
    const sql = migration("001_initial_schema.sql");
    expect(sql).toMatch(/grant execute on function public\.lookup_experience_by_join_code\(text\) to anon, authenticated/i);
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all) on (all tables|table public\.)[^;]* to anon/i);
  });

  it("keeps photo and story writes phase-aware and authenticated", () => {
    const photos = migration("003_phase_3_photo_capture.sql");
    const stories = migration("004_phase_4_story_selection.sql");
    expect(photos).toMatch(/create or replace function public\.create_photo_record[\s\S]*current_phase <> 'exploration'/i);
    expect(photos).toMatch(/clean_caption[\s\S]*char_length\(clean_caption\) > 200/i);
    expect(photos).toMatch(/existing_photo_count >= challenge_max_photos/i);
    expect(photos).toMatch(/coalesce\(p_exif_stripped, true\)/i);
    expect(photos).toMatch(/p\.user_id = auth\.uid\(\)/i);
    expect(photos).toMatch(/revoke all on function public\.create_photo_record[\s\S]*from public/i);
    expect(stories).toMatch(/create or replace function public\.select_story_photo[\s\S]*current_phase = 'selection'/i);
    expect(`${migration("001_initial_schema.sql")}\n${stories}`).toMatch(/unique \(team_id, photo_id\)/i);
    expect(stories).toMatch(/revoke all on function public\.select_story_photo[\s\S]*from public/i);
  });

  it("hides mosaic storage from participants until reveal or finished phase", () => {
    const sql = `${migration("001_initial_schema.sql")}\n${migration("005_phase_5_6_admin_mosaic.sql")}`;
    expect(sql).toMatch(/mosaic_storage_member_read[\s\S]*current_phase in \('reveal', 'finished'\)/i);
    expect(sql).toMatch(/mosaic_storage_admin_write[\s\S]*is_experience_admin/i);
  });

  it("uses revocable expiring memory tokens without exposing private storage", () => {
    const sql = migration("006_production_security_memory_links.sql");
    const resolver = sql.match(/create or replace function public\.resolve_memory_link[\s\S]*?grant execute on function public\.resolve_memory_link[^;]+;/i)?.[0] ?? "";

    expect(sql).toMatch(/token_hash bytea not null unique/i);
    expect(sql).toMatch(/raw_token := encode\(gen_random_bytes\(32\), 'hex'\)/i);
    expect(sql).toMatch(/digest\(raw_token, 'sha256'\)/i);
    expect(resolver).toMatch(/ml\.revoked_at is null/i);
    expect(resolver).toMatch(/ml\.expires_at > timezone\('utc', now\(\)\)/i);
    expect(resolver).toMatch(/e\.mosaic_visible = true/i);
    expect(resolver).toMatch(/e\.current_phase in \('reveal', 'finished'\)/i);
    expect(resolver).not.toMatch(/join_code|first_name|token_hash.*jsonb_build_object/i);
    expect(sql).toMatch(/grant execute on function public\.resolve_memory_link\(text, text, text\) to anon, authenticated/i);
    expect(sql).not.toMatch(/create policy \w+ on public\.memory_links/i);
  });

  it("removes broad participant mutation paths and makes story marks private", () => {
    const sql = migration("006_production_security_memory_links.sql");

    expect(sql).toMatch(/drop policy if exists participants_self_update on public\.participants/i);
    expect(sql).toMatch(/complete_participant_onboarding[\s\S]*id = p_participant_id[\s\S]*user_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/drop policy if exists photos_owner_update on public\.photos/i);
    expect(sql).toMatch(/drop policy if exists story_marks_member_select on public\.story_marks/i);
    expect(sql).toMatch(/story_marks_owner_select[\s\S]*participant_id[\s\S]*auth\.uid\(\)/i);
    expect(sql).toMatch(/story_selections_team_delete[\s\S]*experience_allows_story\(experience_id\)/i);
    expect(sql).toMatch(/join_experience[\s\S]*participant access is paused/i);
    const hardenedJoin = sql.match(/create or replace function public\.join_experience[\s\S]*?grant execute on function public\.join_experience[^;]+;/i)?.[0] ?? "";
    expect(hardenedJoin).not.toMatch(/set[\s\S]*is_active\s*=\s*true/i);
  });

  it("restricts storage mutations to valid owner paths and open phases", () => {
    const sql = migration("006_production_security_memory_links.sql");

    expect(sql).toMatch(/photo_storage_member_upload[\s\S]*array_length\(string_to_array\(name, '\/'\), 1\) = 4/i);
    expect(sql).toMatch(/split_part\(name, '\/', 4\) in \([\s\S]*'image\.webp'[\s\S]*'thumbnail\.jpg'/i);
    expect(sql).toMatch(/photo_storage_owner_delete[\s\S]*experience_allows_photo/i);
    expect(sql).toMatch(/alter publication supabase_realtime add table public\.experiences/i);
  });
});
