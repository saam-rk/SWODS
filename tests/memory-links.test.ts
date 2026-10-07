import { describe, expect, it } from "vitest";

import { buildMemoryUrl, isMemoryToken, readMemoryToken } from "@/lib/supabase/memory-links";

const TOKEN = "a".repeat(64);

describe("memory link tokens", () => {
  it("accepts only canonical 256-bit hexadecimal tokens", () => {
    expect(isMemoryToken(TOKEN)).toBe(true);
    expect(isMemoryToken("A".repeat(64))).toBe(false);
    expect(isMemoryToken("a".repeat(63))).toBe(false);
    expect(isMemoryToken(`${"a".repeat(63)}g`)).toBe(false);
  });

  it("keeps bearer tokens in the URL fragment", () => {
    const memoryUrl = buildMemoryUrl("https://example.test/base", "hervas-october", TOKEN);
    const parsed = new URL(memoryUrl);

    expect(parsed.pathname).toBe("/memory/hervas-october");
    expect(parsed.search).toBe("");
    expect(parsed.hash).toBe(`#token=${TOKEN}`);
    expect(readMemoryToken(parsed.hash)).toBe(TOKEN);
  });

  it("rejects malformed fragment values", () => {
    expect(readMemoryToken("#token=short")).toBeNull();
    expect(readMemoryToken("#other=value")).toBeNull();
  });
});
