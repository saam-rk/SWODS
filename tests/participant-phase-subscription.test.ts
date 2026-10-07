import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParticipantSession } from "@/lib/participant-session";

const testState = vi.hoisted(() => ({
  channelCallbacks: [] as Array<(status: string) => void>,
  phaseCallbacks: [] as Array<(payload: { new: unknown }) => void>,
  participantActive: true,
  queryCount: 0,
  removeChannel: vi.fn(),
  savedSession: null as ParticipantSession | null,
}));

vi.mock("@/lib/participant-session", () => ({
  PARTICIPANT_SESSION_KEY: "swods-participant-session",
  readParticipantSession: () => testState.savedSession,
  saveParticipantSession: (session: ParticipantSession) => {
    testState.savedSession = session;
  },
}));

vi.mock("@/lib/supabase/client", () => {
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test" } }, error: null }),
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => {
          testState.queryCount += 1;
          if (table === "participants") {
            return {
              data: {
                first_name: "Ana",
                country_code: "ES",
                preferred_locale: "es",
                onboarding_completed: true,
                is_active: testState.participantActive,
              },
              error: null,
            };
          }
          if (table === "team_members") return { data: { team_id: "team-1" }, error: null };
          return { data: { current_phase: "exploration", slug: "hervas-october" }, error: null };
        },
      };
      return builder;
    },
    channel: () => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: (payload: { new: unknown }) => void) => {
          testState.phaseCallbacks.push(callback);
          return channel;
        },
        subscribe: (callback: (status: string) => void) => {
          testState.channelCallbacks.push(callback);
          return channel;
        },
      };
      return channel;
    },
    removeChannel: testState.removeChannel,
  };
  return {
    createBrowserSupabaseClient: () => client,
    hasSupabaseConfig: () => true,
  };
});

import { subscribeToParticipantPhase, validateParticipantSession } from "@/lib/supabase/participant-phase";

describe("participant realtime phase subscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    testState.channelCallbacks.length = 0;
    testState.phaseCallbacks.length = 0;
    testState.queryCount = 0;
    testState.participantActive = true;
    testState.removeChannel.mockClear();
    testState.savedSession = {
      participantId: "participant-1",
      experienceId: "experience-1",
      experienceSlug: "hervas-october",
      name: "Ana",
      country: "ES",
      locale: "es",
      phase: "exploration",
      mode: "supabase",
      onboardingCompleted: true,
    };
    Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
    const documentTarget = new EventTarget() as EventTarget & { visibilityState: string };
    documentTarget.visibilityState = "visible";
    Object.defineProperty(globalThis, "document", { configurable: true, value: documentTarget });
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
  });

  it("applies realtime updates, reconnects after channel failure, and stops cleanly", async () => {
    const onState = vi.fn();
    const unsubscribe = subscribeToParticipantPhase(testState.savedSession!, { onState });
    await vi.runAllTicks();

    expect(testState.channelCallbacks).toHaveLength(1);
    testState.phaseCallbacks[0]?.({ new: { current_phase: "reveal", slug: "hervas-october" } });
    expect(testState.savedSession?.phase).toBe("reveal");
    expect(onState).toHaveBeenLastCalledWith({ phase: "reveal", slug: "hervas-october" });

    testState.channelCallbacks[0]?.("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(testState.channelCallbacks).toHaveLength(2);
    expect(testState.removeChannel).toHaveBeenCalledTimes(1);

    unsubscribe();
    const channelCountAfterCleanup = testState.channelCallbacks.length;
    testState.channelCallbacks[1]?.("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(testState.channelCallbacks).toHaveLength(channelCountAfterCleanup);
    expect(testState.removeChannel).toHaveBeenCalledTimes(2);
  });

  it("refreshes a valid identity and rejects inactive or demo identities in production", async () => {
    const validResult = await validateParticipantSession(testState.savedSession!);
    expect(validResult).toMatchObject({
      status: "valid",
      session: { teamId: "team-1", phase: "exploration", experienceSlug: "hervas-october" },
    });

    testState.participantActive = false;
    expect(await validateParticipantSession(testState.savedSession!)).toEqual({ status: "invalid" });
    expect(await validateParticipantSession({ ...testState.savedSession!, mode: "demo" })).toEqual({ status: "invalid" });
  });
});
