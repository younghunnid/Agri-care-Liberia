# H1 / H1.1 progress report — Agricare Liberia (Team 8 hackathon prototype)

Sections 1–5 are the original H1 report (commit `82bf584`). **Section 6 is the H1.1 stabilization (this commit) and supersedes the H1 limitations 1–3 and 6.**

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

## 6. H1.1 stabilization (focused fixes and verification)

Scope kept to the five approved tasks. No change to `server/`, `backend-php/`, the schema, API contracts, golden snapshots or any existing database. H2, H3, H4 and M4 not started.

### 6.1 Task 1: `/experts` blank page: root cause and fix
* **Root cause (confirmed in a browser):** `apiFetch` turns any 2xx answer that is not valid JSON into `{}`. `ExpertSupportPage.loadRequests` then ran `setRequests(res.requests)`, i.e. `undefined`, and the next render threw `Cannot read properties of undefined (reading 'length')` at `requests.length`. There is no React error boundary, so the **whole app went blank**. A failing request (5xx, dropped connection) was swallowed silently and showed an empty dashboard with no explanation.
* **Fix (page-local, no API change):** the answer is validated (`Array.isArray(res.requests)`) before use; on any failure a banner (`role="alert"`) explains the problem in plain words, says the farmer can still write a request (it is saved on the phone), and offers a **Try again** button (48 px high). The banner disappears when a retry succeeds or the phone goes offline. `apiFetch` itself is unchanged.
* **Verified in a real browser** against four simulated server faults: HTML 200, empty 200, HTTP 500, dropped connection. In every case the banner showed, the form stayed usable, Retry kept the page alive, and Retry succeeded as soon as the server answered. `/experts` also renders when the phone is offline.

### 6.2 Task 2: complete farmer-to-expert scenario (isolated environment)
* **Environment:** the Node reference booted in-process on a **disposable temp SQLite file** (the existing test harness, `APP_ENV=test`), fronted by a small scratch server that serves the production build and proxies `/api`. One synthetic expert account created through the harness fixtures. `data/agri_advisory.db` was never opened. Headless Chrome (mobile viewport) driven over the DevTools protocol; real offline mode via network emulation plus the service worker.
* **Result: 31 of 31 checks passed, run three times (the final two after the last build); each run sent the question exactly once.**
  1. Select cassava (Bong) and the yellowing sign, read draft guidance (notice and "Team 8 draft" label present, no review claim).
  2. Save; listed again after reload.
  3. **Go offline**: indicator reads "Offline: this page still works"; saved advice opens offline; the "Ask an agricultural expert" button pre-fills title, county Bong, category and description ("POSSIBLE causes (not confirmed)").
  4. **Submit while offline**: "Saved on this phone", the server received nothing, the draft is listed in the local queue panel.
  5. **Reconnect**: the queued question reached the server exactly once (server count +1, still +1 after waiting; no duplicate).
  6. The farmer sees the request in the Simulated Expert Dashboard (status Submitted).
  7. The synthetic expert signs in, types a reply in the dashboard, sends it; the request shows "Current Reply (Test Expert (synthetic))" and status Answered.
  8. Signed out again, the same phone (requester key) still sees the reply on its own request.
* The expert reply is **simulated**: a person types it in the demo dashboard using an account that is approved in the test data. Nothing is automated and no real agronomist is involved.

### 6.3 Task 3: contract test intermittent mismatch: reproduced, root cause found, NOT changed
* **Captured under parallel load (4 workers) on run `w1_7`:**
  * Request: `[1] health  GET /api/v1/health`
  * Field: `$.body.latestMigration`
  * Expected (golden): `"001_initial_schema.sql"`
  * Actual: `"004_sync_operations.sql"`
  * Everything else in the other 62 requests matched. Total: about 47 harness runs under load plus about 70 earlier sequential runs; failures: 1 captured (plus the 1 seen before H1.1 and 1 more in an earlier 6-run loop, i.e. 3 failures in roughly 120 runs; only the captured one has its full output, which is saved in the working notes, not in the repo).
* **Root cause (mechanism reproduced deterministically with an in-memory SQLite):** `server/routes/v1.ts:43` runs `SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`, but `applied_at` has **one-second resolution** (`datetime('now')`) and there is **no tie-breaker**. When all migrations are applied within the same second (the normal case) every row ties and SQLite returns the first one (`001…`), which is what the golden snapshot recorded. When the clock crosses a second boundary while the migrations run, a later migration wins and `latestMigration` differs. Reproduction: all four in one second returns `001_initial_schema.sql`; the last one a second later returns `004_sync_operations.sql`; the last two a second later returns `003_…`.
* **Meaning:** this is **not an H1 regression and not a test-infrastructure error**. It is a genuine nondeterminism in the Node reference's health response (`latestMigration` is not reliably "latest"), and the golden value `001_initial_schema.sql` itself encodes the tie outcome. The PHP backend avoids it (`ORDER BY applied_at DESC, version DESC`), so PHP returns its newest migration deterministically.
* **Not fixed, by instruction** (no Node reference change; no golden edit just to pass). Options that need your decision: **(a)** fix the Node query with `ORDER BY version DESC` and regenerate the golden (value becomes the newest migration, `006_…`), **(b)** make the contract normalizer treat `latestMigration` as an opaque non-empty string (the PHP comparison already does), **(c)** leave it and accept roughly a 1 in 40 chance of one spurious failure per run. My recommendation is (b) now, (a) later together with the PHP parity work.

### 6.4 Task 4: mobile and accessibility (320, 375, 768 px)
Automated audit in headless Chrome (mobile emulation) on `/`, `/advice/crop-problems` (form and result), `/tools/calculator`, `/demo/cassava`, `/experts`, `/downloads`:
* **No horizontal overflow** on any of the 21 page/width combinations.
* **H1 pages** (crop problems, calculator, demo walkthrough): 0 touch targets under 44 px, 0 unlabelled form controls, 0 text under 12 px, **0 text-contrast failures** (WCAG 4.5:1 normal / 3:1 large) at all three widths.
* **Keyboard:** cassava and symptom controls show a visible focus indicator; Enter selects, Space ticks; Tab moves through the checkboxes in reading order to "See possible causes"; Enter shows the result; the calculator accepts typed digits, has the phone decimal keypad (`inputmode=decimal`) and its error text is linked with `aria-invalid`/`aria-describedby`.
* **Offline indicators:** crop problems and calculator show an Online/Offline pill (verified offline); the app header shows "Offline" too.
* **Found and fixed (small):** the Home category links were 40 px high (8 links); raised to 44 px. The Listen button label on guidance read "Listen to Listen to this advice" to screen readers; corrected.
* **Found, not fixed (existing pages, outside H1.1 scope):** the existing "Your own data (private)" badge and two small Home pills have 4.18:1 contrast (needs 4.5:1); one input on `/experts` was flagged as unlabelled by the automated check (**correction made in H2: it was the visible voice-note summary text field, not a hidden input; fixed in H2**); on Home at 768 px there is text under 12 px (8 items), on `/downloads` 16 items.
* **Camera:** the photo control is a standard `<input type=file accept=image/*>` (no `capture` attribute, so a phone offers camera or gallery). **A synthetic image injected into it was accepted, compressed and previewed.** The real camera was **not** opened: headless Chrome reports one video input but opening it needs a permission grant, and I did not use fake-device or auto-accept flags. Mobile camera capture is therefore **not tested**.
* **Text to speech:** `speechSynthesis` exists with 67 voices; pressing Listen called `speak()` once with the full advice text (1,275 characters, `en-US`, starting with the "NOT a confirmed diagnosis" notice). `speechSynthesis.speaking` was false 1.2 s later, so **audible playback was not confirmed**; testing sound needs a real device.
* Not tested: physical phones (Android, iOS), screen readers (TalkBack, VoiceOver), voice-note recording (microphone), zoom/large-text settings, real slow networks.

### 6.5 Task 5: offline inventory
* **Decision:** yes, saved crop advice (and saved calculations) belong in the inventory: the page promises to show "everything this phone keeps", and these items are the farmer's own saved work.
* **Change (no database, API or schema change):** `takeInventory()` now also reads the two IndexedDB `kv` lists. The Offline Downloads page has a new section "Saved crop advice and calculations" (counts, size, last saved, a Remove button per advice, a "Remove saved calculations" button, a "Team 8 draft advice, stays on this phone" note and a link to crop problems) and two new rows in the size table that feed the measured total. Unit test added for the summary.

### 6.6 Final verification (run after the last code change)
| Check | Result |
|---|---|
| `npm run test:h1` | **18 / 18** (17 + inventory summary) |
| `tsc --noEmit` | pass |
| `npm run build` | pass |
| `test:api` / `test:harness` / `test:offline` | 31 / 4 / 22+6+3 pass |
| `test:contract` | 3 / 3 consecutive passes at the end; intermittent failure explained in 6.3, **not fixed** |
| Real-browser scenario (6.2), three runs | 31 / 31 each |
| Mobile and accessibility audit (6.4) | all automated checks pass except the items listed as found-not-fixed |

### 6.7 Remaining issues and risks
1. Contract flake (6.3) is understood but still present until a decision is made.
2. Camera capture, audible TTS, microphone, physical phones and screen readers are untested.
3. Existing pages still have the minor contrast and tiny-text findings listed in 6.4.
4. The browser scripts and scratch server that drive 6.2 and 6.4 live outside the repository (in the session scratch folder) and are not committed; the manual steps in `/demo/cassava` reproduce the same scenario by hand.
5. Saved advice is draft until an agronomist reviews it; the simulated expert reply is not a real expert.
