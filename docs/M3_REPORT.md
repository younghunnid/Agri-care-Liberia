# M3 report — PHP application foundation

Branch `feature/offline-first`, from `cc4e4d6`. Scope: **M3 only**. Not deployed, not pushed, not merged. React frontend, IndexedDB/PWA/sync code, Node/SQLite reference, XAMPP configuration, existing databases and the untracked archives are untouched. No USSD endpoint, table, adapter, menu, simulator, SMS or admin page exists (U1–U6 are recorded as decisions only).

## Contract note: the endpoints are `/api/v1/health` and `/api/v1/csrf-token`
The brief says `/api/health`; the Node reference (and the React client, `src/hooks/usePWA.ts`) serve **`/api/v1/health`** and **`/api/v1/csrf-token`**. M3 reproduces those paths. No `/api/health` alias was added because Node does not serve one.

## What was built (`backend-php/`)
| Area | Files |
|---|---|
| Front controller + Apache rules | `public/index.php`, `public/.htaccess`, `public/error.json` |
| Boot, fatal/exception/error handling | `app/Bootstrap.php` (generic JSON errors, request id, handlers for uncaught/fatal, `display_errors=0`) |
| Config (strict, fail-closed) | `app/Config/Config.php`, `ConfigException.php`, `app/Support/Env.php`, `bin/check-config.php`, `.env.example` |
| HTTP layer | `app/Http/{Request,Response,Router,Kernel,Cookie,HttpException,App}.php` |
| Controllers | `app/Controllers/{Health,Csrf}Controller.php` |
| Routes | `config/routes.php`, `config/route_manifest.php` (all 61 Node routes; 59 answer `501 NOT_IMPLEMENTED`) |
| Logging | `app/Support/Logger.php` (JSON lines, 0600 files created under umask 0077, key/value redaction) |
| DB | reuses M2 `Agri\Database\Connection` (added a 5 s connect timeout) |
| Tests | `tests/m3_unit.php` (75 tests), `tests/m3/run.ts`, `tests/m3/provision.php`, `tests/m3/apache-check.sh` |
npm scripts: `test:m3` (HTTP suite), `test:m3:unit` (PHP unit tests).

## Behaviour implemented
* **Request/response:** JSON in/out; methods GET/HEAD/POST/PATCH/DELETE/OPTIONS; 413 above `MAX_BODY_BYTES` (default 4 MB as Node) decided from `Content-Length` before the body is read, and again on the bytes actually read; 415 for non-JSON bodies; 400 `INVALID_JSON` (malformed, scalar, depth > 32); 404/405 (with `Allow`) as JSON; control characters/invalid UTF-8 in paths rejected.
* **Pipeline order = Node's:** security headers → CORS (OPTIONS answered 204 before anything else) → body parsing (errors occur before any cookie is issued) → cookie session (`agri_anon` HttpOnly, `agri_csrf` script-readable, 7-day, `Path=/`) → CSRF for every non-GET under `/api/v1` (before routing, same codes and messages) → router.
* **`GET /api/v1/health`:** same fields, order and types; DB-backed `latestMigration`, `publishedGuides`; `aiConfigured` with Node's rule; ms-precision UTC timestamp. Failure: `500 {status:'error', error:{code:'HEALTH_CHECK_FAILED', message:'Database error'}}` — the real DB message goes only to the private log (Node echoes it to clients; deliberately not copied).
* **`GET /api/v1/csrf-token`:** `{csrfToken}` (48 hex), `Cache-Control: no-store`, exactly one `agri_csrf` Set-Cookie on a first visit and the same token reused afterwards.
* **Security headers on every response** (including errors): `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin` (as Node), `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Cache-Control: no-store`, `Vary: Origin`, `X-Request-Id`; HSTS only over HTTPS and only when `HSTS_MAX_AGE` is set; `X-Powered-By` removed.
* **CORS:** exact-match allow-list (`APP_URL` + `CORS_ALLOWED_ORIGINS`; localhost:3000 only outside production) plus Node's same-host rule; credentials only with a specific echoed origin; `*`, `null`, look-alikes and suffix tricks never allowed; a wildcard in configuration is a fatal error in every environment.
* **Cookies:** default `first_party` = `SameSite=Lax` (+`Secure` over HTTPS, and always `Secure` in production/staging) — the approved first-party direction; `COOKIE_MODE=cross_site` reproduces Node's `SameSite=None; Secure; Partitioned` for previews and is refused in production/staging.
* **Fail-closed configuration:** `APP_ENV` unset/unknown is validated as production; production/staging require strong `SESSION_SECRET` and `OWNER_KEY_HMAC_SECRET` (≥ 32 chars, not placeholders/low variety; the Node dev constant only with an explicit `ALLOW_LEGACY_OWNER_KEY_SECRET=1`), DB host/name/user/password (no `root`), an `https://` `APP_URL`, https-only CORS origins, no cross-site cookies; `TEST_FIXTURE_TOKEN`, `APP_DEBUG`, `ENABLE_*`, `DEMO_*_PASSWORD`, `AGRI_DISPOSABLE_DB_OK` are refused there. A misconfigured server answers every request (even OPTIONS) with `500 SERVER_MISCONFIGURED`, no cookies, no CORS headers, names (never values) logged privately. There are no demo/fixture endpoints in PHP at all in M3; `APP_DEBUG` (dev/test only) adds only the exception type/message to a 500, never a trace.

## Results (final verification run, after the hardening below)
| Suite | PHP 8.5.5 | PHP 8.4.17 | PHP 8.3.30 |
|---|---|---|---|
| `php -l` on every PHP file (inside the HTTP suite) | pass | pass | pass |
| `test:m3:unit` — config matrix, cookies, request parsing, router, route table (2 of 61 implemented), CORS, CSRF, error leakage, logger redaction, deployment hygiene, version guard | 75/75 | 75/75 | 75/75 |
| `test:m3` — Node-vs-PHP parity + PHP security over HTTP; MySQL 8.0.44 **and** MariaDB 10.4.28; 5 PHP server configurations; 20+ production-misconfiguration servers | 37/37 | 37/37 | 37/37 |
| `tests/m3/apache-check.sh` — `.htaccess` under a private Apache 2.4.56 (own config, loopback port 18089, `php-cgi`), `public/` mounted at `/api` like `public_html/api` | 28/28 | 28/28 | 28/28 |
| M2 matrix (44 checks × MySQL 8.0.44 + MariaDB 10.4.28) | 88/88 | 88/88 | 88/88 |
Node reference regressions (unchanged code): `test:api` 31/31, `test:contract` 63 requests match the golden snapshot, `test:harness` 4/4, `test:offline` 22 + 6 + 3, `tsc --noEmit` clean. `git diff` on `src/` and `server/` is empty. (Corrections to earlier figures: M2 report said `test:harness` 6 and `test:offline` 22+3 — fixed; the earlier M3 text said the Apache check had 22 assertions — it has 20.)
**PHP 8.2 was not available on this machine and was not executed**; the code uses no feature newer than 8.1 and passes on 8.3, 8.4 and 8.5. PHP 7.4 was run only to prove the version guard (clean JSON 500, no parse error).
Disposable resources only: scratch databases/users dropped after every run, temp SQLite for Node, temp log dirs (the unit tests now delete theirs), a private Apache. `data/agri_advisory.db*` was not opened; XAMPP configuration unchanged.

## Session recovery and review pass
The interrupted-session state was inspected first: the working tree was clean at commit `8c9927f`, all 35 M3 files were present and valid, `tests/m3/provision.php` was complete (refuses without `AGRI_DISPOSABLE_DB_OK=1`, loopback only, creates a least-privilege user, validates scratch names before `drop`). Nothing was re-implemented. The review found and fixed:
1. **httpoxy**: under CGI a client `Proxy:` header becomes `HTTP_PROXY`. The bootstrap removes the variable and `.htaccess` strips the header. **Correction found by a later behavioural test:** the first version of the `.htaccess` line used the `early` flag, which Apache silently ignores inside `.htaccess` (proved: a stand-in header still reached the CGI environment); the line is now `RequestHeader unset Proxy` and the Apache check proves the directive form works (with a positive control and a negative run that fails when `early` is restored). Apache ≥ 2.4.25 (this machine: 2.4.56) already ignores `Proxy` for CGI, so the rule is defence in depth for older Apache/LiteSpeed; whether LiteSpeed honours it is a staging check (`docs/M4_READINESS.md` §16).
2. **Log file permissions window**: log files were created world-readable then chmod'ed; now created under `umask(0077)` (0600 from the start; directory 0700).
3. **Deployment hygiene warnings** (logged, not fatal because shared hosts often create files 0644): `.env` readable by group/others in production/staging, `LOG_DIR` inside the web root, application directory inside the web root.
4. **PHP version guard**: `public/index.php` answers a clean `500 SERVER_MISCONFIGURED` JSON on PHP < 8.2 instead of a parse error.
5. **Disabled-function hosts**: a behavioural test running with `disable_functions=putenv,umask,header_remove` found that the bootstrap would crash (undefined function) on such hosts; hardening calls (`ini_set`, `header_remove`, `putenv`, `umask`) are now guarded.
6. **Test hygiene**: unit tests left temp log directories behind; now removed automatically.
Review checks that found nothing: no secret-looking literals in tracked M2/M3 files (test files contain only generated throw-away values), no `.env` present or tracked, no world-writable or setuid files, file modes 0644 except the one test script (0755), no credentials in logs/responses (asserted by tests), `display_errors` off.

## Intended differences from Node (not parity failures)
Unknown routes, 405, 413, 415 and malformed JSON return JSON errors (Node returns Express HTML pages for the first and framework error bodies for the others); health failures expose no DB text; default cookies are first-party; extra security headers; CORS `Allow-Headers` also lists `Idempotency-Key`, `X-Listing-Key`, `X-Requester-Key` (allow-listed origins only); non-migrated routes return 501 instead of working; `latestMigration` reports the PHP ledger version (`001_schema`) rather than Node's `006_…`.

## Unresolved risks / not verified
1. **PHP 8.2 not executed** (not installed here); 8.3, 8.4 and 8.5 pass and nothing newer than 8.1 is used. Hostinger's selected PHP version must still be set to 8.2+ (a lower one now yields a clean JSON 500).
2. **Hostinger/LiteSpeed not verified.** Apache 2.4 + CGI was exercised; LiteSpeed's `.htaccess` handling, `.user.ini`, FastCGI env passing and OPcache behaviour need a staging check (M7/M9).
3. **Health polling cost:** phones poll `/api/v1/health` every ~30 s (client behaviour); the contract requires DB-backed fields, so each poll runs 2 tiny indexed queries. Plan §12.5 suggested a cheap variant; a short server-side cache or `?deep=1` split needs your decision.
4. `agri_session` is not read yet (`user` is always null) — authentication is M4; no user/role data is exposed by M3.
5. Rate limiting, audit logging and Idempotency are not part of M3 (M4/M6).
6. Logs write to `LOG_DIR`; on shared hosting it must be outside the web root (documented in `.env.example`), and log rotation/retention is not implemented.
7. *(Superseded by M3.1, see `docs/M3_1_REPORT.md`.)* `X-Forwarded-*` are trusted only with `TRUST_PROXY=1` **and** an explicit `TRUSTED_PROXY_CIDRS` list, verified from the right; the original first-entry logic was a spoofing defect.

## Recommended M4 scope and decisions
> **Superseded by `docs/M4_READINESS.md`** (M4 is not yet authorised). In particular: sessions will be server-side (the Node cookie format is not reproduced, fresh login being already approved), the KPAA separation-of-duties/role items are **not** part of M4, and a client-IP defect found in M3 (`X-Forwarded-For` first entry) must be fixed first (pre-M4 change P1).
**M4 — Auth:** register/login/logout/me/forgot/reset, `agri_session` signing/verification (byte-compatible with Node), session regeneration, scrypt verify + rehash on login, rate limits (MySQL `rate_limit_attempts`), audit logging with `request_id`, CSRF already in place, role guards (`requireAuth`, `requireRole`), plus the audit/role gaps from `docs/KPAA_FEATURE_GAP_ANALYSIS.md` §2.7. Decisions needed: **D4** password-hash migration path confirmation (verified libsodium compatibility; rehash policy), **D6** mail transport for password reset (needed before forgot/reset), production session lifetime and rotation policy, whether login must be allowed from the existing cross-site preview mode, and the health-polling choice above.
