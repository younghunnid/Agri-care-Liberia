# Hostinger (Business) Node.js deployment assessment

Status: **assessment only.** Nothing deployed, migrated, pushed or merged. **No application code or database was modified.** Base: branch `feature/offline-first`, commit `f3e454b`. The one file added is this document (not committed).

> **Update (deployment-preparation phase):** blockers B2 (demo accounts), B3 (JS entry), B5 (engines), B6 (lockfile, plus an `npm ci` failure caused by the esbuild pin), the session-secret, cookie, proxy and API-404 findings are addressed in code and tested; B1 (persistent storage on Hostinger) and B4 (SMS mode) remain configuration/verification items. See `docs/HOSTINGER_STAGING_DEPLOYMENT.md`, `docs/DEPLOYMENT_SECURITY_REVIEW.md`, `docs/BACKUP_AND_RECOVERY.md`. The text below is the original assessment and is kept unchanged.

## 0. Answer in short
**Yes, the existing React + Node application can very probably run on Hostinger Business Node.js hosting with a small set of changes**, but three facts can only be confirmed on the real account (section 8), and one issue must be fixed before any public URL exists (demo accounts). It is **not "deploy as-is"**.

| # | Blocker or required change | Severity | Needs |
|---|---|---|---|
| B1 | **Where can the SQLite file live and does it survive a redeploy?** Hostinger builds every deployment into a new folder (`hbuilds/versions/<id>`, symlink `hbuilds/current`). The repo default `./data/agri_advisory.db` would sit inside that folder. Hostinger's documentation does **not** say whether the filesystem is writable at runtime or what survives a redeploy. | **High, unverified** | A 30-minute staging probe on the real account; DB path must be outside the app folder (env change only) |
| B2 | **Demo accounts are seeded in production with published passwords.** On an empty database the server creates a demo farmer (`+231770000101`) and an approved demo expert (`+231770000201`) whose passwords are in our documents. Confirmed against a production-mode local run: the passwords are accepted. | **High for a public URL** | A small code change (seed only when explicitly enabled) or removing the two accounts before launch |
| B3 | **Entry file must be `.js/.mjs/.cjs`; ours is `server.ts` run by `tsx`**, and `tsx` is a devDependency. The `isDirectEntry` check only recognises a file named `server.ts` or `server.js` (a bundle named `server.mjs` silently starts nothing: observed). | Medium | Build step that emits `server.js` (esbuild, already installed) and an `npm run build` that produces it |
| B4 | **Simulated SMS is refused in production mode** (by design). On a public subdomain, new-device sign-in needs either a real SMS provider (does not exist) or the protected `APP_ENV=demo` mode with synthetic accounts only. | Medium | Environment variables only (section 6) |
| B5 | **Node version:** `node:sqlite` needs Node ≥ 22.13 without a flag. Hostinger offers 18, 20, 22 (default), 24, but not which patch. `package.json` has no `engines`. | Medium, unverified | Set `engines` and test on 22 and 24 on staging |
| B6 | No `package-lock.json` (only `bun.lock`); Hostinger detects npm/yarn/pnpm from lockfiles. Dependencies would install unpinned. | Low-medium | Generate and commit a lockfile |

Everything else (HTTPS, cookies, API reachability, offline features, idle restarts) works or needs only configuration. Effort for the Node route: **about 2 to 4 working days** including staging gates. Completing the PHP/MySQL migration: **about 5 to 8 weeks** (section 9).

## 1. What was audited
Read-only inspection of the repository, plus a **local simulation of a hosted deployment** (section 7). Nothing was run against `data/agri_advisory.db`; the simulation used a throw-away database in a temp folder that was deleted afterwards. **No test was run on Hostinger itself.** Hostinger statements below come from its public documentation (linked in section 10) and are marked **unverified** where the documentation is silent.

## 2. Application inventory
| Item | Finding |
|---|---|
| Frontend | React 19, Vite 8, Tailwind 4, React Router 7, `vite-plugin-pwa` (service worker, manifest, `registerType: 'prompt'`), IndexedDB offline stores. Build: `vite build` to `dist/` (11 MB: JS about 1 MB, images and audio, `sw.js`). Pure static output served by the Node app. |
| Backend | Node ESM, Express 4, `cookie-parser`, `node:sqlite` (built-in, experimental), scrypt via `node:crypto`, optional `@google/genai`. Entry point `server.ts` (`createApp()` + `listen`). One process, no worker threads, no child processes. |
| Runtime | Built and tested on **Node 22.23.5**, npm 10.9. No `.nvmrc`, no `engines`. `node:sqlite` prints an ExperimentalWarning. |
| Start commands | `npm run dev` = `tsx server.ts` (Vite middleware, development). `npm start` = `NODE_ENV=production tsx server.ts` (serves `dist/`). `tsx` is a **devDependency**, so a production install that omits dev dependencies cannot run `npm start`. |
| Build | `npm run build` = `vite build` (needs devDependencies: Tailwind, esbuild, TypeScript). `npm run lint` = `tsc --noEmit`. |
| Dependencies | 14 runtime, 8 dev. `node_modules` is 284 MB locally; Hostinger deploys "the whole root directory, including `node_modules`" for Express apps. |
| Port/host | `PORT` (default 3000) and `HOST` (default `0.0.0.0`). Whether Hostinger injects `PORT` is not documented (**unverified**); the app honours it if present. |
| Static serving | `express.static(dist)` plus SPA fallback `GET *` to `index.html`. Observed: no compression, `Cache-Control: public, max-age=0` for everything (including hashed assets), no HSTS/CSP, `X-Powered-By: Express`, and unknown `/api/...` GETs answer **200 + HTML** (the SPA fallback swallows API 404s). |
| Resource use (local) | RSS about 95 to 100 MB idle; registration (scrypt) 84 ms. Fine for shared hosting limits (Hostinger lists 120 processes / 60 entry processes on Business; memory not stated). |

### 2.1 Environment variables the code reads
`NODE_ENV`, `PORT`, `HOST`, `DB_PATH`, `SESSION_SECRET`, `APP_URL`, `APP_ENV` (`test` / `demo`), `GEMINI_API_KEY`, `AI_ANON_DAILY_LIMIT`, `AI_AUTH_HOURLY_LIMIT`, `AI_TIMEOUT_MS`, and the SMS/OTP set: `SMS_PROVIDER`, `OTP_HMAC_SECRET`, `DEMO_INLINE_INBOX`, `SIMULATED_INBOX`, `DEMO_OPERATOR_TOKEN`, `DEMO_ENV_ACK`, `SIMULATED_SMS_ALLOWED_PREFIX`, `TRUSTED_DEVICE_DAYS`. Admin bootstrap script: `ADMIN_BOOTSTRAP_*`. `TEST_FIXTURE_TOKEN` is test-only and must **not** be set. `.env.example` is outdated (still mentions AI Studio, PHP/MySQL values and omits the SMS settings). Hostinger sets variables in hPanel (or by importing a `.env`), injects them at build and run time, and **saving a change triggers a redeploy**.

## 3. Persistent storage, jobs, uploads, other dependencies
| Topic | Finding |
|---|---|
| **SQLite** | **Requires a persistent, writable path** (WAL mode: the `.db`, `-wal` and `-shm` files are written constantly; `busy_timeout` 5 s). Default `./data/agri_advisory.db` (2.1 MB now, `/data/` is git-ignored). WAL on a network or shared filesystem can misbehave; whether Hostinger's volume is local is **unverified**. |
| Redeploys | New directory per build; `hbuilds/current` is re-pointed. Anything created inside the old directory is not carried over unless Hostinger documents otherwise (it does not). So the database must live **outside** the build folder (for example `$HOME/agri-data/agri.db`) **if** that location is writable and persistent. **Unverified.** |
| Backups | None exist today. A deployed DB needs a copy routine (see 8, probe 5). Hostinger Business has hPanel cron jobs for shared hosting generally, but whether they can run Node scripts against this DB is **unverified**. |
| Scheduled jobs / workers | **None.** No cron, no `setInterval`, no queues. Rate limits, session versioning, OTP expiry are computed on request from database rows. Hostinger says Node apps have no always-running workers and no inbound WebSockets: not needed. |
| Idle behaviour | Hostinger stops a Node app after a period without traffic and restarts it on the next request (cold start, a few seconds). Our state is in SQLite and signed cookies, so a restart is safe. **Lost on restart:** the in-memory simulated SMS inbox and its 10-minute messages (acceptable for the demo; the code can be resent). |
| Uploads | No multipart uploads. Photos and voice notes are stored as data-URL strings inside SQLite rows (JSON body limit 4 MB). Audio lessons and images are static files in `dist/`. So the database also grows with photos: plan disk and backups accordingly. |
| Request time | Hostinger stops requests after 120 s; the AI call times out at 20 s: compatible. |
| Outbound calls | Only Gemini (`@google/genai`) and only if `GEMINI_API_KEY` is set. **Known defect:** the model id in `server/ai.ts` is `gemini-4-hydrogen` (invalid), so live AI would fail until fixed. Outbound HTTPS from the host is **unverified**. The on-device advisor works without it. |
| Email/SMS | None sent. Simulated SMS only. |
| Logging | `console.log` to stdout; Hostinger has separate runtime logs (**unverified** retention). Tokens, codes and secrets are not logged (tested). |

## 4. Hostinger Business compatibility (from documentation)
| Requirement | Hostinger | Verdict |
|---|---|---|
| Node.js apps on the Business plan | Yes (Business Web Hosting, Cloud plans). Up to 5 Node sites on Business/Unlimited. | OK |
| Versions | 18, 20, 22 (default), 24 (LTS 20 and 22) | OK, patch version unverified (B5) |
| Deploy | GitHub/GitLab repository, uploaded archive (`.zip/.tar/.tgz`), template | OK. GitHub deploy would not include `data/`, `dist/`, `node_modules`, `.env` (git-ignored): the host must run the build. |
| Framework detection | Express detected; "leave build output blank; the whole root directory including node_modules is deployed" | OK |
| Entry file | Must end in `.js`, `.mjs` or `.cjs` | **B3** |
| Start method | "Node runs the entry file"; `npm start` is not mentioned | `npm start` with `tsx` should not be relied on |
| Build | A `package.json` script (npm detected from lockfile) | **B6** (no npm lockfile) |
| Env vars | hPanel, injected at build and run | OK |
| Subdomain + HTTPS | Not documented on the pages I could read; Hostinger normally provides free SSL for domains/subdomains | Likely OK, **verify** |
| WebSockets, workers | Not supported | Not needed |
| Idle stop, auto-restart on crash | Documented | OK |
| Persistent writable storage for runtime data | **Not documented** | **B1** |
| Process manager / proxy chain / client IP header | Not documented | see 6.3 |

## 5. HTTPS, cookies and frontend/backend communication (verified locally)
The frontend calls the API with **relative URLs** (`/api/v1/...`) on the **same origin**, so serving the built frontend and the API from one Node app on one subdomain needs **no CORS and no API base URL change**. A separate frontend host would need code changes (CORS, cookie `SameSite`, API base): not recommended.

Local simulation of a hosted setup: a bundled `server.js` run with plain `node` in production mode on a temp database, fronted by the project's own TLS proxy (`scripts/dev-https-proxy.mjs`, certificate verified against the dev CA, no `-k`):
* `GET /api/v1/health` over verified HTTPS: 200. Cookies issued with `HttpOnly; Secure; Partitioned; SameSite=None` (anon) and `Secure; Partitioned; SameSite=None` (CSRF, readable by the page as designed).
* CSRF token, registration, session cookie and `GET /auth/me` over HTTPS: worked end to end (201, user returned).
* **New-device sign-in in production mode with `SMS_PROVIDER=none` returned 503 `SMS_UNAVAILABLE`, no session**: the fail-closed behaviour is confirmed.
* Static files: `/`, `/sw.js`, `/manifest.webmanifest`, `/learn` (SPA route) all 200; `sw.js` served with `max-age=0` (good for service-worker updates).
* **Not verified:** the real Hostinger proxy (header `X-Forwarded-Proto`, client IP, hop count), real certificate, behaviour after an idle restart, behaviour of WAL on Hostinger's disk.

Findings to fix for production:
1. `isHttpsRequest()` also treats a request as HTTPS if the **client-supplied `Origin` header** starts with `https://`. It only changes cookie flags, but it should rely on `req.secure` / the proxy header only.
2. Cookies use `SameSite=None; Partitioned` whenever HTTPS. For a first-party app on its own subdomain `SameSite=Lax; Secure` is safer and simpler (the same decision made for PHP: `COOKIE_MODE=first_party`).
3. `trust proxy` is fixed to `1`. If Hostinger has more than one proxy hop, `req.ip` is a proxy address and **every IP-based limit (login, registration, OTP) becomes one shared bucket**; if there are fewer, forged `X-Forwarded-For` values could choose the key. This is the same unknown as gate IP-1 for PHP; it needs a staging measurement.
4. No HSTS, CSP, compression, or long-lived caching of hashed assets. Hostinger's front end may add compression/caching: **verify**.
5. Unknown `/api/*` paths return the SPA HTML with status 200; should be JSON 404.

## 6. Production configuration changes (security, sessions, SMS, API)
### 6.1 Sessions
* `SESSION_SECRET` is **optional and falls back to a random per-process secret**: on Hostinger every idle restart or redeploy would silently sign everyone out. Set a fixed value of at least 32 random characters in hPanel; the code should refuse to start in production without it (small change).
* Sessions are signed cookies with a server-side `session_version` (revocable): suitable for a restart-prone host.
* Rotating `SESSION_SECRET` invalidates all sessions and all hashed identifiers (rate-limit keys, `ip_hash` in audit rows): treat it as permanent.

### 6.2 Simulated SMS (two sensible options for the hackathon subdomain)
Option **A, protected demo environment (recommended for judges):** `NODE_ENV=production`, `APP_ENV=demo`, `SMS_PROVIDER=simulated`, `DEMO_INLINE_INBOX=1`, `DEMO_ENV_ACK=synthetic-accounts-only`, `OTP_HMAC_SECRET` and `SESSION_SECRET` (32+ random characters each); optional `SIMULATED_INBOX=1` + `DEMO_OPERATOR_TOKEN` (separate secret) for the presenter inbox. Only synthetic numbers `+23177000xxxx` receive messages; real numbers get a clear 422; the code is shown only to the browser that started the challenge. **Do not put real farmers' accounts on that deployment.** The server refuses to start if any of this is unsafe.
Option **B, production-like:** `SMS_PROVIDER=none` and `OTP_HMAC_SECRET` set. New-device sign-in and SMS recovery fail closed (503); only trusted devices work. Useless for fresh demos but safe.
Either way never set `TEST_FIXTURE_TOKEN`/`APP_ENV=test`.

### 6.3 Other required or recommended settings
`NODE_ENV=production`, `PORT` (if Hostinger does not inject one), `HOST=0.0.0.0` (default), **`DB_PATH` outside the build folder**, `APP_URL=https://<subdomain>`, `GEMINI_API_KEY` only after the model id is fixed (otherwise leave unset: the app says AI is unavailable), `AI_*` limits as needed. Disable `ADMIN_BOOTSTRAP_*` after first use.

### 6.4 Code changes recommended (all small; none made)
1. Emit `server.js` from `server.ts` at build time (esbuild bundle with packages external, which worked in the simulation when named `server.js`) and make the build script produce both `dist/` and `server.js`; or add a 3-line `server.js` that imports the bundle. Keep `tsx` out of production.
2. Seed demo accounts only when `ENABLE_DEMO_SEED=1` (non-production) (B2).
3. Require `SESSION_SECRET` and `OTP_HMAC_SECRET` in production; fix `DB_PATH` validation (must be absolute and not inside the app folder in production).
4. Cookie mode first-party (`SameSite=Lax; Secure`), drop the `Origin`-based HTTPS guess, configurable `TRUST_PROXY_HOPS`.
5. JSON 404 for `/api/*`; hashed assets `Cache-Control: public, max-age=31536000, immutable`; compression; HSTS once HTTPS is confirmed; `app.disable('x-powered-by')`.
6. Add `engines` (`>=22.13`), commit `package-lock.json`, update `.env.example`.
7. Fix the Gemini model id (or keep AI off).
8. A tiny read-only `/api/v1/health` addition is **not** needed; a one-off diagnostic for the staging probes (section 8) can be a temporary route removed afterwards.

## 7. Offline-first behaviour when deployed
* **Requires HTTPS** for the service worker; the subdomain's certificate must be valid. Service worker, manifest and IndexedDB stores are origin-bound: a **new subdomain starts with an empty cache and empty local data** (existing local drafts/progress on `localhost` do not carry over).
* `sw.js` is served `max-age=0` (updates are picked up); `registerType: prompt` shows the existing update prompt. Navigation fallback excludes `/api/`. API responses are not cached by the service worker.
* First visit needs the network to install the service worker and precache about 1 MB of JS, CSS and icons (`dist/` is 11 MB with audio and images, fetched on demand). After that: lessons, quizzes, saved advice, calculator, the Ministry & Extension demo and offline questions work offline (tested locally on the production build with real network-off emulation in earlier milestones).
* **Idle restarts** are invisible to users but the first request after idle is slow; the app's own offline queue retries.
* **Security actions need the server** (sign-in verification, recovery, device management): they correctly refuse offline.
* Behind a TLS-terminating proxy the Express static handler cannot know the scheme unless `X-Forwarded-Proto` is trusted: verified locally; **verify on Hostinger**.

## 8. Staging gates (do these before any real use; about half a day)
| Probe | How | Pass criterion |
|---|---|---|
| 1. Writable persistent path | Temporary entry that writes a file under `$HOME/agri-data/` and under the app folder, redeploy, read it back | Outside-folder file survives a redeploy |
| 2. SQLite WAL on that disk | Run the app with `DB_PATH` there; 200 parallel health + register calls; stop/start; `PRAGMA integrity_check` | No `database is locked`, data intact |
| 3. Node patch and flags | Log `process.version` and `node:sqlite` import on Node 22 and 24 | Imports without `--experimental-sqlite`; our test suites pass on the chosen version |
| 4. Proxy facts | Echo `req.secure`, `x-forwarded-proto`, `x-forwarded-for`, `req.ip` for a forged-header request | One documented hop count; forged values ignored |
| 5. Backup | `node scripts` copy (SQLite `VACUUM INTO`) from cron or by hand to a second folder | A restorable copy exists |
| 6. HTTPS and service worker | Open on an Android phone: install, airplane mode, reload | App shell and lessons open offline |
| 7. Idle restart | Leave idle, then load | Starts, data intact, session still valid (fixed `SESSION_SECRET`) |
| 8. Outbound HTTPS | Call a public HTTPS URL from the app | Works (only needed for Gemini) |

## 9. Deployment plan for a future subdomain
1. **Prepare (local, about 1 day):** items 1 to 7 in 6.4; run the full regression suite; build `dist/` and `server.js`; tag the commit.
2. **Create the subdomain** (for example `agri.<yourdomain>`) in hPanel with SSL; add a **Node.js web app** (Express), from GitHub or an archive; Node 22 or 24 per probe 3; build script `build`; entry file `server.js`; leave output directory empty.
3. **Environment variables** per 6.2 and 6.3, including a fixed `SESSION_SECRET`, `OTP_HMAC_SECRET`, `DB_PATH` outside the build folder.
4. **Staging gates** (section 8). Fix what fails before continuing.
5. **First start:** the schema migrates itself; no demo accounts (after change 2); create the administrator with the bootstrap script using strong credentials, then remove those variables.
6. **Smoke test** from a phone: install, offline lesson, calculator, Ask an Expert offline then reconnect (exactly-once), sign-in with the in-website demo inbox (Option A), password recovery, Ministry & Extension demo page.
7. **Backups and monitoring:** scheduled copy of the database; check runtime logs after the first day; note that every env-var change redeploys.
8. **Rollback:** Hostinger has no per-commit rollback; keep the previous archive/tag and the database backup; restoring means redeploying the previous source and restoring the DB copy.

## 10. Node on Hostinger vs completing PHP/MySQL
| | Node on Hostinger (this document) | Finish PHP/MySQL migration |
|---|---|---|
| Work remaining | Small fixes (6.4), staging probes, subdomain setup | M4 auth (about 8 to 12 days with the matrix, plus the SMS/session work now to be ported), M5 read APIs, M6 marketplace/expert/sync, M7 uploads/PWA headers/Gemini, M8 data migration utility, M9 staging soak, M10 cutover. Only 2 of 61 endpoints exist in PHP today. |
| Estimate | **2 to 4 working days** | **About 5 to 8 weeks** one developer (the plan's own M4 estimate is 8 to 12 days alone) |
| Risk | Unknown persistence/WAL on Hostinger (cheap to test), Node patch version, idle restarts | Large surface to port and re-verify; Hostinger LiteSpeed/PHP 8.2 gates still pending |
| Reuses tested work | All existing tests and the golden contract, offline features, simulated SMS | Needs parity tests against the Node reference for every endpoint |
| Production fit | Fine for a hackathon/pilot; SQLite is a single-file, single-writer database with no managed backups | MySQL is a better long-term fit on shared hosting (managed DB, backups) |
| Ops | App process stops when idle; no workers | No process to manage; standard shared hosting |
| What stays blocked | Real SMS (no provider), AI model fix | same, plus all the above |

**Recommendation:** use the Node deployment for the hackathon and judges (days, not weeks), keep the PHP/MySQL work paused and revisit it only if Hostinger's runtime probes fail (probes 1 or 2) or if you need managed MySQL for a longer pilot. All PHP work to date (M1 to M3.1) and the Node-first security design (documented for porting) remain valid if you later resume.

## 11. Not verified / assumptions
No Hostinger account access was used. Unverified: writable/persistent runtime storage, WAL behaviour, Node 22 patch version, injected `PORT`, proxy hop count and headers, compression/caching by Hostinger's front end, outbound HTTPS, subdomain SSL provisioning time, cron availability for backups, memory limits of the Business plan. Idle-restart behaviour was not exercised locally. Node 24 was not tested (only 22.23.5 available). Android device behaviour was not re-tested here.

## 12. Sources (Hostinger documentation read for this assessment)
* [Node.js overview](https://docs.hostinger.com/node.js/overview), [Build settings](https://docs.hostinger.com/node.js/build-settings), [Deployments](https://docs.hostinger.com/node.js/deployments.md), [Environment variables](https://docs.hostinger.com/node.js/environment-variables.md), [Express guide](https://docs.hostinger.com/node.js/overview-1/express)
* [Selecting the Node.js version](https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/), [Parameters and limits of hosting plans](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/)
