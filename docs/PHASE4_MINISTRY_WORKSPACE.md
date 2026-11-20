# Phase 4A–4B: shared components and unified Ministry workspace

Implemented on `feature/offline-first`, from `38f18d3`. Scope is the shared workspace components and the eight Ministry views only. Other role dashboards and the full-site redesign are deferred for review.

## Review routes

| Destination | Route | Existing content retained |
| --- | --- | --- |
| Overview | `/ministry` | Source-specific published group coverage; original illustrative KPIs and device queue in an expandable section |
| Food Security | `/ministry/food-security` | Dataset A production table, expected/actual chart, illustrative index and weather; independent legacy dataset B in an expandable section |
| Crop Monitoring | `/ministry/crop-monitoring` | Published simulated check bands and separate illustrative disease signals/review practice |
| Harvest & Marketplace Analytics | `/ministry/harvest` | Existing published listing counts, contributor counts, rounded offered kg and rounded asking prices |
| Extension Services | `/ministry/extension` | Existing local campaign templates, SMS/USSD simulation, signal assignment practice and protected expert-workspace link |
| County Analytics | `/ministry/counties` | County marginal only; no inferred county-by-crop intersection |
| Reports | `/ministry/reports` | Searchable/sortable published rows, scoped CSV with provenance/privacy metadata, browser print action |
| Data Quality | `/ministry/data-quality` | Source definitions, suppression/rounding/publication rules, permissions and saved/offline limitations |

`/food-security` redirects to Food Security. `/ministry-analytics` redirects to Overview. Query parameters are retained. Legacy anchors map to their corresponding views and retain their section targets:

- `sec-overview` → Overview; `sec-live` → Harvest.
- `sec-production`, `sec-fsi`, `sec-weather` → Food Security.
- `sec-disease` → Crop Monitoring; `sec-campaigns` → Extension.
- `sec-privacy` → Data Quality.

Canonical `#sec-overview` does not redirect to itself. Healthy navigation between Ministry views preserves local campaign receipts and assignments; refresh still resets these existing local simulations. Errors can recover when navigating to another route.

## Shared components and design

- `WorkspaceScaffold`: agricultural-green sidebar, compact top navigation, mobile drawer with focus trapping, Escape dismissal and focus restoration. Mobile language/display controls expand on demand. Existing low-data, listen-mode, language and account controls remain available.
- `DashboardBits`: source badges, KPI cards, section cards, distinct loading/error/empty/suppressed/offline states, sortable/paginated semantic tables and text-labeled bar charts. Zero remains zero; missing and suppressed values are distinct.
- `WorkspaceShell` supports opting into the sidebar; current farmer/expert/admin shells keep their existing default layout.
- Chart metrics and published-row filters update the chart and corresponding table. Tables have keyboard sort controls, column/row headings, captions and their own horizontal scroll region on narrow screens.
- Icons, fonts and charts use the existing locally bundled assets/dependencies. No remote chart or font service was added.

## Data and permission boundaries

The workspace consumes the existing `/api/v1/insights/aggregates` endpoint and existing aggregate cache. The two legacy sample pages retain their existing limited `/prototype/management-summary` reads. No server/API, database schema, authentication, consent, ownership or privacy-service implementation changed. No new Ministry permission was invented; these are public aggregate/sample demonstrations. Existing protected workspaces remain protected.

App-entered contributions, seeded synthetic aggregates, illustrative dataset A, illustrative dataset B and device-local queue state have separate labels. App-entered prototype data can itself include synthetic demonstration accounts; it is not official national reporting. Independent sample datasets are never added together.

The frontend explicitly projects only permitted aggregate fields into charts/tables/CSV. Existing minimum record/contributor groups, Other handling, suppression, batching and precision remain enforced by the existing server. Suppressed responses fail closed even if they contain stray rows. Contributor counts are not summed into unique farmer totals. Offered stock is not production or completed sales; asking prices are not transaction prices. Green/yellow/red checks are simulations, not diagnoses.

County and crop are separate published dimensions. Controls never imply a supported joint filter. The reporting-period control is disabled and labeled as a snapshot because no historical series is supplied. Source and filter scope stay visible. CSV excludes private identifiers and escapes spreadsheet formulas, including search metadata.

The service-worker configuration was not changed. Existing app-shell precaching includes the new client bundle. Saved aggregates use the existing IndexedDB client and display publication/save timestamps, offline status and stale-price limitations. Failed refresh retains a previous snapshot. A device needs initial online preparation; browser storage can be cleared. This phase does not claim to complete the separately requested offline-readiness overhaul.

## Verification — 20 November 2026

All selected final suites passed. Backend integration/security tests used disposable SQLite databases. Browser QA used a separate synthetic application/database at `/private/tmp/agri-phase4-qa-n2q2v2cz` on loopback port 64844, independent of the development database and existing public demo. Marketplace UI was enabled only in this temporary QA build for workflow checks. No credentials or databases are included in this commit.

| Suite | Passing checks |
| --- | ---: |
| Existing Ministry mathematics/simulation/privacy | 15 |
| New Ministry workspace projection/routes/CSV/components | 9 |
| Hardening | 11 |
| Phase 0 environment/security | 20 |
| API | 31 |
| Phase 2B USSD | 15 |
| USSD marketplace | 13 |
| Harvest/server/client | 17 |
| Offline advisor/cache/inventory | 31 |
| Phase 2A | 12 |
| Triage | 21 |
| H1 | 18 |
| H2 | 16 |
| **Total** | **229** |

Additionally, all **63 API contract requests** matched their golden snapshot. `npm run lint` (TypeScript), `npm run build` (production client/server/PWA) and `git diff --check` passed. Ministry and Phase 2B tests passed before implementation and after implementation. No failing application test remains.

Re-run using the corresponding `npm run test:*` scripts in `package.json`, including the new `test:ministry-workspace`. In a sandbox that prevents the tsx CLI's IPC socket, `node --import tsx --test tests/ministry-workspace.test.tsx tests/ministry.test.ts tests/phase2b.test.ts` runs those same test files without that CLI socket. The initial sandbox IPC/Chrome launch failures were environment restrictions; a screenshot-harness refresh timeout was corrected by restoring the viewport after a capture. Neither required weakening application controls.

### Browser evidence

Headless Chrome, separate clean profiles, production QA build; no TLS verification bypass. The QA origin was HTTP loopback, which Chrome treats as a trustworthy local origin; these results do not certify a public TLS gateway or tunnel.

- Eight desktop views at 1440px; every view at **320, 360, 375, 412 and 768px**, including expanded legacy food charts: no horizontal document overflow, one primary heading. Wide tables scroll within their region.
- Legacy routes and section anchors; direct navigation; filter/search results compared to the actual QA server snapshot; unsupported county/crop/history combinations disabled.
- Campaign receipt survives section navigation; display controls expand; drawer Tab/Shift-Tab/Escape and focus restoration pass.
- CSV contains selected published fields and provenance only; loading, fresh error, empty, failed-refresh-with-snapshot and suppression are distinct. Loading/error/empty scenarios used browser response interception, not production API changes.
- Client network disabled for both page and service worker: saved Ministry snapshot, Home, Farmer Today, guidance and USSD reopen; original USSD option 8 remains functional.
- Separate synthetic seller/buyer browser contexts: keypad sale confirmation, offline queue, reconnect creating one listing, real generated reference, inquiry, transport failure/retry, My Listings/My Inquiries, seller ownership and farmer reply. Offline inquiries refuse submission. Existing regression suites additionally cover authorization denial, consent, timeouts/restart and idempotency.
- No uncaught browser exceptions in completed runs. See `phase4-screenshots/verification.json` for browser checkpoint summaries and the complete width/view matrix.

Manual regression: dispatch a campaign at `/ministry/extension`, navigate to Data Quality and back using the sidebar, and confirm the local SIM receipt remains. Refreshing intentionally resets the local-only simulator.

Screenshots (synthetic QA data):

- [Desktop overview](phase4-screenshots/overview-desktop.png)
- [Published chart and table](phase4-screenshots/published-chart-table.png)
- [Food-security production and index](phase4-screenshots/food-security-chart.png)
- [Mobile 320px](phase4-screenshots/mobile-320.png), [375px](phase4-screenshots/mobile-375.png), [tablet 768px](phase4-screenshots/tablet-768.png)
- [Offline saved snapshot](phase4-screenshots/offline-mobile.png)
- [Initial error](phase4-screenshots/initial-error.png), [empty dataset](phase4-screenshots/empty.png)

## Safety and remaining limits

The original port-3000 server remained PID 33070 and returned HTTP 200 for `/ussd-demo` after verification; it was not stopped or restarted. The development database was not accessed by QA, copied, reset or migrated. Existing isolated demo services on ports 3001/3081, Cloudflare, Hostinger, DNS and production were not changed. Nothing was pushed, merged or deployed. User-provided untracked reference material was left untouched.

Physical Android/iPhone, Safari/VoiceOver, installed-PWA launch and OS print-dialog behavior were not certified. Browser viewport and keyboard testing do not replace those checks. No public demo URL was configured for QA; its QR poster correctly shows setup instructions. The existing QR encoding unit tests remain passing. No physical-phone scanning claim is made.

Historical reporting, official statistics, a Ministry authorization role and joint county-by-crop data remain unavailable. Any such addition requires a separate data/permissions proposal. Review Phase 4A–4B first; the recommended next phase is the separately approved role-dashboard work, with offline-engine work scoped and reviewed independently.
