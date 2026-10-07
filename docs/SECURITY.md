# Security scope and dependency decisions

## Status and threat model

This is a functional prototype, not a certified secure service or an approved live event deployment. Database grants/RLS and authenticated RPCs are the production trust boundary; client route guards and local demo codes are not authorization for a real event. Apply migrations **001–009** in order on staging before evaluating a hosted deployment.

The intended hosted model is a small private, invite-only event. Do not turn the demo into public registration or an unrestricted image-upload service. Missing Supabase configuration is permitted only for local development or an explicitly marked demo build. `HERVAS` and `HERVAS-ADMIN` are public demo fixtures, not production credentials.

## Existing boundaries and limitations

- Private storage, membership/team/phase checks, registered administrator identities and narrow RPCs are covered by modeled PostgreSQL regression tests; actual Supabase Auth/PostgREST/Storage integration remains unverified.
- Normal browser image processing removes EXIF/GPS. Modified clients can bypass that processing or falsify metadata flags. Hostile uploads require server-side decoding/re-encoding, quotas and abuse controls before a public service is considered.
- No app-level CAPTCHA or dedicated join/upload rate limiter is implemented. Configure appropriate provider/host controls and test the threat model before deployment.
- Memory links are bearer capabilities: 256-bit tokens are hashed in storage, expire and can be revoked. Already issued signed asset URLs remain usable until expiry; previous downloads cannot be revoked. Memory asset URLs last 15 minutes; ordinary gallery signing is shorter.
- Seven-day participant-scoped IndexedDB retry recovery is not a complete background upload queue, cross-device account recovery or proof of reliable distributed writes.
- Gallery/admin loaders and browser mosaic processing target small events, not unbounded datasets. Pagination, idempotent ingestion and scheduled orphan cleanup need operational work before scaling.
- CSP currently allows inline scripts/styles. A tested nonce/hash policy, host HTTPS/HSTS and physical-device/PWA/accessibility acceptance remain deployment work.

## Dependency remediation in this edition

No audit entries are suppressed and CI retains its full `npm audit --audit-level=moderate` gate.

- Sharp is raised to at least **0.35.5**.
- `source-map-js` is overridden to **1.2.2 or later** and `postcss-selector-parser` to **7.1.6 or later**; the resolved lockfile is checked by install/lint/build/browser tests.
- Patched compatible brace-expansion releases are resolved by the lockfile update.
- The interface already uses authored semantic CSS rather than Tailwind utility classes. Tailwind **4.3.3** now supplies only its CSS preflight reset, imported directly. The unused v3 compilation config and scanning plugin are removed, eliminating the vulnerable chokidar/micromatch/braces tool chain without adding a new PostCSS plugin.
- The current Next 15/16 lint plugin releases depend on fast-glob and the unresolved braces advisory GHSA-vfj7-8cjw-p6xm. The public edition pins **eslint-config-next 14.2.35**, the published alternative reported by npm audit, and overrides that plugin's glob dependency to patched **10.5.x**. This is a deliberate *lint-tool downgrade*, not a Next.js runtime downgrade. Core Web Vitals rules, TypeScript rules, Hooks and accessibility linting remain enabled and are validated. It is not equivalent to the latest Next-specific lint rule set; revisit when an upstream fixed plugin is available. ESLint 8 and glob 10 emit deprecation warnings and should be modernized separately when a compatible advisory-free configuration is available.

Audit results are time-dependent. Run both `npm audit` and `npm audit --omit=dev` after any dependency change and before publishing/deploying; current observed results are in `PUBLICATION_REVIEW.md`. Zero known audit entries does not establish absence of exploitable vulnerabilities.

## Secrets and issue reports

The public source checker rejects common credential formats, real-looking JWTs, unexpected binaries, unapproved public assets and private workspace paths. Its only JWT exceptions are exact dummy-signature fixtures in CI and the operations test. This is a heuristic source check, not a comprehensive secret scanner or Git-history audit.

Never commit server keys, local environment files, signed memory links, user images or database exports. `.gitignore` excludes environment files except `.env.example`, local generated output and private workspaces. The validated source exporter copies no historical Git data or runtime folders. Before sharing a security issue publicly, remove tokens, personal data and live-system details; rotate any exposed real credential rather than relying on deletion alone.
