import { describe, expect, it } from "vitest";

import { validateJoinInput } from "@/lib/join-validation";

describe("join-by-code validation", () => {
  it("normalizes a valid demo code and first name", () => {
    expect(validateJoinInput({ code: " hervas ", name: " Ana ", demoMode: true })).toEqual({
      code: "HERVAS",
      name: "Ana",
      error: null,
    });
  });

  it("requires a first name before checking the code", () => {
    expect(validateJoinInput({ code: "wrong", name: "A", demoMode: true }).error).toBe("invalidName");
  });

  it("rejects unknown demo codes but leaves configured codes to the server", () => {
    expect(validateJoinInput({ code: "other", name: "Ana", demoMode: true }).error).toBe("invalidCode");
    expect(validateJoinInput({ code: "other", name: "Ana", demoMode: false }).error).toBeNull();
  });

  it("requires a code in production mode", () => {
    expect(validateJoinInput({ code: " ", name: "Giulia", demoMode: false }).error).toBe("invalidCode");
  });
});
