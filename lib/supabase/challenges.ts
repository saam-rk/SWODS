import type { Dictionary, Locale } from "@/lib/i18n";
import { type ChallengeState } from "@/lib/demo-data";
import { readLocalAdminState } from "@/lib/admin";
import { createBrowserSupabaseClient, isDemoMode } from "@/lib/supabase/client";
import type { ParticipantSession } from "@/lib/participant-session";
import { listLocalPhotoRecords } from "@/lib/supabase/photos";

export type ChallengeItem = {
  id: string;
  order: string;
  title: string;
  description: string;
  hint: string;
  state: ChallengeState;
  category: string;
  difficulty: string | null;
  required: boolean;
  secret: boolean;
  assignedTeamId: string | null;
  maxPhotos: number;
  photoCount: number;
};

export async function loadChallenges(session: ParticipantSession | null, locale: Locale, copy: Dictionary) {
  if (!session) throw new Error("Join the experience first.");
  if (session.mode === "demo" && isDemoMode()) return getDemoChallengeItems(session, locale);

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const [{ data: challengeData, error: challengeError }, { data: photoData, error: photoError }] = await Promise.all([
    supabase
      .from("challenges")
      .select("id, category, difficulty, required, secret, assigned_team_id, max_photos, unlock_phase, is_active, display_order")
      .eq("experience_id", session.experienceId)
      .order("display_order", { ascending: true }),
    supabase.rpc("participant_photo_counts", { p_participant_id: session.participantId }),
  ]);
  if (challengeError) throw challengeError;
  if (photoError) throw photoError;

  const rows = (challengeData ?? []) as ChallengeRow[];
  const challengeIds = rows.map((row) => row.id);
  const { data: translationData, error: translationError } = challengeIds.length === 0
    ? { data: [], error: null }
    : await supabase
      .from("challenge_translations")
      .select("challenge_id, locale, title, description, hint")
      .in("challenge_id", challengeIds);
  if (translationError) throw translationError;

  const translations = (translationData ?? []) as ChallengeTranslation[];
  const photoCounts = new Map<string, number>();
  for (const photo of (photoData ?? []) as Array<{ challenge_id: string; photo_count: number }>) {
    photoCounts.set(photo.challenge_id, Number(photo.photo_count));
  }
  const teamId = await resolveTeamId(supabase, session);

  return rows.flatMap((row) => {
    const assignedToAnotherTeam = Boolean(row.assigned_team_id && row.assigned_team_id !== teamId);
    if (assignedToAnotherTeam && row.secret) return [];

    const translation = translations.find((item) => item.challenge_id === row.id && item.locale === locale)
      ?? translations.find((item) => item.challenge_id === row.id && item.locale === "en");
    if (!translation) return [];

    return [{
      id: row.id,
      order: String(row.display_order).padStart(2, "0"),
      title: translation.title,
      description: translation.description,
      hint: translation.hint ?? "",
      state: row.is_active && row.unlock_phase === session.phase && !assignedToAnotherTeam ? "open" : "locked",
      category: row.category,
      difficulty: row.difficulty,
      required: row.required,
      secret: row.secret,
      assignedTeamId: row.assigned_team_id,
      maxPhotos: row.max_photos,
      photoCount: photoCounts.get(row.id) ?? 0,
    } satisfies ChallengeItem];
  });
}

function getDemoChallengeItems(session: ParticipantSession, locale: Locale): ChallengeItem[] {
  const state = readLocalAdminState();
  const photos = listLocalPhotoRecords().filter(p => p.participantId === session.participantId);
  return state.challenges.filter(c => !c.secret || (c.assignedTeamId && c.assignedTeamId === session.teamId)).sort((a,b) => a.displayOrder - b.displayOrder).map(c => ({
    id: c.id, order: String(c.displayOrder).padStart(2,"0"), ...c.translations[locale],
    state: c.isActive && state.experience.state === "active" && state.experience.currentPhase === "exploration" && c.unlockPhase === "exploration" && (!c.assignedTeamId || c.assignedTeamId === session.teamId) ? "open" : "locked",
    category: c.category, difficulty: c.difficulty, required: c.required, secret: c.secret, assignedTeamId: c.assignedTeamId, maxPhotos: c.maxPhotos,
    photoCount: photos.filter(p=>p.challengeId===c.id).length,
  }));
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

type ChallengeRow = {
  id: string;
  category: string;
  difficulty: string | null;
  required: boolean;
  secret: boolean;
  assigned_team_id: string | null;
  max_photos: number;
  unlock_phase: string;
  is_active: boolean;
  display_order: number;
};

type ChallengeTranslation = {
  challenge_id: string;
  locale: string;
  title: string;
  description: string;
  hint: string | null;
};
