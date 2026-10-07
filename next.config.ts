import { execFileSync } from "node:child_process";

import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

function supabaseOrigins() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return [];

  try {
    const url = new URL(value);
    const websocketOrigin = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
    return [url.origin, websocketOrigin];
  } catch {
    return [];
  }
}

function contentSecurityPolicy() {
  const connections = ["'self'", ...supabaseOrigins()];
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${supabaseOrigins().filter((origin) => origin.startsWith("http")).join(" ")}`,
    `connect-src ${connections.join(" ")}`,
    `media-src 'self' blob: ${supabaseOrigins().filter((origin) => origin.startsWith("http")).join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];

  // Local production demos run over HTTP; upgrading their asset requests breaks WebKit.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEMO_MODE !== "true") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

export default function createNextConfig(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    execFileSync(process.execPath, ["scripts/validate-production-env.mjs"], {
      env: process.env,
      stdio: "inherit",
    });
  }

  return {
    reactStrictMode: true,
    poweredByHeader: false,
    images: {
      qualities: [75, 92],
    },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: securityHeaders,
        },
        {
          source: "/api/:path*",
          headers: [{ key: "Cache-Control", value: "no-store" }],
        },
        {
          source: "/sw.js",
          headers: [
            { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
            { key: "Service-Worker-Allowed", value: "/" },
          ],
        },
      ];
    },
  };
}
