"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell, type ExperienceView } from "@/components/app-shell";
import { ChallengeCapture } from "@/components/challenge-capture";
import { GalleryView } from "@/components/gallery-view";
import { ExploreView } from "@/components/explore-view";
import { useLocale } from "@/components/locale-provider";
import { Icon } from "@/components/ui/icons";
import { canVisitView } from "@/lib/experience-phase";
import { clearParticipantSession, readParticipantSession, type ParticipantSession } from "@/lib/participant-session";
import { loadChallenges, type ChallengeItem } from "@/lib/supabase/challenges";
import {
  participantDestinationForPhase,
  subscribeToParticipantPhase,
  validateParticipantSession,
} from "@/lib/supabase/participant-phase";

export function ExperienceShell({ view }: Readonly<{ view: ExperienceView }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { copy } = useLocale();
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

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
      setSession(result.session);
      setCheckingSession(false);
      if (result.session.phase !== currentSession.phase) {
        router.replace(participantDestinationForPhase({ phase: result.session.phase, slug: result.session.experienceSlug }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!session) return;
    return subscribeToParticipantPhase(session, {
      onState: (state) => {
        setSession((current) => {
          if (!current) return current;
          const experienceSlug = state.slug ?? current.experienceSlug;
          if (current.phase === state.phase && current.experienceSlug === experienceSlug) return current;
          return { ...current, phase: state.phase, experienceSlug };
        });
        if (state.phase !== session.phase) {
          const destination = participantDestinationForPhase(state);
          if (destination !== pathname) router.replace(destination);
        }
      },
      onInvalid: () => {
        clearParticipantSession();
        router.replace("/join");
      },
    });
  }, [pathname, router, session]);

  if (checkingSession || !session) {
    return (
      <main className="route-state" id="main-content">
        <div aria-hidden="true" className="route-skeleton"><span /><span /><span /><span /></div>
        <p className="sr-only" role="status">{copy.admin.loading}</p>
      </main>
    );
  }

  const phase = session.phase;

  return (
    <AppShell activeView={view} phase={phase}>
      {session && !canVisitView(phase, view) ? <PhaseLocked /> : null}
      {!session || canVisitView(phase, view) ? (
        <>
          {view === "explore" ? <ExploreView session={session} /> : null}
          {view === "challenges" ? <ChallengesView session={session} /> : null}
          {view === "gallery" ? <GalleryView phase={phase} session={session} /> : null}
        </>
      ) : null}
    </AppShell>
  );
}

function PhaseLocked() {
  const { copy } = useLocale();

  return (
    <div className="phase-locked state-panel">
      <span className="state-panel__icon" aria-hidden="true"><Icon name="lock" /></span>
      <h1>{copy.shell.phaseLockedTitle}</h1>
      <p>{copy.shell.phaseLockedBody}</p>
      <Link className="button button--secondary" href="/explore">{copy.shell.returnToExplore}</Link>
    </div>
  );
}

function ChallengesView({ session }: Readonly<{ session: ParticipantSession | null }>) {
  const { copy, locale } = useLocale();
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeItem | null>(null);
  const [challenges, setChallenges] = useState<ChallengeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    void loadChallenges(session, locale, copy)
      .then((items) => {
        if (!cancelled) setChallenges(items);
      })
      .catch(() => {
        if (!cancelled) setError(copy.challenges.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [copy, locale, refreshToken, session]);

  if (selectedChallenge) {
    return <ChallengeDetail challenge={selectedChallenge} onBack={() => setSelectedChallenge(null)} session={session} onPhotoSaved={() => setRefreshToken((current) => current + 1)} />;
  }

  const openChallenges = challenges.filter((challenge) => challenge.state === "open");
  const lockedChallenges = challenges.filter((challenge) => challenge.state === "locked");

  return (
    <div className="surface surface--challenges">
      <div className="surface-heading surface-heading--split">
        <h1>{copy.challenges.title}</h1>
        <p className="surface-heading__body">{copy.challenges.body}</p>
      </div>
      <section className="challenge-list" aria-busy={loading}>
        {loading ? <ChallengeListSkeleton /> : null}
        {!loading && error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
        {!loading && !error && challenges.length === 0 ? <p className="challenge-empty">{copy.challenges.empty}</p> : null}
        {!loading && !error && challenges.length > 0 ? <>
          {openChallenges.map((challenge) => (
            <ChallengeRow challenge={challenge} key={challenge.id} onOpen={() => setSelectedChallenge(challenge)} />
          ))}
          {lockedChallenges.length > 0 ? <p className="challenge-list__locked-label">{copy.challenges.locked}</p> : null}
          {lockedChallenges.map((challenge) => <ChallengeRow challenge={challenge} key={challenge.id} onOpen={() => undefined} />)}
        </> : null}
      </section>
    </div>
  );
}

function ChallengeListSkeleton() {
  return <div className="challenge-skeleton" aria-hidden="true"><i /><i /><i /></div>;
}

function ChallengeRow({ challenge, onOpen }: Readonly<{ challenge: ChallengeItem; onOpen: () => void }>) {
  const { copy } = useLocale();
  const open = challenge.state === "open";

  return (
    <button className={`challenge-row${open ? "" : " challenge-row--locked"}`} disabled={!open} onClick={onOpen} type="button">
      <span className="challenge-row__number">{challenge.order}</span>
      <span className="challenge-row__main"><strong>{challenge.title}</strong><small>{challenge.description}</small></span>
      {!open ? (
        <span className="challenge-row__trail"><Icon name="lock" /></span>
      ) : challenge.photoCount >= challenge.maxPhotos ? (
        <span className="challenge-row__trail challenge-row__done"><Icon name="check" />{copy.challenges.done}</span>
      ) : (
        <span className="challenge-row__trail"><Icon name="arrow-right" /></span>
      )}
    </button>
  );
}

function ChallengeDetail({ challenge, onBack, session, onPhotoSaved }: Readonly<{ challenge: ChallengeItem; onBack: () => void; session: ParticipantSession | null; onPhotoSaved: () => void }>) {
  const { copy } = useLocale();

  return (
    <div className="surface surface--challenge-detail">
      <button className="back-link" onClick={onBack} type="button"><Icon name="arrow-left" />{copy.challenges.back}</button>
      <div className="detail-layout">
        <section className="detail-copy">
          <h1>{challenge.title}</h1>
          <p className="detail-copy__body">{challenge.description}</p>
          {challenge.hint ? <div className="detail-hint"><p>{challenge.hint}</p></div> : null}
          <ChallengeCapture challenge={challenge} session={session} onDone={onBack} onPhotoSaved={onPhotoSaved} />
        </section>
      </div>
    </div>
  );
}
