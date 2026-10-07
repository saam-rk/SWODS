"use client";

import { useLocale } from "@/components/locale-provider";
import { type Locale } from "@/lib/i18n";

type LanguageSwitcherProps = Readonly<{
  compact?: boolean;
  surface?: "default" | "landing";
}>;

export function LanguageSwitcher({ compact = false, surface = "default" }: LanguageSwitcherProps) {
  const { locale, copy, setLocale } = useLocale();
  const isLanding = surface === "landing";

  return (
    <label className={`language-switcher${compact ? " language-switcher--compact" : ""}${isLanding ? " language-switcher--landing" : ""}`}>
      <span className={compact ? "sr-only" : "language-switcher__label"}>{copy.common.language}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="en">{isLanding ? "EN" : copy.common.english}</option>
        <option value="es">{isLanding ? "ES" : copy.common.spanish}</option>
        <option value="it">{isLanding ? "IT" : copy.common.italian}</option>
      </select>
    </label>
  );
}
