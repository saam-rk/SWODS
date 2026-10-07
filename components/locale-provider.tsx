"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { detectLocalePreference, getDictionary, isLocale, type Dictionary, type Locale } from "@/lib/i18n";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";

const LOCALE_STORAGE_KEY = "swods-locale";

type LocaleContextValue = {
  locale: Locale;
  copy: Dictionary;
  ready: boolean;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);
  const hasManualPreference = useRef(false);

  useEffect(() => {
    const savedLocale = readBrowserStorage(LOCALE_STORAGE_KEY) ?? "";
    hasManualPreference.current = isLocale(savedLocale);

    const syncBrowserLocale = () => {
      if (hasManualPreference.current) return;

      const browserLanguages = window.navigator.languages?.length
        ? window.navigator.languages
        : [window.navigator.language];
      const nextLocale = detectLocalePreference(browserLanguages);
      setLocaleState(nextLocale);
      document.documentElement.lang = nextLocale;
    };

    const nextLocale = isLocale(savedLocale)
      ? savedLocale
      : detectLocalePreference(window.navigator.languages?.length
        ? window.navigator.languages
        : [window.navigator.language]);

    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    setReady(true);

    window.addEventListener("languagechange", syncBrowserLocale);
    return () => window.removeEventListener("languagechange", syncBrowserLocale);
  }, []);

  const setLocale = (nextLocale: Locale) => {
    hasManualPreference.current = true;
    setLocaleState(nextLocale);
    writeBrowserStorage(LOCALE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
  };

  const value = useMemo(
    () => ({ locale, copy: getDictionary(locale), ready, setLocale }),
    [locale, ready],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
