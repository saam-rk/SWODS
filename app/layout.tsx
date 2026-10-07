import "@fontsource/apfel-grotezk/400.css";
import "@fontsource/apfel-grotezk/700.css";

import type { Metadata, Viewport } from "next";

import { LocaleProvider } from "@/components/locale-provider";
import { OfflineStatus } from "@/components/offline-status";
import { ServiceWorkerRegister } from "@/components/service-worker-register";

import "./globals.css";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/primitives.css";
import "../styles/landing.css";
import "../styles/participant.css";
import "../styles/gallery.css";
import "../styles/admin.css";
import "../styles/final.css";

export const metadata: Metadata = {
  title: "See What Others Don’t See",
  description: "A private collective photography experience in Hervás.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#2b1007",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <LocaleProvider>
          <ServiceWorkerRegister />
          <OfflineStatus />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
