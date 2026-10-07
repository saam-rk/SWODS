import { describe, expect, it } from "vitest";

import {
  normalizeParticipantExperienceState,
  participantDestinationForPhase,
} from "@/lib/supabase/participant-phase";

describe("participant phase synchronization", () => {
  it("accepts database and cached phase shapes while rejecting invalid updates", () => {
    expect(normalizeParticipantExperienceState({ current_phase: "selection", slug: "hervas-october" })).toEqual({
      phase: "selection",
      slug: "hervas-october",
    });
    expect(normalizeParticipantExperienceState({ phase: "reveal" })).toEqual({ phase: "reveal", slug: undefined });
    expect(normalizeParticipantExperienceState({ current_phase: "paused" })).toBeNull();
    expect(normalizeParticipantExperienceState(null)).toBeNull();
  });

  it("routes every facilitator phase to the participant's active surface", () => {
    expect(participantDestinationForPhase({ phase: "welcome" })).toBe("/explore");
    expect(participantDestinationForPhase({ phase: "exploration" })).toBe("/challenges");
    expect(participantDestinationForPhase({ phase: "selection" })).toBe("/gallery");
    expect(participantDestinationForPhase({ phase: "presentation" })).toBe("/present");
    expect(participantDestinationForPhase({ phase: "reveal" })).toBe("/reveal");
    expect(participantDestinationForPhase({ phase: "finished", slug: "hervás 2026" })).toBe("/memory/herv%C3%A1s%202026");
  });

  it("falls back safely when an older session has no memory slug", () => {
    expect(participantDestinationForPhase({ phase: "finished" })).toBe("/gallery");
  });
});
