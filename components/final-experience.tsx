"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ADMIN_STATE_EVENT } from "@/lib/admin";
import { downloadMosaic } from "@/lib/mosaic";
import { clearParticipantSession, readParticipantSession } from "@/lib/participant-session";
import { loadFinalExperience, loadSharedMemory, type FinalExperience, type FinalStory } from "@/lib/final-experience";
import { interpolate } from "@/lib/i18n";
import { useLocale } from "@/components/locale-provider";
import { Icon } from "@/components/ui/icons";
import { MosaicRail } from "@/components/ui/mosaic-rail";
import { participantDestinationForPhase, subscribeToParticipantPhase } from "@/lib/supabase/participant-phase";
import { readMemoryToken } from "@/lib/supabase/memory-links";

export type FinalView = "present" | "reveal" | "memory";

export function FinalExperienceView({ view, slug }: Readonly<{ view: FinalView; slug?: string }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { copy, locale } = useLocale();
  const [experience, setExperience] = useState<FinalExperience | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const currentSession = readParticipantSession();
    setLoading(true);
    setError("");
    try {
      const memoryToken = view === "memory" && typeof window !== "undefined" ? readMemoryToken(window.location.hash) : null;
      const result = memoryToken && slug
        ? await loadSharedMemory(slug, memoryToken, locale, copy)
        : await loadFinalExperience(currentSession, locale, copy);
      if (!slug || result.slug === slug || result.id === slug || currentSession?.mode === "demo") setExperience(result);
      else setError(copy.presentation.missingSession);
    } catch {
      setError(copy.presentation.missingSession);
    } finally {
      setLoading(false);
    }
  }, [copy, locale, slug, view]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener(ADMIN_STATE_EVENT, refresh);
    return () => window.removeEventListener(ADMIN_STATE_EVENT, refresh);
  }, [load]);
  useEffect(() => {
    const currentSession = readParticipantSession();
    if (!currentSession) return;
    let currentPhase = currentSession.phase;
    return subscribeToParticipantPhase(currentSession, {
      onState: (state) => {
        const phaseChanged = state.phase !== currentPhase;
        currentPhase = state.phase;
        if (phaseChanged) {
          const destination = participantDestinationForPhase(state);
          if (destination !== pathname) {
            router.replace(destination);
            return;
          }
        }
        void load();
      },
      onInvalid: () => {
        clearParticipantSession();
        router.replace("/join");
      },
    });
  }, [load, pathname, router]);

  if (loading) return <FinalLoading />;
  if (error || !experience) return <FinalMessage message={error || copy.presentation.missingSession} />;
  if (view === "present") return <Presentation experience={experience} />;
  if (view === "reveal") return <Reveal experience={experience} />;
  return <Memory experience={experience} />;
}

function Presentation({ experience }: Readonly<{ experience: FinalExperience }>) {
  const { copy } = useLocale();
  const [index, setIndex] = useState(0);
  const stories = experience.stories;
  const story = stories[index];
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "ArrowRight" || event.key === " ") setIndex((current) => Math.min(stories.length - 1, current + 1));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
      if (event.key === "Escape") window.location.href = "/explore";
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [stories.length]);

  if (!["presentation", "reveal", "finished"].includes(experience.phase)) return <FinalMessage message={`${copy.presentation.waitingTitle} ${copy.presentation.waitingBody}`} />;
  return (
    <main className="projection-page projection-page--present" id="main-content">
      <header className="projection-topline">
        <span>{copy.presentation.eyebrow}</span>
        <span>{experience.place}</span>
        <Link href="/explore">{copy.presentation.exit}<Icon name="close" /></Link>
      </header>
      {story ? (
        <div className="presentation-stage" key={story.photo.id}>
          <div className="presentation-image">
            {story.photo.imageUrl || story.photo.thumbnailUrl ? <img alt={story.photo.altText} decoding="async" src={story.photo.imageUrl ?? story.photo.thumbnailUrl} /> : <div className={`photo-study photo-study--${story.photo.tone}`} role="img" aria-label={story.photo.altText}><Icon name="image" /></div>}
          </div>
          <div className="presentation-copy" aria-live="polite">
            <p className="presentation-team">{story.teamSymbol} {story.teamName}</p>
            <h1>{story.photo.caption || copy.presentation.captionFallback}</h1>
            <p>{interpolate(copy.presentation.showing, { team: story.teamName, challenge: story.photo.challenge })}</p>
            <MosaicRail compact filled={index + 1} total={stories.length} />
          </div>
        </div>
      ) : <div className="presentation-empty"><Icon name="image" /><p>{copy.presentation.empty}</p></div>}
      {story ? (
        <div className="projection-controls">
          <button aria-label={copy.presentation.previous} disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))} type="button"><Icon name="arrow-left" /></button>
          <span aria-live="polite">{interpolate(copy.presentation.position, { current: String(index + 1).padStart(2, "0"), total: String(stories.length).padStart(2, "0") })}</span>
          <button aria-label={copy.presentation.next} disabled={index === stories.length - 1} onClick={() => setIndex((current) => Math.min(stories.length - 1, current + 1))} type="button"><Icon name="arrow-right" /></button>
        </div>
      ) : null}
    </main>
  );
}

function Reveal({ experience }: Readonly<{ experience: FinalExperience }>) {
  const { copy } = useLocale();
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const ready = Boolean(experience.generatedMosaicUrl);
  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  useEffect(() => {
    if (!started || reducedMotion) return;
    const timeout = window.setTimeout(() => { setStarted(false); setFinished(true); }, 3600);
    return () => window.clearTimeout(timeout);
  }, [reducedMotion, started]);

  if (!experience.mosaicVisible || !["reveal", "finished"].includes(experience.phase)) return <FinalMessage message={copy.presentation.hidden} dark />;
  if (!ready) return <FinalMessage message={copy.presentation.notReady} dark />;
  const finalVisible = finished;
  return (
    <main className={`projection-page reveal-page${started ? " reveal-page--active" : ""}${finished ? " reveal-page--finished" : ""}`} id="main-content">
      <div className="reveal-backdrop" aria-hidden="true" />
      {started ? <div className="reveal-fragments" aria-hidden="true">{experience.stories.slice(0, 12).map((story, index) => <RevealTile index={index} key={story.photo.id} story={story} />)}</div> : null}
      <div className={`reveal-final${finalVisible ? " reveal-final--visible" : ""}`}>{experience.generatedMosaicUrl ? <img alt={copy.presentation.memoryTitle} decoding="async" src={experience.generatedMosaicUrl} /> : null}</div>
      <div className="reveal-copy" aria-live="polite">
        <span className="reveal-mark brand-mark" aria-hidden="true" />
        <h1>{started ? copy.presentation.revealTitle : copy.presentation.revealBody}</h1>
        {finished ? <Link className="button button--light" href={`/memory/${experience.slug}`}>{copy.presentation.memoryTitle}<Icon name="arrow-right" /></Link> : !started ? <button className="button button--light" onClick={() => { setFinished(reducedMotion); setStarted(!reducedMotion); }} type="button">{copy.presentation.startReveal}<Icon name="arrow-right" /></button> : <button className="button button--light" onClick={() => { setStarted(false); setFinished(true); }} type="button">{copy.presentation.skipReveal}</button>}
        {!finished ? <Link className="reveal-memory-link" href={`/memory/${experience.slug}`}>{copy.presentation.memoryTitle}</Link> : null}
      </div>
    </main>
  );
}

function RevealTile({ index, story }: Readonly<{ index: number; story: FinalStory }>) {
  const style = { "--reveal-index": index } as React.CSSProperties;
  return <div className="reveal-tile" style={style}>{story.photo.imageUrl || story.photo.thumbnailUrl ? <img alt="" src={story.photo.imageUrl ?? story.photo.thumbnailUrl} /> : <div className={`photo-study photo-study--${story.photo.tone}`} />}</div>;
}

function Memory({ experience }: Readonly<{ experience: FinalExperience }>) {
  const { copy } = useLocale();
  const [copied, setCopied] = useState(false);
  const memoryUrl = typeof window === "undefined" ? "" : window.location.href;
  async function share() {
    try {
      await navigator.clipboard.writeText(memoryUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }
  if (!experience.mosaicVisible || !["reveal", "finished"].includes(experience.phase)) return <FinalMessage message={copy.presentation.hidden} />;
  return (
    <main className="memory-page" id="main-content">
      <header className="memory-header">
        <Link href="/explore" className="back-link"><Icon name="arrow-left" /><span>{copy.presentation.backToExperience}</span></Link>
        <div className="memory-header__copy"><span className="brand-mark" aria-hidden="true" /><h1>{copy.presentation.memoryTitle}</h1><p>{copy.presentation.memoryBody}</p></div>
      </header>
      <section className="memory-mosaic">{experience.generatedMosaicUrl ? <img alt={`${experience.title} mosaic`} decoding="async" src={experience.generatedMosaicUrl} /> : <div className="memory-mosaic__empty"><Icon name="image" /><p>{copy.presentation.notReady}</p></div>}</section>
      <div className="memory-meta">
        <div><strong>{experience.title}</strong><p>{experience.place}</p></div>
        <div className="memory-stats"><span><strong>{experience.participantCount}</strong>{copy.presentation.people}</span><span><strong>{experience.totalPhotos}</strong>{copy.presentation.photographs}</span></div>
        <div className="memory-actions">
          <button className="button button--primary" disabled={!experience.generatedMosaicUrl} onClick={() => downloadMosaic(experience.generatedMosaicUrl ?? "", `${experience.slug}-mosaic.jpg`)} type="button"><Icon name="download" />{copy.presentation.download}</button>
          <button className="button button--secondary" onClick={() => void share()} type="button"><Icon name="share" />{copied ? copy.presentation.copied : copy.presentation.share}</button>
          <button className="button button--ghost" onClick={() => window.print()} type="button"><Icon name="print" />{copy.presentation.print}</button>
        </div>
      </div>
      <section className="memory-stories"><div><h2>{copy.presentation.title}</h2></div><div className="memory-story-strip">{experience.stories.map((story) => <figure key={story.photo.id}>{story.photo.imageUrl || story.photo.thumbnailUrl ? <img alt={story.photo.altText} decoding="async" loading="lazy" src={story.photo.imageUrl ?? story.photo.thumbnailUrl} /> : <div className={`photo-study photo-study--${story.photo.tone}`} role="img" aria-label={story.photo.altText}><Icon name="image" /></div>}<figcaption><span>{story.teamName}</span><strong>{story.photo.caption}</strong></figcaption></figure>)}</div></section>
    </main>
  );
}

function FinalLoading() {
  const { copy } = useLocale();
  return <main className="final-message final-message--dark" id="main-content"><span className="final-loader" aria-hidden="true" /><span role="status">{copy.admin.loading}</span></main>;
}

function FinalMessage({ message, dark = false }: Readonly<{ message: string; dark?: boolean }>) {
  const { copy } = useLocale();
  return <main className={`final-message${dark ? " final-message--dark" : ""}`} id="main-content"><Icon name="image" /><p>{message}</p><Link className="back-link" href="/explore"><Icon name="arrow-left" /><span>{copy.presentation.backToExperience}</span></Link></main>;
}
