"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/components/locale-provider";

export function OfflineStatus() {
  const { copy } = useLocale();
  const [online, setOnline] = useState(true);
  const [showRestored, setShowRestored] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);

  useEffect(() => {
    setOnline(window.navigator.onLine);
    try { window.localStorage.setItem("swods-storage-check", "1"); window.localStorage.removeItem("swods-storage-check"); }
    catch { setStorageAvailable(false); }

    function handleOffline() {
      setShowRestored(false);
      setOnline(false);
    }

    function handleOnline() {
      setOnline(true);
      setShowRestored(true);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!showRestored) return;
    const timeout = window.setTimeout(() => setShowRestored(false), 4200);
    return () => window.clearTimeout(timeout);
  }, [showRestored]);

  if (!storageAvailable) return <div className="connection-status" role="status">{copy.account.storageWarning}</div>;
  if (online && !showRestored) return null;

  return (
    <div className={`connection-status${online ? " connection-status--online" : ""}`} role="status" aria-live="polite">
      <span aria-hidden="true" className="connection-status__mark" data-online={online} />
      <span>{online ? copy.shell.connectionRestored : copy.shell.offlineTitle}</span>
      {!online ? <span className="connection-status__body">{copy.shell.offlineBody}</span> : null}
    </div>
  );
}
