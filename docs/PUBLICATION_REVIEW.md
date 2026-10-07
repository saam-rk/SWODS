# Public-edition publication review

**Review date: 7 October 2026.** Scope: the independent SWODS public source edition, not the private original workspace, its Git history, a hosted deployment or a real event.

## Verdict

The reviewed source-only edition is suitable to publish as an **independent, AI-assisted functional prototype** on the basis of the owner's confirmation of code publication/licensing rights and the technical/content checks below. No unapproved photographs, campaign media or original Git history are included. This is a scoped publication assessment, not legal advice, an originality/plagiarism determination, a security certification or a guarantee of zero risk. The project is still **not approved for production or a live participant event**.

No Git repository, commit, remote or GitHub publication was created during the initial source-only preparation. The owner subsequently requested public publication; that follow-up is recorded below. The private original remains unchanged by the public-edition work. Publish only the source export described in `PUBLICATION_GUIDE.md`, not the whole working directory.

## Changes made

- Copied an explicit set of current source files into an independent edition without `.git`, dependency directories, original briefing, private video workspace, historical audits/implementation records or old screenshots.
- Replaced all three supplied collage rasters with a lightweight, original geometric SVG contact sheet. Regenerated the SVG/PNG icons and synthetic target directly from authored geometry, rather than copying any old media.
- Preserved fictional demo metadata and neutral gallery placeholders; no participant photographs or external photo service are used by the demo fixtures.
- Added MIT for original code and graphics after the owner explicitly confirmed publication/licensing rights. Preserved Apfel Grotezk's full SIL OFL text and documented dependencies, licensing scope, excluded material and non-affiliation.
- Reconciled migration instructions to 001–009, removed outdated test/automation claims, and separated source publication from hosted/device/privacy approval.
- Remediated the 12 originally reported dependency audit entries. Runtime Next.js remains 15.5.24. The targeted lint-tool downgrade and reset-only Tailwind 4 migration are explained in `SECURITY.md`; no audit entry is suppressed.
- Added an allowlisted publication validator, SHA-256 asset inventory, source-only exporter, four regression tests for publication safety and a CI publication gate. Broadened ignored environment patterns and excluded private workspaces/archives.
- Captured fresh landing/join screenshots from clean local demo contexts for visual review; these generated artifacts are deliberately **not** in the source export.

## Initial source-only verification (before GitHub publication)

The table below is the original preparation snapshot. Current repository checks are recorded in the publication follow-up at the end of this document.

| Check | Result | Qualification |
|---|---|---|
| Locked dependency installation (`npm ci`) | Passed | Node 24.19.0 on Windows; CI targets Node 22, hosted CI not observed |
| Publication source validator | Passed | 146 reviewed source files; six approved assets, plus the service worker; no detected secret patterns |
| TypeScript | Passed | Full `tsc --noEmit`; LSP probes were inconclusive, not counted as clean evidence |
| ESLint | Passed | Current pinned lint configuration, not a claim of the latest Next-specific rule set |
| Vitest | **71 passed**, 18 files | Includes modeled SQL/RLS and four new public-source regression tests; not live Supabase integration |
| Demo production-mode build | Passed | Local demo, not production operation |
| Production build with CI placeholders | Passed | Deliberately non-functional keys; compilation/environment contract only, not real infrastructure |
| Browser acceptance | **11 passed; 1 omitted**, 12 scheduled | Chromium, Firefox and WebKit; Windows WebKit service-worker case explicitly omitted, not counted as successful |
| Image handling audit | **48/48 passed** | Eight EXIF orientations, two decoding paths and three browser engines; pixels, output MIME and metadata removal on synthetic inputs |
| Fresh visual review | Phone/desktop landing and join reviewed | 375×812 and 1440×1000 contexts; abstract artwork loads and the existing composition remains usable |
| Automated accessibility | Four scans, zero violations | Landing/join at phone and desktop; no claim of complete WCAG compliance |
| Full `npm audit` | **0 known vulnerabilities** | Registry result at review time, including development dependencies; not a perpetual guarantee |
| `npm audit --omit=dev` | **0 known vulnerabilities** | Same time-dependent limitation |
| Source-only export verification | Passed in a separate temporary directory | Fresh locked installation with install scripts disabled, publication gate, typecheck, lint, all 71 tests and demo build passed without the original workspace; the export itself remains free of dependency/build directories |

Expected missing-environment errors are exercised by tests and do not indicate a failed suite. Deprecation warnings remain for ESLint/glob and Vitest configuration; no warnings were hidden. Physical phones, camera/HEIC behavior, hosted Supabase, public-abuse behavior and operational privacy approval remain unverified.

## Content and rights qualification

The owner confirmed the right to publish and license the original code with no conflicting assignment or confidentiality agreement. That declaration is relied upon, not independently adjudicated. Original code and geometric graphics are licensed under MIT; dependencies, fonts, third-party marks and future private uploads are not relicensed by MIT. Apfel Grotezk is under SIL OFL and its notice is preserved.

Asset provenance is in `ASSET_MANIFEST.json`, with the generating code in `scripts/generate-public-assets.mjs`. The initial six assets contain only synthetic shapes/colors, not photographs, people, organization logos or downloaded imagery. Checksums establish identity of reviewed files, not ownership of arbitrary future content. Do not reintroduce private media or use historical screenshots in a portfolio.

The source check is heuristic. It rejects common key/private-key/credential-URL/JWT patterns and permits only dummy-signature JWT fixtures in the CI workflow and operations test. It does not certify generated folders, historical Git objects, all secret encodings or external accounts. The source exporter omits those folders and all Git objects rather than purporting to cleanse the private original.

## Reproduction and publication

Follow `PUBLICATION_GUIDE.md`. For additional visual and pixel evidence, run:

```sh
npm run build:demo
node scripts/review-public-demo.mjs
```

The script uses a separate local server and clean contexts, writes ignored evidence under `audit-artifacts/`, and checks image processing. Only the isolated blob-module image audit bypasses CSP to inject the processor; normal browser acceptance and accessibility review use the actual app headers.

Before publishing any later revision, repeat the source gate, locked install, tests, build, browser acceptance and audits; export again and review the exact staged files. Do not describe this prototype as an official Erasmus+ service, a completed pilot, a live deployment or a certified secure application.

## GitHub publication follow-up — 7 October 2026

The owner authorized creation of the public repository at https://github.com/saam-rk/SWODS. A new `main` history was created from the reviewed export, not from any branch, stash or object of the private original. The maintained local clone is `SWODS-portfolio/`; future public changes belong there rather than in the earlier preparation copy. Commits use a GitHub noreply author address. `.gitattributes` preserves LF source/asset checksums across Windows and Linux clones. A fresh remote clone passed the publication gate.

The first hosted CI run passed installation, source/production configuration gates, TypeScript, lint, 71 unit/model tests and the production build. Its WebKit offline reload failed with `WebKit encountered an internal error` on Linux: https://github.com/saam-rk/SWODS/actions/runs/37602940137. That run was not presented as successful.

The browser suite now separates online service-worker/cache privacy checks from offline reload. Online shell/cache checks run on **all three engines**, including WebKit. Before any WebKit offline exemption, global setup runs a standalone minimal cached-worker probe with **no application code**. Only two repeats of the exact internal reload error, after proving online reload, worker control and cached content, permit that single exemption. Unexpected setup, cache, timeout or application failures do not qualify. If a future engine passes the probe, its actual app offline check runs again automatically. Evidence is kept in the CI browser artifact; full browser/real Safari readiness is still not claimed.

Four new unit tests guard that classification. The capture test also waits explicitly for the privacy-confirmed UI before submitting; the Firefox flow passed three consecutive isolated repeats after a timing failure was observed locally.

Updated local verification: **75 unit/model tests passed**, 19 files; **14 browser checks passed and one independently evidenced WebKit offline check was omitted**, 15 scheduled. TypeScript, lint, demo build, the publication gate (**149 source files**) and the full dependency audit passed, with zero known audit entries. Check the latest hosted outcome at https://github.com/saam-rk/SWODS/actions; CI status does not establish hosted Supabase or physical-device acceptance.
