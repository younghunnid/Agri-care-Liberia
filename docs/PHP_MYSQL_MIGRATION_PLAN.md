# PHP 8.x / MySQL migration plan (NOT started)

Status: **planning only.** No migration work has been done. The Node/Express + SQLite backend remains the reference implementation until
parity is proven. Target hosting is shared Apache + PHP + MySQL/MariaDB (no long-running Node process). Local development uses `/usr/local/bin/php`
(8.5.x); XAMPP's bundled PHP is 8.0.28 and is too old. Use a MySQL 8 or MariaDB 10.6+ database.

## 1. Principles
Separate branch off `feature/offline-first`; keep Node working; the React frontend and `/api/v1/*` contract do not change; every phase ends with a
parity check against the Node server; SQLite data is never modified (export, then import into MySQL).

## 2. Contract the PHP API must reproduce
- Cookies: HMAC-signed `agri_session`, `agri_anon`, readable `agri_csrf` (double-submit via `X-CSRF-Token`). Same names, flags (HttpOnly, SameSite, Secure
  behind HTTPS), expiry.
- Error shape `{error: {code, message}}`; status codes used by the client (401, 403 `CSRF_INVALID`, 409 `CONFLICT`, 422, 429).
- Roles admin / expert / farmer; audit logs with HMAC'd IP; rate limits stored in a table.
- Existing `php-backend/` and `database/mysql/001_initial_schema.sql` (19 tables) are a head start but are incomplete (below).

## 3. Offline-first requirements the PHP side must keep
1. **Idempotency.** Honour `Idempotency-Key` on `POST /marketplace/listings`, `POST /expert-requests/demo`, `POST /farmer/questions`: table
   `sync_operations(actor VARCHAR(100), op_key VARCHAR(100), kind VARCHAR(64), status_code SMALLINT, response_json MEDIUMTEXT, created_at DATETIME,
   PRIMARY KEY(actor, op_key))`; replay stored 2xx response with `"replayed": true` and `Idempotent-Replay: true`; 422 `IDEMPOTENCY_KEY_REUSED` on a
   key reused for another kind; purge rows older than 30 days. Check-then-insert inside one transaction (`INSERT ... ` with unique key; on duplicate key,
   read and replay) because PHP requests run concurrently, unlike the single-threaded Node handler.
2. **Conflict detection.** `PATCH /marketplace/listings/:id` with `baseUpdatedAt` returns 409 `CONFLICT` if `updated_at` differs. Keep the exact
   string format (`YYYY-MM-DD HH:MM:SS`, UTC) or normalise on both sides.
3. **Phone consent.** With an `Idempotency-Key` and no consent, store/keep no phone number; never return another owner's number unless consent, admin or owner.
4. **Static files.** Serve `/audio/*` with correct `audio/mp4` type and byte-accurate `Content-Length` (the client verifies exact size) and `/offline-img/*`
   as images. Missing files must return 404, not the HTML shell. Keep `sw.js` and the manifest served with correct types and no long cache on `sw.js`.
5. **Health** `GET /api/v1/health` stays cheap and unauthenticated (the app probes it every 30 s).
6. SPA fallback rewrite (`.htaccess`) to `index.html` for non-file routes, excluding `/api/` and real files.

## 4. Database work (MySQL, InnoDB, utf8mb4)
Missing from `001_initial_schema.sql` and required: `marketplace_listings` (+ columns from SQLite migrations 002 and 003: farm_name, seller_phone,
phone_consent, phone_verified, is_fictional_seller, availability_status, view_count), `marketplace_inquiries`, `local_language_recordings`,
`demo_expert_requests`, `password_resets`, `advisor_conversations`, `platform_settings`, `sync_operations`. Convert `datetime('now')` defaults to
`CURRENT_TIMESTAMP`; SQLite CHECK constraints to ENUM or CHECK (MySQL 8.0.16+/MariaDB 10.2+); `AUTOINCREMENT` to `AUTO_INCREMENT`; `INTEGER` booleans to
`TINYINT(1)`; long data-URL columns to `MEDIUMTEXT` or, better, files (see 6). Add FKs and indexes that SQLite relied on implicitly.

## 5. Authentication and authorization
- **Passwords:** existing hashes are scrypt `salt:hex`. Verify them in PHP (`sodium`/pure-PHP scrypt with the same N, r, p, key length; compare with
  `hash_equals`), then **rehash with `password_hash` (Argon2id/bcrypt) on successful login**. Do not force resets.
- **Strengthen authorization** (do not port the prototype weaknesses): the Node server now uses per-listing owner keys stored as HMAC hashes (`owner_key_hash`, `X-Listing-Key` header, allow-listed public JSON, `can_manage`). Port exactly that, add `owner_key_hash` to the MySQL table, and prefer signed-in seller ownership (keep anonymous keys only for demo mode behind a flag); require auth or a per-request secret for `PATCH /expert-requests/demo/:id/reply`, language-lab review, and
  inquiry updates; enforce role checks server-side on every route; add per-route rate limits for sync endpoints.
- Session fixation: regenerate on login; CSRF token rotation on login/logout.

## 6. Uploads and media
Move base64 photos and voice notes out of rows into files stored **outside the web root**, served through an authorised PHP route; keep the JSON shape
(`photoDataUrl`, `audioDataUrl`) in the API for the client or add URLs with a compatibility shim. Validate real MIME type, cap size (client already
compresses to about 100 KB photos and 24 kbps audio), randomise names, block executables.

## 7. Data migration utility (to be written)
A CLI (`php bin/migrate-sqlite-to-mysql.php --dry-run`) that opens the SQLite file **read-only**, copies table by table in FK order inside transactions,
maps booleans/dates, reports row counts and checksums per table, is re-runnable (truncate-and-reload only a *target* database that the operator names),
and refuses to run against a target that is not empty unless `--force-target` is passed. Never writes to SQLite.

## 8. Phases and exit criteria
1. Audit diff of Node routes vs `php-backend/` (route table, validation, response shapes). Exit: written gap list.
2. Schema + migrations (section 4). Exit: schema applies cleanly on MySQL 8 and MariaDB.
3. Auth/session/CSRF/rate limit parity (section 5). Exit: auth tests pass against PHP.
4. Core read APIs (guides, crops, categories, health). Exit: responses diff-identical to Node on the seeded data.
5. Write APIs with idempotency and conflicts (section 3). Exit: the Stage 4 tests (duplicate, lost response, conflict, consent) pass against PHP.
6. Marketplace, expert, language lab, ministry summary. Exit: parity checklist green.
7. Uploads and static files (sections 3.4, 6). Exit: audio/images served correctly; size checks pass.
8. Data migration dry run, then real run on a copy. Exit: counts and checksums match.
9. Cutover rehearsal on staging (Hostinger-like): build frontend, upload, `.htaccess`, cron for purge jobs. Exit: full offline demo script passes on staging.

## 9. Parity test plan
Re-run `tests/api.test.ts` (19 tests) against the PHP server by pointing `baseUrl` at it; port `offlineAdvisor`/`dataCache`/`inventory` tests (pure
frontend) unchanged; repeat the browser scenarios from `OFFLINE_READINESS_REPORT.md` section 4 against PHP; add security tests: CSRF missing, wrong role,
other user's listing ID, oversize upload, SQL injection strings, replayed idempotency key from another actor.

## 10. Rollback
Keep the Node server and SQLite file untouched. Cutover is a DNS/`.htaccess` switch; rollback is switching back. Take a MySQL dump before each migration step;
migrations are forward-only and additive. If MySQL data diverges after cutover, export new rows back to a file before rolling back (a reverse utility is
out of scope until needed).

## 11. Risks
scrypt parameter mismatch (test with real hashes first); timestamp string formats and timezones breaking `baseUpdatedAt`; MySQL strict mode rejecting
SQLite-style loose data; shared-hosting limits (upload size, `max_execution_time`, no `proc_open`); PHP extension availability (`sodium`, `pdo_mysql`,
`mbstring`); service-worker caching of stale API shells after cutover (bump cache names and test the update prompt).
