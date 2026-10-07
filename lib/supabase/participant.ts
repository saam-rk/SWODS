import { createBrowserSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { readLocalAdminState, writeLocalAdminState } from "@/lib/admin";
import { validateJoinInput } from "@/lib/join-validation";
import { readParticipantSession, saveParticipantSession, type ParticipantSession } from "@/lib/participant-session";
import { normalizeParticipantExperienceState } from "@/lib/supabase/participant-phase";

export type JoinParticipantInput = {
  code: string;
  name: string;
  country: string;
  locale: "en" | "es" | "it";
};

export type JoinParticipantResult = {
  session: ParticipantSession;
  usedDemoMode: boolean;
};

export async function joinParticipant(input: JoinParticipantInput): Promise<JoinParticipantResult> {
  const cleanName = input.name.trim();
  const cleanCode = input.code.trim().toUpperCase();

  const validation = validateJoinInput({ code: cleanCode, name: cleanName, demoMode: false });
  if (validation.error) throw new Error(validation.error);

  if (!hasSupabaseConfig()) {
    const state = readLocalAdminState();
    if (state.experience.joinCode !== cleanCode || state.experience.state !== "active") throw new Error("Experience not found.");
    const previous = readParticipantSession();
    const participantId = previous?.mode === "demo" && previous.experienceId === state.experience.id ? previous.participantId : crypto.randomUUID();
    const existing = state.participants.find((participant) => participant.id === participantId);
    if (existing && !existing.isActive) throw new Error("Participant access is paused.");
    const teamId = existing?.teamId ?? [...state.teams].sort((a, b) => state.participants.filter((p) => p.teamId === a.id).length - state.participants.filter((p) => p.teamId === b.id).length)[0]?.id;
    state.participants = state.participants.filter((participant) => participant.id !== participantId);
    state.participants.push({ id: participantId, firstName: cleanName, countryCode: input.country, isAdmin: false, isActive: true, teamId: teamId ?? null, createdAt: existing?.createdAt ?? new Date().toISOString() });
    writeLocalAdminState(state);
    const session: ParticipantSession = {
      participantId,
      experienceId: state.experience.id,
      experienceSlug: state.experience.slug,
      teamId,
      name: cleanName,
      country: input.country,
      locale: input.locale,
      phase: state.experience.currentPhase,
      mode: "demo",
      onboardingCompleted: previous?.participantId === participantId && previous.onboardingCompleted === true,
    };
    saveParticipantSession(session);
    return { session, usedDemoMode: true };
  }

  const supabase = createBrowserSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const existingSession = await supabase.auth.getSession();
  if (!existingSession.data.session) {
    const anonymousAuth = await supabase.auth.signInAnonymously();
    if (anonymousAuth.error) throw anonymousAuth.error;
  }

  const { data, error } = await supabase.rpc("join_experience", {
    p_join_code: cleanCode,
    p_first_name: cleanName,
    p_country_code: input.country || null,
    p_preferred_locale: input.locale,
  });

  if (error) throw error;

  const joined = Array.isArray(data) ? data[0] as { participant_id?: string; experience_id?: string; team_id?: string; onboarding_completed?: boolean } | undefined : data as { participant_id?: string; experience_id?: string; team_id?: string; onboarding_completed?: boolean } | null;
  if (!joined?.participant_id || !joined.experience_id) throw new Error("The experience did not return a participant session.");

  const experience = await getExperienceState(supabase, joined.experience_id);
  const session: ParticipantSession = {
    participantId: joined.participant_id,
    experienceId: joined.experience_id,
    teamId: joined.team_id,
    name: cleanName,
    country: input.country,
    locale: input.locale,
    experienceSlug: experience.slug,
    phase: experience.phase,
    mode: "supabase",
    onboardingCompleted: joined.onboarding_completed === true,
  };
  saveParticipantSession(session);
  return { session, usedDemoMode: false };
}

export async function completeParticipantOnboarding(session: ParticipantSession) {
  if (session.mode === "supabase") {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data, error } = await supabase.rpc("complete_participant_onboarding", {
      p_participant_id: session.participantId,
    });
    if (error) throw error;
    if (data !== true) throw new Error("The participant session is no longer active.");
  }

  saveParticipantSession({ ...session, onboardingCompleted: true });
}

async function getExperienceState(supabase: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>, experienceId: string) {
  const { data, error } = await supabase.from("experiences").select("current_phase, slug").eq("id", experienceId).maybeSingle();
  if (error) throw error;
  return normalizeParticipantExperienceState(data) ?? { phase: "exploration" as const };
}
