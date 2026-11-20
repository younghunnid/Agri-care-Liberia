# USSD and offline final QA — Codex worktree

Date: 20 November 2026 (Africa/Monrovia).

Worktree: `/Applications/XAMPP/xamppfiles/htdocs/Agri-AdvisoryLib-codex`.
Branch: `codex/ussd-offline-qa`. Starting HEAD: `bb054e0af9665cf92f38eefad7dbba479e74cedf`; initially clean.

## Findings and fixes

No P0 defect was reproduced. Three P1 reliability defects were reproduced and fixed:

| Defect | Reproduction and cause | Small fix | Regression evidence |
| --- | --- | --- | --- |
| Incomplete first-install offline resources | Production `sw.js` did not precache shipped WebP/JPEG images or bundled M4A audio. Legacy images were copied after Workbox generated its manifest. | Include those resource extensions and copy legacy assets in `writeBundle`, before Workbox's `closeBundle`. | New manifest test failed before the fix and passes afterward. Browser fetched previously unvisited images and audio offline, including livestock imagery. |
| A stale tab resends an already completed operation | After another tab published a listing and removed its durable queue item, the first tab still sent its in-memory copy. Web Locks serialized runs but did not refresh each tab's mirror. | Refresh IndexedDB drafts, questions, queue and sync timestamp after acquiring the existing sync lock. Preserve operation keys when recovering an interrupted send. | New IndexedDB test failed with one unexpected resend before the fix and passes with zero afterward. It also verifies discovery/recovery of another tab's pending operation. Existing server idempotency tests remain green. |
| A stalled CSRF bootstrap bypasses the write timeout | An aborted `apiFetch` write continued waiting for `/csrf-token`, which did not receive the caller's signal. A pending sync could stay busy indefinitely. | Forward the existing abort signal into CSRF bootstrap, including security-token refresh. | New stalled-fetch regression failed before the fix and now rejects at the request deadline. |

No USSD menu, numbered option, content, identity model or submission flow was changed. Option **8 Sell & market** and its original read-only market/selling practice remain intact. Interactive Buy & Sell remains option 3. Added dependencies are development-only browser/IndexedDB test tools, pinned in the npm lockfile.

## Validation

- Selected existing suites: **255 passed, 0 failed**. Files: `api`, `phase0`, `phase0b`, `phase2a`, `phase2b`, `ussd-marketplace`, `offlineAdvisor`, `dataCache`, `offlineInventory`, `harvest`, `harvest-client`, `hardening`, `triage`, `h1`, `h2`, `sms-auth`.
- Additional existing suites: **32 passed, 0 failed** (`deploy`, `ministry`, `contract/normalize`).
- Existing API contract: **63 requests** match the golden snapshot.
- New offline regressions: **3 passed** (CSRF deadline, cross-tab durable queue refresh/recovery, complete shipped-media precache).
- TypeScript: `npm run lint` passed.
- Production client/server build: `npm run build` passed. Fixed build precaches **154 resources, approximately 11.7 MiB**. Both default configuration and the existing opt-in USSD marketplace configuration were built.
- USSD engine suite explores more than 900 reachable screens per market state, validates numbered submenus/error variants and 182-character bounds, checks navigation, timeout/restart, crop/pest/soil/harvest content and advice accessibility. Livestock guidance was checked through its existing website route; no livestock USSD submenu was added.
- Marketplace/security suites cover server-generated references, lost responses/replays, ownership keys, private inquiries, authorized replies, consent, unstable storage, synthetic identity restrictions and real default rate limits.

Six browser scenarios passed against a **local production build**, using an isolated synthetic-only demo backend on random loopback port **50895**, a disposable SQLite database and temporary Chrome profiles:

1. Service-worker installation, activation and first-visit control; expected image/audio resources present in Cache Storage.
2. Offline direct navigation/reopening and refresh of `/today`, `/guidance`, `/livestock`, `/soil` and `/ussd-demo` at **320, 360, 375 and 412px**. No document horizontal overflow. Previously unvisited media fetched successfully offline. USSD screenshots at 320 and 412px were visually inspected.
3. Keypad plus keyboard digits, Enter, Backspace, Escape and Tab; original option 8, invalid input, Back, Home, Cancel, timeout and fresh restart.
4. Confirmed USSD sale saved offline, browser profile closed and reopened, then reconnection published one listing with one server-generated SELL reference. Refresh retained the same listing ID.
5. Final offline buyer inquiry confirmation explicitly refused; no inquiry entered the offline sync queue.
6. A separate buyer browser profile submitted a real synthetic inquiry; the seller replied through the existing harvest workspace; the buyer read the authorized reply through USSD My Inquiries.

## Re-running

Use Node 22.13+ and `npm ci`. API suites must run with `API_BASE_URL` unset so the existing harness creates disposable databases and random loopback ports. The browser script creates its own temporary database/server/profile and removes them in `finally`.

```sh
npm run build
npm run test:offline-qa
npm run lint
node --import tsx --test tests/phase2b.test.ts tests/ussd-marketplace.test.ts tests/offlineAdvisor.test.ts tests/dataCache.test.ts tests/offlineInventory.test.ts tests/harvest.test.ts tests/harvest-client.test.ts tests/hardening.test.ts tests/phase0.test.ts tests/phase0b.test.ts tests/phase2a.test.ts tests/triage.test.ts tests/h1.test.ts tests/h2.test.ts tests/api.test.ts tests/sms-auth.test.ts
node --import tsx --test tests/deploy.test.ts tests/ministry.test.ts tests/contract/normalize.test.ts
node --import tsx tests/contract/run.ts
VITE_USSD_MARKETPLACE_ENABLED=true npm run build
npm run test:browser-qa
npm run build
```

Browser QA uses installed desktop Chrome on this macOS host. Set `QA_CHROME` to another Chrome executable where necessary. Production output is ignored by Git. The final local build uses the default configuration; no demo or public URL configuration was changed.

## Limits and integration notes

- Browser evidence is **headless desktop Chrome with mobile viewport and network emulation**, not a real phone, telecom session, installed Android/iOS PWA or physical network test. Mobile storage pressure, OS eviction and background execution remain unverified.
- First use requires an online visit and successful service-worker installation on HTTPS or localhost. A browser that has never installed the app cannot open it offline. External Google fonts can fall back to system fonts offline.
- Interactive USSD writes retain the existing opt-in build flag and protected synthetic-only server check. Verification is held in memory: reopening the USSD page entirely offline leaves its submissions disabled until an online check. Previously queued drafts still synchronize, and the existing harvest workspace retains offline drafts. This guard was preserved rather than adding persistent authorization behavior.
- Web Locks provide cross-tab serialization on supported browsers. Other browsers retain the existing server idempotency protection; no universal cross-tab/OS background execution claim is made.
- Precaching the shipped media increases the initial cache download to approximately 11.7 MiB. The test verifies shipped resources, not remote live data or external services.
- Checked Claude's committed `feature/offline-first` at `d29cf63c42c63c1708abcc49854f1d82ac9b72f2` using Git objects only. Direct file overlap: **`vite.config.ts` and `package.json`**. Integration must reconcile cache/build hooks and npm scripts; Claude's added homepage media should remain covered by the resource glob. Uncommitted work in Claude's directory was not inspected.
- All source edits stayed in the Codex worktree. Tests used temporary SQLite databases and random loopback ports. No development database, port 3000, public demo, Cloudflare Tunnel, PHP/MySQL migration, merge, cherry-pick, push or deployment was touched.

Fixes and regression evidence are committed locally on `codex/ussd-offline-qa`. Integration requires user approval.
