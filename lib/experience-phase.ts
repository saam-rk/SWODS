export const experiencePhases = ["welcome", "exploration", "selection", "presentation", "reveal", "finished"] as const;

export type ExperiencePhase = (typeof experiencePhases)[number];

export function isExperiencePhase(value: string | null | undefined): value is ExperiencePhase {
  return Boolean(value && experiencePhases.includes(value as ExperiencePhase));
}

export function canVisitView(phase: ExperiencePhase, view: "explore" | "challenges" | "gallery") {
  if (view === "explore") return true;
  if (phase === "welcome") return false;
  if (phase === "exploration") return true;
  if (phase === "selection") return view !== "challenges";
  return view === "gallery";
}
