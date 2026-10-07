import { describe, expect, it } from "vitest";

import { getResizedDimensions, IMAGE_LONG_EDGE, MAX_IMAGE_BYTES, validateImageFile } from "@/lib/image-processing";

describe("upload image boundary", () => {
  it("accepts image files within the client size limit", () => {
    expect(() => validateImageFile(new File([new Uint8Array([1, 2, 3])], "frame.jpg", { type: "image/jpeg" }))).not.toThrow();
  });

  it("rejects non-images and oversized originals before canvas work", () => {
    expect(() => validateImageFile(new File(["not an image"], "notes.txt", { type: "text/plain" }))).toThrow("image file");
    expect(() => validateImageFile(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.jpg", { type: "image/jpeg" }))).toThrow("20 MB");
  });

  it("keeps aspect ratio and never enlarges a small image", () => {
    expect(getResizedDimensions(4000, 2000, IMAGE_LONG_EDGE)).toMatchObject({ width: 2000, height: 1000 });
    expect(getResizedDimensions(800, 1200, IMAGE_LONG_EDGE)).toMatchObject({ width: 800, height: 1200 });
  });
});
