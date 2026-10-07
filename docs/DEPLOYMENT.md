# Deployment and live acceptance

## Release gate

Do not invite a real group based on the demo/browser tests alone. A production approval requires the live tests below, an accountable event operator and a documented privacy/retention decision. No live project or hosting account was configured during the audit.

## 1. Database and Auth

- Back up the database **and Storage objects** before upgrades; exercise restoration into a disposable project.
- Apply migrations `001` through `009` in filename order. Do not reapply edited older migrations to a deployed database; these new migrations must be tested on a copy first.
- For an existing installation, review every `participants.is_admin=true` row. The pre-hardening participant update policy allowed self-promotion. Revoke unapproved roles and affected sessions; do not assume applying the fix removes prior compromises.
- Before migration 007, resolve case/whitespace-equivalent duplicate join codes. Review legacy invalid names, empty translations and settings. The migration's `NOT VALID` checks protect new writes but **do not attest old rows**. Validate the new constraints after cleanup:

```sql
alter table public.experiences validate constraint experience_settings_valid;
alter table public.participants validate constraint participant_name_valid;
alter table public.teams validate constraint team_name_valid;
alter table public.challenge_translations validate constraint translation_valid;
```

- Enable anonymous sign-ins in the hosted Auth dashboard (the local TOML is not a hosted deployment).
- Configure sign-up rate limits, Auth URLs/allowed redirects and abuse controls. Supabase recommends CAPTCHA for anonymous signup; if enabled, wire an approved CAPTCHA provider/token into the join form before going public. CAPTCHA integration is **not implemented**. The local app does not rate-limit repeated join RPC calls.
- Use unguessable event codes; never use `HERVAS` in production. Avoid publishing codes in public screenshots or logs.
- Create a registered email/password administrator in Supabase Auth using the operator's controlled account. Do not give an anonymous participant administrative privileges. Bootstrap only from the trusted SQL editor/server-side service role, never the browser. Example, **replace the placeholder UUID and private code**:

```sql
do $$
declare
  admin_user uuid := 'REPLACE-WITH-REGISTERED-AUTH-USER-UUID';
  event_id uuid;
begin
  if not exists(select 1 from auth.users where id=admin_user and not coalesce(is_anonymous,true)) then
    raise exception 'A registered administrator is required';
  end if;
  insert into public.experiences(slug,title,place,join_code,state,supported_languages)
    values('your-event','Your event','Your place','REPLACE-WITH-RANDOM-CODE','draft',array['en','es','it'])
    returning id into event_id;
  insert into public.participants(experience_id,user_id,first_name,is_admin,onboarding_completed)
    values(event_id,admin_user,'Organizer',true,true);
end $$;
```

Sign into `/admin`, configure teams/invitations, then make the event active. Subsequent event creation requires an already provisioned registered administrator. The UI remembers the selected event after creation; a general multi-event picker and account recovery UI are not provided.

## 2. Hosting

- Node 22.12+; deploy with the committed lockfile using `npm ci`.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at **build time**, `NEXT_PUBLIC_DEMO_MODE=false`, and `SUPABASE_SERVICE_ROLE_KEY` only in the server environment. Run `npm run validate:production`, `npm run build` and `npm start` (or the host's Next.js adapter).
- Never expose the service-role key through a public variable, client bundle or commit; the private memory-link resolver needs it server-side.
- Require HTTPS. Verify emitted security headers, private bucket settings, upload limits and host-specific cache behavior. HSTS must be configured at the HTTPS host. A nonce/hash-based Content Security Policy remains a deployment hardening task; the current policy permits inline scripts/styles for Next.js.
- PWA manifests have 192/512 PNG icons. Check actual Android installation and iOS Add to Home Screen; browser emulation does not prove installation/camera support on hardware.
- Update the service-worker cache version when changing shell semantics. Test an upgrade from an existing installation, not only a fresh context. Private Supabase data must never enter Cache Storage. Do not add signed URL endpoints to service-worker caching.

## 3. Live acceptance matrix (mandatory)

Use a disposable staging project and three separate browser profiles: registered organizer, anonymous participant A, anonymous participant B. Also use two physical devices, including iOS Safari and Android Chrome.

1. Invalid code/name, anonymous signup, repeated join and session resume. Onboarding must not create a duplicate participant. Close/reopen and verify identity/team.
2. Attempt participant PATCH of `is_admin`, `user_id`, `is_active` and `experience_id`: deny. An anonymous account must not call administrator RPCs/create an event or modify another event.
3. Pause A; verify reads/mutations are denied and repeat join cannot reactivate A. Restore and reassign A; verify the device picks up team and phase changes (Realtime with poll/focus fallback).
4. Upload camera JPEG/HEIC-if-supported, rotated JPEG, PNG and a corrupt file. Verify output orientation, stripped GPS/EXIF, thumbnail dimensions and actual MIME. Test the configured size limit and max-photo limit under concurrent requests.
5. Disconnect independently during each Storage upload and RPC save; resume/retry. Inject a Storage delete failure. Verify no false success, no duplicated saved photograph and inspect cleanup receipts/orphans.
6. Hide a photograph; B must not query/sign its objects or see it in gallery/story/mosaic input. Verify target mosaic is never participant-readable. Previously signed URLs can work until their five-minute expiry—do not promise immediate revocation.
7. Concurrent team select/remove/reorder at the story limit. No duplicate position, out-of-team photo or phase bypass. Personal marks must be private to their author.
8. Save event dates, languages and translated invitations; blank/invalid inputs must fail in both UI and direct RPC/table calls. Reload and verify persistence.
9. Generate, cancel, regenerate, download and reveal a mosaic. Participant access requires phase+visibility+ready status. Test a slow/failing/expired signed image; wait over five minutes and refocus/reload.
10. Test presentation keyboard navigation, reduced motion, the exact memory slug, copy-link failure, print and fresh-session access to a revocable expiring memory link.
11. Test 320px/large text/200% zoom/landscape and keyboard-only usage. Perform manual VoiceOver/TalkBack/NVDA checks. Run axe, but do not substitute axe for these checks.
12. Simulate the maximum intended event size and concurrent attendance. Record load time, memory, failed requests and Supabase quotas on realistic mobile bandwidth. Current gallery/admin loaders are small-event, non-paginated views; default API row limits and large media sets must be addressed before larger events.

Store dated evidence and the exact deployed commit/build/environment. CI's local adapter tests are not sufficient to sign these steps off.

## 4. Cleanup, privacy and operations

- `photo_file_cleanup` is a durable queue for photographs deleted by the app. Clients retry their accessible jobs on gallery load and delete retries; a failed operation is not marked complete. Monitor the table for old entries.
- A trusted scheduled job should remove both named objects using the **Storage API**, then delete the receipt only after confirmed removal. Never delete `storage.objects` rows directly as a substitute for deleting files. No scheduled worker is deployed here.
- Reconcile abandoned uploads with no photo row, old target/generated mosaic versions and event-deletion jobs. Take care with signed URL expiry and concurrent uploads; use an age threshold and dry-run/report first. Do not delete an event and assume its bucket prefixes disappear.
- Normal clients strip image metadata. For adversarial/untrusted uploaders, add a server-side decode/re-encode and metadata verification boundary before publication; a boolean column and MIME allowlist cannot attest file contents. This is a broader ingestion change, not verified in this audit.
- Document lawful consent (especially for minors), retention/deletion, who can view photographs, anonymous-session loss, shared-device signout and incident contacts. Neither copying a URL nor hiding a tile guarantees erasure of prior downloads/browser caches.
- Establish error/availability monitoring with sensitive URL/JWT redaction, backup/restore drills, quota alarms, cleanup alerts, dependency updates and an operator rollback plan. CI has been added but its hosted execution has not been observed here.

## Rollback

Keep a known-good app artifact and database/storage backup. Test forward migration on staging. Do **not** roll back to the vulnerable RLS grants to restore UI compatibility; fix forward or temporarily close participant access. The integrated UI requires migrations 006–009. Disable joining/uploads at the event level during incident triage while preserving evidence and existing photographs.
