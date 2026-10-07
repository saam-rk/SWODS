"use client";

import Image from "next/image";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/components/locale-provider";

export function LandingPage() {
  const { copy } = useLocale();

  return (
    <main className="landing-page" id="main-content">
      <Image
        alt={copy.landing.imageAlt}
        className="landing-page__image"
        fill
        priority
        quality={92}
        sizes="100vw"
        src="/shared-field.svg"
      />

      <div className="landing-page__frame" aria-hidden="true" />

      <header className="landing-page__header">
        <span className="landing-page__mark" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </span>
        <div className="landing-page__tools">
          <p>{copy.landing.place}</p>
          <LanguageSwitcher compact surface="landing" />
        </div>
      </header>

      <section className="landing-page__copy">
        <div className="landing-page__copy-panel">
          <h1>{copy.brand.title}</h1>
        </div>
        <div className="landing-page__mosaic-preview">
          <div className="landing-page__mosaic-slot" role="img" aria-label={copy.landing.mosaicPlaceholder}>
            <span aria-hidden="true">?</span>
            <small aria-hidden="true">{copy.landing.mosaicLabel}</small>
          </div>
          <p>{copy.landing.waiting}</p>
        </div>
      </section>

      <footer className="landing-page__footer">
        <p>{copy.landing.description}</p>
        <Link className="landing-page__action" href="/join">
          <span>{copy.landing.enter}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 12h13M13 7l5 5-5 5" />
          </svg>
        </Link>
      </footer>
    </main>
  );
}
