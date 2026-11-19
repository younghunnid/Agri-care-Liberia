# Phase 1A: crop check (simulated triage) and versioned advice cards

Status: **implemented locally, committed locally, not deployed, pushed or merged.** Phase 1B (harvest listings, buyer discovery, aggregated Ministry insights, USSD simulator) has **not** been started. Stack unchanged: React, TypeScript, Node.js, SQLite. Inputs: `docs/KPAA_FEATURE_GAP_AUDIT.md` (F3, F4), `docs/KPAA_FEATURE_IMPLEMENTATION_PLAN.md` (4.1, 4.2) and the three KPAA presentations.

## 1. What a farmer gets
**Check my crop** (`/check-my-crop`, also on Home under "Get Advice"): choose cassava, rice or poultry, choose what you see (six situations), answer three plain questions, give a county, optionally add a photo, optionally agree to add the anonymous result to county counts. The result is a **Green / Yellow / Red attention band**, the reasons (your own answers), what to do next, and a linked **advice card**. Every result starts with the banner: *SIMULATED CHECK. This is not a diagnosis. No computer program has analysed your photo or your plants. The result comes only from your answers and a simple point table.* No confidence percentage is shown, and the page says why.

**Advice cards** (`/advice-cards`, `/advice-cards/:ref`): six numbered cards (`ADV-2026-001` to `-006`) with version, plain-language steps, "when to ask an officer", source note, Listen button, version history and a **"Check a code"** box. Every card is shown as **"Demonstration advice: NOT reviewed by a qualified agronomist"** unless an administrator records a named reviewer (section 5).

**Saved checks**: every check is saved on the phone (IndexedDB, up to 30) and opens without internet, with its photo, status and receipt. **Ask an extension officer** turns a check into the existing expert question (same offline queue and server path as before).

## 2. The six situations and the rule
| Case | Crop | Linked card |
|---|---|---|
| `cassava-patchy-young-leaves` | cassava | ADV-2026-001 |
| `cassava-yellow-old-leaves` | cassava | ADV-2026-002 |
| `rice-brown-leaf-spots` | rice | ADV-2026-003 |
| `rice-water-too-deep` | rice | ADV-2026-004 |
| `poultry-chicks-cold-sneezing` | poultry | ADV-2026-005 |
| `poultry-sudden-deaths` (never below Yellow) | poultry | ADV-2026-006 |

The teammate decks name "6 pre-configured mock cases (Cassava, Rice, Poultry)" without listing them; these six are our choice, two per crop. Each case asks: how many are affected (0, 1 or 2 points), is it getting worse (0, 1, 2) and one case-specific question (0 to 2; "three or more birds died in two days" is 3 points and **always Red**). **0 to 1 points = Green, 2 to 3 = Yellow, 4 or more = Red.** The rule lives in `src/data/triageCases.ts` and `src/lib/triageRules.ts`, is shared by the browser and the server, and the **server recomputes the band for every report** (a client cannot choose its own).

**Content honesty.** Card wording is taken from text already in the app (Team 8 cassava crop-problem guidance, Crops Library, Livestock Library). No new agronomic claim, dose, product or treatment was written; the poultry cards say Team 8 does not prescribe medicines. Everything is seeded at level `demo_sample`.

## 3. Photos and consent
* The photo is optional, compressed on the phone (width 800 px, then 520 px if still large) and capped at 600 000 characters (about 450 KB); only JPEG, PNG or WebP are accepted. It is stored **only on the phone** with the saved check.
* **It is never analysed** (the screen says so) and **never part of the anonymous report** (the server refuses `photoDataUrl`, names, phone numbers, e-mail and free text with `400 FIELD_NOT_ACCEPTED`, and `triage_reports` has no such columns).
* It leaves the phone only if the farmer opens "Ask an extension officer" and ticks **"Also send my photo"**, a separate choice. That request uses the existing expert-request endpoint, so the Phase 0 protections (private queue, quotas, shared demo expert cannot see or answer it) apply unchanged.
* Sharing the anonymous result with county counts is a separate, **unticked-by-default** box; the text says exactly what is sent (situation, answers, colour, county; no name, phone or photo).

## 4. Routes and data
| Route | Access | Purpose |
|---|---|---|
| `GET /api/v1/advice-cards[?crop=]` | public | list of current cards |
| `GET /api/v1/advice-cards/:ref` | public | one card (code, slug or id) with steps and version history |
| `GET /api/v1/advice-cards/:ref/versions/:n` | public | an earlier version |
| `GET /api/v1/advice/verify/:code` | public, 60 per 10 min per address | "Check a code"; one identical 404 for every unknown or malformed code |
| `POST /api/v1/admin/advice-cards/:ref/versions` | administrator | add a NEW version (never edits one); starts as `team_draft` |
| `POST /api/v1/admin/advice-cards/:ref/review` | administrator | team_draft / pending_review / verified (rules below) |
| `POST /api/v1/triage/reports` | anonymous (device key) or signed in; `Idempotency-Key`; 20 per hour per address (60 per account) | anonymous crop-check report with a receipt |
| `GET /api/v1/triage/reports` | caller's own only | the caller's reports |

**Migration `009_advice_cards_triage`** (additive, with a down file; the down file discards cards and reports, so back up first): `advice_cards`, `advice_card_versions` (immutable content enforced by a trigger, review fields updatable, a CHECK constraint makes `verified` impossible without reviewer name, organisation and date) and `triage_reports` (CHECK `is_simulated = 1`; device key stored only as a keyed hash).

## 5. Demonstration advice versus genuinely reviewed advice
* The seed can never produce a verified card (tested). A content change is always a **new version** that starts as `team_draft`; it does not inherit an earlier review (tested), and the old version keeps its own review in the history.
* `verified` requires: administrator, reviewer name (3 to 80), organisation, an explicit `attestation: true`, and a name and organisation that are **not demonstration placeholders** (`Sample`, `Demo`, `Test`, `Unverified`, ...). Reviewer details are returned by the API only for a genuinely verified version.
* The screen badge is green and says "Reviewed by NAME, ORG, on DATE" only in that case; everything else is amber and says "NOT reviewed". The same label function runs on the server and the phone.
* **There is no administrator screen for card review in Phase 1A** (API only). Recommended default for the demonstration: leave `verified` unused.

## 6. Offline behaviour
* The check works completely offline (rules, six cards and wording are bundled). Order for advice cards: server, then the copy saved on the phone, then the bundled version 1, and **the screen says which** ("Up to date from the server", "Saved copy on this phone (may be older than the server)", "Demonstration copy built into the app (version 1)").
* Visiting the card list online saves all six cards for offline reading.
* Saved checks are sent by a small queue (`src/lib/triageSync.ts`): the same `Idempotency-Key` on every attempt, receipt `APPLIED` or `DUPLICATE`, back-off for network trouble, the server's `Retry-After` honoured (Phase 0 follow-up policy), rejected reports stop retrying and keep the check, nothing is deleted by a failure, one run at a time.
* A service-worker API cache for advice cards was tried and **removed**: with the server down it made the page claim "Up to date from the server". The app's own labelled copy is used instead.

## 7. Security and safety
Server-side validation of case, answers, county, key and dates; whitelist of accepted fields; CSRF on all writes; administrator-only card changes; own-reports-only listing; rate limits; no personal data in `triage_reports`; no external call, SMS, USSD, payment or AI anywhere; the Phase 0 rules (synthetic-only demo numbers, shared demo accounts, quotas, `no-store`) are untouched and re-tested.

## 8. Tests
`tests/triage.test.ts` (21 tests, `npm run test:triage`): all 162 answer combinations against the rule; strict answer validation; card and wording safety (no doses, products, cures, AI or accuracy claims; banner and consent text present); label rules; local store and capacity; offline queue (offline, same key, lost response gives a DUPLICATE receipt, `Retry-After` of 15 minutes honoured, 12 waits, rejected reports, payload content, overlapping runs); advice client fallbacks; escalation payload (no phone number, photo only with consent); cards API; immutability and review rules (including direct SQL); report API (server band, idempotency, no personal columns, strict validation, ownership); an end-to-end offline, lost-response and retry run against the real server; the Phase 0 protections for an officer question; migration up, down and re-apply; default limits on a real server.

Browser verification (production build, disposable demo-mode server, synthetic data, desktop Chrome; the 375 px and 320 px layouts were measured in same-origin frames, not on a phone):
| Check | Result |
|---|---|
| Poultry sudden deaths, three answers, county, sharing ticked | RED band, emergency box, banner, `ADV-2026-006` v1, badge "NOT reviewed", report received with receipt `TRG-2026-000001` |
| Cassava, Yellow path | YELLOW band, no emergency box, receipt appeared on the open result without a reload (a bug found here and fixed) |
| Ask an officer without the photo box | request reached the queue with no photo and no phone number |
| Photo attach, result, ask again with consent | photo kept on the phone and shown; the second request (consent given) carried the photo, the first did not |
| Advice cards online | six cards, "Check a code" confirmed `ADV-2026-004` and answered an unknown code correctly |
| **Server stopped (real offline)** | list and card opened from the saved copy with an honest "Saved copy on this phone" label (a wrong "Up to date" label was found here and fixed); saved checks opened; a new rice check was created offline with sharing on and showed "Waiting to send" |
| Server restarted | the offline check was sent by itself: receipt `TRG-2026-000003`; the database holds exactly 3 reports, one per check |
| Layout audit at 375 px and 320 px (crop, case, questions, extras, result, saved, advice list, card) | no horizontal overflow, no touch target under 44 px, no text under 12 px, every input labelled, no contrast failures; no console errors |
Screenshots are not committed; one result screenshot was captured in the session.

## 9. Known limitations
1. **Simulated, symptom-guided only.** No image analysis exists. A photo adds nothing to the result.
2. The six cases and all card text are team demonstration content; no agronomist or veterinary officer has reviewed them. English only; Listen uses the phone's own voice.
3. No administrator screen for versions and review (API only); nothing is verified.
4. Reports are anonymous counts only. There is no aggregation view yet (Phase 1B), and the escalation flag is read when the report is sent (a question asked after it was sent does not update the server's flag).
5. The report is sent only if the farmer ticks the sharing box; a venue that wants judges' checks counted must tick it.
6. Anonymous reports are limited to 20 per hour per address (60 per account); a shared venue network may need the limits raised.
7. A card cached on a phone is a snapshot: "Saved copy" is shown when the server cannot be reached, and a new online visit replaces it.
8. Free text is still not policed in the expert question created from a check (it contains only app-generated text plus an optional name).
9. Not verified: real devices, screen readers (TalkBack, VoiceOver), slow networks, the Hostinger runtime; the PHP `test:m3`.
