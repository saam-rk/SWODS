"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/components/locale-provider";
import { completeParticipantOnboarding } from "@/lib/supabase/participant";
import { clearParticipantSession, readParticipantSession, type ParticipantSession } from "@/lib/participant-session";
import { validateParticipantSession } from "@/lib/supabase/participant-phase";

export function OnboardingScreen() {
  const router = useRouter();
  const { copy } = useLocale();
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const currentSession = readParticipantSession();
    if (!currentSession) {
      router.replace("/join");
      return () => {
        cancelled = true;
      };
    }

    void validateParticipantSession(currentSession).then((result) => {
      if (cancelled) return;
      if (result.status === "invalid") {
        clearParticipantSession();
        router.replace("/join");
        return;
      }
      if (result.session.onboardingCompleted) {
        router.replace("/challenges");
        return;
      }
      setSession(result.session);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!session) return null;

  const activeSession = session;

  async function finishOnboarding() {
    setSaving(true);
    setError("");

    try {
      await completeParticipantOnboarding(activeSession);
      router.push("/challenges");
    } catch {
      setSaving(false);
      setError(copy.join.connectionError);
    }
  }

  return (
    <main className="onboarding-page" id="main-content">
      <header className="onboarding-header">
        <BrandMark linked={false} />
        <LanguageSwitcher compact />
      </header>

      <section className="onboarding-layout">
        <div className="onboarding-intro">
          <h1>{copy.onboarding.title}</h1>
          <p>{copy.onboarding.body}</p>
        </div>

        <ol className="onboarding-steps">
          {copy.onboarding.steps.map((note) => (
            <li key={note.mark}>
              <span className="onboarding-step__number" aria-hidden="true">{note.mark}</span>
              <div>
                <h2>{note.title}</h2>
                <p>{note.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="onboarding-actions">
        <span className="onboarding-actions__quiet">{session.name}</span>
        <div className="onboarding-actions__next">
          {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
          <button className="button button--primary" disabled={saving} onClick={finishOnboarding} type="button">{saving ? copy.join.entering : copy.onboarding.begin}</button>
        </div>
      </footer>
    </main>
  );
}
