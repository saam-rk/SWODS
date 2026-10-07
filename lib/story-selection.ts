export type StorySelectionRecord = {
  id: string;
  experienceId: string;
  teamId: string;
  photoId: string;
  position: number;
};

export const DEFAULT_STORY_COUNT = 3;

export function addStorySelection(
  selections: StorySelectionRecord[],
  selection: Omit<StorySelectionRecord, "position">,
  limit = DEFAULT_STORY_COUNT,
) {
  const teamSelections = getTeamSelections(selections, selection.experienceId, selection.teamId);
  if (teamSelections.some((item) => item.photoId === selection.photoId)) return selections;
  if (teamSelections.length >= limit) throw new Error("Your team has chosen its full story");

  return [
    ...selections,
    { ...selection, position: teamSelections.length + 1 },
  ];
}

export function removeStorySelection(selections: StorySelectionRecord[], experienceId: string, teamId: string, photoId: string) {
  const removed = selections.find((item) => item.experienceId === experienceId && item.teamId === teamId && item.photoId === photoId);
  if (!removed) return selections;

  return selections
    .filter((item) => !(item.experienceId === experienceId && item.teamId === teamId && item.photoId === photoId))
    .map((item) => item.experienceId === experienceId && item.teamId === teamId && item.position > removed.position
      ? { ...item, position: item.position - 1 }
      : item);
}

export function moveStorySelection(selections: StorySelectionRecord[], experienceId: string, teamId: string, photoId: string, direction: -1 | 1) {
  const teamSelections = getTeamSelections(selections, experienceId, teamId);
  const currentIndex = teamSelections.findIndex((item) => item.photoId === photoId);
  const targetIndex = currentIndex + direction;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= teamSelections.length) return selections;

  [teamSelections[currentIndex], teamSelections[targetIndex]] = [teamSelections[targetIndex], teamSelections[currentIndex]];
  const positions = new Map(teamSelections.map((item, index) => [item.id, index + 1]));
  return selections.map((item) => positions.has(item.id)
    ? { ...item, position: positions.get(item.id) ?? item.position }
    : item);
}

export function getTeamSelections(selections: StorySelectionRecord[], experienceId: string, teamId: string) {
  return selections
    .filter((item) => item.experienceId === experienceId && item.teamId === teamId)
    .sort((first, second) => first.position - second.position);
}
