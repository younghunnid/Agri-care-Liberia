# Agricare Liberia (Team 8) — 11-feature hackathon MVP plan

Status: **assessment and plan for approval. Nothing implemented.** Branch `feature/offline-first`, base commit `612cb17`.
Scope: hackathon prototype, not a commercial platform. Separate from AgriConnect Liberia. The PHP/MySQL migration roadmap (M4 not started, M11 not started) is **unchanged** by this plan.

## 0. Method and limits
* Evidence comes from reading the code in this branch: `src/` (React), `server/` (Node reference), `backend-php/migrations/001_schema.sql`, route manifest (61 endpoints), `docs/TEAM8_*` audit files and `docs/KPAA_FEATURE_GAP_ANALYSIS.md`.
* **Not run:** no browser/device test was done for this assessment; statements about UI describe what the code contains, not what was observed on screen. Existing docs (`TEAM8_HACKATHON_READINESS.md`) say Chromium/offline-reload checks were never performed on a physical phone — that remains a risk.
* The live prototype runs on **Node/SQLite**; PHP is at M3 (health + CSRF only). Therefore this plan is written to need **no backend or schema change** in the first milestones (see §8).

## 1. What already exists (inventory)
| Area | Evidence | Notes |
|---|---|---|
| Frontend shell | `Layout.tsx` (top links Home/Advisor/Guides/Marketplace/Demo + mega-menu), mobile bottom tabs, `WorkspaceShell` | Navigation is feature-numbered ("7. Crops Library"), not task-grouped |
| Crop content | `cropsLibrary.ts` (9 crops: rice, cassava, maize, pepper, okra, tomatoes, plantain, sweet potatoes, groundnuts), `livestockLibrary.ts` | Includes planting, pests, harvest, flood/drought notes, "extension" referral wording |
| Pests/diseases | `PestsDiseasesPage.tsx` (static symptom cards: rice, cassava mosaic, vegetable blight, livestock), strong "not a diagnosis, no dosages" notice | No guided question flow |
| Advisor | `AdvisorPage.tsx` (voice, optional photo → AI "visual discussion, never a diagnosis", multi-turn, save advice), `offlineAdvisor.ts` (rule-based on-device search over bundled corpus), `/advisor/*` API | **Gemini model ID in `server/ai.ts:379` is still `gemini-4-hydrogen` (invalid)** → live AI falls back; on-device advisor works regardless |
| Offline | IndexedDB `agri-advisory-offline` v3 stores: guides, library, images, kv, syncQueue, drafts, questions, audio, apiCache; `offlinePacks`, `OfflineLibraryPage`, `OfflineDownloadsPage`, `OfflineReaderPage`, `syncEngine` (Idempotency-Key, conflict check, retries), `SyncStatus`, `usePWA` (online/offline, 30 s health poll), PWA update prompt | Tests: `offlineAdvisor`, `dataCache`, `offlineInventory` |
| Accessibility | `SpeakButton`/`voice.ts` (TTS/STT), `ListenModeBar`, `AudioLessonCard`, `audioLessons.ts` (**1** synthetic English demo clip), `i18n.ts` (en, bas, man, lre, kpe — ~9 UI keys; 1 reviewed LRE guide), `LanguageLabPage` (recordings + review) | No language is "fully supported"; labelling must stay honest |
| Ask an expert | `ExpertSupportPage` (guest/demo request: crop, county, **photo + voice note**, status tracking, **simulated expert dashboard reply**), offline draft + `question.create` sync op, authenticated flow `/farmer/questions` + `/expert/*` + `/admin/questions` (assignment, messages, `is_official_expert_advice`) | Authenticated `advisory_questions` has **no photo/attachment column**. Statuses are `Submitted/Assigned/Awaiting Clarification/Answered/Closed` (map to pending/answered/resolved in the UI; no schema change) |
| Weather | `WeatherPage` + `weatherSoilMinistry.ts` (`SAMPLE_COUNTY_WEATHER`, "Sample/Demonstration/Not Live" labels, saved-outlook) | No planting calendar or checklists |
| Soil/seed | `SoilAdvisoryPage`, knowledge-center articles (compost, 10-seed germination test, rotation, seedlings) | No seed-selection checklist or fertilizer-safety card set |
| Harvest/market | Knowledge articles (post-harvest spoilage, market prep, transport on feeder roads); `MarketplacePage` (1,742 lines: listings, filters, inquiries, offline listing drafts, moderation) | A full marketplace **already exists** — keep, do not extend; no sample *price board* |
| Learning | `knowledgeCenter.ts` (16 topics, ~30 articles), `GuidesLibraryPage`, `AudioLessonCard` | **No quizzes, no completion tracking**; "agricultural training academy" is listed under *Coming Soon* |
| Emergency, calculator, community, support directory | none (only roadmap entries in `comingSoonFeatures.ts`; flood/drought sentences inside crop data) | New |
| Demo | `DemoModePage` (4 journeys), `PhoneSimulatorPage`, synthetic `MinistryDashboardPage`, demo accounts in seed (farmer +231770000101, expert +231770000201) | Existing 14-step flow in `TEAM8_HACKATHON_READINESS.md`; admin account must be bootstrapped (`db:bootstrap-admin`) |

Known open issues relevant here (from `TEAM8_*` docs and code): invalid Gemini model ID (P0); admin bootstrap needed for admin demo steps; offline reload and TTS never verified on a physical phone; live AI is optional — the demo must not depend on it.

## 2. Eleven-feature implementation matrix
Class: **A** core working demo · **B** lightweight working prototype · **C** educational content or clearly labelled simulation · **D** future.

| # | Feature | Exists today | Gap | Class | Work type | Effort* |
|---|---|---|---|---|---|---|
| 1 | Crop disease & pest assistance | Symptom cards, advisor with photo caution, offline advisor, save advice, expert escalation | **Guided symptom flow** (crop → symptom → possible causes → first-response advice → escalate), cassava/rice/pepper/plantain/vegetable content set, "possible causes, not a diagnosis" wording, prefill expert question | **A** | Modify + new page/data | M |
| 2 | Offline advice & accessibility | Most of it (IndexedDB, packs, search, TTS, indicators, sync) | Polish: consistent online/offline badge on new pages, new content added to offline packs, large-button audit on new pages, honest language labels | **A** | Modify (small) | S |
| 3 | Weather & planting guidance | Simulated county outlook | County × crop planting-season table, rainfall checklists, flood/dry-spell example warnings (labelled simulated), crop calendar | **B** (data **C**) | New page/data | M |
| 4 | Ask an agricultural expert | Request form w/ photo, offline draft + sync, history, simulated expert reply; authenticated expert flow | Present pending/answered/resolved wording, "verified expert" badge from `expert_profiles.approval_status`, make the demo path obvious; photo on *authenticated* questions = **needs API/schema change → D** | **A** | Modify | S–M |
| 5 | Soil, seeds, fertilizer | Soil page, compost/germination/rotation articles | Seed checklist, fertilizer-safety card, "general education vs site-specific" banner, soil-test referral | **B** | New cards/data | S |
| 6 | Harvest, storage, market info | Articles; marketplace exists | Harvest-readiness + storage + transport checklists; **sample market board** labelled "demonstration prices"; link to existing marketplace as the buyer-contact concept | **B/C** | New page/data | S–M |
| 7 | Farm emergency guidance | Only sentences in crop data | Flood/dry-spell/storm checklists, post-disaster recovery, county picker, simulated alert banner ("DEMONSTRATION — not an official alert") | **C** | New page/data | S–M |
| 8 | Expense & profit calculator | Nothing | Client-only calculator: seed, fertilizer, labour, transport, other; yield × price; LRD/USD kept separate (no conversion); local save in IndexedDB `kv` | **A** | New | S–M |
| 9 | Farmer community | Nothing reusable on the server (feedback + marketplace inquiries are not discussions) | Moderated *demonstration*: seeded sample threads, add a question/reply stored locally, "report" button, "community opinion" vs "verified expert guidance" badges. **Shared multi-user community needs new tables + Node routes → D** | **C** | New (client-only) | M |
| 10 | Learning center | Articles, audio card | Lesson cards (illustrated), 3–4 quizzes, completion indicators in `kv`, offline lessons; reuse knowledge-center articles as lesson text | **A/B** | New + reuse | M |
| 11 | Support directory | Nothing | County × category directory of **categories** (extension office, Ministry of Agriculture support, cooperatives, seed/input suppliers); entries marked "demonstration"; contact fields empty unless you supply independently verified details | **C** | New | S |

\*S ≤ 1 day, M 2–3 days, one developer, including tests/docs; estimates are mine, not measured.

## 3. Recommended MVP scope
* **Must (A):** #1 guided crop problems, #2 offline polish, #4 expert flow polish, #8 calculator, #10 learning (lessons + 1–3 quizzes).
* **Should (B/C, content-led, low risk):** #3, #5, #6, #7, #11 as static, reviewed-style content with labels.
* **Defer (D):** shared server-side community (#9 real), photo attachments on authenticated questions, live weather, real prices, real directory entries, local-language audio beyond the existing demo, any SMS/USSD/payment/SMTP.
* Cuts if time is short (in order): #11, #9, #6 board, #7, #3 calendar.

## 4. Proposed navigation (four groups, mobile first)
Bottom tabs (replace the current Home/Advisor/Guides/Marketplace tabs; Home stays reachable by the logo; existing routes remain valid so no link breaks):

1. **Get Advice** `/advice` — Crop problems `/advice/crop-problems` (new) · Offline advice `/offline` (existing) · Weather & planting `/advice/planting` (extends `/weather`) · Soil & seeds `/soil` (existing + cards) · Harvest & storage `/advice/harvest` (new) · Farm emergencies `/advice/emergency` (new)
2. **Ask an Expert** `/ask` — Ask a question `/experts` (existing) · My questions `/farmer/questions` (existing) · Farmer community `/community` (new, demo)
3. **Learn Farming** `/learn` — Lessons `/learn/lessons` · Quizzes `/learn/quiz/:id` · Listen / accessible guidance (existing `ListenModeBar`, `AudioLessonCard`)
4. **Farm Tools** `/tools` — Calculator `/tools/calculator` · Support directory `/tools/directory` · Sample market information `/tools/market` (+ link to existing `/marketplace`)

The four hubs are thin pages listing cards with large buttons (min 48 px touch targets, simple English, icons). Existing mega-menu items are regrouped under the same four headings. Unrelated prototype pages (Ministry dashboard, Language Lab, Phone simulator, Prototype admin) move under a single "More / Demo tools" entry so farmers see four choices.

## 5. Safety and honesty rules (apply to all new content)
* Every content item carries `reviewStatus`: `team_draft` (default; shown as "Team 8 draft — pending agricultural review") or `reviewed` (only when a named reviewer and date exist). Nothing is called "reviewed" without that data.
* Disease guidance says "possible causes", lists what to check, and never states a confirmed diagnosis; photos only support the *expert escalation*, never produce a result.
* No pesticide names, mixes or dosages. Cultural/mechanical controls and "ask an extension officer" only. Fertilizer content is limited to safety and "get a soil test"; no rates.
* Simulated data is wrapped in one shared `<DemoLabel>` component ("Demonstration data — not live") so labels are consistent and testable. Simulated alerts say "Not an official alert".
* No invented organisations, phone numbers or addresses. Directory entries are generic categories until you provide verified details.
* Currency: LRD and USD are separate inputs/outputs; no exchange-rate conversion and no mixing.
* Synthetic demo accounts only; no real farmer data; SMTP, SMS, USSD, payments stay disabled.

## 6. Database / API impact
* **First milestones: none.** All new content is bundled TypeScript data (like `knowledgeCenter.ts`); user data (calculator entries, quiz completion, community drafts, saved checklists) is stored in IndexedDB `kv` (already exists; `DB_VERSION` stays 3). Existing endpoints, contracts (63 golden requests), the Node reference and `001_schema.sql` stay untouched; the PHP milestones are unaffected.
* Existing entities reused: crops, guides, advisor/save, farmer questions + messages, demo expert requests (photo, voice, status), `expert_profiles` (verified badge).
* **Deferred changes that would need separate approval** (Node reference + PHP schema together): shared community tables (`community_posts`, `community_reports`), attachment storage for authenticated questions, server-side lesson progress, server-managed directory entries, any price/weather feed. Each is a candidate for the PHP-only allow-list mechanism added in M3.1, not for edits to `001_schema.sql`.
* Frontend dependency additions: none planned (no charts library needed, no paid services).

## 7. Offline compatibility
| Feature | Offline behaviour |
|---|---|
| 1 | Flow and advice are bundled and precached → work offline; "Save for offline" writes to existing library/guides stores; escalation creates the existing offline question draft |
| 3,5,6,7,10,11 | Bundled static data → work offline from first load after install; the offline-pack manifest lists the new content so `OfflineDownloadsPage` counts it |
| 8 | Pure client calculation; saved in `kv` |
| 9 | Seeded threads bundled; new posts/replies stored locally and marked "saved on this device only" |
| 4 | Existing draft → queue → Idempotency-Key sync |
| Risk | Bundle/precache size grows (text only; no new images beyond reuse of existing assets); must keep within the existing cache version/`contentVersion.ts` bump so old caches refresh |

## 8. Implementation phases (each ends with tests, build, a short report, and a stop for your review)
| Phase | Content | Gate / tests |
|---|---|---|
| **H0 prep (½ day)** | Fix invalid Gemini model ID (needs your authorisation: touches `server/ai.ts`); `db:bootstrap-admin` and demo seed on a **disposable** DB; phone offline smoke test checklist | `npm run test:api`, `lint`, `build` |
| **H1 (recommended first milestone, ~4–5 days)** | Four-group navigation shell + hubs; **#1 crop-problems guided flow** (cassava yellowing end to end, plus rice/pepper/plantain/vegetable content); save-offline; prefill expert question; **#8 calculator**; `DemoLabel`; demo script step 1–11 running on synthetic data | New unit tests (calculator math incl. currency separation, flow rules incl. "no diagnosis wording"/no-dosage lint over content); `tsc --noEmit`; `vite build`; existing offline/contract/api suites unchanged; manual mobile + airplane-mode run documented |
| H2 (~3 days) | #4 polish (status wording, verified badge), #10 lessons + quizzes + completion, audio link | Quiz scoring tests; offline lesson test |
| H3 (~3 days) | #3, #5, #6, #7 content pages and checklists | Content lint (labels present, no dosages), offline-pack inventory test |
| H4 (~2 days) | #11 directory, #9 local community demo, demo-mode update, README/demo guide, final regression | Full suite + physical-device checklist |

## 9. Demo walkthrough (Bong County cassava farmer) — status of each step
| Step | What happens | Component | Status shown to judges |
|---|---|---|---|
| 1 | Open app | Home + 4-group tabs | Working |
| 2 | Select cassava (and county Bong) | Crop-problems flow | Working (new, H1) |
| 3 | Pick "yellowing leaves" | Symptom step | Working (new) |
| 4 | Possible causes + first-response advice | Static content, labelled "Team 8 draft — not a diagnosis" (or "reviewed" only if a reviewer is named) | Working content; **review status labelled** |
| 5 | Save advice for offline | Existing saved-advice / library | Working |
| 6 | Go offline, open saved advice | `/offline` reader + indicator | Working (needs physical-device verification) |
| 7 | Draft question to an expert (offline) | Existing question draft | Working |
| 8 | Reconnect; draft syncs and submits | `syncEngine` | Working |
| 9 | Expert replies | Existing simulated expert dashboard / expert account | **Simulated expert (labelled)** |
| 10 | Related lesson | Learning center (H2; link to an existing article in H1) | Working (content = sample) |
| 11 | Open expense calculator | `/tools/calculator` (example L$5,000 → L$8,000 = L$3,000) | Working |
A closing slide lists: Working (1, 2, 4, 8, 10), Simulated (weather, alerts, prices, expert reply, community seed threads, directory entries), Future (live weather, real prices, real directory, shared community, local-language audio, SMS/USSD).

## 10. Risks, dependencies and decisions needing approval
**Risks:** (1) agricultural correctness — content is Team 8 draft until a qualified reviewer signs off; (2) offline behaviour unverified on a real phone; (3) scope creep from 11 features — mitigated by classes A–D and cut order; (4) existing pages are large (Marketplace 1.7k lines) — avoid touching; (5) live AI broken until the model ID is fixed, so the demo must use the on-device advisor path; (6) bundled content grows the precache; (7) mixed Node-reference/PHP future — new data is client-side to avoid divergence.

**Decisions requested:**
1. **Scope:** approve the A/B/C/D classification and MVP cut list (§3).
2. **First milestone:** approve H1 (nav shell + crop problems + calculator + DemoLabel) as the first build; H0 items separately.
3. **H0 authorisation:** may I fix the Gemini model ID in `server/ai.ts` (one-line change to the Node reference, and the PHP stub if present)? Otherwise live AI stays labelled unavailable.
4. **Navigation:** replace the four bottom tabs with the four groups (existing routes stay)? Or keep current tabs and add the groups only on Home?
5. **Content review:** will a named agronomist/extension officer review the cassava/rice/pepper/plantain/vegetable content before the demo? If not, everything stays "Team 8 draft".
6. **Directory:** will you supply independently verified organisations/contacts? Default: categories only, no names/numbers.
7. **Community:** accept local-only demo threads (no server) for the hackathon, with shared community deferred?
8. **Photos on authenticated questions:** accept deferral (demo uses the existing photo-capable request path)?
9. **Currency:** LRD primary, USD optional and never converted — confirm.
10. **Language claims:** keep English as the only fully supported language; local languages stay "demonstration/pending human review".

Nothing will be implemented, committed beyond this document, deployed, pushed or merged until you answer.
