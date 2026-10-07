import { describe, expect, it } from "vitest";

import { detectLocale, detectLocalePreference } from "../lib/i18n";

describe("locale detection", () => {
  it("detects a supported locale from a browser language tag", () => {
    expect(detectLocale("es-ES")).toBe("es");
    expect(detectLocale("it-IT")).toBe("it");
    expect(detectLocale("en-GB")).toBe("en");
  });

  it("uses the first supported language in the browser preference list", () => {
    expect(detectLocalePreference(["fr-FR", "it-IT", "en-US"])).toBe("it");
    expect(detectLocalePreference(["de-DE", "es-MX"])).toBe("es");
  });

  it("falls back to English when the browser offers no supported language", () => {
    expect(detectLocalePreference(["fr-FR", "de-DE"])).toBe("en");
    expect(detectLocalePreference(undefined)).toBe("en");
  });
});
