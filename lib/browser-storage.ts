// Only small session/preferences get a volatile fallback. Photo/admin writes
// must still fail visibly rather than claim that an unsaved image is durable.
const volatile = new Map<string, string>();
const sessionKeys = new Set(["swods-participant-session", "swods-locale"]);

export function readBrowserStorage(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return volatile.get(key) ?? window.localStorage.getItem(key);
  } catch {
    return volatile.get(key) ?? null;
  }
}

export function writeBrowserStorage(key: string, value: string) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    volatile.delete(key);
    return true;
  } catch {
    if (sessionKeys.has(key)) volatile.set(key, value);
    return false;
  }
}

export function removeBrowserStorage(key: string) {
  volatile.delete(key);
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
