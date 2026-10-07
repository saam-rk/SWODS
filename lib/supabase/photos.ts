import { retryPhotoCleanup } from "@/lib/supabase/photo-cleanup";
import { readLocalAdminState } from "@/lib/admin";
import { createBrowserSupabaseClient, hasSupabaseConfig, isDemoMode } from "@/lib/supabase/client";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { blobToDataUrl, type ProcessedImage } from "@/lib/image-processing";
import type { ParticipantSession } from "@/lib/participant-session";

export const LOCAL_PHOTOS_KEY = "swods-local-photos";

export type PhotoUploadStage =
  | "preparing"
  | "uploading-image"
  | "uploading-thumbnail"
  | "saving"
  | "complete";

export type PhotoUploadProgress = {
  stage: PhotoUploadStage;
  percent: number;
};

export type SavedPhoto = {
  id: string;
  experienceId: string;
  participantId: string;
  teamId: string | null;
  challengeId: string;
  storagePath: string;
  thumbnailPath: string;
  caption: string;
  createdAt: string;
  localImageUrl?: string;
  localThumbnailUrl?: string;
};

type LocalPhoto = SavedPhoto & {
  localImageUrl: string;
  localThumbnailUrl: string;
};

export async function saveParticipantPhoto(input: {
  session: ParticipantSession;
  challengeId: string;
  processedImage: ProcessedImage;
  caption: string;
  onProgress?: (progress: PhotoUploadProgress) => void;
}) {
  const caption = input.caption.trim().slice(0, 200);
  input.onProgress?.({ stage: "preparing", percent: 12 });

  if (input.session.mode === "demo" && isDemoMode()) {
    const photo = await saveDemoPhoto(input.session, input.challengeId, input.processedImage, caption);
    input.onProgress?.({ stage: "complete", percent: 100 });
    return photo;
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase || !hasSupabaseConfig()) throw new Error("Supabase is not configured.");

  const photoId = createResourceId();
  const extension = input.processedImage.extension;
  const storagePath = `${input.session.experienceId}/${input.session.participantId}/${photoId}/image.${extension}`;
  const thumbnailPath = `${input.session.experienceId}/${input.session.participantId}/${photoId}/thumbnail.${extension}`;
  let imageUploaded = false;
  let thumbnailUploaded = false;

  try {
    input.onProgress?.({ stage: "uploading-image", percent: 28 });
    const imageUpload = await supabase.storage.from("photos").upload(storagePath, input.processedImage.image, {
      cacheControl: "31536000",
      contentType: input.processedImage.mimeType,
      upsert: false,
    });
    if (imageUpload.error) throw imageUpload.error;
    imageUploaded = true;

    input.onProgress?.({ stage: "uploading-thumbnail", percent: 58 });
    const thumbnailUpload = await supabase.storage.from("photos").upload(thumbnailPath, input.processedImage.thumbnail, {
      cacheControl: "31536000",
      contentType: input.processedImage.mimeType,
      upsert: false,
    });
    if (thumbnailUpload.error) throw thumbnailUpload.error;
    thumbnailUploaded = true;

    input.onProgress?.({ stage: "saving", percent: 82 });
    const teamId = await resolveTeamId(supabase, input.session);
    const { error } = await supabase.rpc("create_photo_record", {
      p_photo_id: photoId,
      p_experience_id: input.session.experienceId,
      p_participant_id: input.session.participantId,
      p_team_id: teamId,
      p_challenge_id: input.challengeId,
      p_storage_path: storagePath,
      p_thumbnail_path: thumbnailPath,
      p_caption: caption || null,
      p_alt_text: caption || null,
      p_exif_stripped: true,
    });
    if (error) throw error;

    input.onProgress?.({ stage: "complete", percent: 100 });
    return {
      id: photoId,
      experienceId: input.session.experienceId,
      participantId: input.session.participantId,
      teamId,
      challengeId: input.challengeId,
      storagePath,
      thumbnailPath,
      caption,
      createdAt: new Date().toISOString(),
    } satisfies SavedPhoto;
  } catch (error) {
    const paths = [imageUploaded ? storagePath : null, thumbnailUploaded ? thumbnailPath : null].filter((path): path is string => Boolean(path));
    if (paths.length > 0) await supabase.storage.from("photos").remove(paths);
    await supabase.from("photos").delete().eq("id", photoId).eq("participant_id", input.session.participantId);
    throw error;
  }
}

export async function deleteParticipantPhoto(session: ParticipantSession, photo: Pick<SavedPhoto, "id" | "participantId" | "experienceId">) {
  if (photo.participantId !== session.participantId || photo.experienceId !== session.experienceId) throw new Error("This is not your photograph.");
  if (session.mode === "demo" && isDemoMode()) {
    if (readLocalAdminState().experience.currentPhase !== "exploration") throw new Error("Photo changes are closed.");
    const photos = listLocalPhotoRecords().filter((item) => item.id !== photo.id);
    writeLocalPhotoRecords(photos);
    return;
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase || !hasSupabaseConfig()) throw new Error("Supabase is not configured.");

  const { data, error: readError } = await supabase
    .from("photos")
    .select("storage_path, thumbnail_path")
    .eq("id", photo.id)
    .eq("participant_id", session.participantId)
    .maybeSingle();
  if (readError) throw readError;
  if (!data) { await retryPhotoCleanup(photo.id); return; }

  const { data: removed, error: deleteError } = await supabase
    .from("photos")
    .delete()
    .eq("id", photo.id)
    .eq("participant_id", session.participantId)
    .select("id");
  if (deleteError || !removed?.length) throw deleteError ?? new Error("Photo changes are closed.");

  await retryPhotoCleanup(photo.id);
}

export function listLocalPhotoRecords(): LocalPhoto[] {
  if (typeof window === "undefined") return [];

  const raw = readBrowserStorage(LOCAL_PHOTOS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalPhoto);
  } catch {
    return [];
  }
}

export function getLocalPhotoCount(challengeId?: string) {
  return listLocalPhotoRecords().filter((photo) => !challengeId || photo.challengeId === challengeId).length;
}

async function saveDemoPhoto(session: ParticipantSession, challengeId: string, processedImage: ProcessedImage, caption: string) {
  const state = readLocalAdminState();
  const challenge = state.challenges.find(c=>c.id===challengeId);
  const participant = state.participants.find(p=>p.id===session.participantId);
  if (!participant?.isActive || !challenge?.isActive || state.experience.state !== "active" || state.experience.currentPhase !== "exploration" || challenge.unlockPhase !== "exploration" || (challenge.assignedTeamId && challenge.assignedTeamId !== participant.teamId)) throw new Error("This invitation is not open.");
  if (listLocalPhotoRecords().filter(p=>p.participantId===session.participantId && p.challengeId===challengeId).length >= challenge.maxPhotos) throw new Error("Photo limit reached.");
  const [localImageUrl, localThumbnailUrl] = await Promise.all([
    blobToDataUrl(processedImage.image),
    blobToDataUrl(processedImage.thumbnail),
  ]);
  const photo: LocalPhoto = {
    id: createResourceId(),
    experienceId: session.experienceId,
    participantId: session.participantId,
    teamId: participant.teamId,
    challengeId,
    storagePath: "local/image.webp",
    thumbnailPath: "local/thumbnail.webp",
    caption,
    createdAt: new Date().toISOString(),
    localImageUrl,
    localThumbnailUrl,
  };

  writeLocalPhotoRecords([...listLocalPhotoRecords(), photo]);
  return photo;
}

function writeLocalPhotoRecords(photos: LocalPhoto[]) {
  if (typeof window === "undefined") return;
  if (!writeBrowserStorage(LOCAL_PHOTOS_KEY, JSON.stringify(photos))) {
    throw new Error("The photograph could not be kept in this browser.");
  }
}

async function resolveTeamId(supabase: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>, session: ParticipantSession) {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("participant_id", session.participantId)
    .maybeSingle();
  if (error) throw error;
  return (data?.team_id as string | null | undefined) ?? null;
}

function isLocalPhoto(value: unknown): value is LocalPhoto {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LocalPhoto>;
  return Boolean(
    typeof item.id === "string"
      && typeof item.experienceId === "string"
      && typeof item.participantId === "string"
      && typeof item.challengeId === "string"
      && typeof item.localImageUrl === "string"
      && typeof item.localThumbnailUrl === "string",
  );
}

function createResourceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
