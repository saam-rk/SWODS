import { describe, expect, it } from "vitest";

import { createPendingPhotoUpload, isPendingPhotoUpload, pendingUploadKey } from "@/lib/pending-upload";
import type { ParticipantSession } from "@/lib/participant-session";

const session: ParticipantSession = {
  participantId: "participant-1",
  experienceId: "experience-1",
  name: "Lucía",
  country: "ES",
  locale: "es",
  phase: "exploration",
  mode: "supabase",
  onboardingCompleted: true,
};

describe("pending upload recovery", () => {
  it("scopes each recovery record to the participant, experience, and prompt", () => {
    expect(pendingUploadKey(session, "prompt-1")).toBe("experience-1:participant-1:prompt-1");
  });

  it("creates a validated, caption-limited recovery record", () => {
    const pending = createPendingPhotoUpload(session, "prompt-1", {
      image: new Blob(["image"], { type: "image/webp" }),
      thumbnail: new Blob(["thumb"], { type: "image/webp" }),
      width: 1200,
      height: 800,
      thumbnailWidth: 500,
      thumbnailHeight: 333,
      mimeType: "image/webp",
      extension: "webp",
      originalBytes: 42,
    }, `  ${"a".repeat(250)}  `);

    expect(pending.caption).toHaveLength(200);
    expect(isPendingPhotoUpload(pending)).toBe(true);
  });

  it("rejects malformed records before restoring private data", () => {
    expect(isPendingPhotoUpload({ key: "unsafe" })).toBe(false);
  });
});
