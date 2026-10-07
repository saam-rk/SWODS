"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/components/locale-provider";
import { hasSupabaseConfig } from "@/lib/supabase/client";
import { readLocalAdminState } from "@/lib/admin";
import { validateJoinInput } from "@/lib/join-validation";
import { joinParticipant } from "@/lib/supabase/participant";
import { readParticipantSession, type ParticipantSession } from "@/lib/participant-session";

export function JoinScreen() {
  const router = useRouter();
  const { copy, locale } = useLocale();
  const demoMode = !hasSupabaseConfig();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<"code" | "name" | "form" | null>(null);
  const [joining, setJoining] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [existingSession, setExistingSession] = useState<ParticipantSession | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (demoMode) setCode(readLocalAdminState().experience.joinCode);
    const currentSession = readParticipantSession();
    setExistingSession(currentSession && (demoMode ? currentSession.mode === "demo" : currentSession.mode === "supabase") ? currentSession : null);
    setHydrated(true);
  }, [demoMode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateJoinInput({ code, name, demoMode, demoCode: demoMode ? readLocalAdminState().experience.joinCode : undefined });
    const { code: cleanCode, name: cleanName } = validation;

    if (validation.error === "invalidName") {
      setError(copy.join.invalidName);
      setErrorField("name");
      nameInputRef.current?.focus();
      return;
    }

    if (validation.error === "invalidCode") {
      setError(copy.join.invalidCode);
      setErrorField("code");
      codeInputRef.current?.focus();
      return;
    }

    setJoining(true);
    setError("");
    setErrorField(null);

    try {
      const result = await joinParticipant({ code: cleanCode, name: cleanName, country, locale });
      router.push(result.session.onboardingCompleted ? "/challenges" : "/onboarding");
    } catch {
      setJoining(false);
      setError(copy.join.connectionError);
      setErrorField("form");
    }
  }

  function continueWithExistingSession() {
    if (!existingSession) return;
    router.push(existingSession.onboardingCompleted ? "/challenges" : "/onboarding");
  }

  return (
    <main className="entry-page" id="main-content">
      <section className="entry-introduction">
        <div className="entry-introduction__topline">
          <BrandMark linked={false} />
          <LanguageSwitcher compact />
        </div>
        <div className="entry-copy">
          <h1>{copy.join.title}</h1>
          <p>{copy.join.body}</p>
        </div>
      </section>

      <section className="entry-content">
        <div className="entry-form-heading">
          <h2>{copy.join.enter}</h2>
          <p>{copy.join.joinPrompt}</p>
        </div>

        <form className="join-form" onSubmit={handleSubmit} noValidate aria-busy={joining}>
          <label className="field" htmlFor="join-name">
            <span>{copy.join.nameLabel}</span>
            <input
              aria-describedby={errorField === "name" ? "join-name-error" : undefined}
              aria-invalid={errorField === "name"}
              autoComplete="given-name"
              id="join-name"
              maxLength={60}
              disabled={!hydrated || joining}
              name="name"
              onChange={(event) => { setName(event.target.value); setError(""); setErrorField(null); }}
              placeholder={copy.join.namePlaceholder}
              ref={nameInputRef}
              value={name}
            />
            {error && errorField === "name" ? <small className="field-error" id="join-name-error" role="alert">{error}</small> : null}
          </label>
          <label className="field" htmlFor="join-country">
            <span>{copy.join.countryLabel}</span>
            <select disabled={!hydrated || joining} id="join-country" name="country" onChange={(event) => setCountry(event.target.value)} value={country}>
              <option value="">{copy.join.countryPlaceholder}</option>
              <option value="ES">{copy.join.spain}</option>
              <option value="IT">{copy.join.italy}</option>
            </select>
          </label>
          <details className="join-code" open={!demoMode}>
            <summary>{demoMode ? copy.join.changeCode : copy.join.codeLabel}</summary>
            <label className="field" htmlFor="join-code">
              <span>{copy.join.codeLabel}</span>
              <input
                aria-describedby={errorField === "code" ? "join-code-error" : demoMode ? "join-code-hint" : undefined}
                aria-invalid={errorField === "code"}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                id="join-code"
                maxLength={32}
                disabled={!hydrated || joining}
                name="code"
                onChange={(event) => { setCode(event.target.value); setError(""); setErrorField(null); }}
                placeholder={copy.join.codePlaceholder}
                ref={codeInputRef}
                spellCheck={false}
                value={code}
              />
              {demoMode ? <small id="join-code-hint">{copy.join.demoHint}</small> : null}
              {error && errorField === "code" ? <small className="field-error" id="join-code-error" role="alert">{error}</small> : null}
            </label>
          </details>
          {error && errorField === "form" ? <p className="form-message form-message--error" id="join-form-error" role="alert">{error}</p> : null}
          <button className="button button--primary" disabled={!hydrated || joining} type="submit">
            {joining ? copy.join.entering : copy.join.enter}
          </button>
        </form>

        {existingSession ? (
          <div className="session-return">
            <p>{copy.join.sessionFound}</p>
            <button className="text-link" onClick={continueWithExistingSession} type="button">
              {copy.join.continueAs.replace("{name}", existingSession.name)}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
