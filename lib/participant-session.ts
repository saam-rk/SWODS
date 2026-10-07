import { isExperiencePhase, type ExperiencePhase } from "@/lib/experience-phase";
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

export const PARTICIPANT_SESSION_KEY = "swods-participant-session";

export type ParticipantMode = "supabase" | "demo";

export type ParticipantSession = {
  participantId: string;
  experienceId: string;
  experienceSlug?: string;
  teamId?: string;
  name: string;
  country: string;
  locale: "en" | "es" | "it";
  phase: ExperiencePhase;
  mode: ParticipantMode;
  onboardingCompleted: boolean;
};

export function readParticipantSession(): ParticipantSession | null {
  if (typeof window === "undefined") return null;

  const rawSession = readBrowserStorage(PARTICIPANT_SESSION_KEY);
  if (!rawSession) return null;

  try {
    return normalizeParticipantSession(JSON.parse(rawSession) as unknown);
  } catch {
    return null;
  }
}

export function normalizeParticipantSession(value: unknown): ParticipantSession | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<ParticipantSession>;
  if (typeof parsed.participantId !== "string" || !parsed.participantId.trim()) return null;
  if (typeof parsed.experienceId !== "string" || !parsed.experienceId.trim()) return null;
  if (typeof parsed.name !== "string" || !parsed.name.trim()) return null;

  return {
    participantId: parsed.participantId,
    experienceId: parsed.experienceId,
    experienceSlug: typeof parsed.experienceSlug === "string" && parsed.experienceSlug.trim() ? parsed.experienceSlug : undefined,
    teamId: typeof parsed.teamId === "string" && parsed.teamId.trim() ? parsed.teamId : undefined,
    name: parsed.name,
    country: typeof parsed.country === "string" ? parsed.country : "",
    locale: parsed.locale === "es" || parsed.locale === "it" ? parsed.locale : "en",
    phase: isExperiencePhase(parsed.phase) ? parsed.phase : "exploration",
    mode: parsed.mode === "supabase" ? "supabase" : "demo",
    onboardingCompleted: parsed.onboardingCompleted === true,
  };
}

export function saveParticipantSession(session: ParticipantSession) {
  if (typeof window === "undefined") return;
  writeBrowserStorage(PARTICIPANT_SESSION_KEY, JSON.stringify(session));
}

export function updateParticipantSession(patch: Partial<ParticipantSession>) {
  const currentSession = readParticipantSession();
  if (!currentSession) return null;

  const nextSession = { ...currentSession, ...patch };
  saveParticipantSession(nextSession);
  return nextSession;
}

export function clearParticipantSession() {
  if (typeof window === "undefined") return;
  removeBrowserStorage(PARTICIPANT_SESSION_KEY);
  removeBrowserStorage("swods-participant");
}
