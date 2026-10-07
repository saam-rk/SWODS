# Production operations runbook

This runbook covers repository-supported deployment and event operation. Hosting accounts, real credentials, a domain, monitoring destinations, and legal approvals must be supplied by the operator.

## Ownership

Assign named people before launch for:

- event lead and go/no-go decision;
- facilitator/admin console operation;
- participant support and moderation;
- Supabase and hosting incident response;
- privacy requests and post-event deletion.

Keep two administrator identities. Do not share participant join codes in public channels, and never use the local `HERVAS-ADMIN` demo code as a production credential.

## Provision the production service

1. Create a dedicated hosted Supabase project in the intended region.
2. Enable anonymous sign-ins; participant joining depends on Supabase anonymous auth.
3. Apply migrations in order with `supabase db push --linked`. Review the linked project before confirming.
4. Load event data deliberately. `supabase/seed.sql` is a development/event template and currently targets Hervás, 1–5 October 2026; verify the dates, teams, prompts, join code, and target mosaic before applying equivalent production data.
5. Confirm the `photos` and `mosaics` buckets are private. Restrict photos to JPEG/WebP and set an upload limit appropriate for the processed images (10 MiB is the local baseline).
6. Create a normal email/password Auth user for each administrator. In the SQL editor, insert a participant row for the event using that Auth user UUID, with `is_admin = true`, `is_active = true`, and no team membership. This one-time bootstrap is deliberately out-of-band; after migration 006, only an existing non-anonymous admin may create another experience. Confirm each account can sign in at `/admin` and a participant account cannot.
7. Enable point-in-time recovery or daily database backups and document one restore drill. Configure retention for stored photos separately from database retention.

Use this reviewed bootstrap shape once per administrator, replacing both UUIDs with values from the production project:

```sql
insert into public.participants (
  experience_id, user_id, first_name, preferred_locale, is_admin, is_active
)
values (
  '<production-experience-uuid>',
  '<auth-user-uuid>',
  'Facilitator',
  'en',
  true,
  true
)
on conflict (experience_id, user_id) where user_id is not null
do update set is_admin = true, is_active = true;
```

## Configure and deploy

Set these values in the hosting platform, never in committed files:

- `NEXT_PUBLIC_SUPABASE_URL`: hosted project HTTPS URL;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anonymous/publishable key only;
- `SUPABASE_SERVICE_ROLE_KEY`: required for expiring memory links, server-only, and never prefixed with `NEXT_PUBLIC_`;
- `APP_RELEASE`: recommended commit SHA or release name.

Every production build runs `npm run validate:production` and fails when required configuration is absent, insecure, local, or uses a key in the wrong public/server role. CI uses non-functional placeholders only to verify compilation; they are not deployable credentials.

Deploy with the repository's normal commands:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Terminate TLS at the hosting platform, redirect HTTP to HTTPS, and use a current Node.js 22 runtime. Configure the platform liveness check as `/api/health`. Use `/api/health/ready` for readiness only when the platform tolerates a 503 during a Supabase outage; it verifies the configured Supabase Auth health endpoint with a four-second timeout.

After deployment, run:

```sh
npm run smoke:production -- https://event.example.org
```

The smoke check covers liveness, dependency readiness, the HTML shell, manifest, service worker, HTTPS, content types, and security headers.

## Monitoring and alerts

At minimum, monitor:

- hosting 5xx rate and `/api/health` availability;
- `/api/health/ready` failures, separated from web-process failures;
- Supabase Auth, Database, Realtime, and Storage status;
- database size, storage size, and backup completion;
- browser/client errors through the hosting provider or a configured error tracker.

Alert the event lead and technical owner. Do not include participant names, captions, signed URLs, tokens, or image payloads in logs or alerts.

## Event-day procedure

1. Run the live acceptance checklist in `docs/LIVE_ACCEPTANCE_CHECKLIST.md` on the final deployment.
2. Keep the experience in `welcome` until participant support is ready.
3. Confirm the admin device remains signed in and a second admin can take over.
4. Move phases only when the facilitator announces them. Verify one participant device follows each phase transition.
5. Moderate hidden/deleted photos before presentation and confirm the final mosaic asset is ready before reveal.
6. During weak connectivity, failed production uploads are kept privately in the same browser for up to seven days. Participants may reopen the same prompt after a reload, then retry or cancel to remove the pending copy. Verify this recovery on the event devices before relying on it.

## Incident playbooks

### Participants cannot join

- Check `/api/health/ready`, Supabase Auth status, anonymous sign-ins, experience `state = 'active'`, and the join code.
- Do not switch the production deployment to demo mode. If service cannot be restored, pause entry and preserve the existing session state on participant devices.

### Uploads fail

- Check Supabase Storage health, bucket privacy/policies, browser connectivity, file type/size, and the current `exploration` phase.
- Reopen the same prompt and retry the restored pending photograph. If orphaned objects remain after a partial failure, record the participant/time and clean them up after the event with an administrator-reviewed query.

### Phase changes do not propagate

- Confirm Supabase Realtime is healthy and the experience row changed.
- Participants can perform one manual refresh as a temporary recovery, but stop phase progression if devices remain split across phases.

### Suspected privacy or credential incident

- Stop the event flow, archive the experience if appropriate, rotate affected keys/sessions, preserve audit evidence, and notify the privacy owner.
- Never expose the service-role key to a browser. A suspected service-role leak requires immediate rotation.

## Closeout

Export the approved final artifact, revoke memory links when their audience window closes, archive the experience, process deletion/access requests, and delete photos according to the approved retention schedule. Record backup/restore status, incidents, and the exact deployed `APP_RELEASE`.
