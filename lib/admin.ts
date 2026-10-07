import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import { demoChallenges, type DemoChallenge } from "@/lib/demo-data";
import { isExperiencePhase, type ExperiencePhase } from "@/lib/experience-phase";
import { readParticipantSession, updateParticipantSession, type ParticipantSession } from "@/lib/participant-session";
import { createBrowserSupabaseClient, hasSupabaseConfig, isDemoMode } from "@/lib/supabase/client";
import { processImage, blobToDataUrl } from "@/lib/image-processing";
import { validateExperience, validateNewExperience, validateChallenge } from "@/lib/admin-validation";
import { loadGalleryData, type GalleryPhoto } from "@/lib/supabase/gallery";
import { listLocalPhotoRecords } from "@/lib/supabase/photos";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { retryPhotoCleanup } from "@/lib/supabase/photo-cleanup";
import type { MosaicResult } from "@/lib/mosaic";

export const DEMO_ADMIN_CODE = "HERVAS-ADMIN";
export const DEMO_EXPERIENCE_ID = "demo-hervas";
export const ADMIN_STATE_EVENT = "swods-admin-state-changed";

const LOCAL_ADMIN_AUTH_KEY = "swods-local-admin-auth";
const LOCAL_ADMIN_STATE_KEY = "swods-local-admin-state-v2";

export type AdminAccess = {
  mode: "demo" | "supabase";
  experienceId: string;
  participantId?: string;
};

export type AdminExperience = {
  id: string;
  slug: string;
  title: string;
  description: string;
  place: string;
  joinCode: string;
  startDate: string;
  endDate: string;
  supportedLanguages: Locale[];
  state: "draft" | "active" | "archived";
  currentPhase: ExperiencePhase;
  selectionEnabled: boolean;
  storyCount: number;
  mosaicVisible: boolean;
  targetImagePath?: string;
  targetImageUrl?: string;
};

export type AdminParticipant = {
  id: string;
  firstName: string;
  countryCode: string;
  isAdmin: boolean;
  isActive: boolean;
  teamId: string | null;
  createdAt: string;
};

export type AdminTeam = {
  id: string;
  name: string;
  symbol: string;
  accent: string;
  displayOrder: number;
  memberCount: number;
};

export type AdminTranslation = {
  title: string;
  description: string;
  hint: string;
};

export type AdminChallenge = {
  id: string;
  slug: string;
  category: string;
  difficulty: string;
  required: boolean;
  secret: boolean;
  assignedTeamId: string | null;
  maxPhotos: number;
  unlockPhase: ExperiencePhase;
  isActive: boolean;
  displayOrder: number;
  translations: Record<Locale, AdminTranslation>;
};

export type AdminPhoto = {
  id: string;
  participantId: string;
  participantName: string;
  teamId: string | null;
  teamName: string;
  challengeId: string;
  challengeTitle: string;
  caption: string;
  status: "visible" | "hidden" | "deleted";
  createdAt: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  tone: GalleryPhoto["tone"];
};

export type AdminMosaic = {
  id?: string;
  status: "draft" | "processing" | "ready" | "failed";
  algorithmVersion: string;
  generatedAt?: string;
  generatedImageUrl?: string;
  targetImageUrl?: string;
};

export type AdminSnapshot = {
  experience: AdminExperience;
  participants: AdminParticipant[];
  teams: AdminTeam[];
  challenges: AdminChallenge[];
  photos: AdminPhoto[];
  mosaic: AdminMosaic | null;
};

export type CreateExperienceInput = {
  slug: string;
  title: string;
  place: string;
  firstName: string;
  joinCode: string;
  supportedLanguages: Locale[];
};

type LocalAdminState = {
  experience: AdminExperience;
  participants: AdminParticipant[];
  teams: AdminTeam[];
  challenges: AdminChallenge[];
  mosaic: AdminMosaic | null;
  photoStatuses: Record<string, "visible" | "hidden" | "deleted">;
};

export async function getAdminAccess(): Promise<AdminAccess | null> {
  if (isDemoMode()) {
    return readLocalAdminAuth() ? { mode: "demo", experienceId: DEMO_EXPERIENCE_ID } : null;
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase) return null;
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;
  if (!user || user.is_anonymous) return null;
  const { data, error } = await supabase
    .from("participants")
    .select("id, experience_id")
    .eq("user_id", user.id)
    .eq("is_admin", true)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error || !data?.length) return null;
  const selected = data.find(row => row.experience_id === readBrowserStorage("swods-admin-experience")) ?? data[0];
  return { mode: "supabase", experienceId: selected.experience_id as string, participantId: selected.id as string };
}

export async function authenticateAdmin(email: string, password: string): Promise<AdminAccess> {
  const supabase = requireSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;

  const access = await getAdminAccess();
  if (access) return access;

  await supabase.auth.signOut();
  throw new Error("This account is not an active administrator.");
}

export async function signOutAdmin(access: AdminAccess) {
  if (access.mode === "demo") {
    clearDemoAdmin();
    return;
  }

  const supabase = requireSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function authorizeDemoAdmin(code: string) {
  const authorized = isDemoMode() && code.trim().toUpperCase() === DEMO_ADMIN_CODE;
  if (authorized) writeBrowserStorage(LOCAL_ADMIN_AUTH_KEY, "true");
  return authorized;
}

export function clearDemoAdmin() {
  removeBrowserStorage(LOCAL_ADMIN_AUTH_KEY);
}

export async function loadAdminSnapshot(access: AdminAccess, locale: Locale, copy: Dictionary): Promise<AdminSnapshot> {
  if (access.mode === "demo") return loadDemoSnapshot(locale, copy);

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const experienceId = access.experienceId;
  const [experienceResult, participantResult, teamsResult, membershipResult, challengeResult, mosaicResult, photosResult] = await Promise.all([
    supabase.from("experiences").select("*").eq("id", experienceId).maybeSingle(),
    supabase.from("participants").select("id, first_name, country_code, is_admin, is_active, created_at").eq("experience_id", experienceId).order("created_at", { ascending: true }),
    supabase.from("teams").select("id, name, symbol, accent, display_order").eq("experience_id", experienceId).order("display_order", { ascending: true }),
    supabase.from("team_members").select("team_id, participant_id"),
    supabase.from("challenges").select("id, slug, category, difficulty, required, secret, assigned_team_id, max_photos, unlock_phase, is_active, display_order").eq("experience_id", experienceId).order("display_order", { ascending: true }),
    supabase.from("mosaics").select("id, target_image_path, generated_image_path, status, algorithm_version, generated_at").eq("experience_id", experienceId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("photos").select("id, participant_id, team_id, challenge_id, storage_path, thumbnail_path, caption, status, created_at, updated_at").eq("experience_id", experienceId).order("created_at", { ascending: false }),
  ]);
  const firstError = [experienceResult.error, participantResult.error, teamsResult.error, membershipResult.error, challengeResult.error, mosaicResult.error, photosResult.error].find(Boolean);
  if (firstError) throw firstError;
  if (!experienceResult.data) throw new Error("This experience is no longer available.");

  const challengeIds = ((challengeResult.data ?? []) as SupabaseChallengeRow[]).map((challenge) => challenge.id);
  const translationResult = challengeIds.length === 0
    ? { data: [], error: null }
    : await supabase.from("challenge_translations").select("challenge_id, locale, title, description, hint").in("challenge_id", challengeIds);
  if (translationResult.error) throw translationResult.error;

  const experience = normalizeExperience(experienceResult.data as SupabaseExperienceRow);
  const experienceTargetUrl = experience.targetImagePath ? await signedUrl(supabase, experience.targetImagePath, "mosaics") : undefined;
  const memberships = (membershipResult.data ?? []) as MembershipRow[];
  const participants = ((participantResult.data ?? []) as SupabaseParticipantRow[]).map((participant) => ({
    id: participant.id,
    firstName: participant.first_name,
    countryCode: participant.country_code ?? "",
    isAdmin: participant.is_admin,
    isActive: participant.is_active,
    teamId: memberships.find((membership) => membership.participant_id === participant.id)?.team_id ?? null,
    createdAt: participant.created_at,
  }));
  const teams = ((teamsResult.data ?? []) as SupabaseTeamRow[]).map((team) => ({
    id: team.id,
    name: team.name,
    symbol: team.symbol ?? "◌",
    accent: team.accent ?? "wood",
    displayOrder: team.display_order,
    memberCount: memberships.filter((membership) => membership.team_id === team.id).length,
  }));
  const translationRows = (translationResult.data ?? []) as SupabaseTranslationRow[];
  const challenges = ((challengeResult.data ?? []) as SupabaseChallengeRow[]).map((challenge) => ({
    ...challengeToAdmin(challenge),
    translations: translationsFor(challenge.id, translationRows),
  }));
  const participantNames = new Map(participants.map((participant) => [participant.id, participant.firstName]));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const photos = await Promise.all(((photosResult.data ?? []) as SupabasePhotoRow[]).map(async (photo, index, all) => ({
    id: photo.id,
    participantId: photo.participant_id,
    participantName: participantNames.get(photo.participant_id) ?? copy.gallery.unknownAuthor,
    teamId: photo.team_id,
    teamName: photo.team_id ? teamNames.get(photo.team_id) ?? copy.gallery.unknownTeam : copy.gallery.unknownTeam,
    challengeId: photo.challenge_id,
    challengeTitle: challenges.find((challenge) => challenge.id === photo.challenge_id)?.translations[locale].title ?? copy.gallery.untitledChallenge,
    caption: photo.caption ?? copy.gallery.untitledPhoto,
    status: photo.status,
    createdAt: photo.created_at,
    imageUrl: await signedUrl(supabase, photo.storage_path),
    thumbnailUrl: await signedUrl(supabase, photo.thumbnail_path),
    tone: toneForIndex(index + all.length),
  })));
  const mosaicRow = mosaicResult.data as SupabaseMosaicRow | null;
  const mosaic = mosaicRow ? {
    id: mosaicRow.id,
    status: mosaicRow.status,
    algorithmVersion: mosaicRow.algorithm_version,
    generatedAt: mosaicRow.generated_at ?? undefined,
    generatedImageUrl: mosaicRow.generated_image_path ? await signedUrl(supabase, mosaicRow.generated_image_path, "mosaics") : undefined,
    targetImageUrl: mosaicRow.target_image_path ? await signedUrl(supabase, mosaicRow.target_image_path, "mosaics") : experienceTargetUrl,
  } satisfies AdminMosaic : null;
  return { experience: { ...experience, targetImageUrl: mosaic?.targetImageUrl ?? experienceTargetUrl }, participants, teams, challenges, photos, mosaic };
}

export async function updateAdminExperience(access: AdminAccess, patch: Partial<AdminExperience>) {
  validateExperience(patch);
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.experience = { ...state.experience, ...patch };
    writeLocalAdminState(state);
    syncParticipantPhase(state.experience.currentPhase);
    return;
  }
  const supabase = requireSupabase();
  const payload = {
    title: patch.title,
    description: patch.description,
    place: patch.place,
    join_code: patch.joinCode,
    start_date: patch.startDate === undefined ? undefined : patch.startDate || null,
    end_date: patch.endDate === undefined ? undefined : patch.endDate || null,
    supported_languages: patch.supportedLanguages,
    state: patch.state,
    current_phase: patch.currentPhase,
    selection_enabled: patch.selectionEnabled,
    story_count: patch.storyCount,
    mosaic_visible: patch.mosaicVisible,
  };
  const { error } = await supabase.from("experiences").update(payload).eq("id", access.experienceId).select("id").single();
  if (error) throw error;
}

export async function createAdminExperience(access: AdminAccess, input: CreateExperienceInput): Promise<AdminAccess> {
  validateNewExperience(input);
  if (access.mode === "demo") {
    const state = defaultLocalAdminState();
    state.experience = { ...state.experience, title: input.title.trim(), slug: input.slug.trim() || "new-field", place: input.place.trim(), joinCode: input.joinCode.trim().toUpperCase(), supportedLanguages: input.supportedLanguages };
    writeLocalAdminState(state);
    return access;
  }
  const { data, error } = await requireSupabase().rpc("create_experience_admin", {
    p_slug: input.slug,
    p_title: input.title,
    p_place: input.place,
    p_first_name: input.firstName,
    p_join_code: input.joinCode,
    p_supported_languages: input.supportedLanguages,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] as { experience_id?: string; participant_id?: string } | undefined : data as { experience_id?: string; participant_id?: string } | null;
  if (!result?.experience_id) throw new Error("The new experience could not be opened.");
  writeBrowserStorage("swods-admin-experience", result.experience_id);
  return { mode: "supabase", experienceId: result.experience_id, participantId: result.participant_id };
}

export async function createAdminTeam(access: AdminAccess, input: Pick<AdminTeam, "name" | "symbol" | "accent" | "displayOrder">) {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.teams.push({ id: `demo-team-${Date.now()}`, ...input, memberCount: 0 });
    writeLocalAdminState(state);
    return;
  }
  const { error } = await requireSupabase().from("teams").insert({ experience_id: access.experienceId, name: input.name, symbol: input.symbol, accent: input.accent, display_order: input.displayOrder });
  if (error) throw error;
}

export async function updateAdminTeam(access: AdminAccess, teamId: string, input: Pick<AdminTeam, "name" | "symbol" | "accent" | "displayOrder">) {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.teams = state.teams.map((team) => team.id === teamId ? { ...team, ...input } : team);
    writeLocalAdminState(state);
    return;
  }
  const { error } = await requireSupabase().from("teams").update({ name: input.name, symbol: input.symbol, accent: input.accent, display_order: input.displayOrder }).eq("id", teamId).eq("experience_id", access.experienceId).select("id").single();
  if (error) throw error;
}

export async function deleteAdminTeam(access: AdminAccess, teamId: string) {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.teams = state.teams.filter((team) => team.id !== teamId);
    state.participants = state.participants.map((participant) => participant.teamId === teamId ? { ...participant, teamId: null } : participant);
    writeLocalAdminState(state);
    return;
  }
  const { error } = await requireSupabase().from("teams").delete().eq("id", teamId).eq("experience_id", access.experienceId).select("id").single();
  if (error) throw error;
}

export async function updateAdminParticipant(access: AdminAccess, participantId: string, input: { firstName: string; isActive: boolean }) {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.participants = state.participants.map((participant) => participant.id === participantId ? { ...participant, firstName: input.firstName.trim(), isActive: input.isActive } : participant);
    writeLocalAdminState(state);
    return;
  }
  const { data, error } = await requireSupabase().rpc("admin_update_participant", { p_experience_id: access.experienceId, p_participant_id: participantId, p_first_name: input.firstName, p_is_active: input.isActive });
  if (error || !data) throw error ?? new Error("Participant not found.");
}

export async function assignAdminParticipant(access: AdminAccess, participantId: string, teamId: string | null) {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.participants = state.participants.map((participant) => participant.id === participantId ? { ...participant, teamId } : participant);
    state.teams = state.teams.map((team) => ({ ...team, memberCount: state.participants.filter((participant) => participant.teamId === team.id).length }));
    writeLocalAdminState(state);
    return;
  }
  const { error } = await requireSupabase().rpc("admin_assign_participant", { p_experience_id: access.experienceId, p_participant_id: participantId, p_team_id: teamId });
  if (error) throw error;
}

export async function createAdminChallenge(access: AdminAccess, input: Omit<AdminChallenge, "id">) {
  validateChallenge(input);
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.challenges.push({ id: `demo-challenge-${Date.now()}`, ...input });
    writeLocalAdminState(state);
    return;
  }
  await saveChallengeAtomically(access, null, input);
}

async function saveChallengeAtomically(access: AdminAccess, challengeId: string | null, input: Omit<AdminChallenge, "id">) {
  const { data, error } = await requireSupabase().rpc("admin_save_challenge", {
    p_experience_id: access.experienceId,
    p_challenge_id: challengeId,
    p_settings: {
    slug: input.slug,
    category: input.category,
    difficulty: input.difficulty || null,
    required: input.required,
    secret: input.secret,
    assigned_team_id: input.assignedTeamId,
    max_photos: input.maxPhotos,
    unlock_phase: input.unlockPhase,
    is_active: input.isActive,
    display_order: input.displayOrder,
    },
    p_translations: localesFromInput(input.translations, challengeId ?? ""),
  });
  if (error || !data) throw error ?? new Error("The invitation could not be saved.");
}

export async function updateAdminChallenge(access: AdminAccess, challengeId: string, input: Omit<AdminChallenge, "id">) {
  validateChallenge(input);
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.challenges = state.challenges.map((challenge) => challenge.id === challengeId ? { id: challengeId, ...input } : challenge);
    writeLocalAdminState(state);
    return;
  }
  await saveChallengeAtomically(access, challengeId, input);
}

export async function deleteAdminChallenge(access: AdminAccess, challengeId: string) {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.challenges = state.challenges.filter((challenge) => challenge.id !== challengeId);
    writeLocalAdminState(state);
    return;
  }
  const { error } = await requireSupabase().from("challenges").delete().eq("id", challengeId).eq("experience_id", access.experienceId).select("id").single();
  if (error) throw error;
}

export async function updateAdminPhotoStatus(access: AdminAccess, photoId: string, status: "visible" | "hidden") {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.photoStatuses = { ...state.photoStatuses, [photoId]: status };
    writeLocalAdminState(state);
    return;
  }
  const { error } = await requireSupabase().from("photos").update({ status }).eq("id", photoId).eq("experience_id", access.experienceId).select("id").single();
  if (error) throw error;
}

export async function deleteAdminPhoto(access: AdminAccess, photo: AdminPhoto) {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    const localPhotos = listLocalPhotoRecords().filter((item) => item.id !== photo.id);
    if (!writeBrowserStorage("swods-local-photos", JSON.stringify(localPhotos))) throw new Error("Browser storage is unavailable.");
    state.photoStatuses = { ...state.photoStatuses, [photo.id]: "deleted" };
    writeLocalAdminState(state);
    return;
  }
  const supabase = requireSupabase();
  const { error } = await supabase.from("photos").delete().eq("id", photo.id).eq("experience_id", access.experienceId);
  if (error) throw error;
  await retryPhotoCleanup(photo.id);
}

export async function saveAdminTargetImage(access: AdminAccess, file: File) {
  const processed = await processImage(file);
  if (access.mode === "demo") {
    const targetImageUrl = await blobToDataUrl(processed.image);
    const state = readLocalAdminState();
    state.experience = { ...state.experience, targetImageUrl, targetImagePath: "local/target", mosaicVisible: false };
    state.mosaic = { status: "draft", algorithmVersion: "tone-opacity-v1", targetImageUrl };
    writeLocalAdminState(state);
    return targetImageUrl;
  }
  const supabase = requireSupabase();
  const path = `${access.experienceId}/target/${crypto.randomUUID()}.${processed.extension}`;
  const { error: uploadError } = await supabase.storage.from("mosaics").upload(path, processed.image, { contentType: processed.mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from("experiences").update({ target_image_path: path, mosaic_visible: false }).eq("id", access.experienceId);
  if (error) throw error;
  const { data: currentMosaic, error: mosaicReadError } = await supabase.from("mosaics").select("id").eq("experience_id", access.experienceId).limit(1).maybeSingle();
  if (mosaicReadError) throw mosaicReadError;
  const mosaicSave = currentMosaic?.id
    ? await supabase.from("mosaics").update({ target_image_path: path, status: "draft", generated_image_path: null, generated_at: null }).eq("id", currentMosaic.id)
    : await supabase.from("mosaics").insert({ experience_id: access.experienceId, target_image_path: path, status: "draft", algorithm_version: "tone-opacity-v1", generation_seed: 1 });
  if (mosaicSave.error) throw mosaicSave.error;
  const url = await signedUrl(supabase, path, "mosaics");
  return url ?? "";
}

export async function saveGeneratedMosaic(access: AdminAccess, result: MosaicResult) {
  if (access.mode === "demo") {
    const state = readLocalAdminState();
    state.mosaic = { status: "ready", algorithmVersion: result.algorithmVersion, generatedAt: new Date().toISOString(), generatedImageUrl: result.dataUrl, targetImageUrl: state.experience.targetImageUrl };
    writeLocalAdminState(state);
    return result.dataUrl;
  }
  const supabase = requireSupabase();
  const path = `${access.experienceId}/generated/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from("mosaics").upload(path, result.blob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;
  const { data: current, error: currentError } = await supabase.from("mosaics").select("id, target_image_path").eq("experience_id", access.experienceId).limit(1).maybeSingle();
  if (currentError) throw currentError;
  const payload = { experience_id: access.experienceId, target_image_path: (current?.target_image_path as string | undefined) ?? "", generated_image_path: path, status: "ready", algorithm_version: result.algorithmVersion, generation_seed: Date.now(), generated_at: new Date().toISOString() };
  const saveResult = current?.id
    ? await supabase.from("mosaics").update(payload).eq("id", current.id)
    : await supabase.from("mosaics").insert(payload);
  if (saveResult.error) throw saveResult.error;
  return await signedUrl(supabase, path, "mosaics");
}

async function loadDemoSnapshot(locale: Locale, copy: Dictionary): Promise<AdminSnapshot> {
  const state = readLocalAdminState();
  const teamNames = new Map(state.teams.map((team) => [team.id, team.name]));
  const participantNames = new Map(state.participants.map((participant) => [participant.id, participant.firstName]));
  const gallerySession: ParticipantSession = { participantId: "demo-admin", experienceId: DEMO_EXPERIENCE_ID, name: "Field admin", country: "", locale, phase: state.experience.currentPhase, mode: "demo", onboardingCompleted: true };
  const gallery = await loadGalleryData(gallerySession, locale, copy, { includeModeratedDemo: true });
  return {
    experience: state.experience,
    participants: state.participants,
    teams: state.teams.map((team) => ({ ...team, memberCount: state.participants.filter((participant) => participant.teamId === team.id).length })),
    challenges: state.challenges,
    photos: gallery.photos.map((photo) => adminPhotoFromGallery(photo, participantNames, teamNames, state.challenges, state.photoStatuses)),
    mosaic: state.mosaic,
  };
}

function adminPhotoFromGallery(photo: GalleryPhoto, participantNames: Map<string, string>, teamNames: Map<string, string>, challenges: AdminChallenge[], photoStatuses: LocalAdminState["photoStatuses"]): AdminPhoto {
  return {
    id: photo.id,
    participantId: photo.participantId,
    participantName: participantNames.get(photo.participantId) ?? photo.author,
    teamId: photo.teamId,
    teamName: photo.teamId ? teamNames.get(photo.teamId) ?? photo.team : photo.team,
    challengeId: photo.challengeId,
    challengeTitle: challenges.find((challenge) => challenge.id === photo.challengeId)?.translations.en.title ?? photo.challenge,
    caption: photo.caption,
    status: photoStatuses[photo.id] ?? "visible",
    createdAt: photo.createdAt,
    imageUrl: photo.imageUrl,
    thumbnailUrl: photo.thumbnailUrl,
    tone: photo.tone,
  };
}

function readLocalAdminAuth() {
  return readBrowserStorage(LOCAL_ADMIN_AUTH_KEY) === "true";
}

export function readLocalAdminState(): LocalAdminState {
  const raw = readBrowserStorage(LOCAL_ADMIN_STATE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<LocalAdminState>;
      if (parsed.experience && Array.isArray(parsed.participants) && Array.isArray(parsed.teams) && Array.isArray(parsed.challenges)) return { ...parsed, photoStatuses: parsed.photoStatuses ?? {}, mosaic: parsed.mosaic ?? null } as LocalAdminState;
    } catch {
      // Fall through to the clean demo defaults.
    }
  }
  return defaultLocalAdminState();
}

export function writeLocalAdminState(state: LocalAdminState) {
  if (!writeBrowserStorage(LOCAL_ADMIN_STATE_KEY, JSON.stringify(state))) throw new Error("Browser storage is full or unavailable.");
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ADMIN_STATE_EVENT));
}

function defaultLocalAdminState(): LocalAdminState {
  const teams = [
    { id: "demo-tajo", name: "Tajo", symbol: "◌", accent: "wood", displayOrder: 1, memberCount: 4 },
    { id: "demo-alagon", name: "Alagón", symbol: "≈", accent: "river", displayOrder: 2, memberCount: 4 },
    { id: "demo-ambroz", name: "Ambroz", symbol: "✳", accent: "moss", displayOrder: 3, memberCount: 3 },
  ];
  const names = ["Lucía", "Nerea", "Irene", "Mateo", "Álvaro", "Matteo", "Giulia", "Luca", "Sofia", "Davide", "Emma"];
  const participants = names.map((firstName, index) => ({
    id: `demo-participant-${index + 1}`,
    firstName,
    countryCode: index < 5 ? "ES" : "IT",
    isAdmin: false,
    isActive: true,
    teamId: teams[index % teams.length]?.id ?? null,
    createdAt: new Date(Date.now() - (names.length - index) * 86_400_000).toISOString(),
  }));
  return {
    experience: {
      id: DEMO_EXPERIENCE_ID,
      slug: "hervas-october",
      title: "See What Others Don’t See — Hervás",
      description: "A private collective photography experience in Hervás.",
      place: "Hervás, Cáceres",
      joinCode: "HERVAS",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      supportedLanguages: ["es", "it", "en"],
      state: "active",
      currentPhase: "exploration",
      selectionEnabled: true,
      storyCount: 3,
      mosaicVisible: false,
      targetImagePath: "/demo-target.svg",
      targetImageUrl: "/demo-target.svg",
    },
    participants,
    teams,
    challenges: demoChallenges.map(demoChallengeToAdmin),
    mosaic: { status: "draft", algorithmVersion: "tone-opacity-v1", targetImageUrl: "/demo-target.svg" },
    photoStatuses: {},
  };
}

function demoChallengeToAdmin(challenge: DemoChallenge): AdminChallenge {
  const translations = Object.fromEntries((["en", "es", "it"] as const).map((locale) => {
    const copy = getDictionary(locale).challenges;
    return [locale, {
      title: copy[challenge.titleKey],
      description: copy[challenge.descriptionKey],
      hint: copy[challenge.hintKey],
    }];
  })) as Record<Locale, AdminTranslation>;
  return {
    id: challenge.id,
    slug: challenge.id,
    category: challenge.category ?? "attention",
    difficulty: challenge.difficulty ?? "gentle",
    required: challenge.required ?? false,
    secret: challenge.secret ?? false,
    assignedTeamId: challenge.assignedTeamId ?? null,
    maxPhotos: challenge.maxPhotos ?? 1,
    unlockPhase: challenge.state === "locked" ? "selection" : "exploration",
    isActive: true,
    displayOrder: Number.parseInt(challenge.order, 10),
    translations,
  };
}

function normalizeExperience(row: SupabaseExperienceRow): AdminExperience {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    place: row.place,
    joinCode: row.join_code,
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    supportedLanguages: (row.supported_languages ?? []).filter(isLocaleValue),
    state: row.state,
    currentPhase: isExperiencePhase(row.current_phase) ? row.current_phase : "welcome",
    selectionEnabled: row.selection_enabled,
    storyCount: row.story_count,
    mosaicVisible: row.mosaic_visible,
    targetImagePath: row.target_image_path ?? undefined,
  };
}

function challengeToAdmin(row: SupabaseChallengeRow): Omit<AdminChallenge, "translations"> {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    difficulty: row.difficulty ?? "",
    required: row.required,
    secret: row.secret,
    assignedTeamId: row.assigned_team_id,
    maxPhotos: row.max_photos,
    unlockPhase: isExperiencePhase(row.unlock_phase) ? row.unlock_phase : "exploration",
    isActive: row.is_active,
    displayOrder: row.display_order,
  };
}

function translationsFor(challengeId: string, rows: SupabaseTranslationRow[]): Record<Locale, AdminTranslation> {
  const fallback = { title: "Untitled invitation", description: "", hint: "" };
  const find = (locale: Locale): AdminTranslation => {
    const row = rows.find((item) => item.challenge_id === challengeId && item.locale === locale);
    return row ? { title: row.title, description: row.description, hint: row.hint ?? "" } : fallback;
  };
  return {
    en: find("en"),
    es: find("es"),
    it: find("it"),
  };
}

function localesFromInput(translations: Record<Locale, AdminTranslation>, challengeId: string) {
  return (Object.keys(translations) as Locale[]).map((locale) => ({ challenge_id: challengeId, locale, title: translations[locale].title, description: translations[locale].description, hint: translations[locale].hint || null }));
}

function syncParticipantPhase(phase: ExperiencePhase) {
  const session = readParticipantSession();
  if (session?.experienceId === DEMO_EXPERIENCE_ID) updateParticipantSession({ phase });
}

function requireSupabase() {
  const supabase = createBrowserSupabaseClient();
  if (!supabase || !hasSupabaseConfig()) throw new Error("Supabase is not configured.");
  return supabase;
}

async function signedUrl(supabase: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>, path: string, bucket = "photos") {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error) return undefined;
  return data?.signedUrl;
}

function isLocaleValue(value: string): value is Locale {
  return value === "en" || value === "es" || value === "it";
}

function toneForIndex(index: number): GalleryPhoto["tone"] {
  return (["clay", "river", "moss", "sun", "ink"] as const)[index % 5];
}

type SupabaseExperienceRow = {
  id: string; slug: string; title: string; description: string | null; place: string; join_code: string; start_date: string | null; end_date: string | null; supported_languages: string[]; state: "draft" | "active" | "archived"; current_phase: string; selection_enabled: boolean; story_count: number; mosaic_visible: boolean; target_image_path: string | null;
};
type SupabaseParticipantRow = { id: string; first_name: string; country_code: string | null; is_admin: boolean; is_active: boolean; created_at: string };
type SupabaseTeamRow = { id: string; name: string; symbol: string | null; accent: string | null; display_order: number };
type MembershipRow = { team_id: string; participant_id: string };
type SupabaseChallengeRow = { id: string; slug: string; category: string; difficulty: string | null; required: boolean; secret: boolean; assigned_team_id: string | null; max_photos: number; unlock_phase: string; is_active: boolean; display_order: number };
type SupabaseTranslationRow = { challenge_id: string; locale: string; title: string; description: string; hint: string | null };
type SupabasePhotoRow = { id: string; participant_id: string; team_id: string | null; challenge_id: string; storage_path: string; thumbnail_path: string; caption: string | null; status: "visible" | "hidden" | "deleted"; created_at: string; };
type SupabaseMosaicRow = { id: string; target_image_path: string; generated_image_path: string | null; status: "draft" | "processing" | "ready" | "failed"; algorithm_version: string; generated_at: string | null };
