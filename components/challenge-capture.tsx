"use client";

import { useEffect, useRef, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { Icon } from "@/components/ui/icons";
import { MosaicRail } from "@/components/ui/mosaic-rail";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browser-storage";
import { processImage, type ProcessedImage } from "@/lib/image-processing";
import {
  createPendingPhotoUpload,
  deletePendingPhotoUpload,
  isPendingUploadSupported,
  loadPendingPhotoUpload,
  savePendingPhotoUpload,
} from "@/lib/pending-upload";
import type { ParticipantSession } from "@/lib/participant-session";
import type { ChallengeItem } from "@/lib/supabase/challenges";
import { deleteParticipantPhoto, saveParticipantPhoto, type PhotoUploadProgress, type SavedPhoto } from "@/lib/supabase/photos";

const PRIVACY_NOTICE_KEY = "swods-photo-privacy-notice-seen";

type CaptureState = "idle" | "processing" | "preview" | "uploading" | "saved";

export function ChallengeCapture({
  challenge,
  session,
  onDone,
  onPhotoSaved,
}: Readonly<{
  challenge: ChallengeItem;
  session: ParticipantSession | null;
  onDone: () => void;
  onPhotoSaved: () => void;
}>) {
  const { copy } = useLocale();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<CaptureState>("idle");
  const [processedImage, setProcessedImage] = useState<ProcessedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [privacyConfirmed, setPrivacyConfirmed] = useState(true);
  const [progress, setProgress] = useState<PhotoUploadProgress>({ stage: "preparing", percent: 0 });
  const [savedPhoto, setSavedPhoto] = useState<SavedPhoto | null>(null);
  const [photosAdded, setPhotosAdded] = useState(0);
  const [deletePending, setDeletePending] = useState(false);
  const [pendingStored, setPendingStored] = useState(false);
  const [pendingRestored, setPendingRestored] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session || session.mode !== "supabase" || !isPendingUploadSupported()) return;
    let cancelled = false;

    void loadPendingPhotoUpload(session, challenge.id)
      .then((pending) => {
        if (cancelled || !pending) return;
        setProcessedImage(pending.processedImage);
        setPreviewUrl(URL.createObjectURL(pending.processedImage.image));
        setCaption(pending.caption);
        setPrivacyConfirmed(true);
        setPendingStored(true);
        setPendingRestored(true);
        setState("preview");
      })
      .catch(() => {
        // Recovery is best-effort on browsers that clear or restrict site storage.
      });

    return () => {
      cancelled = true;
    };
  }, [challenge.id, session]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (state !== "idle") panelHeading.current?.focus({ preventScroll: true });
  }, [state]);

  useEffect(() => {
    if (!pendingStored || !processedImage || !session || session.mode !== "supabase") return;
    const timeout = window.setTimeout(() => {
      void savePendingPhotoUpload(createPendingPhotoUpload(session, challenge.id, processedImage, caption));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [caption, challenge.id, pendingStored, processedImage, session]);

  function openCamera() {
    if (cameraInput.current) cameraInput.current.value = "";
    cameraInput.current?.click();
  }

  function openGallery() {
    if (galleryInput.current) galleryInput.current.value = "";
    galleryInput.current?.click();
  }

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    if (session?.mode === "supabase") {
      await deletePendingPhotoUpload(session, challenge.id).catch(() => undefined);
    }
    setState("processing");
    setError("");
    setProcessedImage(null);
    setSavedPhoto(null);
    setPendingStored(false);
    setPendingRestored(false);

    try {
      const nextImage = await processImage(file);
      setProcessedImage(nextImage);
      setPreviewUrl(URL.createObjectURL(nextImage.image));
      setPrivacyConfirmed(readBrowserStorage(PRIVACY_NOTICE_KEY) === "true");
      setState("preview");
    } catch {
      setState("idle");
      setError(copy.challenges.imageError);
    }
  }

  function resetSelection() {
    if (cameraInput.current) cameraInput.current.value = "";
    if (galleryInput.current) galleryInput.current.value = "";
    setProcessedImage(null);
    setPreviewUrl("");
    setCaption("");
    setSavedPhoto(null);
    setDeletePending(false);
    setPendingStored(false);
    setPendingRestored(false);
    setError("");
    setState("idle");
    if (session?.mode === "supabase") {
      void deletePendingPhotoUpload(session, challenge.id).catch(() => undefined);
    }
  }

  function confirmPrivacy() {
    writeBrowserStorage(PRIVACY_NOTICE_KEY, "true");
    setPrivacyConfirmed(true);
  }

  async function uploadPhoto() {
    if (!processedImage || !session) {
      setError(copy.challenges.joinToUpload);
      return;
    }

    setState("uploading");
    setError("");
    setProgress({ stage: "preparing", percent: 12 });

    let recoveryStored = false;
    if (session.mode === "supabase" && isPendingUploadSupported()) {
      try {
        await savePendingPhotoUpload(createPendingPhotoUpload(session, challenge.id, processedImage, caption));
        recoveryStored = true;
        setPendingStored(true);
      } catch {
        setPendingStored(false);
      }
    }

    try {
      const photo = await saveParticipantPhoto({
        session,
        challengeId: challenge.id,
        processedImage,
        caption,
        onProgress: setProgress,
      });
      setSavedPhoto(photo);
      setPhotosAdded((current) => current + 1);
      if (session.mode === "supabase") {
        await deletePendingPhotoUpload(session, challenge.id).catch(() => undefined);
      }
      setPendingStored(false);
      setPendingRestored(false);
      setState("saved");
      onPhotoSaved();
    } catch {
      setState("preview");
      setError(
        recoveryStored
          ? (isOffline() ? copy.challenges.offlineQueued : copy.challenges.uploadQueued)
          : (isOffline() ? copy.challenges.offlineError : copy.challenges.uploadError),
      );
    }
  }

  async function removePhoto() {
    if (!savedPhoto || !session) return;
    setDeletePending(true);
    setError("");

    try {
      await deleteParticipantPhoto(session, savedPhoto);
      setPhotosAdded((current) => Math.max(0, current - 1));
      onPhotoSaved();
      resetSelection();
    } catch {
      setDeletePending(false);
      setError(copy.challenges.deleteError);
    }
  }

  const photoLimitReached = challenge.photoCount + photosAdded >= challenge.maxPhotos;
  const captureCount = Math.min(challenge.photoCount + photosAdded, challenge.maxPhotos);

  return (
    <div className={`capture-flow capture-flow--${state}`} data-state={state}>
      <input
        accept="image/*"
        aria-label={copy.challenges.openCamera}
        capture="environment"
        className="sr-only"
        onChange={(event) => void handleFileSelected(event.target.files?.[0])}
        ref={cameraInput}
        type="file"
      />
      <input
        accept="image/*"
        aria-label={copy.challenges.chooseFromGallery}
        className="sr-only"
        onChange={(event) => void handleFileSelected(event.target.files?.[0])}
        ref={galleryInput}
        type="file"
      />

      {state === "idle" ? (
        <div className="capture-launch">
          <MosaicRail
            compact
            filled={captureCount}
            label={`${captureCount} / ${challenge.maxPhotos}`}
            total={challenge.maxPhotos}
          />
          {photoLimitReached ? (
            <p className="capture-limit-note" role="status"><Icon name="check" />{copy.challenges.photoLimitReached}</p>
          ) : (
            <div className="capture-launch__actions">
              <button className="button button--primary capture-launch__button" onClick={openCamera} type="button">
                <Icon name="camera" />
                <span>{copy.challenges.openCamera}</span>
              </button>
              <button className="button button--secondary" onClick={openGallery} type="button">
                <Icon name="image" />
                <span>{copy.challenges.chooseFromGallery}</span>
              </button>
            </div>
          )}
          {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
        </div>
      ) : null}

      {state === "processing" ? (
        <section className="capture-panel capture-panel--processing" aria-busy="true" aria-labelledby="capture-processing-title" aria-live="polite">
          <div className="capture-processing__cells" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
          <h2 id="capture-processing-title" ref={panelHeading} tabIndex={-1}>{copy.challenges.processingTitle}</h2>
          <p>{copy.challenges.processingBody}</p>
        </section>
      ) : null}

      {state === "preview" || state === "uploading" ? (
        <section className="capture-panel capture-panel--preview" aria-busy={state === "uploading"} aria-labelledby="capture-preview-title">
          <div className="capture-preview__media">
            {previewUrl ? <img className="capture-preview" decoding="async" src={previewUrl} alt={copy.challenges.previewAlt} /> : null}
          </div>
          <div className="capture-preview__body">
            <header className="capture-panel__heading">
              <h2 id="capture-preview-title" ref={panelHeading} tabIndex={-1}>{copy.challenges.previewTitle}</h2>
            </header>
            <label className="capture-caption form-field">
              <span className="field-label">{copy.challenges.captionLabel} <span className="field-optional">{copy.challenges.optional}</span></span>
              <textarea
                aria-describedby="capture-caption-count"
                disabled={state === "uploading"}
                maxLength={200}
                onChange={(event) => setCaption(event.target.value)}
                placeholder={copy.challenges.captionPlaceholder}
                rows={3}
                value={caption}
              />
              <small className="capture-caption__count" id="capture-caption-count">{caption.length} / 200</small>
            </label>

            {privacyConfirmed ? (
              <div className="privacy-note">
                <Icon name="lock" />
                <p>{copy.challenges.privacyBody}</p>
              </div>
            ) : (
              <div className="privacy-notice" role="note">
                <strong>{copy.challenges.privacyTitle}</strong>
                <p>{copy.challenges.privacyNotice}</p>
                <button className="button button--secondary" onClick={confirmPrivacy} type="button">{copy.challenges.privacyContinue}</button>
              </div>
            )}

            {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
            {pendingRestored ? <p className="form-message" role="status">{copy.challenges.pendingRestored}</p> : null}

            {state === "uploading" ? (
              <div className="upload-progress" aria-live="polite">
                <div className="upload-progress__labels"><span>{progressLabel(progress.stage, copy)}</span><span>{progress.percent}%</span></div>
                <div className="upload-progress__track"><i style={{ transform: `scaleX(${progress.percent / 100})` }} /></div>
              </div>
            ) : (
              <div className="capture-actions">
                <button className="button button--primary" disabled={!privacyConfirmed} onClick={() => void uploadPhoto()} type="button">
                  <Icon name="check" />
                  <span>{copy.challenges.addPerspective}</span>
                </button>
                <button className="button button--secondary" onClick={openGallery} type="button"><Icon name="refresh" />{copy.challenges.replacePhoto}</button>
                <button className="cancel-link capture-cancel" onClick={resetSelection} type="button">{copy.challenges.cancelCapture}</button>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {state === "saved" && savedPhoto ? (
        <section className="capture-panel capture-panel--saved" aria-labelledby="capture-saved-title" aria-live="polite">
          <div className="capture-preview__media">
            {savedPhoto.localImageUrl ? (
              <img className="capture-preview" decoding="async" src={savedPhoto.localImageUrl} alt={copy.challenges.previewAlt} />
            ) : (
              <div className="capture-image-fallback"><Icon name="image" /></div>
            )}
            <span className="capture-saved-check" aria-hidden="true"><Icon name="check" /></span>
          </div>
          <div className="capture-preview__body">
            <header className="capture-panel__heading">
              <h2 id="capture-saved-title" ref={panelHeading} tabIndex={-1}>{copy.challenges.savedTitle}</h2>
              <p>{copy.challenges.savedBody}</p>
            </header>
            <MosaicRail filled={captureCount} label={copy.challenges.savedTitle} total={challenge.maxPhotos} />
            {savedPhoto.caption ? <blockquote className="capture-saved-caption">{savedPhoto.caption}</blockquote> : null}
            {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
            {deletePending ? (
              <div className="capture-delete-confirm" role="group" aria-labelledby="capture-delete-title">
                <p id="capture-delete-title">{copy.challenges.deleteConfirm}</p>
                <div className="capture-actions">
                  <button className="button button--danger" onClick={() => void removePhoto()} type="button">{copy.challenges.deletePhoto}</button>
                  <button className="button button--secondary" onClick={() => setDeletePending(false)} type="button">{copy.common.close}</button>
                </div>
              </div>
            ) : (
              <div className="capture-actions">
                <button className="button button--primary" onClick={onDone} type="button"><Icon name="arrow-left" />{copy.challenges.backToPrompts}</button>
                <button className="button button--ghost capture-delete-button" onClick={() => setDeletePending(true)} type="button">{copy.challenges.deletePhoto}</button>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function progressLabel(stage: PhotoUploadProgress["stage"], copy: ReturnType<typeof useLocale>["copy"]) {
  if (stage === "uploading-image") return copy.challenges.progressImage;
  if (stage === "uploading-thumbnail") return copy.challenges.progressThumbnail;
  if (stage === "saving") return copy.challenges.progressSaving;
  if (stage === "complete") return copy.challenges.progressComplete;
  return copy.challenges.progressPreparing;
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
