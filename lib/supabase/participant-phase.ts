import { isExperiencePhase, type ExperiencePhase } from "@/lib/experience-phase";
import { readLocalAdminState } from "@/lib/admin";
import { readBrowserStorage } from "@/lib/browser-storage";
import {
  PARTICIPANT_SESSION_KEY,
  readParticipantSession,
  saveParticipantSession,
  type ParticipantSession,
} from "@/lib/participant-session";
import { createBrowserSupabaseClient, hasSupabaseConfig } from "@/lib/supabase/client";

const DEMO_ADMIN_STATE_EVENT = "swods-admin-state-changed";
const PHASE_POLL_INTERVAL_MS = 30_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export type ParticipantExperienceState = {
  phase: ExperiencePhase;
  slug?: string;
};

export type ParticipantSessionValidation =
  | { status: "valid" | "unavailable"; session: ParticipantSession }
  | { status: "invalid" };

type PhaseSubscriptionHandlers = {
  onState: (state: ParticipantExperienceState) => void;
  onInvalid?: () => void;
  onError?: () => void;
};

export function normalizeParticipantExperienceState(value: unknown): ParticipantExperienceState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { current_phase?: unknown; phase?: unknown; slug?: unknown };
  const phase = typeof row.current_phase === "string" ? row.current_phase : typeof row.phase === "string" ? row.phase : null;
  if (!isExperiencePhase(phase)) return null;
  return {
    phase,
    slug: typeof row.slug === "string" && row.slug.trim() ? row.slug : undefined,
  };
}

export function participantDestinationForPhase(state: ParticipantExperienceState) {
  if (state.phase === "exploration") return "/challenges";
  if (state.phase === "selection") return "/gallery";
  if (state.phase === "presentation") return "/present";
  if (state.phase === "reveal") return "/reveal";
  if (state.phase === "finished" && state.slug) return `/memory/${encodeURIComponent(state.slug)}`;
  if (state.phase === "finished") return "/gallery";
  return "/explore";
}

export async function validateParticipantSession(session: ParticipantSession): Promise<ParticipantSessionValidation> {
  if (session.mode === "demo") {
    if (hasSupabaseConfig()) return { status: "invalid" };
    const state = readLocalAdminState();
    const participant = state.participants.find((row) => row.id === session.participantId);
    if (state.experience.id !== session.experienceId || !participant?.isActive) return { status: "invalid" };
    const updated = { ...session, phase: state.experience.currentPhase, experienceSlug: state.experience.slug, teamId: participant.teamId ?? undefined };
    saveParticipantSession(updated);
    return { status: "valid", session: updated };
  }
  if (!hasSupabaseConfig()) return { status: "invalid" };

  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { status: "invalid" };

  const authResult = await supabase.auth.getSession();
  if (authResult.error) return { status: "unavailable", session };
  if (!authResult.data.session) return { status: "invalid" };

  const [participantResult, experienceResult, membershipResult] = await Promise.all([
    supabase
      .from("participants")
      .select("id, experience_id, first_name, country_code, preferred_locale, onboarding_completed, is_active")
      .eq("id", session.participantId)
      .eq("experience_id", session.experienceId)
      .maybeSingle(),
    supabase
      .from("experiences")
      .select("current_phase, slug")
      .eq("id", session.experienceId)
      .maybeSingle(),
    supabase
      .from("team_members")
      .select("team_id")
      .eq("participant_id", session.participantId)
      .maybeSingle(),
  ]);

  if (participantResult.error || experienceResult.error) return { status: "unavailable", session };
  const participant = participantResult.data as ParticipantRow | null;
  const experience = normalizeParticipantExperienceState(experienceResult.data);
  if (!participant?.is_active || !experience) return { status: "invalid" };

  const locale = participant.preferred_locale === "es" || participant.preferred_locale === "it" ? participant.preferred_locale : "en";
  const nextSession: ParticipantSession = {
    ...session,
    experienceSlug: experience.slug ?? session.experienceSlug,
    teamId: membershipResult.error ? session.teamId : (membershipResult.data?.team_id as string | null | undefined) ?? undefined,
    name: participant.first_name,
    country: participant.country_code ?? "",
    locale,
    phase: experience.phase,
    onboardingCompleted: participant.onboarding_completed === true,
  };
  saveParticipantSession(nextSession);
  return { status: "valid", session: nextSession };
}

export function subscribeToParticipantPhase(session: ParticipantSession, handlers: PhaseSubscriptionHandlers) {
  if (session.mode === "demo") return subscribeToDemoPhase(session, handlers);

  const supabase = createBrowserSupabaseClient();
  if (!supabase || !hasSupabaseConfig()) {
    handlers.onInvalid?.();
    return () => undefined;
  }
  const client = supabase;

  let stopped = false;
  let channelGeneration = 0;
  let channel: ReturnType<typeof client.channel> | null = null;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshPromise: Promise<void> | null = null;

  function applyState(state: ParticipantExperienceState) {
    const current = readParticipantSession();
    if (!current || current.participantId !== session.participantId || current.experienceId !== session.experienceId) {
      handlers.onInvalid?.();
      return;
    }
    const effectiveState = { ...state, slug: state.slug ?? current.experienceSlug };
    saveParticipantSession({ ...current, phase: effectiveState.phase, experienceSlug: effectiveState.slug });
    handlers.onState(effectiveState);
  }

  function refresh() {
    if (stopped) return Promise.resolve();
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const { data, error } = await client
        .from("experiences")
        .select("current_phase, slug")
        .eq("id", session.experienceId)
        .maybeSingle();
      if (stopped) return;
      if (error) {
        handlers.onError?.();
        return;
      }
      const state = normalizeParticipantExperienceState(data);
      if (!state) {
        handlers.onInvalid?.();
        return;
      }
      applyState(state);
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * (2 ** reconnectAttempt), RECONNECT_MAX_DELAY_MS);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (stopped) return;
    const generation = ++channelGeneration;
    const previousChannel = channel;
    channel = client
      .channel(`participant-phase:${session.experienceId}:${generation}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "experiences", filter: `id=eq.${session.experienceId}` },
        (payload) => {
          if (stopped || generation !== channelGeneration) return;
          const state = normalizeParticipantExperienceState(payload.new);
          if (state) applyState(state);
          else void refresh();
        },
      )
      .subscribe((status) => {
        if (stopped || generation !== channelGeneration) return;
        if (status === "SUBSCRIBED") {
          reconnectAttempt = 0;
          void refresh();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleReconnect();
        }
      });
    if (previousChannel) void client.removeChannel(previousChannel);
  }

  function refreshWhenAvailable() {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void refresh();
  }

  void refresh();
  connect();
  const pollTimer = setInterval(refreshWhenAvailable, PHASE_POLL_INTERVAL_MS);
  if (typeof window !== "undefined") {
    window.addEventListener("focus", refreshWhenAvailable);
    window.addEventListener("online", refreshWhenAvailable);
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", refreshWhenAvailable);

  return () => {
    stopped = true;
    channelGeneration += 1;
    clearInterval(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", refreshWhenAvailable);
      window.removeEventListener("online", refreshWhenAvailable);
    }
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", refreshWhenAvailable);
    if (channel) void client.removeChannel(channel);
    channel = null;
  };
}

function subscribeToDemoPhase(session: ParticipantSession, handlers: PhaseSubscriptionHandlers) {
  function syncFromStorage() {
    const current = readParticipantSession();
    if (!current || current.mode !== "demo" || current.participantId !== session.participantId || current.experienceId !== session.experienceId) {
      handlers.onInvalid?.();
      return;
    }
    const participant = readLocalAdminState().participants.find((row) => row.id === current.participantId);
    if (!participant?.isActive) { handlers.onInvalid?.(); return; }
    const adminState = readDemoAdminExperienceState();
    const state = adminState ?? { phase: current.phase, slug: current.experienceSlug };
    saveParticipantSession({ ...current, phase: state.phase, experienceSlug: state.slug ?? current.experienceSlug });
    handlers.onState({ ...state, slug: state.slug ?? current.experienceSlug });
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === PARTICIPANT_SESSION_KEY || event.key === "swods-local-admin-state-v2") syncFromStorage();
  }

  if (typeof window !== "undefined") {
    window.addEventListener(DEMO_ADMIN_STATE_EVENT, syncFromStorage);
    window.addEventListener("storage", handleStorage);
  }
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(DEMO_ADMIN_STATE_EVENT, syncFromStorage);
      window.removeEventListener("storage", handleStorage);
    }
  };
}

function readDemoAdminExperienceState(): ParticipantExperienceState | null {
  const rawState = readBrowserStorage("swods-local-admin-state-v2");
  if (!rawState) return null;
  try {
    const parsed = JSON.parse(rawState) as { experience?: { currentPhase?: unknown; slug?: unknown } };
    return normalizeParticipantExperienceState({
      phase: parsed.experience?.currentPhase,
      slug: parsed.experience?.slug,
    });
  } catch {
    return null;
  }
}

type ParticipantRow = {
  first_name: string;
  country_code: string | null;
  preferred_locale: string;
  onboarding_completed: boolean;
  is_active: boolean;
};
