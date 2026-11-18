# PHP 8.2+ / MySQL 8 migration plan — Agri-Advisory Liberia (Team 8)

**Status: M1 (test harness) implemented and verified; M2 onward NOT started.** (Originally: assessment and design only.) Nothing here has changed the React frontend, the PWA service
worker, IndexedDB, the Node/Express backend, the SQLite files (`data/agri_advisory.db*` is untouched), or any existing migration.
Written against branch `feature/offline-first` at commit `a6e8416`. **Approval is requested for the decisions in section 17 before any implementation starts.**

Evidence base: read from the code (routes, migrations, security module, frontend callers). Two feasibility checks were run read-only on this Mac and
are reported where relevant: (a) PHP's libsodium verifies the existing Node scrypt password hashes exactly; (b) the build/static-asset paths.

---------------------------------------------------------------------------------------------------

## 1. Decision, scope and rules

**Confirmed architecture:** keep the React + TypeScript + Tailwind frontend, the PWA service worker, IndexedDB offline storage, offline guides/images/audio,
the Offline Guide Assistant, marketplace/expert drafts and the sync engine. **Replace** the Node/Express + SQLite backend with PHP 8.2+ (PDO) and MySQL 8
on shared Hostinger hosting.

| In scope | Out of scope |
|---|---|
| A PHP REST API that is a drop-in for `/api/v1/*` | Any visual/UX change to the React app |
| MySQL schema + SQLite→MySQL data migration utility | Replacing IndexedDB or the service worker |
| Same cookies, headers, error shapes, idempotency, ownership keys | New product features |
| Security fixes already made in Node, ported and extended | A framework rewrite of the frontend |
| Hostinger deployment, cron, backups, rollback | Native apps |

Non-negotiables during implementation: separate branch; Node + SQLite stay runnable until sign-off; never write to SQLite; never touch production data
without a verified backup; no secrets in Git; each milestone has automated exit criteria.

## 2. Assessment of the current backend

### 2.1 Architecture
- `server.ts` (Express): trust proxy, `X-Content-Type-Options`, `Referrer-Policy`, CORS allow-list (same-host or `APP_URL`), `express.json({limit:'4mb'})`,
  cookie parser, session middleware, `/api/v1` routers (`server/routes/v1.ts`, `server/routes/prototype.ts`), then static `dist/` + SPA fallback in production.
- `server/db.ts`: SQLite via `node:sqlite` (`foreign_keys=ON`, WAL), forward-only migrations `001`–`006` tracked in `schema_migrations`.
- `server/security.ts`: scrypt passwords, HMAC session cookie, double-submit CSRF, rate-limit table, audit log, ownership-key hashing.
- `server/idempotency.ts`: `Idempotency-Key` replay store. `server/ai.ts`: Gemini via `@google/genai` (**model id `gemini-4-hydrogen` is hard-coded and unverified; no API key was ever available in testing**, so live AI has never been exercised).
- Seeds: `seed.ts` (reference data: 7 published guides, crops, categories, roles, expert/admin demo accounts) and `seedPrototype.ts` (11 demo listings, language recordings, simulated expert requests).
- `php-backend/` exists but is a 314-line placeholder (7 routes: health, csrf, crops, guides, advisor/ask, login, admin/overview). It is **not** a usable base; it is replaced, not extended. `database/mysql/001_initial_schema.sql` covers 19 of the 27 tables (section 7).

### 2.2 Security controls that must carry over exactly
| Control | Node behaviour | PHP requirement |
|---|---|---|
| Session | Cookie `agri_session` = `base64url(JSON{uid,exp}) . "." . base64url(HMAC-SHA256(secret, payload))`, 7 days, HttpOnly, SameSite, Secure over HTTPS | Same format and secret so existing sessions survive cutover (or force re-login — decision D3) |
| CSRF | Double submit: readable cookie `agri_csrf` + header `X-CSRF-Token`; `GET /csrf-token` issues it; failures `403 CSRF_INVALID`; client retries once | Identical; compare with `hash_equals` |
| Anonymous id | Cookie `agri_anon` (HttpOnly) for anonymous AI quota | Same |
| Passwords | `scrypt(password, saltHexString, 64)` stored `salt:hex` (N=16384, r=8, p=1) | Verify legacy hashes with libsodium (**verified compatible**, section 6.3), rehash to Argon2id/bcrypt on login |
| RBAC | roles `admin`, `expert`, `farmer`; expert must be `approved`; admin bypasses | Same middleware semantics |
| Rate limits | table `rate_limit_attempts` (key, action, time) | Same table and limits (6.6) |
| Audit | `audit_logs` with HMAC'd IP | Same, 20 existing actions (appendix B) |
| Ownership (listings) | per-listing secret, HMAC hash `owner_key_hash`, `X-Listing-Key`, allow-listed JSON | Identical (section 9) |
| Ownership (expert requests) | per-device secret, `requester_key_hash`, `X-Requester-Key` | Identical |
| Idempotency | `sync_operations`, `Idempotency-Key`, replay + `"replayed":true` | Identical, race-safe on MySQL |
| Phone consent | no consent → no phone stored/returned (create/update via sync, public reads) | Identical |

### 2.3 Findings from the audit that the migration must NOT reproduce
1. Public read of every language-lab submission (pending/rejected) incl. speaker names and audio; public submission endpoint unthrottled (section 11).
2. Photos/voice notes/audio stored as base64 data URLs in rows (up to 2.5 MB each, `MEDIUMTEXT`): bloats DB and backups (section 10).
3. `GET /marketplace/inquiries`, `POST …/inquiries`, `POST …/view` are unauthenticated/unthrottled; inquiries are a retired feature (3 endpoints have no frontend caller).
4. `forgot-password` returns the reset token in non-production; production needs real delivery (SMTP/SMS) (D6).
5. `PATCH /expert-requests/demo/:id/reply` and the demo queue are prototype constructs; real expert flow is `/expert/*` + `/farmer/questions`.
6. `SESSION_SECRET` fallback: without it Node uses an ephemeral secret (sessions die on restart) and a **fixed dev constant** for owner-key hashing. PHP must refuse to start without a real secret, and migrated hashes must be re-computed or verified under the same secret (section 8.3).
7. CORS allow-headers list lacks `Idempotency-Key`, `X-Listing-Key`, `X-Requester-Key` (harmless today because the app is same-origin; keep same-origin only).
8. `/api/v1/health` runs two DB queries and is polled every 30 s by every open phone (section 12.5).
9. Hard-coded model id for Gemini and no timeout/backoff policy documented (section 5.6).

## 3. Endpoint inventory (61 endpoints, generated from the route files)

Conventions (all endpoints): base `/api/v1`; JSON in/out; errors `{"error":{"code":"…","message":"…"}}` with HTTP status; state-changing methods
need `X-CSRF-Token`; cookies `credentials: include`. "Frontend callers" lists files that call the endpoint through `apiFetch`/`fetch`.
**58 of 61 endpoints are used by the frontend; 3 are not** (`GET /public/home`, `POST /marketplace/listings/:id/inquiries`, `PATCH /marketplace/inquiries/:id`): keep them for API parity until D8 is decided.

| # | Method | Path | Access | Notes | Tables | Frontend callers |
|---|---|---|---|---|---|---|
| 1 | GET | `/api/v1/health` | public |  | agricultural_guides, schema_migrations | usePWA.ts |
| 2 | GET | `/api/v1/csrf-token` | public |  |  | api.ts |
| 3 | GET | `/api/v1/public/home` | public |  | agricultural_guides, crops, guide_categories, platform_settings | (none: server/tests only) |
| 4 | GET | `/api/v1/crops` | public |  | crops | CropGuideManagementPage.tsx, ExpertRequestsPage.tsx, GuidesLibraryPage.tsx |
| 5 | GET | `/api/v1/categories` | public |  | guide_categories | CropGuideManagementPage.tsx, GuidesLibraryPage.tsx |
| 6 | GET | `/api/v1/guides` | public |  | agricultural_guides, crops, guide_categories, guide_translations | GuidesLibraryPage.tsx, PestsDiseasesPage.tsx, offlinePacks.ts |
| 7 | GET | `/api/v1/guides/:id` | public |  | agricultural_guides, crops, guide_categories, guide_translations | GuideDetailPage.tsx, OfflineLibraryPage.tsx, offlinePacks.ts |
| 8 | GET | `/api/v1/auth/me` | public |  |  | AppContext.tsx |
| 9 | POST | `/api/v1/auth/register` | public |  | farmer_profiles, language_preferences, platform_settings, roles, user_roles, users | RegisterPage.tsx |
| 10 | POST | `/api/v1/auth/login` | public |  | users | LoginPage.tsx |
| 11 | POST | `/api/v1/auth/logout` | public |  |  | AppContext.tsx |
| 12 | POST | `/api/v1/auth/forgot-password` | public |  | password_resets, users | LoginPage.tsx |
| 13 | POST | `/api/v1/auth/reset-password` | public |  | password_resets, users | LoginPage.tsx |
| 14 | POST | `/api/v1/advisor/ask` | public |  | advisor_conversations | AdvisorPage.tsx |
| 15 | GET | `/api/v1/advisor/history` | signed-in |  | advisor_conversations | AdvisorPage.tsx |
| 16 | POST | `/api/v1/advisor/save` | signed-in |  | saved_advice | AdvisorPage.tsx, GuideDetailPage.tsx |
| 17 | GET | `/api/v1/farmer/saved` | signed-in |  | saved_advice | FarmerDashboardPage.tsx, SavedAdvicePage.tsx |
| 18 | DELETE | `/api/v1/farmer/saved/:id` | signed-in |  | saved_advice | SavedAdvicePage.tsx |
| 19 | GET | `/api/v1/farmer/questions` | signed-in |  | advisory_questions, crops, users | ExpertRequestsPage.tsx, FarmerDashboardPage.tsx, MyQuestionsPage.tsx |
| 20 | POST | `/api/v1/farmer/questions` | signed-in | idempotent | advisory_messages, advisory_questions, crops | ExpertRequestsPage.tsx, FarmerDashboardPage.tsx, MyQuestionsPage.tsx |
| 21 | GET | `/api/v1/farmer/questions/:id` | signed-in |  | advisory_messages, advisory_questions, crops, users | MyQuestionsPage.tsx |
| 22 | POST | `/api/v1/farmer/questions/:id/messages` | signed-in |  | advisory_messages, advisory_questions | MyQuestionsPage.tsx |
| 23 | GET | `/api/v1/profile` | signed-in |  |  | AppContext.tsx, ProfilePreferencesPage.tsx |
| 24 | PATCH | `/api/v1/profile` | signed-in |  | farmer_profiles, language_preferences, users | AppContext.tsx, ProfilePreferencesPage.tsx |
| 25 | POST | `/api/v1/feedback` | public |  | feedback | ContactFeedbackPage.tsx |
| 26 | GET | `/api/v1/expert/questions` | role: expert, admin |  | advisory_questions, crops, users | AssignedQuestionsPage.tsx, ExpertDashboardPage.tsx |
| 27 | GET | `/api/v1/expert/questions/:id` | role: expert, admin |  | advisory_messages, advisory_questions, crops, users | AnswerQuestionPage.tsx |
| 28 | POST | `/api/v1/expert/questions/:id/respond` | role: expert, admin |  | advisory_messages, advisory_questions | AnswerQuestionPage.tsx |
| 29 | PATCH | `/api/v1/expert/profile` | role: expert |  | expert_profiles | ExpertProfilePage.tsx |
| 30 | GET | `/api/v1/admin/overview` | role: admin |  | advisory_questions, agricultural_guides, audit_logs, expert_profiles, feedback, roles, user_roles, users | AdminOverviewPage.tsx |
| 31 | GET | `/api/v1/admin/users` | role: admin |  | farmer_profiles, roles, user_roles, users | FarmerManagementPage.tsx |
| 32 | PATCH | `/api/v1/admin/users/:id/status` | role: admin |  | users | FarmerManagementPage.tsx |
| 33 | GET | `/api/v1/admin/experts` | role: admin |  | expert_profiles, users | ExpertManagementPage.tsx, QuestionManagementPage.tsx |
| 34 | POST | `/api/v1/admin/experts` | role: admin |  | expert_profiles, roles, user_roles, users | ExpertManagementPage.tsx, QuestionManagementPage.tsx |
| 35 | PATCH | `/api/v1/admin/experts/:id/status` | role: admin |  | expert_profiles | ExpertManagementPage.tsx |
| 36 | GET | `/api/v1/admin/guides` | role: admin |  | agricultural_guides, crops, guide_categories | AdvisoryContentReviewPage.tsx, CropGuideManagementPage.tsx |
| 37 | POST | `/api/v1/admin/guides` | role: admin |  | agricultural_guides, crops | AdvisoryContentReviewPage.tsx, CropGuideManagementPage.tsx |
| 38 | POST | `/api/v1/admin/guides/:id/review` | role: admin |  | agricultural_guides, guide_reviews | AdvisoryContentReviewPage.tsx |
| 39 | GET | `/api/v1/admin/questions` | role: admin |  | advisory_questions, crops, users | QuestionManagementPage.tsx |
| 40 | POST | `/api/v1/admin/questions/:id/assign` | role: admin |  | advisory_questions, expert_assignments, expert_profiles | QuestionManagementPage.tsx |
| 41 | GET | `/api/v1/admin/feedback` | role: admin |  | feedback | ReportsAuditLogsPage.tsx |
| 42 | GET | `/api/v1/admin/audit-logs` | role: admin |  | audit_logs, users | ReportsAuditLogsPage.tsx |
| 43 | GET | `/api/v1/admin/settings` | role: admin |  | platform_settings | PlatformSettingsPage.tsx |
| 44 | PATCH | `/api/v1/admin/settings` | role: admin |  | platform_settings | PlatformSettingsPage.tsx |
| 45 | GET | `/api/v1/marketplace/listings` | public |  | marketplace_inquiries, marketplace_listings | CropsLibraryPage.tsx, DemoFarmerDashboardPage.tsx, FarmerDashboardPage.tsx, LivestockPage.tsx, MarketplacePage.tsx, PrototypeManagementPage.tsx, syncEngine.ts |
| 46 | POST | `/api/v1/marketplace/listings/:id/view` | public |  | marketplace_listings | MarketplacePage.tsx |
| 47 | POST | `/api/v1/marketplace/listings` | public | idempotent | marketplace_listings | CropsLibraryPage.tsx, DemoFarmerDashboardPage.tsx, FarmerDashboardPage.tsx, LivestockPage.tsx, MarketplacePage.tsx, PrototypeManagementPage.tsx, syncEngine.ts |
| 48 | PATCH | `/api/v1/marketplace/listings/:id` | public |  | marketplace_listings | MarketplacePage.tsx, syncEngine.ts |
| 49 | DELETE | `/api/v1/marketplace/listings/:id` | public |  | marketplace_listings | MarketplacePage.tsx, syncEngine.ts |
| 50 | GET | `/api/v1/marketplace/inquiries` | public |  | marketplace_inquiries, marketplace_listings | DemoFarmerDashboardPage.tsx, FarmerDashboardPage.tsx |
| 51 | POST | `/api/v1/marketplace/listings/:id/inquiries` | public |  | marketplace_inquiries, marketplace_listings | (none: server/tests only) |
| 52 | PATCH | `/api/v1/marketplace/inquiries/:id` | public |  | marketplace_inquiries, marketplace_listings | (none: server/tests only) |
| 53 | GET | `/api/v1/language-lab/recordings` | public |  | local_language_recordings | LanguageLabPage.tsx, PrototypeManagementPage.tsx |
| 54 | POST | `/api/v1/language-lab/recordings` | public |  | local_language_recordings | LanguageLabPage.tsx, PrototypeManagementPage.tsx |
| 55 | PATCH | `/api/v1/language-lab/recordings/:id/review` | role: expert, admin |  | local_language_recordings | LanguageLabPage.tsx, PrototypeManagementPage.tsx |
| 56 | GET | `/api/v1/expert-requests/demo` | public |  | demo_expert_requests | DemoFarmerDashboardPage.tsx, ExpertSupportPage.tsx, PrototypeManagementPage.tsx, syncEngine.ts |
| 57 | POST | `/api/v1/expert-requests/demo` | public | idempotent | demo_expert_requests | DemoFarmerDashboardPage.tsx, ExpertSupportPage.tsx, PrototypeManagementPage.tsx, syncEngine.ts |
| 58 | PATCH | `/api/v1/expert-requests/demo/:id/reply` | role: expert, admin |  | demo_expert_requests | ExpertSupportPage.tsx |
| 59 | GET | `/api/v1/prototype/management-summary` | public |  | advisory_questions, agricultural_guides, demo_expert_requests, local_language_recordings, marketplace_inquiries, marketplace_listings, roles, user_roles | MinistryDashboardPage.tsx, OfflineDownloadsPage.tsx, PrototypeManagementPage.tsx |
| 60 | POST | `/api/v1/demo/reset` | role: admin |  |  | DemoModePage.tsx |
| 61 | POST | `/api/v1/admin/marketplace/:id/moderate` | role: admin |  | marketplace_listings | PrototypeManagementPage.tsx |

## 4. Frontend dependency contract (what the PHP API must not break)

The frontend is the fixed point. It depends on the following server behaviour; each item has a parity test (section 14).

1. **Transport** (`src/lib/api.ts`): every call is `fetch('/api/v1' + path, {credentials:'include'})`; JSON bodies; error body parsed as `{error:{code,message}}`
   (falls back to `message`); `403 CSRF_INVALID` triggers exactly one retry after re-fetching `GET /csrf-token`.
2. **Custom headers sent by the app:** `X-CSRF-Token`, `Idempotency-Key` (offline sync creates), `X-Listing-Key` (listing edit/delete), `X-Requester-Key` (expert requests). They must never appear in URLs or logs.
3. **Response shapes relied on:** the allow-listed listing JSON (`can_manage`, `phone_consent`, `updated_at`, `image_url`…); `{listing:{id,updated_at}, replayed?}` on create/update; expert request JSON with `is_mine`/`can_reply`; guides (`languageCode`, `fallbackApplied`, `version`, `lastReviewedAt`, `crop`, `category`); `auth/me` user object with `roles`, `expertStatus`, `county`.
4. **Timestamp strings:** the client stores `listing.updated_at` and returns it as `baseUpdatedAt` for conflict detection. The string must round-trip unchanged (section 9.4).
5. **Server ids are stored on phones.** IndexedDB `guides` is keyed by server guide id; `drafts`/`questions` records keep `serverId`; `localStorage` holds `agri_listing_keys_v1` (`{listingId: key}`) and `agri_requester_key_v1`. **The migration must preserve every primary key** and the key-hash secret (section 8).
6. **Static assets the client verifies:** `/offline-img/*.webp` (must answer `image/*`; the client rejects HTML with status 200), `/audio/**/*.m4a` (`audio/mp4`, exact byte length — the client rejects any size mismatch), `/src/assets/images/*` (copied into `dist/src/assets` by the Vite plugin `copy-unbundled-src-assets`; 9 files), `/manifest.webmanifest`, `/sw.js`, `/pwa-*.png`. **Missing files must be real 404s, never the SPA HTML.**
7. **Service-worker routes:** NetworkFirst cache for `GET /api/v1/(crops|categories|guides)` (cache `agri-public-guides-api`); these must stay plain cacheable 200 JSON.
8. **Health probe:** `GET /api/v1/health?_=<ts>` every 30 s per open phone, 4 s timeout; "online" means HTTP 200.
9. **Shared source files:** the frontend imports `server/constants.ts` (counties, marketplace categories/units) and `src/lib/phone.ts` (also used by the server). They stay in the repo as the single source of truth; PHP gets ports verified by shared test vectors and a build-time JSON export of the constants.
10. **Language codes** `en, bas, man, kpe, lre`; guide `lang` query with English fallback; the Offline Library bundles its own content (no server dependency beyond downloads).

## 5. Target PHP architecture

### 5.1 Principles
Plain PHP 8.2+ with PDO, no heavy framework (shared hosting, no Composer on the server, small attack surface). Strict types, one front controller, small
classes, PSR-4 style autoloading with a hand-written autoloader (no vendor directory needed in production). Extensions required: `pdo_mysql`, `sodium`,
`mbstring`, `openssl`, `curl`, `fileinfo`, `gd` or `imagick` (image re-encode). Dev tools (PHPUnit, PHPStan) via Composer locally only.

### 5.2 Layout (application code lives ABOVE the web root)
```
~/agri/                         (private; not served)
  app/        Http/ (Request, Response, Router), Middleware/, Controllers/, Services/, Repositories/, Support/
  config/     config.php (reads .env), routes.php (the 61-endpoint table above)
  migrations/ 001…NNN_*.sql (MySQL, forward-only)
  bin/        migrate.php, migrate-sqlite-to-mysql.php, bootstrap-admin.php, cron-purge.php
  storage/    uploads/ (private files), logs/, cache/
  .env        (chmod 600; never in Git)
~/public_html/                  (web root = built React app)
  index.html, assets/, sw.js, manifest.webmanifest, offline-img/, audio/, src/assets/images/
  api/index.php + api/.htaccess (front controller; requires ../../agri/app via absolute path)
```
### 5.3 Request lifecycle
`api/index.php` → load config → security headers → CORS (same-origin only) → body size/JSON parse (4 MB, same as Node) → session middleware (verify `agri_session`)
→ CSRF (non-GET) → router → route middleware (`auth`, `role`, `rateLimit`, `idempotent`) → controller → service → repository (PDO prepared statements only) → JSON response.
A single exception handler returns `{error:{code,message}}` with correct status; stack traces and SQL never leave the server; each request gets a random request id (logged, returned as `X-Request-Id`).
### 5.4 Database access
`PDO(mysql:…;charset=utf8mb4)`, `ERRMODE_EXCEPTION`, `EMULATE_PREPARES=false`, `FETCH_ASSOC`; session `SET time_zone='+00:00', sql_mode='STRICT_ALL_TABLES,…'`; transactions for multi-statement writes (question + first message; sync idempotency + business write); no string-built SQL — dynamic filters (marketplace) build `WHERE` from a fixed allow-list of columns with bound parameters, like the Node code.
### 5.5 Controllers
One controller per route group mirroring Node: `Health, Auth, Public (crops/categories/guides/home), Advisor, Farmer, Expert, Admin, Marketplace, LanguageLab, ExpertRequests, Prototype`. Each endpoint's validation rules, limits and status codes are ported from the Node handler (the endpoint table + Node tests are the specification).
### 5.6 Gemini advisor
Server-side `curl` to the Gemini REST API with `AI_TIMEOUT_MS`, model id from `GEMINI_MODEL` (**the current hard-coded `gemini-4-hydrogen` is unverified and must be validated against the real model list before go-live**), key only in `.env`, prompts/answers not logged, same per-IP/user quotas, same honest "AI not configured / provider failed" fallback payload and `provider_mode` values. A circuit-breaker (skip the call for 60 s after 3 failures) protects shared-hosting worker limits.
### 5.7 Mail
Password reset needs real delivery (SMTP via Hostinger mailbox, or an HTTP mail API). Tokens are stored hashed (`password_resets.token_hash`), 1-hour expiry, single use; the response never reveals whether the account exists; the dev-mode token echo is removed (D6).

## 6. Security design

### 6.1 Sessions and cookies
Port `signSessionToken/verifySessionToken` byte-for-byte (JSON payload `{uid,exp}`, base64url, HMAC-SHA256, `hash_equals`). Cookies: `agri_session` (HttpOnly), `agri_anon` (HttpOnly), `agri_csrf` (script-readable), `Path=/`, 7-day life. **Current Node behaviour:** over HTTP `SameSite=Lax`; over HTTPS `SameSite=None; Secure; Partitioned` (added so the app works inside embedded preview iframes). For a same-origin production site `SameSite=Lax; Secure` is stricter and sufficient, so the recommendation is Lax + Secure (D11); the iframe-compatible variant stays available behind an env flag for demos. HTTPS is detected from `$_SERVER['HTTPS']` or a trusted `X-Forwarded-Proto`. Regenerate the session cookie on login; clear all three on logout. The secret comes only from `.env` (`SESSION_SECRET` ≥ 32 random bytes); the API refuses to boot without it.
### 6.2 CSRF
Double-submit exactly as today: token issued by `GET /csrf-token` (also set on first response), compared to `X-CSRF-Token` with `hash_equals` for POST/PATCH/DELETE; failure → `403 {code:'CSRF_INVALID'}`. Idempotency replays are still CSRF-checked.
### 6.3 Passwords (existing hashes keep working)
Legacy format `<32-hex-char salt>:<128-hex derived>` from Node `scrypt(password, salt-as-UTF-8-string, 64)` with Node defaults N=16384, r=8, p=1.
**Verified on this machine (PHP 8.5.5, read-only test):** `sodium_crypto_pwhash_scryptsalsa208sha256(64, $password, $saltString, OPSLIMIT_INTERACTIVE, MEMLIMIT_INTERACTIVE)` reproduces the Node hash exactly (the 32-character salt string is exactly the 32 bytes libsodium requires); a wrong password does not match. Plan: detect legacy format by regex, verify with libsodium + `hash_equals`, and on successful login **rehash with `password_hash(PASSWORD_DEFAULT)`** (bcrypt/Argon2id) and store it; new accounts use `password_hash` only; `password_needs_rehash` on every login. No password resets are forced. Parity tests use hashes generated by Node for known passwords. If a host lacks `sodium` (unlikely on PHP 8.2+), fall back to a vetted pure-PHP scrypt (slow) or force a one-time reset (D4).
### 6.4 Role-based access control (server-verified on every route)
| Group | Access |
|---|---|
| Public reads (`health`, `crops`, `categories`, `guides*`, `marketplace/listings` GET, `language-lab/recordings` GET *(restricted, §11)*, `expert-requests/demo` GET *(own + samples, §2.2)*) | anyone |
| Auth (`register/login/logout/forgot/reset/me`) | anyone, rate-limited, CSRF-protected |
| `advisor/*`, `farmer/*`, `profile` | signed-in user, data scoped to `user_id` (404, not 403, for other people's rows) |
| `expert/*` | `expert` (status `approved`) or `admin` |
| `admin/*`, `demo/reset`, `admin/marketplace/*/moderate` | `admin` |
| Marketplace write/delete | admin, signed-in seller (`seller_user_id`), or holder of the listing key (`X-Listing-Key`) |
| Expert-request read | responders see all; owner device/account sees own; public sees fictional samples only |
| Expert reply, language review | `expert` (approved) or `admin`; reviewer name from the account |
Every authorization decision is made in PHP; nothing trusts client-sent flags, role names or `X-Role`-style headers (regression tests prove this today in Node).
### 6.5 Ownership keys (listings and expert requests)
256-bit device-generated secrets (64 hex chars; accepted pattern `^[A-Za-z0-9_-]{32,128}$`); server stores `HMAC-SHA256(secret, "listing-owner-v1:"+key)` / `"expert-requester-v1:"+key` and compares with `hash_equals`; never returned, logged or stored in the idempotency table (actors are scoped by a truncated hash). The HMAC secret must be the **same value Node used** (section 8.3).
### 6.6 Rate limiting (MySQL table, no Redis)
Reuse `rate_limit_attempts(rate_key, action_type, created_at)` with an index on `(rate_key, action_type, created_at)`; keys are HMAC'd IP or account id. Existing limits to port: register 10/h/IP; login 8/15 min per IP+identifier; forgot-password 5/h/IP; feedback 8/h/IP; AI anonymous `AI_ANON_DAILY_LIMIT` (5/day), signed-in `AI_AUTH_HOURLY_LIMIT` (30/h). **New limits proposed** (abuse paths found in the audit): marketplace create 20/h/IP, listing view counter 1 per listing per anon cookie per hour, inquiry create 10/h/IP, expert-request create 20/h/key+IP, language-lab submission 5/h/IP, uploads total bytes/day per IP. Over-limit → `429` JSON with `Retry-After`; the sync engine already treats 429 as retryable. A nightly cron deletes rows older than 2 days.
### 6.7 Audit logging
Same `audit_logs` table and the 20 existing action names (appendix B); keep HMAC'd IP; never store secrets, request bodies or key headers; add `request_id`. Admin read endpoint unchanged. Retention: 12 months then archive/delete by cron.
### 6.8 Headers, CORS, transport
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (as today) plus `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` (microphone self), HSTS once HTTPS is final, and a Content-Security-Policy introduced in report-only mode first. CORS: same-origin only (no cross-origin allow-list needed); if a staging origin must call production, allow-list it and add the three custom headers to `Access-Control-Allow-Headers`.
### 6.9 Input validation
Port validation exactly (lengths, enums, counties/categories/units from `server/constants.ts`, Liberian phone normalization from `src/lib/phone.ts`, price bounds, data-URL prefixes and sizes). Reject unknown JSON types, cap JSON depth, and set `post_max_size`/`upload_max_filesize` ≥ 8 MB. All output is JSON (no HTML), so XSS risk is in the React layer (already escaped).
### 6.10 Secrets and configuration
`.env` outside the web root, mode 600, never committed; separate DB user with least privilege (SELECT/INSERT/UPDATE/DELETE on the app schema only; the migration user is distinct and used only during deployment); keys: `SESSION_SECRET`, `OWNER_KEY_HMAC_SECRET` (may equal the legacy value), `GEMINI_API_KEY`, SMTP credentials, DB credentials. No credential appears in docs, logs, errors or the repository.

## 7. MySQL 8 schema

### 7.1 Conventions
InnoDB, `utf8mb4` / `utf8mb4_unicode_ci`, `BIGINT UNSIGNED` ids (preserving existing values), real foreign keys with the same `ON DELETE` rules as SQLite, indexes for every foreign key and every filter used by the API, `ENUM` for closed sets already enforced by SQLite `CHECK` constraints, `VARCHAR` (validated in PHP) for sets that change with product decisions (marketplace categories/units), `TINYINT(1)` booleans, `JSON` (or `LONGTEXT` + `JSON_VALID` check on MariaDB) for `*_json` columns.
**Timestamps (D1):** use `DATETIME(3)` in UTC (not `TIMESTAMP`, avoiding the 2038 limit and session-timezone drift) and set the session `time_zone='+00:00'`. **Do not use `ON UPDATE CURRENT_TIMESTAMP` on `marketplace_listings.updated_at`:** MySQL would bump it on every view-count increment and cause false `409 CONFLICT` for offline edits (SQLite only changes it on real edits). Application code sets `updated_at` explicitly.
`database/mysql/001_initial_schema.sql` already defines 19 tables; migration `M001` supersedes it with the changes above (it used `TIMESTAMP`).
### 7.2 Table mapping (27 SQLite tables → MySQL)
| SQLite table | In `mysql/001` today | Plan |
|---|---|---|
| schema_migrations, roles, users, user_roles, farmer_profiles, expert_profiles, language_preferences, crops, guide_categories, agricultural_guides, guide_translations, guide_reviews, advisory_questions, advisory_messages, expert_assignments, saved_advice, feedback, rate_limit_attempts, audit_logs | yes (19) | Keep columns/constraints; switch timestamps to `DATETIME(3)` UTC; add missing indexes (`idx_guides_public`, `idx_questions_*`, `idx_rate_limit_lookup`); add `audit_logs.request_id` |
| advisor_conversations, password_resets, platform_settings | **no** | New (7.3) — `platform_settings.key` is reserved in MySQL → `setting_key` |
| marketplace_listings (+ migrations 002/003/005 columns), marketplace_inquiries | **no** | New (7.3) |
| local_language_recordings, demo_expert_requests (+ migration 006) | **no** | New (7.3) |
| sync_operations (migration 004) | **no** | New (7.3) |
**Result:** 8 tables are missing from the existing MySQL schema; the 9 columns added by later SQLite migrations (003, 005, 006) are folded into the `CREATE` statements below.
### 7.3 DDL for the missing tables
```sql
CREATE TABLE marketplace_listings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_user_id BIGINT UNSIGNED NULL,
  owner_token VARCHAR(80) NOT NULL DEFAULT '',        -- LEGACY: never read for authorisation, never returned; kept only for audit/rollback
  owner_key_hash CHAR(64) NOT NULL DEFAULT '',        -- HMAC of the per-listing secret; '' = legacy row (admin/seller-user only)
  seller_name VARCHAR(80) NOT NULL,
  farm_name VARCHAR(80) NOT NULL DEFAULT '',
  category VARCHAR(40) NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  quantity VARCHAR(40) NOT NULL,
  unit VARCHAR(40) NOT NULL,
  price_lrd INT UNSIGNED NOT NULL,
  county VARCHAR(30) NOT NULL,
  town VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  image_url MEDIUMTEXT NOT NULL,                      -- path or data URL (phase B: file path, §10)
  availability_status ENUM('Available','Limited Stock','Sold Out') NOT NULL DEFAULT 'Available',
  seller_phone VARCHAR(30) NOT NULL DEFAULT '',
  phone_consent TINYINT(1) NOT NULL DEFAULT 0,
  phone_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_fictional_seller TINYINT(1) NOT NULL DEFAULT 1,
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_demo_listing TINYINT(1) NOT NULL DEFAULT 1,
  moderation_status ENUM('approved','flagged','hidden') NOT NULL DEFAULT 'approved',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),   -- no ON UPDATE (see 7.1)
  KEY idx_mkt_filter (moderation_status, category, county),
  KEY idx_mkt_seller (seller_user_id),
  CONSTRAINT fk_mkt_seller FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE marketplace_inquiries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id BIGINT UNSIGNED NOT NULL,
  buyer_user_id BIGINT UNSIGNED NULL,
  buyer_token VARCHAR(80) NOT NULL DEFAULT '',
  buyer_name VARCHAR(80) NOT NULL,
  buyer_phone VARCHAR(30) NOT NULL DEFAULT '',
  buyer_county VARCHAR(30) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  status ENUM('New','Farmer Replied','Closed') NOT NULL DEFAULT 'New',
  farmer_reply VARCHAR(1000) NOT NULL DEFAULT '',
  is_demo_inquiry TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_inq_listing (listing_id), KEY idx_inq_buyer (buyer_user_id),
  CONSTRAINT fk_inq_listing FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_inq_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE local_language_recordings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  language_code ENUM('en','bas','man','kpe','lre') NOT NULL,
  topic_slug VARCHAR(60) NOT NULL,
  topic_label VARCHAR(80) NOT NULL,
  question_text VARCHAR(400) NOT NULL,
  answer_text VARCHAR(1200) NOT NULL,
  local_phrase_gloss VARCHAR(400) NOT NULL DEFAULT '',
  audio_data_url MEDIUMTEXT NULL,                     -- phase B: audio_path VARCHAR(255) (private file, §10/§11)
  speaker_name VARCHAR(80) NOT NULL,
  consent_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  review_status ENUM('reviewed','pending_review','needs_rerecording') NOT NULL DEFAULT 'pending_review',
  is_sample_demo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_llr_public (review_status, language_code, topic_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE demo_expert_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  requester_token VARCHAR(80) NOT NULL DEFAULT '',     -- LEGACY / seeded-sample marker only; never returned
  requester_key_hash CHAR(64) NOT NULL DEFAULT '',
  farmer_name VARCHAR(80) NOT NULL,
  category VARCHAR(80) NOT NULL,
  county VARCHAR(30) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(2500) NOT NULL,
  photo_data_url MEDIUMTEXT NULL,                     -- phase B: private file path
  voice_note_data_url MEDIUMTEXT NULL,                -- phase B: private file path
  voice_note_summary VARCHAR(400) NOT NULL DEFAULT '',
  status ENUM('Submitted','Assigned','Answered') NOT NULL DEFAULT 'Submitted',
  assigned_expert_name VARCHAR(80) NOT NULL DEFAULT 'Demo Extension Queue (Simulated)',
  expert_reply VARCHAR(2500) NOT NULL DEFAULT '',
  is_simulated_demo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_der_owner (requester_key_hash), KEY idx_der_user (user_id),
  CONSTRAINT fk_der_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sync_operations (
  actor VARCHAR(100) NOT NULL,
  op_key VARCHAR(100) NOT NULL,
  kind VARCHAR(64) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL,             -- 0 = reserved while the write is in flight (§9.2)
  response_json MEDIUMTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (actor, op_key),
  KEY idx_sync_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE advisor_conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  anon_token VARCHAR(80) NULL,
  crop_slug VARCHAR(60) NULL,
  question_text TEXT NOT NULL,
  answer_json JSON NOT NULL,
  provider_mode VARCHAR(40) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_adv_user (user_id, created_at),
  CONSTRAINT fk_adv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_pr_hash (token_hash), KEY idx_pr_user (user_id),
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
Index key-length check: `sync_operations` PK = 2 × VARCHAR(100) × 4 bytes = 800 bytes < 3072.
MariaDB note: if Hostinger provides MariaDB instead of MySQL 8, `JSON` becomes `LONGTEXT` with `CHECK (JSON_VALID(...))`; everything else is compatible. **Confirm the hosting plan's engine before M2 (D5).**

## 8. SQLite → MySQL data migration (no record lost, SQLite never modified)

### 8.1 Principles
1. **Read-only source:** open the SQLite file with `?mode=ro` + `PRAGMA query_only=ON` on a **copy** taken with `sqlite3 .backup` while the Node server is stopped (WAL checkpointed). The live `data/agri_advisory.db*` is never written.
2. **Preserve primary keys.** Phones hold server ids (guides, listing ids, key maps). Insert explicit ids and then set `AUTO_INCREMENT` to `MAX(id)+1`.
3. **Re-runnable and verifiable:** the utility targets an *empty* MySQL schema by default (`--force-target` required otherwise), runs in one transaction per table in FK order, and emits a JSON report.
4. **Dry run first** (`--dry-run`: read, transform, validate, write nothing).
### 8.2 Order and transformations
Order: `roles → users → user_roles → farmer_profiles → expert_profiles → language_preferences → crops → guide_categories → agricultural_guides → guide_translations → guide_reviews → advisory_questions → advisory_messages → expert_assignments → saved_advice → advisor_conversations → feedback → password_resets → platform_settings → marketplace_listings → marketplace_inquiries → local_language_recordings → demo_expert_requests → sync_operations → audit_logs → rate_limit_attempts (optional: skip, they expire)`.
| Source | Transform |
|---|---|
| `TEXT` timestamps `YYYY-MM-DD HH:MM:SS` (UTC) | → `DATETIME(3)` with `.000`; reject unparsable values and report them |
| `INTEGER` 0/1 | → `TINYINT(1)` |
| `*_json` text | → `JSON` (validate with `json_decode`; invalid rows listed, not dropped silently) |
| `CHECK` enums | verify every value is in the ENUM set before insert |
| `platform_settings.key` | → `setting_key` |
| `password_hash` scrypt strings | copied unchanged (verified compatible, §6.3) |
| `owner_token`, `requester_token` legacy columns | copied unchanged for audit/rollback; never read or returned |
| `owner_key_hash`, `requester_key_hash`, `sync_operations.actor` | copied **only if the HMAC secret is the same** (§8.3) |
| Base64 `*_data_url` columns | phase A: copied as-is; phase B (D2): extracted to private files, DB keeps a path, API still returns the same JSON shape |
### 8.3 Secret continuity (critical)
The stored hashes depend on the HMAC key. Node uses `SESSION_SECRET` when it is ≥16 characters; **otherwise a fixed development constant** for owner/requester keys (and an ephemeral random value for sessions). Before cutover, record which case production was in. PHP is configured with `OWNER_KEY_HMAC_SECRET` equal to that exact value, so every existing listing/request key keeps working. If the value is unknown or compromised, there are two safe options: (a) leave `owner_key_hash=''` (owners fall back to account/admin, as legacy rows do today), or (b) rotate by letting each phone re-bind its key on next sign-in (requires an explicit re-claim flow — out of scope unless approved).
### 8.4 Verification (all must pass before cutover)
Per-table row counts equal; `SUM(id)`/`MAX(id)` equal; per-table checksum of a canonical serialization (ordered by id, normalised booleans/timestamps); FK orphan queries return 0; a sample of 50 random rows per table compared field-by-field; **API contract diff**: the same 40-request script run against Node(SQLite copy) and PHP(MySQL) returns identical normalised JSON (section 14); login works for the demo admin/expert/farmer accounts with their existing passwords.
### 8.5 What is not migrated
Phone-side data (IndexedDB, localStorage, service-worker caches) never moves; it keeps working because ids, keys and URLs are unchanged. `rate_limit_attempts` can be skipped. `sync_operations` rows are migrated so an offline create whose reply was lost on Node still dedupes after cutover.
### 8.6 Cutover window
Announce read-only (Node returns 503 JSON for writes) → final backup copy → migrate → verify → switch DNS/`.htaccess` → smoke tests → reopen writes. Phones retry 503/network errors automatically (the sync engine already backs off), so queued items survive the window.

## 9. Offline synchronization compatibility

The sync engine and all client code stay unchanged. The PHP API must honour this contract.
### 9.1 Idempotent creates
`POST /marketplace/listings`, `POST /expert-requests/demo`, `POST /farmer/questions` accept `Idempotency-Key` (pattern `^[A-Za-z0-9._:-]{8,100}$`, else 400). Actor = signed-in user, else `owner:<hash(ownerKey)[:32]>` / `requester:<hash(requesterKey)[:32]>` / `ip:<ip>`. First 2xx response is stored; repeats return the stored status + body + `"replayed":true` + `Idempotent-Replay: true`; same key on another endpoint kind → `422 IDEMPOTENCY_KEY_REUSED`; non-2xx is never stored (a corrected retry is allowed); rows older than 30 days are purged by cron.
### 9.2 Race safety on MySQL (new requirement)
Node's handlers are synchronous, so check-then-insert cannot interleave; PHP requests are concurrent. Use **one transaction**: `INSERT sync_operations(actor,op_key,kind,status_code=0)` first (primary-key conflict ⇒ rollback, read the committed row, replay it; a concurrent in-flight duplicate blocks on the row lock until the first commits) → perform the business write → `UPDATE sync_operations SET status_code, response_json` → `COMMIT`. A failed write rolls back the reservation, so failures are never cached and a lost response can never create a second row.
### 9.3 Ownership keys, retries and consent
Create stores `owner_key_hash` (anonymous callers must supply a valid key, else 400); edits/deletes require admin, seller account, or the key via `X-Listing-Key`; the key is never in responses, idempotency rows or logs. Retry classes the client relies on: network/timeouts, 408, 425, 429, 5xx → retry with back-off; 400/401/403/409/422 → stop and show the message. PHP must therefore return JSON for every error (including fatals: `display_errors=0`, a global handler, and an `ErrorDocument 500` JSON stub under `/api`), `503` for DB outages, and `429` with `Retry-After`. With an `Idempotency-Key` and no consent, no phone number is stored or returned.
### 9.4 Conflict detection
`PATCH /marketplace/listings/:id` accepts `baseUpdatedAt`; if it differs from the stored `updated_at` → `409 {code:'CONFLICT'}` and nothing changes. Requirements: `updated_at` is set only by real edits (no `ON UPDATE`, §7.1); the string returned to the client is the exact string compared later; with `DATETIME(3)` the format is `YYYY-MM-DD HH:MM:SS.mmm` (D1) — compare as parsed UTC instants and accept both forms during transition so phones that stored second-precision values still work. Two edits within the same millisecond are impossible to distinguish; if stronger guarantees are wanted add an integer `version` column and return it alongside `updated_at` (D1b).
### 9.5 Other offline-sensitive behaviour
Guides/crops/categories endpoints stay cacheable plain 200 JSON; `/health` is cheap (§12.5); expert-request visibility rules (own via key/account, samples public, responders all) and `is_mine/can_reply` flags unchanged; the three headers are same-origin so no preflight is triggered.

## 10. Secure file uploads and static assets
### 10.1 Today
Photos (listings, expert requests), voice notes and language-lab audio travel as base64 data URLs in JSON (≤ 2.5 MB each, 4 MB body cap) and are stored in `MEDIUMTEXT` columns. The client already compresses photos to ≈100 KB (JPEG) and voice notes to ≈24 kbps.
### 10.2 Plan (decision D2)
- **Phase A (parity, recommended first):** keep the JSON shape and the data-URL columns; add stricter server checks (decode base64, verify real MIME with `finfo`, re-encode images through GD/Imagick to strip metadata, cap decoded size, reject unexpected types).
- **Phase B (hardening, after parity):** store files **outside the web root** (`storage/uploads/{listings|requests|lab}/<random>.<ext>`, random 128-bit names, no user-controlled paths), keep a DB path, and serve through an authorised PHP route (`GET /api/v1/files/:kind/:id`) with ownership/role checks, `Content-Type` from the verified type, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cache-Control: private`. Listing photos are public once the listing is approved; expert-request photos/voice notes are private to the requester + responders; language-lab audio follows §11. Migrate existing data URLs to files with the data-migration utility. Add a size/day quota per IP and a nightly orphan-file sweep.
- Never execute uploads (store without extension mapping to code, `.htaccess` deny in `storage/` even though it is above the web root), never trust client MIME or filename, no archives or SVG uploads, optional ClamAV hook if the host offers it (not available on most shared plans — documented residual risk).
### 10.3 Static PWA assets (served by Apache, not PHP)
`.htaccess` serves `index.html` only for **non-file, non-API, non-asset** paths. Real 404 (not the SPA) for `/audio/*`, `/offline-img/*`, `/assets/*`, `/src/assets/*`, `/api/*`. MIME types: `.webmanifest` → `application/manifest+json`, `.m4a` → `audio/mp4`, `.webp` → `image/webp`. `Content-Length` must equal the file size (client verifies 110284 for the demo audio). Caching: `sw.js` and `index.html` `no-cache`; hashed `/assets/*` `immutable` 1 year; `/audio` and `/offline-img` 30 days with ETag.

## 11. Language Lab privacy and security (remaining issues from the Node audit)
| # | Issue today | Planned control |
|---|---|---|
| L1 | `GET /language-lab/recordings` is public and returns **pending and rejected** submissions with the consenting speaker's name and audio | Public list returns only `review_status='reviewed'`; reviewers/admins see all; speaker name shown only if the speaker consented to attribution (`show_name` flag), otherwise "Community speaker"; audio of non-reviewed items is private |
| L2 | `POST /language-lab/recordings` is unauthenticated and unthrottled | Rate limit 5/h/IP (+ per anon cookie), size cap, MIME/duration validation, optional honeypot field; submissions stored `pending_review` regardless of the body (already enforced) |
| L3 | Consent is a boolean only | Store `consent_version`, `consent_text_hash`, `consent_at`, and what was consented to (attribution, public use, research); consent for children/third parties requires a guardian flag |
| L4 | No way to withdraw | Add `DELETE/withdraw` for the submitter (key or account) and an admin takedown that removes audio files and nulls personal fields; audit-logged; retention policy documented |
| L5 | Audio as base64 in rows | Private files (§10 phase B), streamed through an authorised route with HTTP Range support |
| L6 | Only text/JSON validation | Verify real audio MIME and decoded size, cap duration, strip metadata where feasible, reject executables disguised as audio |
| L7 | Review state is a free enum | Add `reviewed_by`, `reviewed_at`, `review_note`; two-step approve (reviewer ≠ submitter where possible); reviewer actions audited (already `language_recording_reviewed`) |
| L8 | Native-speaker review of translations unverified | Public UI keeps "awaiting recordings / not reviewed" labels; no machine translation or synthetic voice is ever labelled as a native recording (already enforced client-side) |
| L9 | Speaker personal data (name, county) retained indefinitely | Minimise: store county-level only; delete or anonymise on withdrawal; export on request; document lawful basis |

## 12. Hostinger deployment architecture

### 12.1 Topology
Static React build + PHP API on the same domain (same-origin, no CORS): `https://<domain>/` serves `public_html/` (Apache/LiteSpeed); `/api/*` is handled by `public_html/api/index.php`; application code, `.env`, uploads and logs sit one level above `public_html`. One MySQL 8 database + one least-privilege DB user (second user for migrations). HTTPS is mandatory (PWA install, service worker, secure cookies) — Hostinger provides free TLS; force HTTP→HTTPS and add HSTS after verification.
### 12.2 PHP settings (hPanel → PHP Configuration or `.user.ini`)
PHP 8.2 or 8.3; enable `pdo_mysql, sodium, mbstring, openssl, curl, fileinfo, gd`; `display_errors=0`, `log_errors=1`, `post_max_size=8M`, `upload_max_filesize=8M`, `memory_limit≥128M`, `max_execution_time=30`, `session.use_cookies=0` (the app uses its own cookie, not PHP sessions), `expose_php=0`.
### 12.3 Sample `public_html/.htaccess` (to be finalised in M7)
```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
# API -> front controller
RewriteRule ^api/ - [L]
# real files and the asset folders are never rewritten (missing => genuine 404, not the SPA)
RewriteCond %{REQUEST_URI} ^/(audio|offline-img|assets|src/assets)/ [OR]
RewriteCond %{REQUEST_FILENAME} -f
RewriteRule ^ - [L]
# SPA fallback
RewriteRule ^ /index.html [L]
<FilesMatch "^(sw\.js|index\.html|manifest\.webmanifest)$">
  Header set Cache-Control "no-cache"
</FilesMatch>
AddType application/manifest+json .webmanifest
AddType audio/mp4 .m4a
```
`public_html/api/.htaccess`: route everything to `index.php`, `Options -Indexes`, deny dotfiles; `ErrorDocument 500` → a static JSON body so clients never see HTML errors.
### 12.4 Secrets, backups, cron
`.env` mode 600 above the web root; secrets only via hPanel/SFTP, never Git. Daily automated `mysqldump` (hPanel backups + a cron `mysqldump | gzip` to a private folder, 14-day retention) and a weekly off-host copy; uploads directory backed up with the DB. Cron (hPanel): every 15 min `bin/cron-purge.php` (rate-limit rows > 2 days, idempotency rows > 30 days, expired password resets), nightly audit-log retention and orphan-file sweep.
### 12.5 Capacity notes for shared hosting
Every open phone polls `GET /api/v1/health` every 30 s (client behaviour, cannot change without a frontend edit): make `/health` return a static JSON with no DB query and `Cache-Control: no-store`, and offer `/health?deep=1` (DB ping) for monitoring only. Expect CPU/process limits (LiteSpeed returns 503/508 under pressure — the client treats these as retryable). Keep PHP responses small (no unbounded lists; marketplace list gets a hard `LIMIT`/pagination default), use OPcache, avoid per-request heavy work (scrypt only at login), and put the 30-day purge off the request path.
### 12.6 Environments and release
Local dev: `/usr/local/bin/php` 8.5.x + local MySQL (XAMPP's PHP 8.0.28 is too old; use XAMPP MySQL/MariaDB only as a DB server). Staging: a second Hostinger subdomain with its own DB and `.env`, receiving an anonymised copy of the migrated data. Release = build React → upload `dist/` to `public_html/` → upload `app/` → run `bin/migrate.php` → smoke test → switch. Deploy via Git-based hPanel deploy or SFTP; keep the previous release folder for instant rollback.

## 13. Phased milestones and exit criteria

| M | Deliverable | Exit criteria (automated unless noted) |
|---|---|---|
| **M0** | Approval of this plan; answers to D1–D10; hosting plan confirmed (MySQL vs MariaDB, PHP version, SSH availability) | Written sign-off |
| **M1** | Test harness: refactor `tests/api.test.ts` into a black-box suite driven by `API_BASE_URL`; golden contract snapshots from Node; fixtures API for seeding | Suite runs green against Node unchanged (31 tests) |
| **M2** *(complete, accepted — `docs/M2_REPORT.md`)* | MySQL schema `M001` + migration runner; seed scripts (reference + prototype data) | Schema applies cleanly on MySQL 8 (and MariaDB if applicable); FK/index checks pass |
| **M3** *(implemented, awaiting review — `docs/M3_REPORT.md`)* | PHP core: front controller, router, request/response, PDO layer, error handler, config, logging, security headers, CORS | Health + `csrf-token` parity tests green; no HTML error leaks |
| **M4** | Auth: register/login/logout/me/forgot/reset, sessions, CSRF, password rehash, rate limits, audit | Auth parity + security tests green; Node-generated password hashes verify |
| **M5** | Read APIs: crops, categories, guides, public home, profile, saved advice, farmer questions, expert/admin endpoints | Contract diff identical on seeded data |
| **M6** | Marketplace + expert requests + language lab + sync (idempotency, ownership keys, conflicts, consent) | All Node security regression tests (20–31) and sync tests (15–19) green against PHP; concurrency test (parallel duplicate creates → one row) |
| **M7** | Uploads/static serving, `.htaccess`, SW/PWA header checks, Gemini advisor, mail | Browser offline scenarios pass on staging; asset 404/MIME/size checks pass; AI fallback verified (live AI only if a verified key/model is provided) |
| **M8** | SQLite→MySQL utility + dry run + rehearsal on a copy | Section 8.4 verification all green; rollback rehearsed |
| **M9** | Staging soak, security review, performance check, cutover rehearsal, **physical Android pass** | Checklists signed; go/no-go |
| **M10** | Production cutover, monitoring, 2-week Node fallback window | Error-rate/latency within thresholds; rollback not needed |
| **M11** *(separate, future; architecture decisions U1–U6 approved, implementation NOT authorized)* | USSD channel for basic phones through **one aggregator** serving MTN Liberia and Orange Liberia, one shared short code if approved: see `docs/USSD_PLAN.md` | Plan approved; simulator + adapters + admin green locally; live activation only after operator approval and M10 |

## 14. Automated parity and security tests
1. **Black-box suite:** `tests/api.test.ts` is rewritten to take `API_BASE_URL` (default: in-process Node). The 17 assertions that currently read SQLite through `getDb()` (hash storage, legacy rows, counts) move to a small **test-only admin fixture endpoint or CLI seed/inspect tool** that exists only in non-production builds (an adapter per backend), so the same 31 tests run on both servers.
2. **Contract snapshots:** record normalised Node responses (ids, timestamps and cookies masked) for a 40-request script covering every endpoint family; PHP must match field names, types, status codes and error codes.
3. **Security regression pack (must pass on PHP, already passing on Node):** no ownership/credential leakage in any response (listing, expert request, inquiry); unauthorised edit/delete/reply/review/reset refused with the right status and unchanged data; spoofed role headers/cookies/body ignored; legacy tokens ignored; CSRF missing/invalid; rate limits (429); SQL-injection strings in every filter; oversize and wrong-MIME uploads; idempotency replay/reuse/no-secret-storage; consent enforcement; admin-only `admin=1`.
4. **Concurrency tests (new for PHP):** 20 parallel identical idempotent creates → exactly one row; parallel edits with the same `baseUpdatedAt` → one 200 + 409s.
5. **Migration tests:** per-table counts/checksums, FK orphans, password verification with Node-made hashes, key-hash continuity (a listing key created on Node still authorises an edit on PHP).
6. **Unit parity vectors:** phone normalization (`src/lib/phone.ts`) and constants export compared between TypeScript and PHP.
7. **Frontend suites unchanged:** `npm run test:offline` (advisor 22, cache 6, inventory 3), lint, build; plus the documented browser scenarios (first install, Starter Pack, offline reopen, drafts, lost-response sync, low storage) run against staging in desktop Chrome and then on the physical phone.
8. **Static/PWA checks:** manifest/icons/SW headers, `sw.js` no-cache, missing asset → 404, `audio/mp4` + exact length, HTTPS redirect, cookie flags.
9. **Static analysis:** PHPStan level ≥6, `php -l`, secret scanning in CI, dependency audit.

## 15. Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| HMAC secret mismatch → owners lose listings/requests | Data access loss | §8.3; migration test that a Node-created key authorises on PHP; fall back to account/admin ownership |
| Timestamp format/precision → false 409 or missed conflicts | Offline edit failures | §7.1/§9.4, no `ON UPDATE`, accept both formats, optional `version` column |
| Concurrent duplicate creates on MySQL | Duplicate listings | Reservation-first transaction (§9.2) + concurrency test |
| Hostinger limits (CPU, processes, memory, no SSH) | 503/508, slow deploys | Lightweight `/health`, small payloads, OPcache, SFTP deploy scripts, retry-friendly client |
| MariaDB instead of MySQL 8 | `JSON`/syntax differences | Confirm plan (D5); keep DDL portable; CI on both |
| `sodium` extension missing | Cannot verify legacy hashes | Check in M0; fallback to pure-PHP scrypt or one-time reset (D4) |
| HTML error pages from the host | Client mis-handles errors | JSON `ErrorDocument`, global handler, tests |
| SPA fallback serving HTML for missing audio/images | Silent corruption of offline downloads | §10.3 rewrite rules + tests |
| Service worker caches the old API shapes after cutover | Stale behaviour | Same shapes (contract tests); bump cache names only if a shape changes; test the update prompt |
| Large base64 rows slow MySQL/backups | Performance | Phase B files; per-row caps; indexes |
| Secrets in logs/URLs | Credential leak | Header-only keys, redaction, log review in M9 |
| Gemini model id/key unverified | Advisor offline/fallback only | Configurable model, verify before go-live, honest fallback unchanged |
| Scope creep during parity | Delay | Parity first; hardening items tracked separately (§17) |

## 16. Rollback strategy
- **Before cutover:** everything is on a branch; Node + SQLite untouched and runnable. Rollback = do not switch.
- **Cutover rollback (first 14 days):** keep Node/SQLite available (or a frozen copy) and the previous `public_html` release. To roll back: restore the old `.htaccess`/DNS target, re-open Node writes. Data created on MySQL after cutover is exported by a reverse utility (`bin/export-mysql-to-sqlite.php`, written only if rollback is plausible) or replayed manually; the 14-day fallback window and a freeze announcement limit divergence.
- **Per-phase rollback:** MySQL migrations are forward-only and additive; each release is preceded by a verified `mysqldump`; restoring the dump + previous app folder returns the previous state. Feature flags (`.env`) can disable new endpoints/uploads phase B independently.
- **Client safety:** phones keep drafts and queued operations through any outage; idempotency keys make replays safe on either backend as long as `sync_operations` and the HMAC secret were carried over.
- **Never** delete SQLite files, Node code, or old migrations during the migration; archive them after the fallback window ends.

## 17. Decisions requested before implementation (approval gate)

**Owner decisions received (M1 authorisation):** React frontend, PHP 8.2+/PDO and the architecture approved; target MySQL 8 **with local and Hostinger compatibility to be verified**; IndexedDB/PWA/offline features preserved; **fresh authentication required when PHP goes live (D3 = force re-login; sessions are not carried over)**; existing accounts and password hashes preserved (D4 = libsodium verify + rehash on login); sensitive uploads and private data protected; **Language Lab privacy protections (D9: L1–L4 mandatory) required before public launch**; **production secrets must be explicit — never silently fall back to development credentials**; secure first-party cookies (D11 = `SameSite=Lax; Secure`, iframe-preview mode only behind a flag).
Consequences recorded: (a) PHP refuses to boot without `SESSION_SECRET` **and** `OWNER_KEY_HMAC_SECRET`; if production Node ran on the development fallback constant, that value must be set *explicitly and knowingly* for migrated owner-key hashes to keep working (flagged as a risk, §8.3); (b) because sessions are not carried over, the session cookie format may be changed freely.
**Approved since:** **D1** UTC `DATETIME(3)`, with modification timestamps unchanged by view-count-only updates; **D2** data-URL compatibility preserved through the migration, protected file storage as a later improvement. **D5 (partially answered):** local engine = MariaDB 10.4.28 (XAMPP); MySQL 8.0.44 is also available locally via MAMP; the Hostinger engine is still unverified. **Still open:** D6, D7, D8, D10, and the M2 decisions D12–D16 listed in `docs/M2_PREPARATION.md`.

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Timestamp type/precision (`DATETIME(3)` UTC; optional `version` column for conflicts) | `DATETIME(3)` + accept both formats; add `version` only if stricter conflicts are wanted |
| D2 | Uploads: data URLs first (phase A) then private files (phase B), or files from day one | Phase A for parity, phase B before public launch |
| D3 | Existing sessions: keep valid (same secret/format) or force re-login | Keep valid if the production secret is known; otherwise force re-login |
| D4 | Legacy scrypt passwords: verify via libsodium and rehash on login (recommended) vs force reset | libsodium + rehash |
| D5 | Hosting engine/version: confirm MySQL 8 vs MariaDB, PHP 8.2/8.3, SSH/Composer availability | Confirm in M0 |
| D6 | Password-reset delivery channel (SMTP mailbox vs SMS vs admin-assisted) | SMTP via a Hostinger mailbox |
| D7 | Anonymous ownership keys stay for demo mode vs require accounts for publishing | Keep keys for the hackathon; move real deployments to accounts |
| D8 | Retire the 3 unused endpoints (public/home, inquiries create/patch) | Keep until after parity, then retire inquiries |
| D9 | Language Lab: apply L1–L9 (public list = reviewed only, consent metadata, takedown) | Yes, L1–L4 mandatory before any public launch |
| D10 | Gemini: provide a verified model id + API key for staging, or ship with AI in honest-fallback mode | Fallback mode until a key/model is verified |
| D11 | Cookie policy in production: `SameSite=Lax; Secure` (recommended) vs keep Node's `None; Secure; Partitioned` iframe-preview mode | Lax + Secure, with the preview mode behind an env flag |

## Appendix A — configuration map (Node → PHP `.env`)
| Node | PHP | Notes |
|---|---|---|
| `SESSION_SECRET` | `SESSION_SECRET` | ≥32 bytes; required |
| (dev constant `agri-owner-key-dev-fallback` or `SESSION_SECRET`) | `OWNER_KEY_HMAC_SECRET` | must equal the value Node actually used (§8.3) |
| `DB_PATH` | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS` | least-privilege user |
| `APP_URL` | `APP_URL` | used for same-origin/CORS checks and reset links |
| `PORT`, `HOST` | — | not applicable |
| `NODE_ENV` | `APP_ENV` (`production`/`staging`) | gates test-only tooling |
| `GEMINI_API_KEY`, `AI_TIMEOUT_MS`, `AI_ANON_DAILY_LIMIT`, `AI_AUTH_HOURLY_LIMIT` | same names + `GEMINI_MODEL` | model must be verified |
| — | `MAIL_*` (SMTP) | password reset |
| — | `UPLOAD_DIR`, `LOG_DIR` | outside web root |

## Appendix B — audit actions to preserve
`expert_created, expert_request_replied, expert_responded, expert_status_updated, farmer_registered, guide_created, guide_reviewed, language_recording_reviewed, listing_delete_denied, listing_edit_denied, login_failed, login_success, logout, marketplace_moderated, password_reset_completed, password_reset_requested, question_assigned, question_submitted, settings_updated, user_status_changed` (+ new: `listing_created`, `upload_rejected`, `recording_withdrawn`, `rate_limited`).

## Appendix C — what this assessment changed in the repository
Only this document (`docs/PHP_MYSQL_MIGRATION_PLAN.md`) was rewritten. No code, schema, migration, dependency, SQLite file or frontend file was modified. No credentials appear in this document.


## Addendum — M2 decisions (approved)
**D12** portable `LONGTEXT` + `CHECK (JSON_VALID())`, NULL-tolerant. **D13** SQL portable across MySQL 8 and MariaDB 10.4+ until Hostinger is verified. **D14** demo accounts/prototype data never in production; admin from env-supplied credentials or protected CLI. **D15** data URLs preserved; if the production packet limit is too small use protected file storage, never truncate or silently reject. **D16** case-insensitive duplicate emails: stop and report, never merge or delete.
