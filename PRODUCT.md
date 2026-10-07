# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Intended users: Spanish and Italian student-exchange participants using their own phones outdoors in and around Hervás. They join briefly throughout a multi-hour or multi-day programme to notice, photograph, and share details without turning the experience into a screen-led activity.
- A facilitator who configures the experience, manages participants and teams, writes multilingual invitations, moderates photographs, advances phases, and prepares the final presentation and mosaic. This work is primarily desktop or tablet oriented.
- The whole group during a projected sharing circle and mosaic reveal.
- Participants revisiting the finished collective memory after the experience.

## Product Purpose

See What Others Don’t See is an independent prototype for a private, multilingual photography experience that helps a mixed student group observe a shared place through different perspectives. Participants follow creative invitations, contribute photographs and short reflections, curate a team story, and combine their work into a final mosaic. Success means the interface gets people back into the physical environment quickly while making the collective result feel meaningful.

## Positioning

The product turns many small acts of individual observation into one collective photographic memory. It is not a competition, classroom, social network, generic task manager, or conventional scavenger hunt.

## Operating Context

- The fictional development template uses Hervás, 1–5 October 2026; no activity or deployment is claimed. Prompts focus on the first signs of autumn rather than promising peak foliage.
- The intended small-group use case has approximately eleven participants in mixed teams; the seed names and metadata are fictional.
- The participant experience is mobile-first, used one-handed and outdoors, sometimes in bright light or with weak connectivity.
- Entry uses a short code and first name without passwords or email registration.
- The experience moves through welcome, exploration, selection, presentation, reveal, and finished phases.
- The facilitator may operate a separate administration surface while participants use the field experience.
- The finale uses a projection screen, then produces a shareable and printable memory archive.

## Capabilities and Constraints

- Preserve all existing routes, phase rules, business logic, Supabase boundaries, demo adapters, browser-session persistence, PWA behavior, and internationalization in English, Spanish, and Italian.
- Preserve private image storage, participant ownership rules, client-side image resizing, EXIF/GPS removal, retry behavior, and participant-controlled deletion.
- Preserve gallery filtering, story marks, capped team story selection and ordering, administration workflows, mosaic generation, presentation controls, reveal gating, download, sharing, and print behavior.
- Maintain a useful experience without configured Supabase credentials through the existing local demo path.
- Route/session guards, phase refresh and tokenized memory links are implemented; hosted integration, event operation and real-device acceptance remain unverified.
- Avoid new dependencies unless the interaction cannot be implemented cleanly with the current stack.

## Brand Commitments

- Product name: **See What Others Don’t See**.
- The experience is quiet, contemporary, photographic, collective, and non-competitive.
- Interface language may use invitations, perspectives, traces, stories, looking, noticing, capture, and reveal, but clarity always outranks poetic wording.
- The locked replacement direction is **Common Light**, documented in `DESIGN.md`. The discarded editorial/viewfinder implementation is an anti-reference, not visual authority.

## Evidence on Hand

- Current scope and public-edition qualification: `README.md`, `PRODUCTION_READINESS.md` and `docs/SECURITY.md`.
- Source publication method and current evidence: `docs/PUBLICATION_GUIDE.md` and `docs/PUBLICATION_REVIEW.md`. Private briefs and historical records are not redistributed.
- English, Spanish, and Italian interface copy: `locales/`.
- Working participant, facilitator, presentation, reveal, and memory flows in `app/`, `components/`, and `lib/`.
- Demo data and a synthetic mosaic target exist, but the repository contains no approved public participant photography or documentary brand-image library. The interface must not fabricate participant photographs; real uploads provide expressive imagery once available.

## Product Principles

1. **Return attention to the world.** Every participant interaction should be brief, obvious, and easy to complete outdoors.
2. **Make the collective visible.** Individual photographs should visibly contribute to the group story and final mosaic.
3. **No winners or rankings.** Progress communicates participation and readiness, never comparative performance.
4. **Private and resilient by default.** Explain privacy clearly, preserve failed work, and remain useful under imperfect connectivity.
5. **One product, distinct working modes.** Participant, facilitator, projection, and archive surfaces share a system but use density and hierarchy appropriate to their jobs.

## Accessibility & Inclusion

- Target WCAG 2.2 AA contrast and interaction semantics.
- Support keyboard navigation, visible focus, field-level errors, semantic tabs and pressed states, accessible dialogs, live status messages, and touch targets of at least 44px.
- Design mobile layouts for 320px and above, with primary validation at approximately 375 × 812px, safe-area support, thumb reach, text zoom, and short landscape screens.
- Preserve full English, Spanish, and Italian usability without relying on narrow fixed labels.
- Provide deliberate reduced-motion alternatives that retain immediate state feedback while removing travel, scale, loops, and cinematic choreography.
