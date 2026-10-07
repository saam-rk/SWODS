import type { Dictionary, Locale } from "@/lib/i18n";
import { demoChallenges, demoPhotos, type DemoPhoto } from "@/lib/demo-data";
import type { ParticipantSession } from "@/lib/participant-session";
import { createBrowserSupabaseClient, isDemoMode } from "@/lib/supabase/client";
import { retryPhotoCleanup } from "@/lib/supabase/photo-cleanup";
import { readLocalAdminState } from "@/lib/admin";
import { listLocalPhotoRecords, type SavedPhoto } from "@/lib/supabase/photos";
import { addStorySelection, moveStorySelection, removeStorySelection, type StorySelectionRecord } from "@/lib/story-selection";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

export type GalleryFilter = "all" | "team" | "challenge";

export type GalleryPhoto = {
  id: string;
  experienceId: string;
  participantId: string;
  teamId: string | null;
  challengeId: string;
  study: string;
  author: string;
  team: string;
  teamSymbol: string;
  challenge: string;
  caption: string;
  altText: string;
  createdAt: string;
  orientation: DemoPhoto["orientation"];
  tone: DemoPhoto["tone"];
  imageUrl?: string;
  thumbnailUrl?: string;
  storagePath?: string;
  thumbnailPath?: string;
  source: "demo" | "local" | "supabase";
};

export type GalleryTeam = {
  id: string;
  name: string;
  symbol: string;
};

export type GalleryChallenge = {
  id: string;
  title: string;
};

export type StorySelection = StorySelectionRecord;

export type GalleryData = {
  photos: GalleryPhoto[];
  teams: GalleryTeam[];
  challenges: GalleryChallenge[];
  storySelections: StorySelection[];
  storyMarks: string[];
  storyCount: number;
  selectionEnabled: boolean;
  cleanupPending?: boolean;
};

const LOCAL_STORY_MARKS_KEY = "swods-local-story-marks";
const LOCAL_STORY_SELECTIONS_KEY = "swods-local-story-selections";

export async function loadGalleryData(session: ParticipantSession | null, locale: Locale, copy: Dictionary, options: { includeModeratedDemo?: boolean } = {}): Promise<GalleryData> {
  if (!session) throw new Error("Join the experience first.");
  if (session.mode === "demo" && isDemoMode()) {
    return getDemoGalleryData(session, copy, locale, options.includeModeratedDemo);
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  let cleanupPending = false;
  try { await retryPhotoCleanup(); } catch { cleanupPending = true; }
  const [experienceResult, photosResult, participantsResult, teamsResult, challengesResult, marksResult, selectionsResult] = await Promise.all([
    supabase.from("experiences").select("selection_enabled, story_count").eq("id", session.experienceId).maybeSingle(),
    supabase
      .from("photos")
      .select("id, experience_id, participant_id, team_id, challenge_id, storage_path, thumbnail_path, caption, alt_text, created_at")
      .eq("experience_id", session.experienceId)
      .eq("status", "visible")
      .order("created_at", { ascending: false }),
    supabase.from("participants").select("id, first_name").eq("experience_id", session.experienceId),
    supabase.from("teams").select("id, name, symbol, display_order").eq("experience_id", session.experienceId).order("display_order", { ascending: true }),
    supabase.from("challenges").select("id, display_order").eq("experience_id", session.experienceId).order("display_order", { ascending: true }),
    supabase.from("story_marks").select("photo_id").eq("experience_id", session.experienceId).eq("participant_id", session.participantId),
    supabase.from("story_selections").select("id, experience_id, team_id, photo_id, position").eq("experience_id", session.experienceId).order("position", { ascending: true }),
  ]);

  const firstError = [
    experienceResult.error,
    photosResult.error,
    participantsResult.error,
    teamsResult.error,
    challengesResult.error,
    marksResult.error,
    selectionsResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;
  if (!experienceResult.data) throw new Error("Experience access is unavailable.");

  const photoRows = (photosResult.data ?? []) as SupabasePhotoRow[];
  const participantNames = new Map(((participantsResult.data ?? []) as ParticipantRow[]).map((participant) => [participant.id, participant.first_name]));
  const teams = ((teamsResult.data ?? []) as SupabaseTeamRow[]).map((team) => ({ id: team.id, name: team.name, symbol: team.symbol ?? "◌" }));
  const teamNames = new Map(teams.map((team) => [team.id, team]));
  const challengeRows = (challengesResult.data ?? []) as SupabaseChallengeRow[];
  const challengeIds = challengeRows.map((challenge) => challenge.id);
  const translationResult = challengeIds.length === 0
    ? { data: [], error: null }
    : await supabase.from("challenge_translations").select("challenge_id, locale, title").in("challenge_id", challengeIds);
  if (translationResult.error) throw translationResult.error;

  const translations = (translationResult.data ?? []) as ChallengeTranslationRow[];
  const challengeTitles = new Map(challengeRows.map((challenge) => {
    const translation = translations.find((item) => item.challenge_id === challenge.id && item.locale === locale)
      ?? translations.find((item) => item.challenge_id === challenge.id && item.locale === "en");
    return [challenge.id, translation?.title ?? copy.gallery.untitledChallenge];
  }));

  const signed = new Map<string, string>();
  const paths = [...new Set(photoRows.flatMap(photo => [photo.storage_path, photo.thumbnail_path]))];
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { data, error } = await supabase.storage.from("photos").createSignedUrls(paths.slice(offset, offset + 100), 300);
    if (error) throw error;
    for (const item of data ?? []) {
      if (item.error) throw new Error("A photograph could not be opened. Try again.");
      if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
    }
  }
  const photos = photoRows.map((photo, index) => {
    const team = photo.team_id ? teamNames.get(photo.team_id) : undefined;
    const author = participantNames.get(photo.participant_id) ?? copy.gallery.unknownAuthor;
    const challenge = challengeTitles.get(photo.challenge_id) ?? copy.gallery.untitledChallenge;
    const imageUrl = signed.get(photo.storage_path);
    const thumbnailUrl = signed.get(photo.thumbnail_path);
    return {
      id: photo.id,
      experienceId: photo.experience_id,
      participantId: photo.participant_id,
      teamId: photo.team_id,
      challengeId: photo.challenge_id,
      study: `${String(index + 1).padStart(2, "0")} / ${String(photoRows.length).padStart(2, "0")}`,
      author,
      team: team?.name ?? copy.gallery.unknownTeam,
      teamSymbol: team?.symbol ?? "◌",
      challenge,
      caption: photo.caption ?? copy.gallery.untitledPhoto,
      altText: photo.alt_text ?? photo.caption ?? interpolatePhotoAlt(copy.gallery.photoAlt, { author, team: team?.name ?? copy.gallery.unknownTeam }),
      createdAt: photo.created_at,
      orientation: index % 3 === 1 ? "landscape" : "portrait",
      tone: toneForIndex(index),
      imageUrl,
      thumbnailUrl,
      storagePath: photo.storage_path,
      thumbnailPath: photo.thumbnail_path,
      source: "supabase",
    } satisfies GalleryPhoto;
  });

  const experience = experienceResult.data as { selection_enabled?: boolean; story_count?: number } | null;
  return {
    photos,
    teams,
    challenges: getUsedChallenges(photoRows, challengeTitles),
    storySelections: normalizeStorySelections(selectionsResult.data),
    storyMarks: ((marksResult.data ?? []) as StoryMarkRow[]).map((mark) => mark.photo_id),
    storyCount: experience?.story_count ?? 3,
    selectionEnabled: experience?.selection_enabled ?? true,
    cleanupPending,
  };
}

export async function toggleStoryMark(session: ParticipantSession, photoId: string) {
  if (session.mode === "demo" && isDemoMode()) {
    const state = readLocalAdminState();
    if (!["exploration", "selection"].includes(state.experience.currentPhase)) throw new Error("Story marks are closed.");
    const current = readLocalStoryMarks().filter((mark) => mark.experienceId === session.experienceId && mark.participantId === session.participantId);
    const alreadyMarked = current.some((mark) => mark.photoId === photoId);
    const next = alreadyMarked
      ? current.filter((mark) => mark.photoId !== photoId)
      : [...current, { experienceId: session.experienceId, participantId: session.participantId, photoId }];
    writeLocalStoryMarks([...readLocalStoryMarks().filter((mark) => !(mark.experienceId === session.experienceId && mark.participantId === session.participantId)), ...next]);
    return !alreadyMarked;
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("toggle_story_mark", {
    p_experience_id: session.experienceId,
    p_participant_id: session.participantId,
    p_photo_id: photoId,
  });
  if (error) throw error;
  return data === true;
}

export async function selectStoryPhoto(session: ParticipantSession, photoId: string) {
  const teamId = session.teamId ?? (session.mode === "demo" ? "demo-tajo" : undefined);
  if (!teamId) throw new Error("Your team is not available yet.");

  if (session.mode === "demo" && isDemoMode()) {
    const state = assertDemoSelection();
    const photo = listLocalPhotoRecords().find(p=>p.id===photoId);
    const demoPhoto = demoPhotos.find(p=>p.id===photoId);
    if ((photo?.teamId ?? (demoPhoto ? demoTeamId(demoPhoto.team) : null)) !== teamId || (state.photoStatuses[photoId] ?? "visible") !== "visible") throw new Error("Choose a visible photograph from your team.");
    const existing = readLocalStorySelections();
    writeLocalStorySelections(addStorySelection(existing, {
      id: `local-story-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      experienceId: session.experienceId,
      teamId,
      photoId,
    }, state.experience.storyCount));
    return;
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("select_story_photo", {
    p_experience_id: session.experienceId,
    p_team_id: teamId,
    p_photo_id: photoId,
  });
  if (error) throw error;
}

export async function removeStoryPhoto(session: ParticipantSession, photoId: string) {
  const teamId = session.teamId ?? (session.mode === "demo" ? "demo-tajo" : undefined);
  if (!teamId) throw new Error("Your team is not available yet.");

  if (session.mode === "demo" && isDemoMode()) {
    assertDemoSelection();
    writeLocalStorySelections(removeStorySelection(readLocalStorySelections(), session.experienceId, teamId, photoId));
    return;
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("story_selections")
    .delete()
    .eq("experience_id", session.experienceId)
    .eq("team_id", teamId)
    .eq("photo_id", photoId);
  if (error) throw error;
}

export async function moveStoryPhoto(session: ParticipantSession, photoId: string, direction: -1 | 1) {
  const teamId = session.teamId ?? (session.mode === "demo" ? "demo-tajo" : undefined);
  if (!teamId) throw new Error("Your team is not available yet.");

  if (session.mode === "demo" && isDemoMode()) {
    assertDemoSelection();
    writeLocalStorySelections(moveStorySelection(readLocalStorySelections(), session.experienceId, teamId, photoId, direction));
    return;
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.rpc("move_story_selection", {
    p_experience_id: session.experienceId,
    p_team_id: teamId,
    p_photo_id: photoId,
    p_direction: direction,
  });
  if (error) throw error;
}

function getDemoGalleryData(session: ParticipantSession | null, copy: Dictionary, locale: Locale, includeModerated = false): GalleryData {
  const localPhotos = session ? listLocalPhotoRecords().filter((photo) => photo.experienceId === session.experienceId) : [];
  const basePhotos = demoPhotos.map((photo, index) => demoPhotoToGalleryPhoto(photo, index, copy));
  const uploadedPhotos = localPhotos.map((photo, index) => localPhotoToGalleryPhoto(photo, index, localPhotos.length, session, copy));
  const state = readLocalAdminState();
  const teams = state.teams;
  const challenges = state.challenges.filter(c => !c.secret || c.assignedTeamId === session?.teamId).map((challenge) => ({ id: challenge.id, title: challenge.translations[locale].title }));
  const photos = [...uploadedPhotos, ...basePhotos].filter(photo => includeModerated || (state.photoStatuses[photo.id] ?? "visible") === "visible").map(photo => ({ ...photo,
    author: state.participants.find(p => p.id === photo.participantId)?.firstName ?? photo.author,
    team: teams.find(t => t.id === photo.teamId)?.name ?? copy.gallery.unknownTeam,
    challenge: challenges.find(c => c.id === photo.challengeId)?.title ?? copy.gallery.untitledChallenge,
  }));
  const selections = session ? readLocalStorySelections().filter((selection) => selection.experienceId === session.experienceId) : [];
  const marks = session
    ? readLocalStoryMarks().filter((mark) => mark.experienceId === session.experienceId && mark.participantId === session.participantId).map((mark) => mark.photoId)
    : [];

  return {
    photos,
    teams,
    challenges,
    storySelections: selections.filter(s => photos.some(p => p.id === s.photoId)),
    storyMarks: marks,
    storyCount: state.experience.storyCount,
    selectionEnabled: state.experience.selectionEnabled,
  };
}

function demoPhotoToGalleryPhoto(photo: DemoPhoto, index: number, copy: Dictionary): GalleryPhoto {
  return {
    id: photo.id,
    experienceId: "demo-hervas",
    participantId: `demo-${photo.author.toLowerCase()}`,
    teamId: demoTeamId(photo.team),
    challengeId: "first-signs-of-autumn",
    study: photo.study,
    author: photo.author,
    team: photo.team,
    teamSymbol: demoTeamSymbol(photo.team),
    challenge: copy.challenges.autumnSignsTitle,
    caption: photo.caption,
    altText: interpolatePhotoAlt(copy.gallery.photoAlt, { author: photo.author, team: photo.team }),
    createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    orientation: photo.orientation,
    tone: photo.tone,
    source: "demo",
  };
}

function localPhotoToGalleryPhoto(photo: SavedPhoto, index: number, total: number, session: ParticipantSession | null, copy: Dictionary): GalleryPhoto {
  const teamId = photo.teamId ?? session?.teamId ?? "demo-tajo";
  const team = demoTeamName(teamId);
  const author = session?.name ?? copy.gallery.unknownAuthor;
  return {
    id: photo.id,
    experienceId: photo.experienceId,
    participantId: photo.participantId,
    teamId,
    challengeId: photo.challengeId,
    study: `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    author,
    team,
    teamSymbol: demoTeamSymbol(team),
    challenge: challengeTitle(photo.challengeId, copy),
    caption: photo.caption || copy.gallery.untitledPhoto,
    altText: interpolatePhotoAlt(copy.gallery.photoAlt, { author, team }),
    createdAt: photo.createdAt,
    orientation: index % 2 === 0 ? "portrait" : "landscape",
    tone: toneForIndex(index + 2),
    imageUrl: photo.localImageUrl,
    thumbnailUrl: photo.localThumbnailUrl,
    source: "local",
  };
}

function getUsedChallenges(rows: SupabasePhotoRow[], titles: Map<string, string>): GalleryChallenge[] {
  const ids = [...new Set(rows.map((row) => row.challenge_id))];
    return ids.map((id) => ({ id, title: titles.get(id) ?? "Invitation" }));
}

function normalizeStorySelections(value: unknown): StorySelection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<StorySelection> & { experience_id?: string; team_id?: string; photo_id?: string };
    const experienceId = row.experienceId ?? row.experience_id;
    const teamId = row.teamId ?? row.team_id;
    const photoId = row.photoId ?? row.photo_id;
    return typeof row.id === "string" && typeof experienceId === "string" && typeof teamId === "string" && typeof photoId === "string" && typeof row.position === "number"
      ? [{ id: row.id, experienceId, teamId, photoId, position: row.position }]
      : [];
  });
}

function assertDemoSelection() {
  const state = readLocalAdminState();
  if (state.experience.currentPhase !== "selection" || !state.experience.selectionEnabled || state.experience.state !== "active") throw new Error("Team story selection is closed.");
  return state;
}

function challengeTitle(challengeId: string, copy: Dictionary) {
  const challenge = demoChallenges.find((item) => item.id === challengeId);
  if (!challenge) return copy.gallery.untitledChallenge;
  return copy.challenges[challenge.titleKey];
}

function demoTeamId(team: string) {
  if (team === "Alagón") return "demo-alagon";
  if (team === "Ambroz") return "demo-ambroz";
  return "demo-tajo";
}

function demoTeamName(teamId: string) {
  if (teamId === "demo-alagon") return "Alagón";
  if (teamId === "demo-ambroz") return "Ambroz";
  return "Tajo";
}

function demoTeamSymbol(team: string) {
  if (team === "Alagón") return "≈";
  if (team === "Ambroz") return "✳";
  return "◌";
}

function toneForIndex(index: number): DemoPhoto["tone"] {
  return (["clay", "river", "moss", "sun", "ink"] as const)[index % 5];
}

function interpolatePhotoAlt(template: string, values: { author: string; team: string }) {
  return template.replaceAll("{author}", values.author).replaceAll("{team}", values.team);
}

type LocalStoryMark = { experienceId: string; participantId: string; photoId: string };

function readLocalStoryMarks(): LocalStoryMark[] {
  return readLocalJson<LocalStoryMark>(LOCAL_STORY_MARKS_KEY, (value): value is LocalStoryMark => Boolean(value && typeof value === "object" && typeof (value as LocalStoryMark).experienceId === "string" && typeof (value as LocalStoryMark).participantId === "string" && typeof (value as LocalStoryMark).photoId === "string"));
}

function writeLocalStoryMarks(marks: LocalStoryMark[]) {
  if (!writeBrowserStorage(LOCAL_STORY_MARKS_KEY, JSON.stringify(marks))) throw new Error("Browser storage is unavailable.");
}

function readLocalStorySelections() {
  return readLocalJson<StorySelection>(LOCAL_STORY_SELECTIONS_KEY, (value): value is StorySelection => Boolean(value && typeof value === "object" && typeof (value as StorySelection).id === "string" && typeof (value as StorySelection).experienceId === "string" && typeof (value as StorySelection).teamId === "string" && typeof (value as StorySelection).photoId === "string" && typeof (value as StorySelection).position === "number"));
}

function writeLocalStorySelections(selections: StorySelection[]) {
  if (!writeBrowserStorage(LOCAL_STORY_SELECTIONS_KEY, JSON.stringify(selections))) throw new Error("Browser storage is unavailable.");
}

function readLocalJson<T>(key: string, guard: (value: unknown) => value is T): T[] {
  const raw = readBrowserStorage(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

type SupabasePhotoRow = {
  id: string;
  experience_id: string;
  participant_id: string;
  team_id: string | null;
  challenge_id: string;
  storage_path: string;
  thumbnail_path: string;
  caption: string | null;
  alt_text: string | null;
  created_at: string;
};

type ParticipantRow = { id: string; first_name: string };
type SupabaseTeamRow = { id: string; name: string; symbol: string | null };
type SupabaseChallengeRow = { id: string; display_order: number };
type ChallengeTranslationRow = { challenge_id: string; locale: string; title: string };
type StoryMarkRow = { photo_id: string };
