# Teammate dashboard integration: Ministry & Extension View (Demo)

Base: branch `feature/offline-first`, after commit `7da6edc` (in-website Demo SMS Inbox). Frontend-only, synthetic data. **No backend, database, API, Node, PHP or authentication change.** Nothing deployed, pushed or merged. No real SMS, no real USSD, no short code. The simulated SMS login work (commits `2f9372e`, `7da6edc`) was **not touched**; it was re-tested afterwards.

## 1. Integration assessment (before coding)
**Source reviewed:** `KPAA_Ministry_Analytics___Food_Security_Dashboard(1).html` (untracked, project root, 2,754 lines, left in place and not committed). A single-page prototype loading Chart.js, D3, TopoJSON, Lucide and Google Fonts from CDNs, with hard-coded demo data and six sections (KPIs, production table, weather, disease surveillance, campaigns with an SMS/USSD phone simulator, privacy).

**What it contains (functional reference):** 12 county × crop production rows with expected/actual tonnage and three index inputs; a Food Security Index (40% availability, 30% weather, 30% crop health, bands 70/60); 5 county weather cards (3-day and 7-day, soil moisture, planting window); disease cases with severity and an escalation queue; a campaign composer (county, crop, template, character counter, SMS and USSD previews, simulated dispatch log); a privacy panel; a CSV export; a D3 world-atlas map.

**Problems found in the source (and why they were not copied):**
| Finding | Handling |
|---|---|
| Branded as "KPAA" / "MoA-KPAA", messages signed "MoA-KPAA", footer says "Grounded in KPAA System Design" | Not adopted. Our name is Agricare Liberia; no Ministry attribution anywhere; the page states it is **not endorsed**. |
| USSD code `*384#` presented as the service's short code, used in templates | Not adopted. No short code exists; messages containing any `*…#` code are **refused** by the validator; the preview says none is assigned. A test fails if the string appears in `src/`. |
| AI "confidence" percentages (74 to 88%), "<60% escalated", named confirmed diseases (e.g. "Rice Blast", "Newcastle Disease") and treatment text ("apply recommended fungicide", "vaccinate") | Not adopted. We show **counts of farmer reports** only, a plain description of what was reported, a rule-based severity indicator and "ask an officer". No named disease, no confidence, no treatment. |
| Privacy panel claims (.NET `[Authorize]`, Argon2id, JWT, Supabase, audit logs) that describe a different system | Replaced by statements that are true for **our** prototype (no Ministry role exists yet; synthetic and isolated). |
| KPIs hard-coded as if real (12,480 farmers, 98.4% sync) | Replaced by our own clearly **labelled** synthetic figures; the offline-sync card shows **real** numbers from this device. |
| FSI table inconsistency: Lofa rice stored 75, but 0.4×78 + 0.3×76 + 0.3×72 = 75.6 → 76 | We **calculate** from the inputs, so Lofa rice shows 76. The other 11 rows reproduce the teammate's values exactly (a test checks all 12). |
| Weather thresholds (>40 mm, >32 °C, <10 mm/7 days) used as planting instructions ("Do NOT plant pepper now") | Kept only as demo data with **draft** wording and "not checked by an agronomist"; no hard instructions. |
| CSV export of the table, D3 map from a CDN, Google Fonts | CSV deferred (see below); map replaced by the county filter and tables; fonts/charts need no CDN (works offline). |
| `notebookAppApi` persistence hooks | Not used. State stays in memory. |

**Already in our app (not duplicated):** weather samples (`/weather`), a synthetic Ministry food-security view (`/ministry`), the basic-phone voice simulator (`/phone-simulator`), expert requests and escalation workflow, offline sync engine, disease/pest guidance, the SMS login flows. The new page is separate and links to the existing Ministry view.

## 2. Features adopted
| Section | Adopted from the teammate | Our changes |
|---|---|---|
| A Overview | KPI cards | 6 cards, each labelled **Synthetic demo / Derived / Live: this prototype / Live: this device**. Real: offline queue and last sync from this device; the prototype's simulated expert-request count (public aggregate endpoint, read only, when online). Registered/active farmers, crop reports and expert requests are synthetic **counts only**. |
| B County production | Five counties; county and crop filters; sortable table; expected-vs-actual chart | Accessible HTML table (caption, `scope`, `aria-sort`, scrolling region), and a chart built only from the filtered rows with values as text, dashed-outline vs solid bars, legend, empty state. |
| C Food Security Index | 40/30/30 formula, bands | Calculated from inputs with integer arithmetic; selected-row panel shows every input, weight, points and the substituted formula; label exactly **"Illustrative Team 8 Demo Index — Not an official food-security assessment."** Bands (70+/60–69/<60) labelled demo-only. |
| D Weather and planting | 5 county cards, 3-day/7-day toggle, soil moisture | Moisture bar with number and label (Dry/Adequate/Wet, draft bands), planting window labelled **draft**, banner "Not a live forecast", agronomist caveat. |
| E Disease surveillance | County filter, severity, escalation queue | Aggregated report counts, severity by a documented rule (text + icon + colour), queue of High items with Assign → Reviewed (demo only, nobody notified), explicit "not diagnoses". |
| F SMS and USSD simulator | County, crop, template, counter, SMS preview, USSD-style menu, dispatch log | Approved **Team 8 draft** templates (no chemicals, doses, claims or codes); GSM-7/UCS-2 segment counter; validator refusing OTP/verification codes, USSD codes, links, phone numbers, doses, spray advice, cure claims and Ministry claims; deterministic **simulated** dispatch (no randomness, no network); our own demo USSD menu with keypad and ≤182-character screens; log marked SIMULATED. |
| G Privacy | Privacy panel idea | True statements only: separate page, no personal data, no export, **no Ministry login exists yet**, campaigns are simulated. |

## 3. Features deferred (and why)
* **CSV/bulk export:** the brief forbids bulk personal-data export; an aggregate-only export of synthetic data adds nothing for judges and could be mistaken for official data.
* **World map (D3 + TopoJSON from a CDN):** needs external scripts (not offline-safe) and a licence/privacy review; county filter and tables cover the need.
* **Real campaign sending, consent management, sender approval, delivery receipts:** need a real provider and legal review (see `docs/USSD_PLAN.md`).
* **Server-side Ministry role (RBAC) and audit of dashboard actions:** requires backend authentication changes; the page stays synthetic and isolated until separately approved.
* **Real data feeds** (aggregates of actual reports): would need new server endpoints, a Ministry role and privacy review; not done.
* **Persistence of the dispatch log / escalation state:** intentionally in memory only.
* **Local-language USSD/SMS text:** needs human language review.

## 4. Differences from the teammate's original
Branding and wording; no CDN scripts or Google Fonts; React/TypeScript/Tailwind components in our design system; no Chart.js (accessible HTML/CSS chart, also readable by screen readers through the table); no map; no CSV; no confidence scores or named diseases; no treatment advice; no `*384#`; true privacy statements; real vs synthetic metrics labelled; FSI calculated not stored; FSI Lofa-rice corrected (76); campaigns forbidden from carrying sign-in codes and fully separated from the authentication code (a test proves the dashboard modules import nothing from the auth code and call no auth endpoint).

## 5. Screens and routes added
* `/ministry-analytics`: **Ministry & Extension View (Demo)**, sections Overview, County production, Food security index, Weather and planting, Disease signals, SMS and USSD simulator, Privacy and access (anchor navigation).
* Links: Demo Mode card ("Open the dashboard demo"), the existing Ministry view (`/ministry`), and the "More" menu entry "5b. Ministry & Extension View (Demo)".
* Files: `src/data/ministryDemo.ts`, `src/lib/ministryAnalytics.ts`, `src/components/ministry/ExpectedActualChart.tsx`, `src/pages/public/MinistryAnalyticsPage.tsx`, `tests/ministry.test.ts`, `package.json` (`test:ministry`), small edits to `App.tsx`, `DemoModePage.tsx`, `MinistryDashboardPage.tsx`, `Layout.tsx`.

## 6. Demo-data limitations (read before presenting)
All production, index inputs, weather, report counts, audience sizes and delivery percentages are **invented** for the demonstration and adapted from the teammate's illustrative table. They are not Ministry or any official statistics, not forecasts, not diagnoses. The index weights and bands are the teammate's proposal, unvalidated. Planting windows and soil-moisture bands are draft. The simulated delivery rate is a hash-derived 95.5 to 99.0 percent, not a measurement. Escalation "assignment" changes only the page. The dashboard has no authentication, so it must never be connected to real data without the server-side role and audit work above. The two live numbers (this device's offline queue, the prototype's simulated expert-request count) describe this prototype only.

## 7. Tests performed (this session)
| Check | Result |
|---|---|
| `npm run test:ministry` (new, 15 tests) | **15 / 15**: FSI maths and all 12 rows, invalid inputs, band boundaries; filters, totals, sorting, chart data equals rows; weather data and draft wording; severity rule, escalation transitions, no diagnosis/confidence/treatment text; SMS segment counting (GSM-7, extension characters, UCS-2); every template safe in every county and 15 unsafe messages refused; no import/call of auth code; deterministic simulated dispatch; USSD screens within 182 characters and no `*384#` anywhere in `src`; no personal data, no network/storage/export in the dashboard code, exactly one read-only call; routes and links |
| Real-browser run on the production build (headless Chrome, synthetic data, isolated test backend) | **52 / 52**: opens from Demo Mode; banner and branding; six overview cards with source labels; county and crop filters change the table, summary totals and the chart (bar values equal table cells); combined and empty filters; sorting and `aria-sort`; FSI panel for Lofa rice (75.6 → 76, shown inputs/weights/points) and Montserrado pepper (59, Critical); label text exact; 3-day/7-day weather numbers; disease county filter, severity text, queue assign/review; campaign template loading, live counter, SMS preview, refusal of a code-containing and a `*…#`-containing message, **dispatch makes zero network requests**, result and log marked SIMULATED, USSD keypad screens and the "no short code" notice; no phone numbers or e-mail on the page; no export control; only read requests; **layout audit at 320/375/768/1280 px: no horizontal overflow, no unlabelled controls, no tiny text, no contrast failures, no touch target under 44 px**; **offline**: the dashboard loads from the service worker and filters work, lessons and calculator still open |
| Regression | see section 8 |
Screenshots saved during the run (session scratch folder, not committed): top of the page at 1280 and 375 px.

## 8. Regression (existing features and the SMS work), all run after the last code change
| Check | Result |
|---|---|
| `tsc --noEmit`, `npm run build` | pass |
| `test:h1` / `test:h2` | 18 / 18, 16 / 16 |
| `test:api`, `test:harness`, `test:offline` | 31, 4, 22+6+3 pass |
| `test:contract` | 63 / 63 match the **unchanged** golden, 3 consecutive runs |
| `test:sms` (simulated SMS login, recovery, phone verification, in-website inbox, production/demo servers) | **39 / 39** on an isolated run. **One earlier run, started right after the browser runs, reported 37 / 39 (two failures I did not capture); the isolated rerun passed all 39.** These tests start real child servers with time limits, so they can fail on a busy machine; I did not identify the exact cause. |
| Browser regression of the SMS flows (new-device login with the in-website inbox, recovery, phone verification, offline checks, lessons/calculator offline) | **26 / 26** on the final run. Earlier attempts failed single checks that used fixed waits (first page load after a server restart, step 4 of recovery, phone status); they were changed to wait for the element and then passed. No application change was needed for those, but it shows the scripted browser checks are timing-sensitive on a loaded machine. |
| `test:m3` (PHP foundation) | not re-run: no backend, harness or PHP file changed in this task |

## 9. Not verified
Real phones, screen readers (TalkBack/VoiceOver), print layout, very large text sizes, slow networks; Chrome only (mobile emulation); the page was not reviewed by a Ministry, agronomist or veterinary officer.
