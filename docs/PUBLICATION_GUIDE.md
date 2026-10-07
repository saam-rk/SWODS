# Publishing the public portfolio edition

## Scope and rights

Publish **this independent edition**, not the private original directory or its Git history. The project owner explicitly confirmed their right to publish and license the original code without a conflicting assignment or confidentiality agreement. MIT is applied on that basis. This is not a legal opinion, a copyright originality/plagiarism certification, or a promise of zero risk.

No campaign-video workspace, unapproved photographs, their derivatives, old screenshots, original briefing or old Git objects are redistributed. The six shipped visual assets are original synthetic geometry. Apfel Grotezk is used under SIL OFL, with the full license preserved. Keep `LICENSE`, `THIRD_PARTY_NOTICES.md`, `licenses/` and `docs/ASSET_MANIFEST.json` in the published copy.

References to a place or a student-exchange use case do not imply institutional affiliation. Do not add organization logos, official-service claims or participant images without the corresponding rights and approvals.

## Prepare an exact source-only export

From the independent working copy:

```sh
npm ci
npm run audit:publication
npm run typecheck
npm run lint
npm test
npm run build:demo
npm run test:e2e
npm audit
npm run export:source
```

`dist/SWODS-public/` is the intended upload source. The exporter uses an explicit root allowlist and the publication validator, excludes dependency/build/test folders and Git objects, refuses symbolic links and does not overwrite an existing export. Move an old export aside before exporting again. Validate the export by running `node scripts/validate-publication.mjs` inside it. Asset checksums help catch accidental restoration/replacement, but a checksum is not independent proof of ownership.

**Do not upload the whole development directory, `node_modules/`, `.next/`, `audit-artifacts/`, `test-results/`, private backups or `.git` from the original project.** The source checker excludes generated folders rather than certifying their contents. Any actual Git index/history must be reviewed separately before pushing; the exporter does not copy an existing index/history.

## GitHub — manual, only when ready

No repository or remote is created automatically. When you decide to publish, start a new repository from the source-only export rather than importing the original history. Review staged files, use a privacy-preserving commit email if desired, and check GitHub secret-scanning results. Never copy the original `.git` or push its other branches/stashes into the public project.

Keep the repository description honest: **independent functional prototype; AI-assisted development; not piloted; not approved for production**. Enable dependency alerts and review them periodically. The audit result is time-dependent, not a perpetual safety certificate.

## Portfolio screenshots

Capture fresh screenshots from a clean local demo with no Supabase credentials or real accounts. Use only the shipped synthetic graphics or your own permitted uploads; do not reuse historical screenshots or campaign posters. Test-generated screenshots and traces are ignored and not automatically exported. Review every image for names, personal uploads, tokens, browser chrome and unrelated desktop content before adding it. The current asset gate deliberately rejects extra media until explicitly reviewed and documented.

## Suggested CV wording

> SWODS — mobile-first collaborative photography prototype. Product design and AI-assisted development with Next.js, TypeScript and Supabase; ES/IT/EN localization, participant/admin workflows, client-side image processing and RLS-based access controls. Local automated and browser validation; hosted integration and real participant pilot pending.

Use actual test counts from `PUBLICATION_REVIEW.md`, and only claim architecture or decisions you can explain. Do not claim an official Erasmus+ service, real participant adoption, certification or a successful live deployment.

## Source publication is not event approval

A source repository can be public while the software remains unsuitable for a live event. Real use still requires hosted Supabase validation, physical devices, private storage/administrator provisioning, operational retention/deletion, privacy notices and a lawful basis, consent/guardian handling where relevant, and moderation/incident ownership. Public registration or adversarial uploads need the additional abuse and server-side ingestion controls described in `SECURITY.md`.
