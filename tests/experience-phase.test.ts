import { describe, expect, it } from "vitest";

import { canVisitView, isExperiencePhase } from "@/lib/experience-phase";

describe("experience phase rules", () => {
  it("accepts only known phases", () => {
    expect(isExperiencePhase("selection")).toBe(true);
    expect(isExperiencePhase("unknown")).toBe(false);
    expect(isExperiencePhase(null)).toBe(false);
  });

  it("keeps challenges in exploration and hides them during selection", () => {
    expect(canVisitView("exploration", "challenges")).toBe(true);
    expect(canVisitView("selection", "challenges")).toBe(false);
    expect(canVisitView("selection", "gallery")).toBe(true);
  });

  it("keeps the gallery and account overview reachable during final phases", () => {
    expect(canVisitView("presentation", "gallery")).toBe(true);
    expect(canVisitView("presentation", "explore")).toBe(true);
    expect(canVisitView("finished", "challenges")).toBe(false);
  });
});
