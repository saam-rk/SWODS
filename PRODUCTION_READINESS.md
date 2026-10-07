# Production readiness

**Status: functional prototype; not piloted or production-ready.** The implementation and local verification described below are present, but no hosted Supabase deployment, real participant workflow, physical-device acceptance, or privacy/legal approval has been completed. The remaining gates require the operator's real Supabase project, hosting account, domain, physical devices, responsible people, and privacy approval. Do not describe this as launched, field-tested, or ready for a real event until those gates pass against the final deployment.

## Completed in the repository

- [x] Added production Supabase migration and configuration boundaries.
  - Migrations `001`–`009` cover private storage, RLS, narrow write RPCs, participant suspension, Realtime publication, and revocable memory links.
  - Production builds fail closed unless hosted public Supabase credentials and a server-only service key are configured safely.
  - Production admin access uses a separately provisioned email/password Auth identity with active `is_admin` membership; `HERVAS-ADMIN` is demo-only.

- [x] Added live participant phase synchronization.
  - Participant screens subscribe to filtered Supabase Realtime changes and follow welcome, exploration, selection, presentation, reveal, and finished phases automatically.
  - A 30-second poll, focus/visibility/online refresh, exponential reconnect, and stale-channel cleanup provide recovery when Realtime is interrupted.

- [x] Protected direct participant routes.
  - Missing, stale, inactive, mismatched-demo, and signed-out sessions redirect to join before participant content renders.
  - Transient network failures retain an already validated production session for field resilience.

- [x] Implemented the memory-link access model.
  - Administrators create revocable 256-bit links that expire after 30 days by default.
  - Only SHA-256 token hashes are stored; tokens stay in URL fragments and are POSTed without referrer logging.
  - Anonymous resolution is limited to visible reveal/finished memories and returns 15-minute signed private asset URLs without participant identities.

- [x] Removed the reload-loss upload limitation.
  - Failed production uploads are kept in participant-scoped IndexedDB for seven days on the same browser.
  - Reopening the same prompt restores the processed image and caption; success or cancellation deletes the pending copy.

- [x] Added production delivery and operations support.
  - CI runs locked install, environment validation, typecheck, lint, tests, and production build.
  - Security headers, liveness/readiness endpoints, safer service-worker caching, production validation, and an HTTPS smoke test are included.
  - [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md) covers provisioning, administrator bootstrap, monitoring, backup, incidents, event-day operation, and closeout.
  - [`docs/LIVE_ACCEPTANCE_CHECKLIST.md`](docs/LIVE_ACCEPTANCE_CHECKLIST.md) is the evidence-based launch gate.

- [x] Reconciled event configuration and documentation.
  - The development/event template uses Hervás, 1–5 October 2026, eleven participants, three teams, and five English/Spanish/Italian early-autumn prompts.
  - The README now describes the production architecture and current operating model.

## Required operator gates before the event

- [ ] Provision the dedicated production Supabase project.
  - Link the correct project and apply migrations `001`–`009`.
  - Enable anonymous sign-ins, verify private buckets, and configure backups.
  - Create at least two administrator Auth users and bootstrap their admin participant records.

- [ ] Approve and load the real event configuration.
  - Confirm 1–5 October 2026, teams, prompt translations, join code, participants, final mosaic target, and retention dates.
  - Do not reuse the demo administrator code as any production credential.

- [ ] Configure and deploy the final HTTPS release.
  - Set all required secrets, hosting, domain, TLS redirect, release identifier, health checks, monitoring, and alerts.
  - Publish only the reviewed public edition if desired; source publication does not establish deployment readiness.
  - Run `npm run smoke:production -- https://<production-domain>`.

- [ ] Run the live Supabase acceptance suite.
  - Joining/team assignment; upload/EXIF removal/retry/recovery/deletion; private storage/RLS/signed URLs; moderation/story selection; phase changes; mosaic/reveal; memory creation/open/revocation.

- [ ] Complete physical-device and network acceptance.
  - Current iPhone/Safari and Android/Chrome camera/library permissions.
  - Installed PWA/service-worker update behavior on the production HTTPS origin.
  - Normal, weak, intermittent, offline, reload, and restored-connection scenarios.

- [ ] Complete the operational privacy approval.
  - Approve participant notice and lawful/consent basis.
  - Define guardian handling if minors participate, photo/link retention and deletion, access requests, incident response, and named privacy/moderation/support owners.

- [ ] Record launch evidence and go/no-go.
  - CI, smoke, health/readiness, backup/restore drill, device matrix, monitoring alert, rollback release, tester/date/evidence, and named event lead must be recorded in the live acceptance checklist.

## Non-blocking future improvements

- [ ] Upgrade the deterministic tone/opacity mosaic to average-colour image matching.
- [ ] Extend the existing local browser suite with hosted Supabase integration tests after staging is available.

## Verification status

The current public-edition results are in [`docs/PUBLICATION_REVIEW.md`](docs/PUBLICATION_REVIEW.md). Local unit/SQL-model and browser tests do not certify live Supabase behavior. CI credentials are deliberately non-functional placeholders: successful compilation with them is not a deployment test. The original raster art and historical screenshot evidence are not shipped in this edition.

Dependency advisories and the distinction between source publication, local builds and a real public service are tracked in [`docs/SECURITY.md`](docs/SECURITY.md). No production approval is implied by the MIT license.
