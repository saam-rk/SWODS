import { describe, expect, it } from "vitest";

import en from "@/locales/en.json";
import es from "@/locales/es.json";
import itCopy from "@/locales/it.json";
import { demoChallenges } from "@/lib/demo-data";
import { getDictionary, type Locale } from "@/lib/i18n";

describe("participant copy", () => {
  it("keeps the three locale dictionaries structurally aligned", () => {
    expect(leafPaths(es)).toEqual(leafPaths(en));
    expect(leafPaths(itCopy)).toEqual(leafPaths(en));
  });

  it("does not expose the obsolete event date range", () => {
    for (const dictionary of [en, es, itCopy]) {
      expect(JSON.stringify(dictionary)).not.toMatch(/1(?:–|-)5\s+(?:October|de octubre|ottobre)/i);
    }
  });

  it.each(["en", "es", "it"] satisfies Locale[])("gives every demo prompt unique complete %s copy", (locale) => {
    const copy = getDictionary(locale).challenges;
    const prompts = demoChallenges.map((challenge) => ({
      title: copy[challenge.titleKey],
      description: copy[challenge.descriptionKey],
      hint: copy[challenge.hintKey],
    }));

    expect(new Set(prompts.map((prompt) => prompt.title)).size).toBe(demoChallenges.length);
    for (const prompt of prompts) {
      expect(prompt.title.trim()).not.toBe("");
      expect(prompt.description.trim()).not.toBe("");
      expect(prompt.hint.trim()).not.toBe("");
    }
  });
});

function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}
