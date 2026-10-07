"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { Icon } from "@/components/ui/icons";
import { MosaicRail } from "@/components/ui/mosaic-rail";
import type { ExperiencePhase } from "@/lib/experience-phase";
import { interpolate } from "@/lib/i18n";
import type { ParticipantSession } from "@/lib/participant-session";
import { deleteParticipantPhoto } from "@/lib/supabase/photos";
import {
  loadGalleryData,
  moveStoryPhoto,
  removeStoryPhoto,
  selectStoryPhoto,
  toggleStoryMark,
  type GalleryData,
  type GalleryFilter,
  type GalleryPhoto,
  type StorySelection,
} from "@/lib/supabase/gallery";

export function GalleryView({ phase, session }: Readonly<{ phase: ExperiencePhase; session: ParticipantSession | null }>) {
  const { copy, locale } = useLocale();
  const [data, setData] = useState<GalleryData | null>(null);
  const [filter, setFilter] = useState<{ kind: GalleryFilter; value?: string }>({ kind: "all" });
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((current) => current + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    void loadGalleryData(session, locale, copy)
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch(() => {
        if (!cancelled) setError(copy.gallery.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [copy, locale, refreshToken, session]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") refresh();
    }

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const filteredPhotos = useMemo(() => {
    if (!data) return [];
    return data.photos.filter((photo) => {
      if (filter.kind === "team") return photo.teamId === filter.value;
      if (filter.kind === "challenge") return photo.challengeId === filter.value;
      return true;
    });
  }, [data, filter]);

  const selectedPhoto = data?.photos.find((photo) => photo.id === selectedPhotoId) ?? null;
  const currentTeamId = session?.teamId ?? (session?.mode === "demo" ? "demo-tajo" : null);
  const currentTeam = data?.teams.find((team) => team.id === currentTeamId);
  const teamSelections = useMemo(
    () => (data?.storySelections ?? []).filter((selection) => selection.teamId === currentTeamId).sort((first, second) => first.position - second.position),
    [currentTeamId, data?.storySelections],
  );
  const canChooseTeamStory = Boolean(session && data?.selectionEnabled && phase === "selection" && currentTeamId);
  const canMarkStory = Boolean(session?.teamId && data?.selectionEnabled && (phase === "exploration" || phase === "selection"));

  async function deletePhoto(photo: GalleryPhoto) {
    if (!session || !window.confirm(copy.challenges.deleteConfirm)) return;
    setPendingAction(`delete:${photo.id}`);
    setActionError("");
    try {
      await deleteParticipantPhoto(session, photo);
      setSelectedPhotoId(null);
      refresh();
    } catch {
      setActionError(copy.challenges.deleteError);
    } finally {
      setPendingAction("");
    }
  }

  function updateMark(photoId: string) {
    if (!session) return;
    setPendingAction(`mark:${photoId}`);
    setActionError("");
    void toggleStoryMark(session, photoId)
      .then((marked) => {
        setData((current) => current ? { ...current, storyMarks: marked ? [...new Set([...current.storyMarks, photoId])] : current.storyMarks.filter((id) => id !== photoId) } : current);
      })
      .catch(() => setActionError(copy.gallery.storyMarkError))
      .finally(() => setPendingAction(""));
  }

  function updateTeamStory(action: "add" | "remove" | "up" | "down", photoId: string) {
    if (!session || !canChooseTeamStory) return;
    if (action === "add" && data && teamSelections.length >= data.storyCount) return;
    setPendingAction(`${action}:${photoId}`);
    setActionError("");
    const operation = action === "add"
      ? selectStoryPhoto(session, photoId)
      : action === "remove"
        ? removeStoryPhoto(session, photoId)
        : moveStoryPhoto(session, photoId, action === "up" ? -1 : 1);
    void operation
      .then(refresh)
      .catch(() => setActionError(copy.gallery.storySelectionError))
      .finally(() => setPendingAction(""));
  }

  function openPhoto(photoId: string) {
    setActionError("");
    setSelectedPhotoId(photoId);
  }

  return (
    <div className="surface surface--gallery">
      <header className="surface-heading surface-heading--gallery">
        <h1>{copy.gallery.title}</h1>
        <p className="surface-heading__body">{copy.gallery.body}</p>
      </header>

      {data ? <GalleryFilters data={data} filter={filter} onChange={setFilter} /> : null}
      {data?.cleanupPending ? <p className="form-message" role="status">{copy.account.cleanupWarning}</p> : null}

      {loading ? <GallerySkeleton /> : null}
      {!loading && error ? (
        <div className="state-panel gallery-message" role="alert">
          <Icon name="image" />
          <p>{error}</p>
          <button className="button button--secondary" onClick={refresh} type="button"><Icon name="refresh" />{copy.gallery.retry}</button>
        </div>
      ) : null}
      {!loading && !error && data ? (
        <>
          <div className="gallery-count" aria-live="polite">
            {interpolate(copy.gallery.showingCount, { current: String(filteredPhotos.length), total: String(data.photos.length) })}
          </div>
          {filteredPhotos.length === 0 ? (
            <div className="state-panel gallery-empty">
              <Icon name="image" />
              <p>{data.photos.length === 0 ? copy.gallery.empty : copy.gallery.noFilteredPhotos}</p>
              {data.photos.length === 0 ? <a className="button button--primary" href="/challenges"><Icon name="camera" />{copy.challenges.open}</a> : null}
            </div>
          ) : (
            <section className="gallery-grid" aria-label={copy.gallery.latest}>
              {filteredPhotos.map((photo, index) => (
                <PhotoTile
                  index={index}
                  key={photo.id}
                  marked={data.storyMarks.includes(photo.id)}
                  onOpen={() => openPhoto(photo.id)}
                  onToggle={() => updateTeamStory(teamSelections.some((selection) => selection.photoId === photo.id) ? "remove" : "add", photo.id)}
                  pending={pendingAction.endsWith(`:${photo.id}`)}
                  photo={photo}
                  selected={teamSelections.some((selection) => selection.photoId === photo.id)}
                  selectionAtLimit={teamSelections.length >= data.storyCount}
                  selectionEnabled={canChooseTeamStory && photo.teamId === currentTeamId}
                />
              ))}
            </section>
          )}

          {canChooseTeamStory && data.selectionEnabled ? (
            <StoryShelf
              actionError={actionError}
              data={data}
              onMove={(photoId, direction) => updateTeamStory(direction === -1 ? "up" : "down", photoId)}
              onOpen={openPhoto}
              onRemove={(photoId) => updateTeamStory("remove", photoId)}
              pendingAction={pendingAction}
              selections={teamSelections}
              teamName={currentTeam?.name ?? copy.gallery.unknownTeam}
            />
          ) : null}
        </>
      ) : null}

      {selectedPhoto ? (
        <PhotoDetail
          actionError={actionError}
          canChoose={canChooseTeamStory && selectedPhoto.teamId === currentTeamId && (teamSelections.some((selection) => selection.photoId === selectedPhoto.id) || teamSelections.length < (data?.storyCount ?? 0))}
          canDelete={phase === "exploration" && session?.participantId === selectedPhoto.participantId && selectedPhoto.source !== "demo"}
          canMark={canMarkStory}
          marked={data?.storyMarks.includes(selectedPhoto.id) ?? false}
          onAdd={() => updateTeamStory("add", selectedPhoto.id)}
          onClose={() => setSelectedPhotoId(null)}
          onDelete={() => void deletePhoto(selectedPhoto)}
          onMark={() => updateMark(selectedPhoto.id)}
          onRemove={() => updateTeamStory("remove", selectedPhoto.id)}
          pendingAction={pendingAction}
          photo={selectedPhoto}
          selected={teamSelections.some((selection) => selection.photoId === selectedPhoto.id)}
        />
      ) : null}
    </div>
  );
}

function GalleryFilters({ data, filter, onChange }: Readonly<{
  data: GalleryData;
  filter: { kind: GalleryFilter; value?: string };
  onChange: (filter: { kind: GalleryFilter; value?: string }) => void;
}>) {
  const { copy } = useLocale();
  const currentValue = filter.kind === "all" ? "all" : `${filter.kind}:${filter.value ?? ""}`;

  function changeFilter(value: string) {
    if (value === "all") {
      onChange({ kind: "all" });
      return;
    }
    const separator = value.indexOf(":");
    const kind = value.slice(0, separator) as GalleryFilter;
    onChange({ kind, value: value.slice(separator + 1) });
  }

  return (
    <div className="gallery-tools">
      <label className="gallery-filter">
        <span>{copy.gallery.filterLabel}</span>
        <select className="field-control" onChange={(event) => changeFilter(event.target.value)} value={currentValue}>
          <option value="all">{copy.gallery.filterAll}</option>
          <optgroup label={copy.common.team}>
            {data.teams.map((team) => <option key={team.id} value={`team:${team.id}`}>{team.name}</option>)}
          </optgroup>
          <optgroup label={copy.common.challenge}>
            {data.challenges.map((challenge) => <option key={challenge.id} value={`challenge:${challenge.id}`}>{challenge.title}</option>)}
          </optgroup>
        </select>
      </label>
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div aria-hidden="true" className="gallery-skeleton">
      {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
    </div>
  );
}

function PhotoTile({ index, marked, onOpen, onToggle, pending, photo, selected, selectionAtLimit, selectionEnabled }: Readonly<{
  index: number;
  marked: boolean;
  onOpen: () => void;
  onToggle: () => void;
  pending: boolean;
  photo: GalleryPhoto;
  selected: boolean;
  selectionAtLimit: boolean;
  selectionEnabled: boolean;
}>) {
  const { copy } = useLocale();
  const slot = (index % 6) + 1;

  return (
    <article
      className={`photo-tile photo-tile--${slot} photo-tile--${photo.orientation}${selected ? " photo-tile--story" : ""}`}
    >
      <button aria-label={`${copy.gallery.viewPhoto}: ${photo.altText}`} className="photo-tile__open" onClick={onOpen} type="button">
        <span className="photo-tile__frame">
          {photo.thumbnailUrl || photo.imageUrl ? (
            <img alt="" className="photo-tile__image" decoding="async" loading="lazy" src={photo.thumbnailUrl ?? photo.imageUrl} />
          ) : (
            <span className="photo-placeholder" aria-hidden="true"><Icon name="image" /><small>{copy.gallery.viewPhoto}</small></span>
          )}
          {marked ? <span className="photo-tile__mark"><span className="sr-only">{copy.gallery.storyMarked}</span></span> : null}
          {selected ? <span className="photo-tile__story-state" aria-label={copy.gallery.selectedForStory}><Icon name="check" /></span> : null}
        </span>
        <span className="photo-tile__meta"><strong>{photo.author}</strong><small>{photo.team}</small></span>
      </button>
      {selectionEnabled ? (
        <button
          aria-pressed={selected}
          className={`photo-tile__select${selected ? " photo-tile__select--active" : ""}`}
          disabled={pending || (!selected && selectionAtLimit)}
          onClick={onToggle}
          type="button"
        >
          <Icon name={selected ? "close" : "check"} />
          {selected ? copy.gallery.removeFromStory : copy.gallery.addToStory}
        </button>
      ) : null}
    </article>
  );
}

function StoryShelf({ actionError, data, onMove, onOpen, onRemove, pendingAction, selections, teamName }: Readonly<{
  actionError: string;
  data: GalleryData;
  onMove: (photoId: string, direction: -1 | 1) => void;
  onOpen: (photoId: string) => void;
  onRemove: (photoId: string) => void;
  pendingAction: string;
  selections: StorySelection[];
  teamName: string;
}>) {
  const { copy } = useLocale();
  const photos = new Map(data.photos.map((photo) => [photo.id, photo]));
  const remaining = Math.max(0, data.storyCount - selections.length);

  return (
    <section className="story-shelf" aria-labelledby="story-shelf-title">
      <div className="story-shelf__heading">
        <div>
          <h2 id="story-shelf-title">{copy.gallery.storySectionTitle}</h2>
          <p>{copy.gallery.storySectionBody}</p>
          <p className="story-shelf__team">{copy.common.team}: {teamName}</p>
        </div>
        <div className="story-shelf__progress">
          <strong className="story-shelf__count">{interpolate(copy.gallery.storySelectionCount, { selected: String(selections.length), total: String(data.storyCount) })}</strong>
          <MosaicRail compact filled={selections.length} label={copy.gallery.storySectionTitle} total={data.storyCount} />
        </div>
      </div>
      {selections.length === 0 ? (
        <div className="story-shelf__empty"><Icon name="gallery" /><p>{copy.gallery.storySelectionEmpty}</p></div>
      ) : (
        <ol className="story-shelf__list" aria-label={copy.gallery.storySectionTitle}>
          {selections.map((selection, index) => {
            const photo = photos.get(selection.photoId);
            if (!photo) return null;
            const isFirst = index === 0;
            const isLast = index === selections.length - 1;
            const isPending = pendingAction.endsWith(`:${photo.id}`);
            return (
              <li aria-busy={isPending} className="story-shelf__item" key={selection.id}>
                <span className="story-shelf__position" aria-label={interpolate(copy.gallery.storyOrderLabel, { position: String(index + 1) })}>{index + 1}</span>
                <button aria-label={`${copy.gallery.viewPhoto}: ${photo.altText}`} className="story-shelf__photo" onClick={() => onOpen(photo.id)} type="button">
                  {photo.thumbnailUrl || photo.imageUrl ? <img alt="" decoding="async" loading="lazy" src={photo.thumbnailUrl ?? photo.imageUrl} /> : <span className="photo-placeholder" aria-hidden="true"><Icon name="image" /></span>}
                </button>
                <button className="story-shelf__copy" onClick={() => onOpen(photo.id)} type="button"><strong>{photo.caption || photo.challenge}</strong><small>{photo.author} · {photo.challenge}</small></button>
                <div className="story-shelf__actions">
                  <button aria-label={copy.gallery.moveStoryUp} className="icon-button" disabled={isFirst || pendingAction !== ""} onClick={() => onMove(photo.id, -1)} type="button"><Icon className="icon story-action__up" name="arrow-left" /></button>
                  <button aria-label={copy.gallery.moveStoryDown} className="icon-button" disabled={isLast || pendingAction !== ""} onClick={() => onMove(photo.id, 1)} type="button"><Icon className="icon story-action__down" name="arrow-left" /></button>
                  <button aria-label={copy.gallery.removeFromStory} className="icon-button story-action__remove" disabled={pendingAction !== ""} onClick={() => onRemove(photo.id)} type="button"><Icon name="close" /></button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className={`story-shelf__status${selections.length === data.storyCount ? " story-shelf__status--complete" : ""}`} aria-live="polite">
        {selections.length === data.storyCount ? copy.gallery.storySelectionComplete : interpolate(copy.gallery.storySelectionIncomplete, { remaining: String(remaining) })}
      </p>
      {actionError ? <p className="form-message form-message--error" role="alert">{actionError}</p> : null}
    </section>
  );
}

function PhotoDetail({ actionError, canChoose, canDelete, canMark, marked, onAdd, onClose, onDelete, onMark, onRemove, pendingAction, photo, selected }: Readonly<{
  actionError: string;
  canChoose: boolean;
  canDelete: boolean;
  canMark: boolean;
  marked: boolean;
  onAdd: () => void;
  onClose: () => void;
  onDelete: () => void;
  onMark: () => void;
  onRemove: () => void;
  pendingAction: string;
  photo: GalleryPhoto;
  selected: boolean;
}>) {
  const { copy } = useLocale();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab" || !dialog) return;

      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="photo-detail-backdrop" onClick={onClose} role="presentation">
      <section aria-labelledby="photo-detail-title" aria-modal="true" className="photo-detail" onClick={(event) => event.stopPropagation()} ref={dialogRef} role="dialog" tabIndex={-1}>
        <button aria-label={copy.gallery.closeDetail} className="icon-button photo-detail__close" onClick={onClose} ref={closeButtonRef} type="button"><Icon name="close" /></button>
        <div className="photo-detail__visual">
          {photo.imageUrl || photo.thumbnailUrl ? <img alt={photo.altText} decoding="async" src={photo.imageUrl ?? photo.thumbnailUrl} /> : <div className="photo-placeholder photo-placeholder--large"><Icon name="image" /></div>}
        </div>
        <div className="photo-detail__copy">
          <div className="photo-detail__title-group">
            <h2 id="photo-detail-title">{photo.caption || photo.challenge}</h2>
            <p>{photo.challenge}</p>
          </div>
          <dl className="photo-detail__facts">
            <div><dt>{copy.gallery.by}</dt><dd>{photo.author}</dd></div>
            <div><dt>{copy.common.team}</dt><dd>{photo.team}</dd></div>
          </dl>
          {canMark ? (
            <div className="photo-detail__action-group">
              <p>{copy.gallery.storyMarkHint}</p>
              <button aria-pressed={marked} className={`button button--secondary story-mark${marked ? " story-mark--active" : ""}`} disabled={pendingAction !== ""} onClick={onMark} type="button"><Icon name={marked ? "check" : "gallery"} />{marked ? copy.gallery.storyMarked : copy.gallery.storyMark}</button>
            </div>
          ) : null}
          {canChoose ? (
            <button aria-pressed={selected} className={`button button--primary story-select${selected ? " story-select--active" : ""}`} disabled={pendingAction !== ""} onClick={selected ? onRemove : onAdd} type="button"><Icon name={selected ? "close" : "check"} />{selected ? copy.gallery.removeFromStory : copy.gallery.addToStory}</button>
          ) : null}
          {canDelete ? <button className="button button--danger" disabled={pendingAction !== ""} onClick={onDelete} type="button">{copy.challenges.deletePhoto}</button> : null}
          {actionError ? <p className="form-message form-message--error" role="alert">{actionError}</p> : null}
        </div>
      </section>
    </div>
  );
}
