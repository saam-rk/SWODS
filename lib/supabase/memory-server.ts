import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { ExperiencePhase } from "@/lib/experience-phase";

const SIGNED_URL_TTL_SECONDS = 15 * 60;

export type PublicMemoryExperience = {
  id: string;
  slug: string;
  title: string;
  description: string;
  place: string;
  startDate: string;
  endDate: string;
  phase: ExperiencePhase;
  mosaicVisible: boolean;
  generatedMosaicUrl?: string;
  participantCount: number;
  totalPhotos: number;
  stories: PublicMemoryStory[];
};

export type PublicMemoryStory = {
  position: number;
  teamId: string;
  teamName: string;
  teamSymbol: string;
  photo: {
    id: string;
    challengeId: string;
    challengeTitle: string;
    caption: string;
    altText: string;
    createdAt: string;
    imageUrl?: string;
    thumbnailUrl?: string;
  };
};

export async function resolvePublicMemory(
  slug: string,
  token: string,
  locale: "en" | "es" | "it",
): Promise<PublicMemoryExperience | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("resolve_memory_link", {
    p_slug: slug,
    p_token: token,
    p_locale: locale,
  });
  if (error) throw error;

  const row = firstRow<{ payload?: unknown }>(data);
  const payload = normalizePayload(row?.payload);
  if (!payload) return null;

  const mosaicUrl = payload.generatedMosaicPath
    ? await signPath(supabase, "mosaics", payload.generatedMosaicPath)
    : undefined;
  const stories = await Promise.all(payload.stories.map(async (story) => {
    const [imageUrl, thumbnailUrl] = await Promise.all([
      signPath(supabase, "photos", story.storagePath),
      signPath(supabase, "photos", story.thumbnailPath),
    ]);
    return {
      position: story.position,
      teamId: story.teamId,
      teamName: story.teamName,
      teamSymbol: story.teamSymbol,
      photo: {
        id: story.photoId,
        challengeId: story.challengeId,
        challengeTitle: story.challengeTitle,
        caption: story.caption,
        altText: story.altText,
        createdAt: story.createdAt,
        imageUrl,
        thumbnailUrl,
      },
    } satisfies PublicMemoryStory;
  }));

  return {
    ...payload.experience,
    generatedMosaicUrl: mosaicUrl,
    participantCount: payload.participantCount,
    totalPhotos: payload.totalPhotos,
    stories,
  };
}

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("The server-side Supabase memory service is not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signPath(supabase: SupabaseClient, bucket: "photos" | "mosaics", path: string) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

function normalizePayload(value: unknown): ResolvedMemoryPayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const experience = normalizeExperience(raw.experience);
  if (!experience) return null;
  if (!Array.isArray(raw.stories)) return null;

  const stories = raw.stories.map((story) => normalizeStory(story, experience.id));
  if (stories.some((story) => story === null)) return null;

  const generatedMosaicPath = optionalString(raw.generatedMosaicPath);
  if (generatedMosaicPath && !isMosaicPath(generatedMosaicPath, experience.id)) return null;

  return {
    experience,
    generatedMosaicPath,
    participantCount: nonNegativeInteger(raw.participantCount),
    totalPhotos: nonNegativeInteger(raw.totalPhotos),
    stories: stories as ResolvedMemoryStory[],
  };
}

function normalizeExperience(value: unknown): ResolvedMemoryPayload["experience"] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isNonEmptyString(raw.id)
    || !isNonEmptyString(raw.slug)
    || !isNonEmptyString(raw.title)
    || typeof raw.description !== "string"
    || !isNonEmptyString(raw.place)
    || typeof raw.mosaicVisible !== "boolean"
    || (raw.phase !== "reveal" && raw.phase !== "finished")) return null;

  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    place: raw.place,
    startDate: optionalString(raw.startDate) ?? "",
    endDate: optionalString(raw.endDate) ?? "",
    phase: raw.phase,
    mosaicVisible: raw.mosaicVisible,
  };
}

function normalizeStory(value: unknown, experienceId: string): ResolvedMemoryStory | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Number.isInteger(raw.position)
    || !isNonEmptyString(raw.teamId)
    || !isNonEmptyString(raw.teamName)
    || typeof raw.teamSymbol !== "string"
    || !isNonEmptyString(raw.photoId)
    || !isNonEmptyString(raw.challengeId)
    || typeof raw.challengeTitle !== "string"
    || typeof raw.caption !== "string"
    || typeof raw.altText !== "string"
    || !isNonEmptyString(raw.createdAt)
    || !isNonEmptyString(raw.storagePath)
    || !isNonEmptyString(raw.thumbnailPath)
    || !isPhotoPath(raw.storagePath, experienceId, raw.photoId, "image")
    || !isPhotoPath(raw.thumbnailPath, experienceId, raw.photoId, "thumbnail")) return null;

  return raw as unknown as ResolvedMemoryStory;
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPhotoPath(path: string, experienceId: string, photoId: string, kind: "image" | "thumbnail") {
  const parts = path.split("/");
  return parts.length === 4
    && parts[0] === experienceId
    && isUuid(parts[1])
    && parts[2] === photoId
    && (parts[3] === `${kind}.webp` || parts[3] === `${kind}.jpg`);
}

function isMosaicPath(path: string, experienceId: string) {
  const parts = path.split("/");
  return parts.length === 3
    && parts[0] === experienceId
    && parts[1] === "generated"
    && /^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(parts[2]);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nonNegativeInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  throw new Error("The memory payload contains an invalid count.");
}

type ResolvedMemoryPayload = {
  experience: {
    id: string;
    slug: string;
    title: string;
    description: string;
    place: string;
    startDate: string;
    endDate: string;
    phase: "reveal" | "finished";
    mosaicVisible: boolean;
  };
  generatedMosaicPath?: string;
  participantCount: number;
  totalPhotos: number;
  stories: ResolvedMemoryStory[];
};

type ResolvedMemoryStory = {
  position: number;
  teamId: string;
  teamName: string;
  teamSymbol: string;
  photoId: string;
  challengeId: string;
  challengeTitle: string;
  caption: string;
  altText: string;
  createdAt: string;
  storagePath: string;
  thumbnailPath: string;
};
