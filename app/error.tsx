"use client";

import { useEffect } from "react";

import { useLocale } from "@/components/locale-provider";
import { Icon } from "@/components/ui/icons";

export default function ErrorView({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const { copy } = useLocale();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="route-state" id="main-content">
      <div className="state-panel">
        <Icon name="refresh" />
        <h1>{copy.gallery.loadError}</h1>
        <button className="button button--primary" onClick={reset} type="button">{copy.gallery.retry}</button>
      </div>
    </main>
  );
}
