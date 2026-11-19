# M4 readiness review — authentication, sessions, audit, RBAC (PHP)

Status: **review only — M4 is NOT authorised and nothing was implemented.** No code, database, SMTP, telecom or deployment action was taken; the only edits are documentation. Evidence (second pass, this revision adds §12–§18): Node reference auth code (`server/routes/v1.ts` 287–600, `server/security.ts`), the React client (`src/lib/api.ts`, `LoginPage`, `RegisterPage`, `AppContext`, `syncEngine`, `usePWA`), the M1 harness/golden snapshot, and the M3 PHP code at commit **`580218d`**.
Git state at the start of this revision: clean tree (only the two untracked archives), HEAD `b3521fc` (docs only) on top of M3 `580218d`; no code differs between them.
Note on the commit reference: the M3 commit you cited (`8c9927f`) was amended after the M3 review pass (hardening + report); the current local commit is `580218d` and is what was reviewed. Both are unpushed.
KPAA enhancements (M12–M14) and USSD (M11) are **out of scope** here and remain separate (section 9).

## 1. Verdict
**Ready to start M4 once (a) the four pre-M4 changes in §3 are approved and done and (b) the decisions in §10 are answered.** One of the pre-M4 items is a genuine security defect in M3 (spoofable client IP, §2.2 R1) that must be fixed first because every M4 rate limit and audit record depends on the client IP.

## 2. Review of the M3 commit and its outstanding risks
### 2.1 What M3 gives M4 (verified earlier: 75 unit + 37 HTTP + 20 Apache + 88 DB checks on PHP 8.3/8.4/8.5, MySQL 8.0.44 + MariaDB 10.4.28)
Fail-closed config; request/response/router/kernel pipeline in Node's order (CORS → body → cookies → CSRF → routing); `agri_anon`/`agri_csrf` cookies; CSRF double-submit identical to Node; private structured logger; PDO foundation with identical `sql_mode`/UTC; 59 routes registered as `501`; `request_id` in every response; provisioning and Apache test harnesses; `user` request attribute reserved as `null`.
### 2.2 Residual risks and their M4 relevance
| # | Risk / finding | Severity | M4 impact | Action |
|---|---|---|---|---|
| **R1** | **Client IP is taken from the *first* `X-Forwarded-For` entry when `TRUST_PROXY=1`** (`Request::fromGlobals`). A proxy that *appends* the real peer leaves the attacker-supplied first value in front, so a client can forge its IP. Express (`trust proxy 1`) uses the entry added by the single trusted proxy. | **High for M4** (login/register/reset limits and audit `ip_hash` are IP-keyed) | Rate-limit evasion, audit poisoning | **Pre-M4 fix P1**: use the rightmost-N entries (`TRUSTED_PROXY_HOPS`, default 1), validate IPs, never trust the header unless `TRUST_PROXY=1`; add tests for forged headers. |
| R2 | Hostinger's real-client-IP mechanism is unknown (LiteSpeed/Cloudflare/`X-Forwarded-For`, `CF-Connecting-IP`?). If every request appears to come from the proxy, IP-keyed limits would throttle *all* users together. | High (availability) | Lockout of everyone vs. no throttling | Verify on staging before enabling limits in production; config `CLIENT_IP_HEADER` allow-list; limits also keyed per identifier so one bad IP source cannot disable them; **unverified today**. |
| R3 | `X-Forwarded-Proto` first value is also spoofable behind a proxy; only affects the `Secure` cookie decision | Low (production already forces `Secure`) | none | covered by P1 |
| R4 | Health check runs two DB queries per probe; phones probe every 30 s (`usePWA.ts`, only `res.ok` is read) | Medium (shared-hosting capacity) | Competes with auth traffic | Decision H1 (§4.4) |
| R5 | No log rotation/retention; hygiene problems are warnings only | Low | Auth events increase log volume | Add purge/rotation to the M4 cron task |
| R6 | LiteSpeed/`.user.ini` not exercised (Apache + php-cgi only) | Medium | Cookie/header behaviour on the real host | Staging check in M9; M4 tests must not assume Apache-only features |
| R7 | PHP 8.2 not executed (8.3–8.5 pass; nothing newer than 8.1 used) | Low | none | Staging confirms Hostinger PHP ≥ 8.2 |
| R8 | The M2 parity test asserts "exactly the SQLite tables" — a new PHP-only table (sessions) would fail it | Medium (test design) | M4 needs a table | **Pre-M4 change P2** |
| R9 | Rate limiter in Node counts then inserts (not atomic); same naive port to PHP allows bursts above the limit under concurrency | Medium | Brute-force bursts | Insert-then-count design (§5.5) |
| R10 | `Seeder::hashPassword` writes legacy-format scrypt hashes for demo users | Low | Divergent hashing code paths | Move to a shared `PasswordHasher` in M4; seeds use it |
| **R12** | **The httpoxy `.htaccess` rule from the M3 hardening pass was ineffective** (`RequestHeader unset Proxy early` is ignored in `.htaccess`). Found by the behavioural test in §15; fixed (`RequestHeader unset Proxy`). Apache ≥ 2.4.25 is unaffected anyway; LiteSpeed behaviour unknown. | Low–Medium | none for M4 logic; relevant before any outbound HTTP (SMTP is not HTTP, Gemini in M7) | Fixed; staging check S-L4 |
| **R13** | **Bootstrap crashed on hosts that disable `putenv`/`header_remove`/`ini_set`/`umask`** (disabled functions are undefined). Found by §15's disabled-functions run. | Medium (would 500 every request on such a host) | none | Fixed (guards) + permanent test |
| R11 | Cookie name `agri_csrf` must stay non-HttpOnly and un-prefixed: `src/lib/api.ts` reads it from `document.cookie` | Info | Cannot adopt `__Host-` prefixes without a frontend change | Keep; recorded as accepted limitation |

### 2.3 Changes required before M4 (proposed “M3.1”, small)
| ID | Change | Why | Size |
|---|---|---|---|
| **P1** | Fix trusted-proxy client IP/proto derivation (R1/R3), add `TRUSTED_PROXY_HOPS`, tests with forged `X-Forwarded-*` | Security defect | S |
| **P2** | Make the M2 structure-parity check accept an explicit, documented allow-list of PHP-only tables/columns (so `002_auth.sql` can add `user_sessions` without weakening the check); keep linter rules (no edits to `001_schema.sql`) | R8 | S |
| **P3** | Add config keys with fail-closed validation: `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `SESSION_IDLE_MINUTES_ADMIN`, `SESSION_ABSOLUTE_HOURS_ADMIN`, `MAIL_TRANSPORT` (`null` default), `MAIL_*`, `IP_HASH_SECRET` (or reuse `SESSION_SECRET` with domain separation), `PASSWORD_HASH_SCHEME`, `PASSWORD_REHASH_ENABLED`, `CLIENT_IP_*`; production refuses `MAIL_TRANSPORT=smtp` with incomplete settings | Config must exist before use | S |
| **P4** | Health: lightweight frequent check + deep check (decision H1) | R4 | S |
Nothing else is required before M4; M4 itself needs migration `002_auth.sql` (§5.2) and test-only fixtures (§8).

## 3. The proposed decisions, evaluated
### 3.1 D4 — preserve Node scrypt hashes, rehash after successful login, no forced resets  → **Approve, with one refinement (D4a)**
* **Compatibility is proven** (M2 test 40): libsodium `sodium_crypto_pwhash_scryptsalsa208sha256(64, pw, salt32, INTERACTIVE…)` reproduces Node's `scrypt(pw, saltString, 64)`; both directions verified. Legacy format regex `^[0-9a-f]{32}:[0-9a-f]{128}$`; anything else fails closed. Verify with `hash_equals`; reject passwords > 128 characters *before* hashing (Node enforces this at registration only; reset has no upper bound — PHP will add it).
* **Target scheme:** `password_hash(PASSWORD_ARGON2ID)` with `memory_cost`/`time_cost` calibrated per host (measured here: 200 ms on PHP 8.5.5 but 1.1–1.6 s on the MAMP 8.3 build, scrypt-verify 48 ms vs 465 ms — CPU varies ~10× between builds, so cost must be **calibrated on the target host** (`bin/calibrate-password.php`, target 250–400 ms) and expensive hashing must only happen *after* the rate-limit check). Fallback if Argon2id is unavailable: bcrypt cost ≥ 12 (72-byte input limit documented). `password_needs_rehash` after every successful verify.
* **Rehash rules:** same request, after the password is verified and the session is created; compare-and-swap (`UPDATE … WHERE id=? AND password_hash=?`) so a concurrent change is never overwritten; failure to rehash never fails the login (logged); `users.updated_at` is **not** touched (not a user edit — same principle as D1); audit `password_rehashed` records only the scheme change.
* **D4a (new — rollback safety):** the plan keeps Node as a fallback for two weeks after cutover (M10). Node can verify **only** scrypt hashes, so any Argon2id hash written in PHP (rehash, new registration, reset) would make those users unable to sign in if traffic is rolled back. Proposal: `PASSWORD_HASH_SCHEME=legacy` (PHP writes the Node-compatible scrypt format) and `PASSWORD_REHASH_ENABLED=false` during the fallback window; after the window closes set `argon2id` and `true`, after which accounts upgrade gradually on login. Cost: weaker hashes (scrypt interactive is acceptable but not best-in-class) for those weeks. Alternative: extend the Node reference to verify Argon2id (changes the reference; not recommended).
* **Not forced:** no mass reset; accounts never logged in remain on scrypt until their first login.
### 3.2 D6 — configurable SMTP for reset email, disabled until configured and tested  → **Approve, with constraints**
* `MAIL_TRANSPORT=null|log|smtp`; default **`null`** (nothing sent; the `forgot-password` response keeps `deliveryConfigured:false` and its honest message, which the login page displays verbatim). `log` is development-only (refused in production). `smtp` requires host, port, `starttls|tls`, credentials, from-address; **peer/hostname verification always on**; credentials only from environment; a startup self-check (`bin/mail-selftest.php`, explicit command, never automatic) must pass before `deliveryConfigured` can become `true`.
* **Implementation choice (needs approval, D6a):** the server has no Composer. Either vendor a pinned, checksum-verified **PHPMailer 6.x** (LGPL-2.1 licence review needed) or write a minimal SMTP client (AUTH LOGIN/PLAIN over TLS only, strict CRLF/header-injection checks). Recommendation: vendored PHPMailer; it removes a security-sensitive hand-rolled protocol implementation.
* **Content:** fixed subject; body contains the token (the existing UI has **no reset URL handling** — `LoginPage` asks the user to paste the token, and the frontend is frozen), expiry time, and “ignore if you did not request this”; no HTML, no user-supplied text in headers; the token is **never** logged, audited or returned; send failures are audited without the token and never change the HTTP response (anti-enumeration).
* **Gap that SMTP does not solve:** email is optional at registration (`users.email` nullable), so **phone-only accounts cannot receive a reset** (Node has the same gap). Options: admin-assisted reset (audited) now; SMS reset when an SMS provider exists; USSD reset later (M11). Decision R-1 (§10).
* **Safe local test transports:** `MAIL_TRANSPORT=capture` (non-production only; refused in production/staging) writes each message to a private temp directory or memory so tests can read the token from the body; plus the loopback-only SMTP sink below for protocol-level tests. Neither relays anything.
* **Testing without sending anything real:** a loopback-only SMTP sink in the test suite (random port, accepts and records; no relay), plus `MAIL_TRANSPORT=null` default assertions. No external SMTP server is contacted by M4 tests.
### 3.3 Sessions — 12 h inactivity, 7-day absolute, shorter for administrators  → **Approve the model; replace the stateless cookie with server-side sessions; confirm numbers**
* **Why server-side:** Node's cookie is a stateless HMAC `{uid, exp}` (7 days): it cannot be revoked (logout only deletes the cookie; password reset and suspension do not end existing sessions — `loadUserById` re-checks `status` but a stolen cookie stays valid after a password change) and it has no inactivity notion. Inactivity and revocation both require server state. Because fresh login at cutover is already approved, **the cookie format need not match Node's**.
* **Design:** table `user_sessions(id, token_hash CHAR(64) UNIQUE, user_id FK CASCADE, created_at, last_seen_at, expires_at (absolute), idle_expires_at, role_class, ip_hash, ua_hash, revoked_at)` (migration `002`); cookie `agri_session` = 256-bit random token (HttpOnly, `Secure`, `SameSite=Lax`, `Path=/`), DB stores **HMAC-SHA256(SESSION_SECRET, token)** only; new token on every login (no fixation); `last_seen_at` updated at most every 5 minutes to avoid a write per request; expiry checked on every request; revoked on logout, password reset/change, suspension (`status != active`), and by an admin “revoke all”.
* **Numbers (to confirm):** ordinary users (farmer, expert): idle **12 h**, absolute **7 days**; administrators: idle **30 min**, absolute **8 h** (my proposal for “shorter”); a user with several roles gets the shortest applicable window. All values are configuration.
* **Field-usability risk (needs your explicit acceptance):** farmers with intermittent connectivity who open the app weekly will be signed out every time they return after > 12 h and must retype phone + password on a basic phone. That is secure but may hurt adoption. Alternative for *non-privileged* roles only: 7-day idle / 30-day absolute (“remember this phone”) while admins/experts keep short limits. Recommendation: ship 12 h/7 d as the secure default and pilot-test; keep values configurable (D-S1).
* **Offline-first impact (verified in the code):** `syncEngine.ts` treats 401 as a non-retryable, *recoverable* state with the message “Please sign in again, then tap Try again”; queued drafts/questions stay in IndexedDB (nothing is deleted); listing/inquiry sync is anonymous (owner-key based) and unaffected; reading downloaded guides/audio/offline library needs no session; the service worker never caches `/api/v1/auth/*` (only crops/categories/guides GETs). `AppContext.refreshUser` swallows errors and shows the signed-out UI when `/auth/me` returns `{user:null}`.
* **Rotation rules (requested):** a **new random token is issued on every login** (the pre-login cookie is never promoted). Privilege or credential changes: (a) the user changes/resets their **own** password → current session gets a fresh token (absolute lifetime unchanged), every *other* session of that user is revoked; (b) an administrator changes another user's **roles, expert approval status or account status**, or resets their password → **all that user's sessions are revoked** (forced re-login; a rotation would be meaningless because the actor does not hold the target's cookie); (c) admin promotion/demotion also revokes the target's sessions; (d) suspension takes effect on the very next request because `status` is read from the database on every request, and the session rows are revoked in the same transaction. Roles are never cached in the session, so a privilege change is effective immediately even before the rows are revoked.
* **Cookies:** as M3 (`first_party`; always `Secure` in production). The session cookie `Max-Age` = remaining absolute lifetime (never longer); `/auth/logout` clears it with matching attributes.
### 3.4 Health polling — lightweight frequent check + deeper DB check  → **Approve; implementation compatible with the frozen client**
* The client only reads `res.ok` from `GET /api/v1/health?_=<timestamp>` every 30 s, and the M1/M3 contract tests assert the DB-backed fields. Therefore the **same URL must stay 200 with the same fields**.
* Recommendation **H1:** (1) `GET /api/v1/health` stays the contract response but is served from a **15-second private server-side cache** (file in `storage/cache`, atomic write, ignores the `_` cache-buster) so N phones cause ≤ 4 DB checks per minute; a failed check is cached only 3 s so recovery is quick; (2) a **deep check** `GET /api/v1/health?deep=1` bypasses the cache and runs the live DB/ledger checks, accessible only with a monitoring token header (`HEALTH_DEEP_TOKEN`, ≥ 32 chars, constant-time compare) or loopback, rate-limited, so it cannot be used for DoS; (3) staleness is bounded and documented (“database: connected” may be up to 15 s old). If a cache file cannot be written the endpoint falls back to a live check. Alternative considered and rejected: a new `/health/live` — the frozen client would never call it.

## 4. Authentication requirements review
### 4.1 Endpoint contract to preserve (Node → PHP)
| Endpoint | Node behaviour (evidence) | PHP M4 plan / differences |
|---|---|---|
| `GET /auth/me` | `{user: SessionUser \| null}`; never errors for anonymous | Same shape (id, displayName, phone, email, status, roles[], county, preferredLanguage, cropsOfInterest[], expertStatus, expertSpecialty); `null` for expired/revoked sessions; no write except throttled `last_seen_at` |
| `POST /auth/register` | `allow_public_registration` setting (403 `REGISTRATION_DISABLED`); limit 10/h/IP (429 `RATE_LIMITED`); validation 400 `VALIDATION_ERROR` with the exact messages (name 2–80, Liberian phone via `normalizeLiberianPhone`, email regex, password 8–128, county in the 15-county list, language in supported list, ≤ 10 crops); 409 `PHONE_EXISTS` / `EMAIL_EXISTS`; transaction creating user + `farmer` role + profile + language pref; logs the user in (cookie); audit `farmer_registered`; `201 {user}` | Same codes/messages/status; **port `normalizeLiberianPhone` byte-for-byte with shared test vectors**; email lower-cased; duplicate detection also enforced by the UNIQUE index (race-safe: catch duplicate-key → 409) and **case-insensitive** (D16: MySQL collation differs from SQLite); new random session |
| `POST /auth/login` | limit 8/15 min per `ip+identifier` (429 `AUTH_THROTTLED`); 400 for empty fields; lookup by phone or lower(email); 401 `INVALID_CREDENTIALS` (same text for unknown user and bad password); 403 `ACCOUNT_INACTIVE` only after a correct password; audit `login_failed` (hashed identifier) / `login_success`; `{user}` | Same; **plus** constant-time behaviour (dummy hash verify for unknown users), an additional per-IP and per-identifier limit, session rotation, rehash (D4), audit with `request_id` |
| `POST /auth/logout` | clears cookie, audit `logout` if signed in, `{ok:true}` | Same, **and revokes the server session**; idempotent |
| `POST /auth/forgot-password` | 5/h/IP (429 `RATE_LIMITED`); identical response whether or not the account exists: `{deliveryConfigured:false, message}`; creates a 30-min token (sha256 stored); audit `password_reset_requested`; token printed to the server console in non-production | Same response shape and wording rules (message must stay truthful: “not configured” while `MAIL_TRANSPORT=null`); token never in logs/response; invalidate earlier unused tokens; constant-time-ish handling; email only when transport enabled and an email exists |
| `POST /auth/reset-password` | `token` ≥ 16 chars, `newPassword` ≥ 8 (no upper bound, no rate limit); 400 `INVALID_RESET_TOKEN`; updates hash + `used_at` in one transaction; audit `password_reset_completed`; `{ok:true,message}` | Same codes/messages; **add** max length 128, per-IP attempt limit, conditional `UPDATE … WHERE used_at IS NULL` affected-rows check (no double use under concurrency), revoke all sessions of the user, audit failures; not auto-login |
### 4.2 Findings in the Node behaviour that M4 should *improve* (without changing the response contract)
| Finding | Improvement |
|---|---|
| Stateless, irrevocable sessions; reset/suspension do not end sessions | Server-side sessions (§3.3) |
| Login lookup short-circuits for unknown users → timing difference reveals which phones/emails exist | Dummy verification of equal cost |
| Login limiter keyed `ip+identifier` only: an attacker rotating identifiers from one IP is unthrottled; rotating IPs against one account is unthrottled | Add per-IP (e.g. 40/15 min) and per-account soft limit (progressive delay rather than hard lockout, to avoid locking out a victim) |
| Limiter is count-then-insert (race) | Insert-then-count in one statement path |
| Registration returns `PHONE_EXISTS`/`EMAIL_EXISTS` | Enumeration oracle — see decision E-1 |
| Several reset tokens can be valid simultaneously; reset has no length cap and no limiter | Invalidate previous tokens; cap + limiter |
| `ip_hash` keyed with the *session* secret (changes if rotated); ephemeral secret in Node when unset | Dedicated `IP_HASH_SECRET` (fail-closed config) |
| Audit write failure handling undefined | Fail closed for auth events: the request is aborted if the audit row cannot be written |
### 4.3 Account-enumeration protection
* Already generic: login failure text; forgot-password response; 403 inactive only after correct password.
* To add: equalised timing for login/forgot; uniform responses for reset-token failures; limiter responses independent of account existence.
* **Open product trade-off (E-1):** phone number is the account identifier and registration must tell users if it is taken. Options: (A) keep the 409 messages and rely on rate limits (10/h/IP plus a per-phone-hash limit) — recommended, because without SMS verification a generic reply would leave a person unable to tell why registration “succeeded” but login fails; (B) generic reply plus out-of-band confirmation — needs SMS/email delivery that does not exist yet. Record A as an accepted, documented risk until SMS/USSD verification exists.
### 4.4 Role-based access control
* M4 delivers the **mechanism**: session → user DTO with roles; `requireAuth` (401 `UNAUTHORIZED`), `requireRole(...)` (403 `FORBIDDEN`), the expert-approval rule (`EXPERT_NOT_APPROVED`, admins exempt), identical codes and messages; roles read from the database on every request (never from the client). No new roles, no separation-of-duties changes (those belong to the KPAA track, §9).
* Because the real protected endpoints arrive in M5/M6, M4 verifies RBAC with unit tests plus **test-only probe routes** registered only when `APP_ENV=test` (assertions: absent in production — same guard style as the fixture routes, §8).
### 4.5 CSRF
Unchanged from M3 (double-submit, identical messages, checked before routing for all `/api/v1` writes). Login/logout need no extra rotation (the client re-fetches on 403 via `_csrfRetried`; no parity risk). Known limitation R11 (cookie tossing not mitigated by prefixes because the frozen client reads `agri_csrf`). Reset-password and login remain CSRF-protected like Node.
### 4.6 Password-reset token security (summary of requirements)
192-bit CSPRNG token; SHA-256 stored (high-entropy token, so no slow hash needed); 30-minute expiry (Node value — configurable); single use enforced by a conditional update; all earlier unused tokens invalidated on a new request and on success; sessions revoked on success; per-IP and per-account request limits; attempts limited on the reset endpoint; token only in the email body (never URL query strings, logs, audit, errors or metrics); response time and body identical for existing/non-existing accounts; “your password was changed” notification email when SMTP is enabled; purge expired rows by cron.
### 4.7 Rate limiting (proposed matrix; Node values kept where they exist)
| Action | Key | Limit | Source |
|---|---|---|---|
| register | IP | 10 / 60 min | Node |
| register (new) | phone hash | 5 / 60 min | proposed |
| login | IP + identifier | 8 / 15 min | Node |
| login (new) | IP | 40 / 15 min | proposed |
| login (new) | account (soft) | 20 / 60 min → progressive delay, not lockout | proposed |
| forgot-password | IP | 5 / 60 min | Node |
| forgot-password (new) | account | 3 / 60 min | proposed |
| reset-password (new) | IP | 10 / 60 min | proposed |
| health deep (new) | IP | 10 / min | proposed |
Responses: `429` + `Retry-After`, same codes as Node (`AUTH_THROTTLED`, `RATE_LIMITED`); storage in `rate_limit_attempts` (M2 index exists); database failure → **deny** (fail closed); purge rows > 2 days by cron; keys are HMACs, never raw IPs/identifiers.
### 4.8 Audit logging
Reuse `audit_logs`; preserve the existing action names used by auth (`farmer_registered`, `login_success`, `login_failed`, `logout`, `password_reset_requested`, `password_reset_completed`) with the same actor/target conventions; add `session_revoked`, `password_rehashed`, `password_reset_email_failed`, `rate_limited`; every record carries `request_id` and an HMAC `ip_hash`; no passwords, tokens, hashes, raw identifiers or request bodies; written in the same transaction as the state change where one exists; failure aborts the request.
### 4.9 Disposable-database testing
Reuse the M2/M3 infrastructure: scratch MySQL 8.0.44 (:3307) and MariaDB 10.4.28 (:3308), `provision.php` (new database + least-privilege runtime user per run, dropped afterwards), the migration runner applies `002_auth.sql` with a separate privileged user, runtime user keeps only SELECT/INSERT/UPDATE/DELETE; matrix: both engines × PHP 8.3/8.4/8.5; concurrency tests use parallel HTTP requests against a real server; no existing database is opened.
### 4.10 Node/PHP API parity strategy
The 31-test harness and the 63-request golden snapshot need endpoints that arrive in M5/M6, so full PHP runs are not possible in M4. M4 adds an **auth subset** run against **both** backends (new `tests/m4/` black-box suite using the M1 HTTP client + normaliser) and an auth-only extract of the contract script compared with the Node golden steps (me anonymous → register → duplicate → me → wrong password → login → logout → me). Intentional deviations are listed and asserted explicitly (session cookie value format, extra throttling, dummy-hash timing, JSON error bodies instead of Express HTML).

## 5. Technical design summary for M4 (for approval, not started)
### 5.1 Components
`app/Auth/{PasswordHasher, SessionManager, SessionMiddleware, AuthService, RateLimiter, ResetService, PhoneNormalizer, Audit}`, `app/Mail/{MailTransport, NullTransport, LogTransport, SmtpTransport}`, `app/Controllers/AuthController`, kernel hook that loads the session (replacing `user = null`), CLI `bin/calibrate-password.php`, `bin/mail-selftest.php`, `bin/cron-purge.php` (sessions, resets, rate limits, logs). The M2 `Seeder::bootstrapAdmin` keeps working and moves to `PasswordHasher`.
### 5.2 Migration `002_auth.sql` (forward-only, M2 linter rules)
`user_sessions` (above); optional index on `password_resets(user_id, used_at)`; **no change to `001_schema.sql`**; no new columns on `users`. Rollback = drop the new table only through a new forward migration (policy: no drops); data impact none.
### 5.3 Phone normalisation
Port of `src/lib/phone.ts` with a shared JSON vector file used by both TypeScript and PHP tests (identical outputs for ≥ 60 vectors including `00231…`, `+2310…`, 9-digit locals, spaces/hyphens/parentheses, invalid prefixes).
### 5.4 Environment
New required (production) settings: `IP_HASH_SECRET`, session windows (defaults provided but explicit), `PASSWORD_HASH_SCHEME`, optional mail block; no secret has a default; `.env.example` extended.
### 5.5 Rate-limit algorithm
`INSERT` the attempt first, then `COUNT` within the window; allow when `count ≤ limit`; delete the row of a rejected attempt is unnecessary (rejected attempts also count, which is the intended throttle); one indexed query pair per request.

## 6. Proposed M4 acceptance tests (concrete)
IDs are for tracking; every item is automated unless marked manual. Matrix: MySQL 8 + MariaDB × PHP 8.3/8.4/8.5.
**A. Registration**
1. Valid farmer → 201, `{user}` shape equals Node's (field names/types), cookies set, `farmer` role, profile, language row, audit `farmer_registered`. 2. Each validation rule (name length, phone invalid/valid forms, email, password 7/8/128/129 chars, county, language fallback, crops cap) returns Node's code, status and message. 3. Duplicate phone, duplicate email (including case variants) → 409 with Node's codes; two parallel registrations of the same phone → exactly one user. 4. `allow_public_registration=false` → 403 `REGISTRATION_DISABLED`. 5. 11th registration from one IP in an hour → 429; phone-hash limit. 6. Transaction atomicity: failure after user insert leaves no orphan rows. 7. SQL-injection strings in every field stored/rejected safely.
**B. Login / logout / me**
8. Phone and email identifiers, all accepted phone formats. 9. Wrong password and unknown user → identical status, body, and (statistically) timing class. 10. Inactive/suspended → 403 only after a correct password. 11. 8 failures per ip+identifier → 429 `AUTH_THROTTLED` with `Retry-After`; unaffected for other identifiers; per-IP limit; recovery after the window (clock control in test). 12. Session cookie attributes (`HttpOnly`, `Secure`/`Lax`, `Path=/`, Max-Age ≤ absolute lifetime); session token not equal across logins; old token still valid after a second login (multi-device) but revoked after logout. 13. `me` for anonymous/expired/revoked/suspended → `{user:null}`. 14. Logout revokes server-side (replay of the old cookie → anonymous) and is idempotent; audit `logout`. 15. Forged/garbage/other-user session cookies → anonymous. 16. Role data comes from the database (changing a role in the DB changes `me` immediately).
**C. Passwords**
17. Node-generated scrypt hashes (fixtures from the Node reference) verify; wrong password fails. 18. After a successful legacy login with `REHASH_ENABLED=true` the stored hash becomes Argon2id, `updated_at` unchanged, login still works; with `false` or scheme `legacy` the hash stays Node-compatible and verifies in Node (cross-check). 19. Concurrent password change during rehash is not overwritten (compare-and-swap). 20. Malformed/foreign hash formats fail closed. 21. Passwords > 128 characters rejected before hashing; Unicode/emoji passwords round-trip. 22. Calibration script reports a cost within the target window on the test host.
**D. Sessions**
23. Idle expiry (12 h) and absolute expiry (7 d) with a controllable clock; sliding `last_seen_at` throttled to ≤ 1 write per 5 min; admin windows shorter; multi-role shortest window. 24. Password reset, suspension and “revoke all” invalidate sessions immediately. 25. Session token stored only as HMAC; DB dump contains no usable token. 26. Fixation: pre-login cookie is never accepted as the post-login session.
**E. Forgot / reset**
27. Existing and non-existing identifiers → identical status/body/headers (timing class); message reflects `deliveryConfigured` truthfully. 28. Token: 192-bit, SHA-256 stored, never present in logs/audit/response (scan log files and DB), expiry honoured, single use under 20 parallel attempts (exactly one success), earlier tokens invalidated, sessions revoked, no auto-login. 29. Limits: 5/h/IP, per-account, reset-endpoint attempts. 30. `MAIL_TRANSPORT=null` sends nothing; loopback SMTP sink receives exactly one message with the token only in the body, header-injection attempts in identifiers rejected, TLS-required settings enforced, failure to deliver does not change the response; `smtp` with incomplete config refuses to boot in production. 31. Phone-only account: documented behaviour (no email) asserted.
**F. CSRF / security / config**
32. All auth writes without/with wrong CSRF → 403 with Node's messages; GET `me` needs none. 33. Forged `X-Forwarded-For`/`-Proto` cannot change the rate-limit key or `Secure` decision (P1). 34. Production config rejects missing `IP_HASH_SECRET`, bad session windows, incomplete SMTP, `PASSWORD_HASH_SCHEME` typos. 35. No response, log or audit row contains a password, token, hash or secret (grep over everything generated during the suite). 36. Fixture/probe routes return 404 in non-test environments and the server refuses `TEST_FIXTURE_TOKEN` in production (already enforced by config).
**G. RBAC / audit**
37. `requireAuth`/`requireRole` matrix (anonymous, farmer, pending/suspended expert, approved expert, admin) on test-only probe routes returns Node's codes/messages. 38. Every auth event writes exactly one audit row with the right action/actor/target/`request_id`/`ip_hash`; audit failure aborts the request; failed login stores only the hashed identifier.
**H. Parity and regression**
39. `tests/m4` auth subset equal on Node and PHP (normalised) apart from the listed deviations; auth-only extract of the golden contract matches. 40. M1 Node suites, M2 matrix (88), M3 suites (75 unit, 37 HTTP, 20 Apache) all still pass; `src/`/`server/` diffs empty; React build output unaffected.
**I. Health (decision H1)**
41. `/health` contract fields unchanged; ≤ 4 DB checks/min under 200 parallel pollers; stale-success bound 15 s; failure recovers within 3 s; `?deep=1` requires the token, bypasses the cache, rate-limited; cache write failure falls back to live.
**K. httpoxy / disabled-function hosts (behavioural; the Apache part exists today in `tests/m3/apache-check.sh`)**
42. A request carrying `Proxy: http://127.0.0.1:9/` never produces `HTTP_PROXY` in the CGI environment, in `getenv()` or in `$_SERVER`, under the shipped `.htaccess` (with a positive control proving the test can detect leakage, and a negative run proving it fails when the rule is wrong). 43. The same request to the real API still returns normal responses. 44. Booting with `disable_functions=putenv,umask,header_remove,ini_set` returns a clean JSON error or a normal response, never a crash. 45. Staging repeat of 42–44 on LiteSpeed (manual, §16).
**J. Manual / external (not automated)**
Real Hostinger PHP version, LiteSpeed cookie/header behaviour, real client-IP header, a real mailbox test of the SMTP self-check (only after you approve and configure SMTP), physical Android sign-in/offline-sync pass.

## 7. Confirmation: frontend and offline-first behaviour stay unchanged
* **No React/TypeScript/Tailwind change is required or planned.** The client touches auth only through `apiFetch` (`/auth/me`, `/auth/login`, `/auth/register`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`); it uses the error `message` text and `res.ok`, reads the `agri_csrf` cookie and the `/csrf-token` JSON; M4 keeps paths, status codes, JSON shapes, messages and cookie names identical.
* **Offline-first is unaffected:** IndexedDB stores, the service worker (API navigation deny-list, runtime caching limited to crops/categories/guides GETs), the sync engine's idempotency/owner-key flows and its 401 handling (recoverable “sign in again”) do not change; downloaded content never depends on a session.
* **Known visible differences (intended):** sessions end after 12 h idle / 7 days absolute (admins sooner) and at password reset; extra throttling messages may appear after repeated failures; the reset email (when enabled) carries the token for the existing paste-in form.
* Verification: M4 exit criteria include an empty `git diff` for `src/`, a clean `tsc`, unchanged build artefacts hash for the frontend bundle, and a manual browser pass against the PHP backend on staging (M9).

## 8. Test infrastructure notes
PHP-side fixtures (`/__test__/users`, `/__test__/count/:table`, `/__test__/audit-count`, probe routes) are needed for M4 black-box tests. Rules: registered only when `APP_ENV=test` **and** `TEST_FIXTURE_TOKEN` ≥ 16 chars **and** a disposable-database marker is present; token compared in constant time; fixed parameterised operations only (no raw SQL); a unit test asserts the router has none of these paths in any other environment and `Config` already refuses the token in production/staging.

## 9. Separation from KPAA (M12–M14) and USSD (M11)
* M4 contains **none** of the KPAA enhancements: no verification codes, no new roles (institution, reviewer), no separation-of-duties rule for advice approval, no audit-chain hashing, no analytics. The earlier statement in `docs/M3_REPORT.md` / `docs/KPAA_FEATURE_GAP_ANALYSIS.md` that M4 might also “close the separation-of-duties and role gaps” is **superseded**: those items are scheduled with the KPAA work (M12) and need their own approval.
* M4 keeps the role set and RBAC mechanism extensible but implements nothing for them.
* **M11 USSD remains unstarted.** Decisions U1–U6 stay recorded only. M4 designs nothing USSD-specific beyond keeping phone normalisation reusable and not hard-coding assumptions that phone-only accounts need passwords (relevant later to U3).
* No SMTP or telecom service is contacted or activated by this review or by M4 tests.

## 10. Decisions and approvals requested
| ID | Question | Recommendation |
|---|---|---|
| **A1** | Approve “M3.1” pre-M4 changes P1–P4 (P1 is a security fix to M3) | Yes — do first |
| **D4** | Preserve/verify scrypt, rehash after login, no forced resets | Approve |
| **D4a** | Rollback-safe window: write legacy scrypt hashes and disable rehash until the fallback window closes, then switch to Argon2id | Approve |
| **D4b** | Argon2id with per-host calibrated cost (fallback bcrypt 12) | Approve |
| **D6** | SMTP transport, default `null`, disabled until configured and self-tested | Approve |
| **D6a** | PHPMailer (vendored, pinned, LGPL licence review) vs hand-written SMTP client | PHPMailer |
| **R-1** | Reset path for phone-only accounts: admin-assisted reset now, SMS/USSD later | Approve (document the limitation) |
| **S1** | Session model: server-side sessions; ordinary 12 h idle / 7 d absolute; admin 30 min / 8 h; experts treated as ordinary | Approve the model; confirm numbers; consider the “remember this phone” variant for farmers only after pilot feedback |
| **H1** | Health: 15 s cached full contract + token-protected deep check | Approve |
| **E-1** | Keep `PHONE_EXISTS`/`EMAIL_EXISTS` responses with stricter limits until SMS/USSD verification exists | Approve (accepted risk) |
| **L1** | Rate-limit matrix in §4.7 (new limits are proposals) | Approve or adjust |
| **IP-1** | Which header carries the real client IP on Hostinger (to be confirmed on staging); until then limits must not rely on a single IP source | Confirm on staging before production enablement |
| **F1** | Audit failure aborts security-critical requests (fail closed) | Approve |

## 11. Estimated effort and risks
M3.1: S (1–2 days). M4: **L** (≈ 8–12 days with the test matrix): Auth core + sessions (M), password hasher + calibration (S), reset + mail abstraction (M), rate limiter + audit (M), tests/fixtures/parity (M–L). Main risks: wrong client-IP source (R2), password cost on a slow shared CPU (calibration + rate limits first), SMTP deliverability (external), session UX on poor connectivity (S1), rollback incompatibility of new hashes (D4a), accidental behavioural drift from Node (mitigated by the parity subset).


## 12. Compatibility of the proposed defaults with Node behaviour and the frozen frontend (task 2)
| Proposed default | Node behaviour today | Frontend behaviour | Compatible? | Notes |
|---|---|---|---|---|
| **D4** keep scrypt hashes and identities, rehash after login, never invalidate accounts | `hashPassword`/`verifyPassword`: `salt(32 hex):hex(64 bytes)`, N=16384,r=8,p=1; accounts keyed by `users.id`, phone and lower-cased email | Client never sees hashes; sends `{identifier, password}` | **Yes** — libsodium scrypt reproduces Node hashes (M2 test 40, both directions); ids, phones, emails migrate unchanged; no forced reset path exists | Rehash must be gated by D4a (rollback window); malformed hashes fail closed and are *reported*, never reset. No account is ever disabled by the migration; only **unexpired reset tokens** and **sessions** are not carried over (see §14, decision MR-1) |
| **D6** configurable SMTP, safe test transport | No mail at all: `deliveryConfigured:false`; dev token is logged to the console only outside production | `LoginPage` shows `res.message` verbatim and asks the user to paste a token (no link handling) | **Yes** | While `MAIL_TRANSPORT=null` the PHP response must remain truthful (`deliveryConfigured:false`); the future email must contain the token text itself |
| **Sessions** 12 h idle / 7 d absolute, shorter admin; rotate on login and privilege change | Stateless HMAC cookie `{uid,exp}`, 7 d, no idle limit, no revocation, no rotation | `AppContext.refreshUser` treats `/auth/me → {user:null}` as signed out; protected calls expecting a session get 401 | **Yes**, with a UX trade-off | Behavioural change (earlier sign-out) is invisible to the code but visible to users; offline queue handles 401 (`syncEngine.ts` 146: retained, “sign in again”); cookie name/flags unchanged |
| **Health** keep contract, add cache/lightweight path | Full DB-backed JSON on every call | Only `res.ok` is read (`usePWA.ts`), every 30 s, URL has `?_=timestamp` | **Yes** if the same URL keeps returning 200 + the same fields | The cache key must ignore `_`; a 15-s cache bounds staleness; deep check on a separate query parameter |
| CSRF/cookie names unchanged | `agri_csrf` read from `document.cookie` by `src/lib/api.ts` | same | **Yes** (must not rename) | `__Host-` prefixes are impossible without a frontend change |
| JSON error messages | Frontend displays `error.message` text directly | same | **Yes** if Node's message strings are kept | Messages are part of the contract (listed in §4.1) |

## 13. Threat model (authentication surface)
Assets: account credentials (phone/email + password hash), session tokens, reset tokens, audit trail, user identity data (phone, email, county), availability of the login path on shared hosting. Actors: anonymous internet client, authenticated farmer/expert, malicious or compromised admin, network observer, other tenant on shared hosting, operator error. Trust boundary: browser ↔ Hostinger edge (LiteSpeed/CDN, unknown) ↔ PHP ↔ MySQL; mail relay (future).
| # | Threat (STRIDE) | Vector | Mitigation planned in M4 | Residual / test |
|---|---|---|---|---|
| T1 | Spoofing: credential stuffing / brute force | many logins | Limits per ip+identifier, per IP, per account (soft); Argon2id cost; hashing only after the limit check; password max 128 | Distributed attacks across IPs → soft per-account delay; tests 11, 29 |
| T2 | Info disclosure: account enumeration | login/forgot/reset/register responses and timing | Generic messages, dummy hash verify, equalised forgot-password path, uniform reset failures; registration 409 kept (E-1, accepted) | Registration oracle remains; tests 9, 27 |
| T3 | Spoofing: session theft (XSS, malware, shared phone) | cookie exfiltration | `HttpOnly`, `Secure`, `Lax`; server-side revocable sessions; idle + absolute limits; token stored only as HMAC; rotate on login/privilege change; admin short windows | Local device compromise out of scope; tests 12, 23–26 |
| T4 | Spoofing: session fixation | attacker plants cookie before login | New token on login; unknown cookies never adopted | test 26 |
| T5 | Tampering: CSRF | cross-site form/fetch | Double-submit (unchanged), `Lax` cookies, CORS allow-list | Cookie tossing from a sibling subdomain (R11, accepted) |
| T6 | Spoofing/elevation: password-reset takeover | stolen email, token in logs/referrer/URL, guessing | 192-bit token, hashed at rest, 30 min, single use (conditional update), earlier tokens invalidated, sessions revoked, never in URL/log/audit/response, notification email | Mailbox compromise out of scope; tests 28–30 |
| T7 | Tampering: SMTP/header injection | newline in identifier/name reaching mail headers | Fixed subject/from, recipient taken from the DB row, strict CRLF rejection, PHPMailer/validated client | test 30 |
| T8 | Host-header poisoning of reset links | forged `Host` | No links in the email body (frozen UI); any future link uses configured `APP_URL`, never the request host | — |
| T9 | DoS: expensive hashing / table growth | login floods, huge passwords, session spam | Limits first, 128-char cap, calibrated cost, per-user session cap (proposed 10, oldest revoked), purge job, rate-limit insert cost | Shared-host CPU is the real ceiling; load test in staging |
| T10 | Repudiation / tampering with audit | deleting or forging log rows | Append-only usage (no delete API), request ids, HMAC IP hashes, audit failure aborts security events; DB user has no DDL; retention policy | Admin with DB access can alter rows (optional hash chaining belongs to KPAA/M12) |
| T11 | Rate-limit evasion | forged `X-Forwarded-For`, rotating identifiers | **P1** fix; per-IP and per-identifier keys; limits fail closed on DB error | R2 (unknown real-IP header) until staging |
| T12 | Elevation: role tampering / mass assignment | extra JSON fields (`roles`, `status`) at registration or profile update | Registration whitelists fields and always assigns `farmer`; roles only changed by admin endpoints with RBAC + audit + session revocation | test 37 |
| T13 | Injection | SQL in identifiers/names | Prepared statements only, `EMULATE_PREPARES=false`; tests use hostile strings | test 7 |
| T14 | Information leak via logs/errors | passwords/tokens in logs, stack traces | Logger redaction by key and value shape; generic error bodies; grep-based leak test over all artefacts | test 35 |
| T15 | Downgrade / rollback weakness | fallback to Node after cutover | D4a hash-scheme flag; sessions are not shared (fresh login); documented | Rolled-back users lose PHP-era data (rollback plan §16) |
| T16 | Test/demo functionality reachable in production | fixtures, probe routes, demo accounts | Config refuses test tokens/flags in production; routes absent unless `APP_ENV=test`; demo seed refuses production | tests 36 |
| T17 | Open proxy / SSRF via environment | `Proxy:` header → `HTTP_PROXY` | Header stripped (`RequestHeader unset Proxy`), env/`$_SERVER` cleared in bootstrap; no outbound HTTP in M4 | §15 behavioural test |
| T18 | Backup/host-tenant disclosure | database or `.env` copies | Secrets only in `.env` (0600, above web root), hashes Argon2id/scrypt, least-privilege DB user, hygiene warnings | Host-level compromise out of scope |

## 14. Migration risks (data and behaviour)
| # | Risk | Detection (before cutover, read-only on a **copy**) | Handling |
|---|---|---|---|
| MR1 | Password hashes that do not match `^[0-9a-f]{32}:[0-9a-f]{128}$` | Count and list user ids | Report; user keeps the account and uses the reset path; **never auto-reset, delete or merge** |
| MR2 | Case-variant duplicate emails (SQLite allows, MySQL UNIQUE rejects — D16) | Group by `lower(email)` | **Stop and report**, owner decides |
| MR3 | Stored phone numbers not in canonical `+231XXXXXXXXX` form (seeds, bootstrap CLI, old data) while login normalises input | Compare `phone` with `normalizeLiberianPhone(phone).normalized` for every row | Identities are **not rewritten**; PHP login queries the same `phone = normalized OR lower(email) = ident` as Node and additionally the raw trimmed form, so every existing account can still sign in; list mismatches for the owner |
| MR4 | Emails stored with upper case or whitespace | `email != lower(trim(email))` | Preserve; MySQL collation is case-insensitive; lookups lower-case |
| MR5 | Sessions are not carried over (approved) | — | Everyone signs in again once; old `agri_session` cookies are treated as anonymous and cleared on the first auth response; announce it |
| **MR6 (decision MR-1)** | **Unexpired password-reset tokens in flight at cutover** | Count `password_resets` with `used_at IS NULL AND expires_at > now` | Proposal: do **not** migrate them (they expire in ≤ 30 min anyway; users simply request again). This is the only “invalidation” and it affects tokens, not accounts. Alternative: migrate hash+expiry unchanged (works because sha256 hashing is identical) |
| MR7 | `rate_limit_attempts`, `sync_operations`, idempotency rows | — | Not migrated (counters restart; idempotency window ≤ 30 days is lost, documented in the sync plan) |
| MR8 | `audit_logs.ip_hash` computed with Node's session secret (or its ephemeral per-process secret) | — | Migrated as opaque strings; PHP uses a separate `IP_HASH_SECRET`, so old and new hashes cannot be correlated; documented |
| MR9 | `users.updated_at` semantics | — | Rehash does not touch it; profile edits do (D1 principle) |
| MR10 | Admin accounts: the demo DB had none | Count `admin` role holders | No default admin is created; use the env-driven CLI (`bin/seed.php admin`) |
| MR11 | Fallback-window incompatibility of new hash formats | — | D4a (legacy scheme + rehash off until the window closes) |
| MR12 | Time-zone/format differences in expiry comparisons | — | All stored as UTC `DATETIME(3)`; PHP compares in SQL with `UTC_TIMESTAMP(3)`; tests with a controllable clock |
| MR13 | Argon2id CPU on shared hosting; a wave of first logins | — | Legacy verify costs ≈ 50–460 ms depending on the build; calibration script; limits-before-hash; per-host cost tuning |
| MR14 | Concurrent sessions per user are unlimited in Node | — | Cap (proposal 10) to bound table growth |
| MR15 | No cron on the hosting plan | — | Opportunistic purge (≤ 1×/day guarded by a lock row) as a fallback |

## 15. Behavioural httpoxy test (task 5) — and the defect it found
**Test (implemented as an M3 test asset in `tests/m3/apache-check.sh`, no M4 code):** a private Apache 2.4 instance (own config, loopback) serves three probe directories, each with a CGI script that prints the environment it receives and a PHP probe that prints `getenv('HTTP_PROXY')` and `$_SERVER['HTTP_PROXY']`: `poxy_on` (the **actual** rule line extracted from `backend-php/public/.htaccess`), `mech_on` (the same directive form applied to a harmless stand-in header `X-Poxy-Test`) and `mech_off` (no rule = positive control). Assertions: the control leaks the stand-in header into the CGI environment (so the test can detect failures); the shipped directive form removes it; a real `Proxy: http://127.0.0.1:9/` request never produces `HTTP_PROXY` in the CGI env, `getenv` or `$_SERVER` under the shipped rule; the real API still answers 200 with the header present; the bootstrap itself clears `HTTP_PROXY` from the environment and `$_SERVER` even when they were injected; and booting with `disable_functions=putenv,umask,header_remove` yields a clean JSON error.
**Findings:** (1) the original rule `RequestHeader unset Proxy early` **did nothing** inside `.htaccess` (the stand-in header reached the CGI environment); fixed to `RequestHeader unset Proxy`. Restoring `early` makes the new test fail, proving the test would have caught it. (2) Apache 2.4.56 already ignores the `Proxy` header for CGI (a fix shipped in 2.4.25), so on this server the real header cannot serve as its own positive control — the rule is defence in depth for older Apache/LiteSpeed. (3) Disabled-function hosts crashed the bootstrap; guards added. Results: PHP 8.3.30, 8.4.17, 8.5.5 → 28/28 Apache assertions; unit 75/75; HTTP 37/37; M2 88/88; Node suites unchanged.
**Still to do on LiteSpeed (manual):** repeat with a probe script on the staging host (S-L4 below). Note: the test-only probe files are generated in a temporary directory and are never part of the shipped web root.

## 16. PHP 8.2 and Hostinger LiteSpeed compatibility checks required before production (all NOT VERIFIED today — need the staging host)
| ID | Check | How | Pass criterion |
|---|---|---|---|
| S-P1 | PHP version set to ≥ 8.2 for the domain; 8.2 itself exercised | hPanel PHP selector + run `php backend-php/tests/m3_unit.php` and `bin/check-config.php` over SSH (or a temporary, token-protected diagnostic removed afterwards) | Unit suite passes on the host's PHP; version guard not triggered |
| S-P2 | Extensions: `pdo_mysql`, `sodium`, `mbstring`, `openssl`, `curl`, `fileinfo`, `gd`; Argon2id available | `php -m`, `password_hash` self-test (`bin/check-env.php`, M4) | all present; `PASSWORD_ARGON2ID` defined; otherwise bcrypt fallback documented |
| S-P3 | `disable_functions` / `open_basedir` / `memory_limit` (≥ 128 MB for Argon2id), `max_execution_time` ≥ 30, `post_max_size` ≥ 8M | `ini_get` report | App boots; no crash on disabled `putenv`/`umask`/`header_remove`/`ini_set`; log dir writable under `open_basedir` |
| S-P4 | OPcache, timezone, `error_log` location, `display_errors=0` | `ini_get` | Errors never reach clients; logs private |
| S-P5 | Argon2id cost calibration on the real CPU | `bin/calibrate-password.php` | 250–400 ms verify at the chosen parameters |
| S-L1 | `.htaccess` honoured by LiteSpeed: rewrite to `index.php`, `Options -Indexes -MultiViews`, `AcceptPathInfo Off`, `FilesMatch` + `Require all denied`, `ErrorDocument` JSON bodies, `RequestHeader`/`Header always set` | Re-run the Apache-check assertions (`curl`) against `https://staging/api/...` | All 28 assertions equivalent pass |
| S-L2 | Environment/`.env` access: variables from `.env` above the web root load; `SetEnv`-style variables not required | `check-config` over HTTP-less CLI + one request | `ok:true` configuration; no secret reachable by URL (`/api/.env`, `/.env`, `/backend-php/…` all non-200) |
| S-L3 | Client IP and scheme: which of `REMOTE_ADDR`, `X-Forwarded-For`, `CF-Connecting-IP`, `X-Forwarded-Proto` carries the truth behind Hostinger's edge; hop count for P1 | Send a request with forged headers and compare what PHP sees (temporary diagnostic) | One documented trusted source; forged values ignored; `TRUSTED_PROXY_HOPS` set accordingly |
| S-L4 | httpoxy on LiteSpeed | Probe script + `Proxy:` header | `HTTP_PROXY` absent in env/`getenv`/`$_SERVER` |
| S-L5 | Edge caching/CDN/LiteSpeed Cache never caches `/api/*`: `csrf-token` differs per visitor, `Set-Cookie` never shared, `no-store` honoured, `Vary: Origin` | Two clients, repeated GETs, response headers | No cross-user cache hits |
| S-L6 | WAF/Imunify360/ModSecurity false positives and blocks | Replay the suite's hostile-string cases and normal Liberian-English free text | No legitimate request blocked; blocked ones return a safe error |
| S-L7 | Cookies end-to-end over HTTPS: `Secure`, `HttpOnly`, `SameSite=Lax`, multiple `Set-Cookie` headers, lifetimes | Browser devtools + `curl -i` | As M3 tests |
| S-L8 | Request body reading: `php://input` with chunked bodies, LiteSpeed body-size limit ≥ 4 MB, `Content-Length` handling, HTTP/2 | Large/chunked POSTs | 413 at the configured limit, never a hang |
| S-L9 | Header/method handling: `HEAD`, `OPTIONS` preflight, `PATCH`/`DELETE` reach PHP | `curl -X` set | Same results as Apache tests |
| S-L10 | Cron availability and SSH for purge/calibration jobs | hPanel | Cron or documented opportunistic fallback |
| S-L11 | HTTPS-only + HSTS rollout, certificate, HTTP→HTTPS redirect without redirect loops behind the edge proxy | Browser + `curl -I` | Single redirect; cookies `Secure` |
| S-L12 | Resource limits (entry processes, CPU) under the health-poll load with cache H1 | Staging load test (200 pollers) | No 503/508 at expected concurrency |

## 17. Log rotation and retention policy — **proposal for separate approval (nothing here is in force)**
Current state (M3): application logs are JSON lines in `LOG_DIR`, one file per day (`app-YYYY-MM-DD.log`), mode 0600 in a 0700 directory, with key/value redaction; there is **no** rotation, compression, size cap or deletion, and hygiene warnings only. The audit trail lives in the `audit_logs` table (separate from log files).
| ID | Proposal | Value (to approve or change) |
|---|---|---|
| LR-1 | Rotation | Daily files (already); gzip files older than 2 days; cap each daily file at 20 MB (after the cap, one “log cap reached” line per hour instead of more detail, so a flood cannot fill the disk quota) |
| LR-2 | Retention of application/error logs | 30 days, then deleted by `bin/cron-purge.php`; deletion counts written to a summary line; `--dry-run` supported |
| LR-3 | Retention of database operational data | `rate_limit_attempts` 2 days; `user_sessions` expired/revoked rows 30 days after expiry; `password_resets` used/expired rows 30 days; `sync_operations` 30 days; `audit_logs` 12 months then archive/delete (consistent with plan §6.7); all configurable |
| LR-4 | Content rules | Logs and audit rows contain hashed IP/identifier, request id, error class and sanitised message only; never passwords, tokens, reset codes, hashes, cookies, request bodies, or phone numbers; a leak test greps all generated logs |
| LR-5 | Operations | Purge by cron where available, else an opportunistic once-a-day purge guarded by a lock; free-space/size check reported by the deep health check; backups of logs follow the same retention; a legal-hold switch suspends deletion; web-server access logs on Hostinger are outside our control and subject to the host's policy |
| LR-6 | Review | Annual review; any change to retention requires the same approval path |
These are **proposals only**; no retention duration is approved or implemented.

## 18. Updated list of decisions that still need your approval
Carried over from §10 (A1 M3.1 fixes, D4, D4a, D4b, D6, D6a, R-1, S1, H1, E-1, L1, IP-1, F1) plus new:
| ID | Question | Recommendation |
|---|---|---|
| **A1′** | The httpoxy `.htaccess` correction and the disabled-function guards (§15) are already applied to M3 files as test-driven fixes; confirm they are acceptable as part of M3.1 rather than waiting for approval | Accept |
| **SM-1** | Session rotation rules in §3.3 (new token on login; own password change rotates and revokes others; admin changes to another user's role/status/password revoke all of that user's sessions) | Approve |
| **SM-2** | Per-user concurrent session cap (10, oldest revoked) | Approve |
| **MR-1** | Do not migrate unexpired password-reset tokens (users request again); everything else about accounts is preserved | Approve |
| **LR-1…LR-6** | Log rotation/retention proposal in §17 (all numbers) | Approve or adjust — separately from M4 |
| **T-1** | Threat-model residual risks accepted: registration enumeration (E-1), cookie tossing (R11), unknown edge IP source until staging (R2) | Accept, with staging verification |
| **C-1** | The capture/loopback mail transports are test-only and refused in production | Approve |
