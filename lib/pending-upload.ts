import type { ProcessedImage } from "@/lib/image-processing";
import type { ParticipantSession } from "@/lib/participant-session";

const DATABASE_NAME = "swods-private-field-data";
const STORE_NAME = "pending-photo-uploads";
const DATABASE_VERSION = 1;
const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingPhotoUpload = {
  key: string;
  experienceId: string;
  participantId: string;
  challengeId: string;
  caption: string;
  processedImage: ProcessedImage;
  createdAt: string;
};

export function pendingUploadKey(session: ParticipantSession, challengeId: string) {
  return `${session.experienceId}:${session.participantId}:${challengeId}`;
}

export function createPendingPhotoUpload(
  session: ParticipantSession,
  challengeId: string,
  processedImage: ProcessedImage,
  caption: string,
): PendingPhotoUpload {
  return {
    key: pendingUploadKey(session, challengeId),
    experienceId: session.experienceId,
    participantId: session.participantId,
    challengeId,
    caption: caption.trim().slice(0, 200),
    processedImage,
    createdAt: new Date().toISOString(),
  };
}

export async function savePendingPhotoUpload(pending: PendingPhotoUpload) {
  const database = await openDatabase();
  await runRequest(database, "readwrite", (store) => store.put(pending));
}

export async function loadPendingPhotoUpload(session: ParticipantSession, challengeId: string) {
  const database = await openDatabase();
  const pending = await runRequest<PendingPhotoUpload | undefined>(
    database,
    "readonly",
    (store) => store.get(pendingUploadKey(session, challengeId)),
  );

  if (!pending || !isPendingPhotoUpload(pending)) return null;
  if (Date.now() - Date.parse(pending.createdAt) <= MAX_PENDING_AGE_MS) return pending;

  await deletePendingPhotoUpload(session, challengeId);
  return null;
}

export async function deletePendingPhotoUpload(session: ParticipantSession, challengeId: string) {
  const database = await openDatabase();
  await runRequest(database, "readwrite", (store) => store.delete(pendingUploadKey(session, challengeId)));
}

export function isPendingUploadSupported() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function isPendingPhotoUpload(value: unknown): value is PendingPhotoUpload {
  if (!value || typeof value !== "object") return false;
  const pending = value as Partial<PendingPhotoUpload>;
  const image = pending.processedImage as Partial<ProcessedImage> | undefined;
  return Boolean(
    typeof pending.key === "string"
      && typeof pending.experienceId === "string"
      && typeof pending.participantId === "string"
      && typeof pending.challengeId === "string"
      && typeof pending.caption === "string"
      && typeof pending.createdAt === "string"
      && Number.isFinite(Date.parse(pending.createdAt))
      && image
      && image.image instanceof Blob
      && image.thumbnail instanceof Blob
      && (image.extension === "webp" || image.extension === "jpg")
      && typeof image.mimeType === "string",
  );
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!isPendingUploadSupported()) {
      reject(new Error("Durable photo recovery is not supported by this browser."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "key" });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("The private photo queue could not be opened.")));
    request.addEventListener("blocked", () => reject(new Error("The private photo queue is temporarily unavailable.")));
  });
}

function runRequest<T = IDBValidKey>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result: T;
    request.addEventListener("success", () => {
      result = request.result;
    });
    request.addEventListener("error", () => {
      database.close();
      reject(request.error ?? new Error("The private photo queue could not be updated."));
    });
    transaction.addEventListener("complete", () => {
      database.close();
      resolve(result);
    });
    transaction.addEventListener("abort", () => {
      database.close();
      reject(transaction.error ?? new Error("The private photo queue update was cancelled."));
    });
  });
}
