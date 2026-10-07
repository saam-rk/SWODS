import { describe, expect, it } from "vitest";

import { normalizeParticipantSession } from "@/lib/participant-session";

describe("participant session boundary", () => {
  it("drops malformed identity data and normalizes unknown phase values", () => {
    expect(normalizeParticipantSession({ participantId: "p-1", experienceId: "e-1", name: "Ana", phase: "not-a-phase" })).toMatchObject({
      participantId: "p-1",
      experienceId: "e-1",
      phase: "exploration",
      mode: "demo",
      onboardingCompleted: false,
    });
    expect(normalizeParticipantSession({ participantId: "", experienceId: "e-1", name: "Ana" })).toBeNull();
  });

  it("keeps a validated experience slug for final-phase routing", () => {
    expect(normalizeParticipantSession({
      participantId: "p-1",
      experienceId: "e-1",
      experienceSlug: "hervas-october",
      name: "Ana",
      phase: "finished",
      mode: "supabase",
    })).toMatchObject({
      experienceSlug: "hervas-october",
      phase: "finished",
      mode: "supabase",
    });
  });
});
