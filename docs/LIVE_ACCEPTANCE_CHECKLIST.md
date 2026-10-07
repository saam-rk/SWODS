# Live production acceptance checklist

Complete this against the final HTTPS domain and production Supabase project. Record tester, device/browser, timestamp, release, and evidence for every item. Do not use real participant photos during rehearsal unless consent and retention rules already apply.

## Automated gate

- [ ] CI passes install, environment validation, type-check, lint, tests, and production build.
- [ ] `node scripts/smoke-production.mjs https://<production-domain>` passes.
- [ ] `/api/health` returns 200 and the expected `APP_RELEASE`.
- [ ] `/api/health/ready` returns 200 while Supabase is available and 503 during a controlled dependency/configuration failure.
- [ ] HTTP redirects to HTTPS; response headers include CSP, frame denial, MIME sniffing protection, referrer policy, and permissions policy.

## Identity and access

- [ ] A new participant joins with the event code and receives one team assignment.
- [ ] Invalid codes fail without exposing experience data.
- [ ] Direct participant routes redirect a browser with no participant session to join.
- [ ] Participant accounts cannot open admin data or mutate another participant/team.
- [ ] A dedicated administrator signs in; the demo `HERVAS-ADMIN` code has no production effect.
- [ ] A second administrator can take over.
- [ ] Private photo/mosaic object URLs fail without authorization; signed URLs expire.
- [ ] An administrator creates a 30-day memory link; it opens without a participant session, stops after revocation, and never exposes the token in the request URL or referrer.

## Participant workflow

- [ ] Join, locale choice, onboarding, team, and prompts are correct in English, Spanish, and Italian.
- [ ] Camera capture and library selection work on a current physical iPhone/Safari and Android/Chrome.
- [ ] Image orientation is correct and EXIF metadata is absent from the uploaded derivative.
- [ ] Upload, visible progress, success, retry after failure, and participant deletion all work.
- [ ] After a forced upload failure, reloading and reopening the same prompt restores the private pending photograph; retry succeeds and cancel removes it.
- [ ] The same workflow is repeated on normal and throttled/intermittent Wi-Fi.
- [ ] Installed PWA launches on HTTPS; updates replace the old service worker; private navigations are not retained in the shell cache.

## Facilitator workflow

- [ ] Phase changes propagate automatically to two participant devices without rejoining or refreshing.
- [ ] Capture is accepted only during exploration; selection only during selection.
- [ ] Moderation hide/delete actions affect participant and presentation views.
- [ ] Team story selection enforces ordering, ownership, and configured limits.
- [ ] Presentation, mosaic generation, reveal, and finished memory work on the presentation display.
- [ ] Refreshing facilitator and participant pages preserves valid state.

## Event configuration and operations

- [ ] Event year/dates, Hervás location, languages, teams, prompts, join code, and mosaic target are approved.
- [ ] Named event lead, facilitator, support/moderation owner, technical owner, and privacy owner are on call.
- [ ] Error monitoring and alerts reach the technical owner without participant content.
- [ ] Database/storage backup completed and a restore drill is documented.
- [ ] Consent/privacy text, guardian consent process, retention/deletion schedule, and incident contact are approved.
- [ ] The seven-day same-browser pending-upload recovery is accepted and tested; cross-device/background upload is explicitly out of scope.
- [ ] Go/no-go decision and rollback release are recorded.
