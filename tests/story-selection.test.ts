import { describe, expect, it } from "vitest";

import { addStorySelection, moveStorySelection, removeStorySelection, type StorySelectionRecord } from "@/lib/story-selection";

const selection = (id: string, photoId: string, teamId = "team-a", position = 1): StorySelectionRecord => ({
  id,
  experienceId: "experience",
  teamId,
  photoId,
  position,
});

describe("team story selection", () => {
  it("prevents duplicates and enforces the configured cap per team", () => {
    const first = selection("one", "photo-1");
    const existing = [first, selection("other-team", "photo-2", "team-b")];
    expect(addStorySelection(existing, { ...first, id: "duplicate" })).toBe(existing);

    const full = [first, selection("two", "photo-2", "team-a", 2)];
    expect(() => addStorySelection(full, { id: "three", experienceId: "experience", teamId: "team-a", photoId: "photo-3" }, 2)).toThrow("full story");
    expect(addStorySelection(full, { id: "other", experienceId: "experience", teamId: "team-b", photoId: "photo-3" }, 2)).toHaveLength(3);
  });

  it("removes a story and closes the position gap", () => {
    const existing = [selection("one", "photo-1"), selection("two", "photo-2", "team-a", 2), selection("three", "photo-3", "team-a", 3)];
    expect(removeStorySelection(existing, "experience", "team-a", "photo-2").map((item) => item.position)).toEqual([1, 2]);
  });

  it("moves only within the requested team and direction", () => {
    const existing = [selection("one", "photo-1"), selection("two", "photo-2", "team-a", 2), selection("other", "photo-3", "team-b")];
    expect(moveStorySelection(existing, "experience", "team-a", "photo-2", -1).filter((item) => item.teamId === "team-a").sort((first, second) => first.position - second.position).map((item) => item.photoId)).toEqual(["photo-2", "photo-1"]);
    expect(moveStorySelection(existing, "experience", "team-a", "photo-1", -1)).toEqual(existing);
  });
});
