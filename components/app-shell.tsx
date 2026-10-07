"use client";

import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocale } from "@/components/locale-provider";
import { Icon, type IconName } from "@/components/ui/icons";
import { canVisitView, type ExperiencePhase } from "@/lib/experience-phase";

export type ExperienceView = "explore" | "challenges" | "gallery";

const navItems: Array<{ href: string; view: ExperienceView; label: "challenges" | "gallery"; icon: IconName }> = [
  { href: "/challenges", view: "challenges", label: "challenges", icon: "invitations" },
  { href: "/gallery", view: "gallery", label: "gallery", icon: "gallery" },
];

export function AppShell({ activeView, phase = "exploration", children }: Readonly<{ activeView: ExperienceView; phase?: ExperiencePhase; children: React.ReactNode }>) {
  const { copy } = useLocale();
  const visibleNavItems = navItems.filter((item) => canVisitView(phase, item.view));

  return (
    <div className="experience-shell">
      <header className="experience-header">
        <BrandMark />
        <div className="experience-header__meta">
          <span>{copy.landing.place}</span>
          <LanguageSwitcher compact />
        </div>
      </header>

      <nav className="participant-nav participant-nav--desktop" aria-label={copy.shell.menuLabel}>
        {visibleNavItems.map((item) => {
          const active = item.view === activeView;
          return (
            <Link className="participant-nav__item" href={item.href} key={item.label} aria-current={active ? "page" : undefined}>
              <Icon name={item.icon} />
              <span>{copy.nav[item.label]}</span>
            </Link>
          );
        })}
      </nav>

      <main className="experience-main" id="main-content">{children}</main>

      <footer className="experience-footer">
        <div className="experience-footer__note">
          <span>{copy.footer.privacy}</span>
          <span>{copy.footer.noCompetition}</span>
        </div>
        <nav className="participant-nav participant-nav--mobile" aria-label={copy.shell.menuLabel} style={{ gridTemplateColumns: `repeat(${visibleNavItems.length}, minmax(0, 1fr))` }}>
          {visibleNavItems.map((item) => {
            const active = item.view === activeView;
            return (
              <Link
                className="participant-nav__item"
                href={item.href}
                key={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} />
                <span>{copy.nav[item.label]}</span>
              </Link>
            );
          })}
        </nav>
      </footer>
    </div>
  );
}
