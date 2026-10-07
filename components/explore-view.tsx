"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { interpolate } from "@/lib/i18n";
import { clearParticipantSession, type ParticipantSession } from "@/lib/participant-session";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loadChallenges, type ChallengeItem } from "@/lib/supabase/challenges";
import { loadOverview, type Overview } from "@/lib/supabase/overview";

export function ExploreView({ session }: Readonly<{ session: ParticipantSession }>) {
  const { copy, locale } = useLocale();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([loadOverview(session), loadChallenges(session, locale, copy)])
      .then(([nextOverview, nextChallenges]) => {
        if (!active) return;
        setOverview(nextOverview);
        setChallenges(nextChallenges);
        setError("");
      })
      .catch(() => { if (active) setError(copy.account.sessionError); });
    return () => { active = false; };
  }, [session, locale, copy, retry]);

  async function leave() {
    if (!window.confirm(copy.account.signOutConfirm)) return;
    try {
      if (session.mode === "supabase") {
        const result = await createBrowserSupabaseClient()?.auth.signOut();
        if (result?.error) throw result.error;
      }
      clearParticipantSession();
      window.location.assign("/join");
    } catch {
      setError(copy.account.sessionError);
    }
  }

  if (error) return <div className="state-panel" role="alert"><p>{error}</p><button className="button button--secondary" onClick={() => setRetry((value) => value + 1)} type="button">{copy.gallery.retry}</button></div>;
  if (!overview) return <div className="route-state" role="status">{copy.admin.loading}</div>;

  const suggested = challenges.find((challenge) => challenge.state === "open" && challenge.photoCount < challenge.maxPhotos);
  return (
    <div className="surface surface--explore">
      <div className="surface-heading">
        <p className="explore-place">{overview.place} · {overview.title}</p>
        <h1>{interpolate(copy.home.welcome, { name: session.name })}</h1>
        <p className="surface-heading__body">{copy.home.body}</p>
      </div>
      <div className="explore-layout">
        <section className="invitation-focus">
          <div className="invitation-focus__copy">
            <p className="explore-eyebrow">{copy.home.invitationEyebrow}</p>
            <h2>{suggested?.title ?? copy.home.invitationTitle}</h2>
            <p>{suggested?.description ?? copy.home.invitationBody}</p>
          </div>
          <Link className="button button--primary" href={suggested ? `/challenges?invitation=${encodeURIComponent(suggested.id)}` : "/challenges"}>{copy.home.openChallenge}</Link>
        </section>
        <section className="explore-summary" aria-label={copy.home.yourTeam}>
          <div><p className="explore-eyebrow">{copy.home.yourTeam}</p><h2><span aria-hidden="true">{overview.symbol}</span> {overview.teamName || copy.admin.participants.unassigned}</h2><p>{overview.members.join(" · ")}</p></div>
          <div><p className="explore-eyebrow">{copy.home.collective}</p><strong>{overview.totalPhotos}</strong><p>{copy.common.perspectives}</p></div>
          <div><p className="explore-eyebrow">{copy.home.progressLabel}</p><strong>{overview.ownPhotos}</strong><p>{copy.home.perspectives}</p></div>
        </section>
        <section className="explore-account" id="you"><span>{session.name}</span><button className="button button--secondary" onClick={() => void leave()} type="button">{copy.account.signOut}</button></section>
      </div>
    </div>
  );
}
