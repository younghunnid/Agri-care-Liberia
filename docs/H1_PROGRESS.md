# H1 progress report — Agri-Advisory Liberia (Team 8 hackathon prototype)

Branch `feature/offline-first`, based on `612cb17` (M3.1). Scope: **H1 only** as authorised. No backend, schema, API contract, Node reference (`server/`), PHP or database change. H2, H3, H4 not started.

## 1. What was built

| # | Approved item | Result | Where |
|---|---|---|---|
| 1 | Four navigation groups on Home | Done. **Get Advice / Ask an Expert / Learn Farming / Farm Tools**, large buttons (all ≥ 44 px, checked in a browser at 375 px). Future items are shown but are not links. Bottom navigation and all existing routes are unchanged. | `src/components/HomeGroups.tsx`, `src/data/navGroups.ts`, one line in `HomePage.tsx` |
| 3 | Guided cassava crop-problem demo | Done. Select cassava → county → tick signs (7 signs + "none of these") → possible causes (6) with "check to tell", safe first steps, "ask an expert when" → **not-a-confirmed-diagnosis** notice at the top of every result → **save for offline** → **Ask an Expert** button that pre-fills the existing form (title, description, county, category). Read-aloud uses the existing `SpeakButton`. Other crops are shown as *Future*. | `src/pages/public/CropProblemsPage.tsx`, `src/components/GuidanceView.tsx`, `src/data/cassavaProblems.ts`, `src/lib/cropProblem.ts`; small change in `ExpertSupportPage.tsx` to read `county` and `category` query parameters (validated against the form's own lists) |
| 4 | Offline farm calculator | Done. LRD primary; optional USD block that is calculated **separately** (never converted, never added). Expenses: seed, fertilizer, labour, transport, other; harvest quantity × price. Exact arithmetic (BigInt cents), input validation with messages, loss/break-even/profit wording, named saves in IndexedDB (`kv`), load/delete. Worked example L$5,000 → L$8,000 → profit L$3,000 is a test. | `src/pages/public/FarmCalculatorPage.tsx`, `src/lib/farmCalculator.ts` |
| 5 | Consistent labels | Done. One component and vocabulary: **Working**, **Simulated demo data**, **Team 8 draft advice**, **Future feature**. Used on Home groups, crop problems, calculator and the demo page. | `src/components/StatusLabel.tsx`, `src/lib/statusLabels.ts` |
| 6 | Bong County cassava demonstration | Done. 11-step presenter page at `/demo/cassava` (linked from Demo Mode) with a status label and a note for each step, and a closing "say this" box listing working / simulated / draft / future. `?demo=1` pre-selects cassava, Bong and the yellowing sign. | `src/pages/public/CassavaDemoPage.tsx`, link in `DemoModePage.tsx` |

New routes: `/advice/crop-problems`, `/tools/calculator`, `/demo/cassava`. Storage: IndexedDB `kv` keys `h1.cropProblem.saved` (max 20) and `h1.calculator.saved` (max 30). `DB_VERSION` unchanged (3). No new dependencies.

## 2. Honesty and safety decisions
* **All crop-problem advice is "Team 8 draft".** `CASSAVA_REVIEW.status` is `team_draft` with no reviewer; nothing says "reviewed" or "verified". The UI says "No agricultural expert has reviewed this yet." The data model only allows `reviewed` together with a reviewer name and date (shown if ever set).
* Possible causes only; never a diagnosis. No pesticide names, mixtures or doses: a unit test scans all content for dose/quantity patterns, named chemicals, mixing words and definitive claims.
* Cassava wording from the existing Crops Library is reused where available (mosaic, drainage, clean cuttings).
* Simulated items are labelled: expert replies (existing simulated dashboard), weather, sample market listings. Nothing fake is shown as live. No directory contacts and no live weather were added.
* English only. Live AI, `server/ai.ts` and the Node reference were not touched; the demo uses the bundled/on-device content.

## 3. Test results (this session)
| Check | Result |
|---|---|
| `npm run test:h1` (new) | **17 / 17**: calculator math, currency separation, validation, saving; cause matching and ranking, draft status, safety lint, offline save/retrieve/cap/dedupe/delete/corrupt rows, expert prefill validity, navigation routes exist, labels, demo steps |
| `tsc --noEmit` (`npm run lint`) | pass |
| `npm run build` | pass (PWA precache 16 entries) |
| `test:api` / `test:harness` / `test:offline` | 31 / 4 / 22+6+3 pass |
| `test:contract` | passes (63 / 63) on most runs; **one run in about 8 reported 1 of 63 differing and a repeat of the same code passed.** I changed nothing under `server/` or `tests/contract/`; see §5 |
| Real-browser run (headless Chrome driven over the DevTools protocol, 375 × 812 mobile viewport, production build served by `vite preview`) | all steps below passed |

Browser run details (script kept outside the repo, results listed here):
* No horizontal overflow at 375 px on `/`, `/advice/crop-problems`, `/tools/calculator`, `/demo/cassava`, `/demo`. Four groups on Home; every group button ≥ 44 px tall.
* Full flow: cassava → sign → causes → notice and draft label shown → **save for offline** → record present in IndexedDB → listed again after reload; the flow made no API call.
* **True offline test:** after the service worker was active, the preview server was **stopped** (fetch to the server failed). With the server down the saved page still loaded from the service-worker cache, the saved advice opened with causes, notice and first steps, the calculator worked (L$5,000 / L$8,000 / L$3,000), USD stayed separate, invalid input showed an error, a calculation was saved, survived a reload and could be reloaded, Home rendered four groups and the demo page rendered 11 steps.
* Ask an Expert form pre-filled (title, county Bong, category "Pest and crop disease management", description with "POSSIBLE causes (not confirmed)"); an unknown `county` is ignored.

## 4. Demonstration walkthrough
Open `/demo/cassava` (or Demo Mode → "Open the cassava demo"). Steps: 1 open the app; 2 select cassava (Bong); 3 report yellowing leaves; 4 read possible causes and first steps (*draft, not a diagnosis*); 5 save offline; 6 go offline and open the saved advice; 7 draft the expert question (form is pre-filled); 8 reconnect and send; 9 expert replies in the simulated dashboard (*simulated*); 10 read a related guide; 11 open the calculator (L$5,000 costs, L$8,000 sales → L$3,000 profit). Closing statement: Working / Simulated / Draft / Future as listed on the page.

## 5. Limitations and risks (not hidden)
1. **Backend was not available in the browser run.** The Node server opens `data/agri_advisory.db`, which must not be touched, so the preview had no API. Steps 7–9 (sending the question and the simulated expert reply) were **not re-run end to end in this session**; only the pre-fill was verified (with the API requests stubbed). Those steps use existing code unchanged and were previously covered by `test:api`, but run them once on the real demo setup before presenting.
2. **`/experts` shows a blank page when the API returns a non-JSON answer** (seen in the no-backend preview; the page crashed reading `.length` of an undefined list). This is existing behaviour I did not change and did not compare against the previous commit; it only matters if the demo server is down.
3. **Flaky contract test:** one intermittent failure of `test:contract` was observed before any investigation; repeated runs pass. H1 touches neither `server/` nor `tests/contract/`, so it is unlikely to be caused by H1, but the cause was not identified. Afterwards 60+ further consecutive runs (6 + 20 + about 40) all passed, so it failed once in roughly 70 runs. I did not capture the failing output.
4. Real-phone checks are still outstanding (Chrome Android / Safari iOS, TTS, camera). The browser used was desktop Chrome in mobile emulation.
5. The advice is draft until an agronomist reviews it. The "reviewed" path exists in the data model but is unused.
6. Saved advice is **not** counted by the existing offline-downloads inventory page and does not bump `contentVersion`; it lives in its own `kv` keys.
7. On Home the four groups sit below the hero section, so on a phone the farmer scrolls once to reach them.
8. Not in H1 (deferred as approved): quizzes and lessons, planting calendar, soil/seed cards, harvest/market content, emergency guidance, directory, community, photos on logged-in questions, other crops.
