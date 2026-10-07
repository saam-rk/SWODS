# Third-party notices and asset provenance

## Original SWODS material

The original project code, documentation, geometric SVG artwork and generated application icons in this public edition are distributed under the root MIT license. The owner confirmed their right to publish and license the original code when preparing this edition. This is an owner declaration, not an independent legal determination or a warranty about AI-generated material.

All six files under `public/` are generated solely from original geometry in `scripts/generate-public-assets.mjs`. There are no input photographs, external images, people, logos, web-font downloads or stock-photo inputs in that script. `docs/ASSET_MANIFEST.json` records paths and SHA-256 digests. PNG icons are rasterizations of the original SVG mark. Regenerate with `npm run assets:generate`.

Demo participant names and captions are fictional fixtures. Gallery fixtures have no image URLs and render neutral placeholders, not claimed participant submissions. Browser/image tests create synthetic pixels programmatically. Screenshots generated from this edition may be used only after checking that no personal uploads or live accounts were present.

## Apfel Grotezk

- Copyright 2020 Collletttivo and original Designer (as listed on collletttivo.it).
- Font software: SIL Open Font License, Version 1.1, **not MIT**.
- Supplied through `@fontsource/apfel-grotezk`; only the 400 and 700 styles are imported.
- A complete copyright and license copy is preserved in [`licenses/Apfel-Grotezk-OFL.txt`](licenses/Apfel-Grotezk-OFL.txt).
- Font project: https://www.collletttivo.it/
- Package information: https://fontsource.org/fonts/apfel-grotezk

Keep this notice and the OFL text when redistributing builds that embed the font. Do not treat the font as original SWODS artwork or relicense it as MIT.

## Software dependencies

Dependencies remain under their own licenses, not the SWODS MIT license. They are installed through npm rather than vendored into the source edition. `package-lock.json` records resolved packages and available license identifiers; installed packages contain their own notices. Next.js, React, Supabase JS, Tailwind and other MIT/Apache/ISC dependencies must retain their required notices when redistributed.

Other license families in the dependency tree include MPL-2.0 (axe-core and related development tools as identified by the lockfile), LGPL-3.0-or-later components of Sharp/libvips, and CC-BY-4.0 data in caniuse-lite. These do not automatically license the SWODS code under those terms. If distributing compiled applications, containers or dependency binaries, review the actual bundled artifacts and carry their notices and any applicable source/relinking obligations; this file is not a substitute for that review. Sharp is used by the asset and image-test tooling and may also be installed for Next.js image handling.

No dependency implementation, binaries or `node_modules/` are included in the source export. Do not distribute those directories as part of the portfolio repository.

## Excluded material and affiliation

The private original workspace, historical Git objects, campaign/video workspace, original briefing, historical implementation/audit records, unapproved photographs, their derivatives and old screenshots are not part of this edition. Their exclusion does not authorize publishing them elsewhere.

Hervás is a descriptive place reference. This prototype is not an official, approved, sponsored or piloted Erasmus+ or FuTourUp! service. No organization logo or participant photograph is shipped. The software license does not grant rights to third-party trademarks, likenesses, private uploads or organizational materials.
