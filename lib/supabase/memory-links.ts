import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { PublicMemoryExperience } from "@/lib/supabase/memory-server";

export type MemoryLink = {
  id: string;
  tokenHint: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type IssuedMemoryLink = {
  id: string;
  token: string;
  expiresAt: string;
};

export async function issueMemoryLink(experienceId: string, validForDays = 30): Promise<IssuedMemoryLink> {
  if (!Number.isInteger(validForDays) || validForDays < 1 || validForDays > 365) {
    throw new Error("Memory links must be valid for between 1 and 365 days.");
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("issue_memory_link", {
    p_experience_id: experienceId,
    p_valid_for_days: validForDays,
  });
  if (error) throw error;

  const row = firstRow<IssuedMemoryLinkRow>(data);
  if (!row?.id || !isMemoryToken(row.token) || !row.expires_at) {
    throw new Error("The memory link could not be created.");
  }

  return { id: row.id, token: row.token, expiresAt: row.expires_at };
}

export async function listMemoryLinks(experienceId: string): Promise<MemoryLink[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_memory_links", {
    p_experience_id: experienceId,
  });
  if (error) throw error;

  return ((data ?? []) as MemoryLinkRow[]).map((row) => ({
    id: row.id,
    tokenHint: row.token_hint,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }));
}

export async function revokeMemoryLink(experienceId: string, linkId: string): Promise<boolean> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("revoke_memory_link", {
    p_experience_id: experienceId,
    p_link_id: linkId,
  });
  if (error) throw error;
  return data === true;
}

export function buildMemoryUrl(origin: string, slug: string, token: string) {
  if (!isMemoryToken(token)) throw new Error("The memory token is invalid.");
  const url = new URL(`/memory/${encodeURIComponent(slug)}`, origin);
  url.hash = `token=${token}`;
  return url.toString();
}

export function readMemoryToken(hash: string) {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  const token = new URLSearchParams(value).get("token");
  return token && isMemoryToken(token) ? token : null;
}

export function isMemoryToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export async function loadPublicMemory(
  slug: string,
  token: string,
  locale: "en" | "es" | "it",
): Promise<PublicMemoryExperience> {
  if (!isMemoryToken(token)) throw new Error("This memory link is invalid or unavailable.");
  const response = await fetch(`/api/memory/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, locale }),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  const result = await response.json() as { experience?: PublicMemoryExperience; error?: string };
  if (!response.ok || !result.experience) {
    throw new Error(result.error ?? "This memory link is invalid or unavailable.");
  }
  return result.experience;
}

function requireSupabase(): SupabaseClient {
  const supabase = createBrowserSupabaseClient();
  if (!supabase || !hasSupabaseConfig()) throw new Error("Supabase is not configured.");
  return supabase;
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

type IssuedMemoryLinkRow = { id: string; token: string; expires_at: string };
type MemoryLinkRow = {
  id: string;
  token_hint: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};
