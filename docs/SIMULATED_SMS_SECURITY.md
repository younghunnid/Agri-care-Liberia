# Simulated SMS authentication (Node reference): implementation, security design, tests and porting guide

Status: **implemented in the Node reference backend and the React frontend; no real SMS exists anywhere.** Base commit `6a832c4` (H2). PHP/MySQL M4 is **not started**; section 9 is the specification for porting this to PHP later. Nothing here was deployed, pushed or merged.

## 1. What it does
| Requirement | Result |
|---|---|
| Phone registration (+231) | Existing registration normalises Liberian numbers; no network is inferred from a prefix. Registration sends **no** SMS; the number starts **unverified** with a 72-hour claim window. Password minimum is now 10. |
| Six-digit verification service | `server/otp.ts`: purposes `phone_confirm`, `new_device_login`, `password_reset`, `phone_change` (+ `phone_change_new`, `phone_claim`). |
| Simulated SMS provider | `server/sms/` (`SmsProvider` interface, `SimulatedSmsProvider`, `UnavailableProvider`). |
| New-device login | `POST /auth/login` returns **202 VERIFICATION_REQUIRED and no session** unless the device cookie is a valid trusted device; `POST /auth/verify-device` creates the session. |
| Forgot password | Four screens, generic answers, separate recovery challenge, ends sessions and trusted devices. |
| Security settings | `/account/security`, `/account/devices` (masked phone, verification status, change password, change phone, trusted devices, recovery options). |
| Offline | Lessons, advice, quizzes, calculator unchanged. Every security action needs the server and says so; no secret is stored in IndexedDB/localStorage/sessionStorage. |
| Demo notice | "Demo mode — verification messages are simulated. No SMS will be sent." on every security screen (`DemoSmsBanner`). |

## 2. Architecture
```
Browser ──(CSRF + cookies)──> /api/v1/auth/* , /account/*           routes/v1.ts, routes/authSecurity.ts
                                    │
                    otp.ts (challenges)  authSecurity.ts (devices, session version, password policy, phone ownership)
                                    │
                         sms/index.ts → SmsProvider ─ SimulatedSmsProvider (memory) | UnavailableProvider (fail closed)
                                    │
                 SQLite 007: verification_challenges, trusted_devices, otp_rate_events, phone_claim_holds, users(+3 columns)
```
Config is validated at start-up (`server/authConfig.ts`); an unsafe combination stops the server.

### 2.1 Codes
* `crypto.randomInt(0, 1_000_000)` zero-padded; **5 minutes**; **5 wrong attempts** then `locked`; a new challenge for the same (user, purpose) marks older ones `superseded`; success marks `consumed` (single use).
* Stored only as `HMAC-SHA256(derivedKey, publicId | purpose | userId | phone | code)` (`OTP_HMAC_SECRET`); compared in constant time. User, purpose, phone and challenge are inside the digest, so a code cannot be reused for another action, account, number or challenge.
* The challenge is **bound to the starting browser**: a 192-bit random secret travels in the HttpOnly cookie `agri_challenge` (`<publicId>.<secret>`); only its SHA-256 is stored. A correct code typed from another browser fails.
* **Atomicity:** every transition is one conditional `UPDATE ... WHERE status='pending' AND expires_ms > now AND attempts < 5 AND ...`; the affected-row count decides success. 25 parallel correct submissions give exactly one success; parallel wrong attempts stop at 5 (tested).
* Resend: 60 s cooldown, at most 3 codes per challenge (a resend replaces the code; attempts are cumulative so resending cannot dodge the lock).
* Limits (sliding window, hashed keys, `otp_rate_events`): 5 SMS/hour per phone, 5 per user, 20 per IP, 200 global; 30 verify attempts / 15 min per IP; forgot-password 3/hour per identifier and 5/hour per IP; phone-claim 3/hour per number and 5/hour per IP; password and phone-change attempts 5 per 15 min.
* Codes are never logged, never returned, never in audit rows; audit and challenge tables are scanned in the tests.

### 2.2 Simulated provider and inbox
* Sends nothing. Messages live **in process memory** only, 10-minute TTL, at most 200, appended with "[DEMO: simulated SMS, nothing was sent]".
* **Only synthetic numbers** (`+23177000xxxx`, `SIMULATED_SMS_ALLOWED_PREFIX`) are accepted. Any other number is rejected (HTTP 422 `PHONE_NOT_ALLOWED`), so a real person's number cannot be used in demo mode. Checked against the demo accounts: `+231770000101` (farmer), `+231770000201` (expert) are inside the range.
* Inbox: `GET /api/v1/dev/simulated-sms` (and `DELETE` to clear) requires header `X-Demo-Operator-Token` = `DEMO_OPERATOR_TOKEN` (separate secret, at least 32 characters, different from `OTP_HMAC_SECRET` and `SESSION_SECRET`), compared in constant time, rate limited to 60/min, `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`. A signed-in admin session is **not** enough, and the token in the URL is refused. It exists only when `SMS_PROVIDER=simulated` **and** `SIMULATED_INBOX=1` **and** not production; otherwise it behaves like a route that does not exist (in a production-mode server it falls through to the static fallback, tested with a real child process).
* Presenter UI: `/demo/sms-inbox` (token typed into memory only, never stored, never in the URL).
* No endpoint, log line, or console output contains a code.

### 2.3 New-device sign-in
1. `POST /auth/login`: password checked (existing 8/15 min throttle). Wrong password or unknown account: identical 401.
2. Valid, unexpired, unrevoked `agri_device` cookie **belonging to this user** (SHA-256 stored) → session as before.
3. Otherwise: `phone_verified_at` set → challenge `new_device_login`; not set → `phone_confirm` (first sign-in after the rollout verifies the number). **202 `{status:'VERIFICATION_REQUIRED', purpose, maskedPhone, expiresInSeconds, resendAfterSeconds, demo}`, no session cookie.** If SMS cannot be sent: 503 `SMS_UNAVAILABLE` (fail closed); non-synthetic number in demo mode: 422; account with no usable number: 409 `PHONE_RECOVERY_REQUIRED`.
4. `POST /auth/verify-device {code}` → session cookie (`sv` = current `session_version`) + `agri_device` (HttpOnly, SameSite=Lax; `Secure; SameSite=None; Partitioned` over HTTPS as the existing cookie options do) with **30 day** `Max-Age`, a `trusted_devices` row (label from the user agent for display only; **never** used for trust), `phone_verified_at` set.
5. The challenge records the number it was sent to; if the account's number changed meanwhile the code is worthless.
Protected routes need a session, so they return 401 in the pending state (tested for nine routes, forged and old-format cookies).

### 2.4 Server-enforced session revocation
The session cookie carries `sv`; `sessionMiddleware` compares it with `users.session_version`. Cookies without `sv` (issued before this milestone) or with a stale one are rejected. `session_version` is bumped by password reset, password change (this device gets a fresh cookie), revoke-all, phone change, operator recovery, and release of an unverified number. **Everyone signs in again once after the rollout.**

### 2.5 Forgot password
`POST /auth/forgot-password` (503 for everyone if no provider) → always the same 200 body and cookie names. Eligible = active, **verified** phone on file → real challenge + SMS; otherwise a **dummy challenge row** with the same timers, attempts, expiry, lock and state endpoint, and nothing is sent (tested, including attempt-by-attempt equality). Any send failure for a real account is swallowed to keep the answer identical. `.../verify {code}` → grant (10 minutes, single use); `POST /auth/reset-password {newPassword}` → policy check (10+ characters, not common, not containing phone digits or name) **before** the grant is consumed, then in one transaction: new scrypt hash, `session_version` bump, all trusted devices revoked, all pending challenges superseded, old `password_resets` closed. It **never signs in**. Audit `password_reset_requested/_completed`.

### 2.6 Phone ownership (decision 8)
* A number is never reserved just because it was typed. `users.phone_claim_expires_at` = registration + 72 h (existing accounts: migration + 30 days). An **unverified, expired** claim can be released to a new registrant; the displaced account keeps its data but its number becomes a tombstone (`released:<id>:<random>`) and its sessions/devices end.
* A **verified** number is never taken. An **unexpired** unverified claim is not taken (registration returns the existing `PHONE_EXISTS`, so the golden snapshot is unchanged).
* **Proof-of-possession recovery for the real owner:** `POST /auth/phone-claim/start {phone}` (generic answer, dummy challenge when not applicable) sends a code to that number; `.../verify` releases the unverified holder and sets a 15-minute **hold** bound to the proving browser (`agri_claim` cookie, hash stored) so nobody can front-run the owner's registration.
* Changing a verified number: password + code to the **current** number + code to the **new** number; both checked server-side in order; a pending login challenge for the account dies when a change starts; success bumps `session_version`, revokes other devices, keeps the current session. A new number that belongs to another verified account, or an unexpired claim, is refused.

### 2.7 Existing accounts and recovery (decision 7)
Existing real numbers become "unverified with a 30-day grace window"; synthetic `+23177000xxxx` numbers (demo accounts) are marked verified by the migration and the seed. At the next sign-in the account gets a `phone_confirm` challenge and **no session until it succeeds**. **Operator recovery** for accounts that cannot verify (lost SIM, tombstoned number): `npm run auth:recover-account -- --user <phone|email|id> --new-phone <+231…> --reason "<how identity was verified>" --confirm` (see `scripts/recover-account.ts`): the operator must verify identity out of band; the script points the account at the new number as unverified, bumps `session_version`, revokes devices, cancels codes and writes an `account_recovery_by_operator` audit row. The farmer then signs in with the existing password and the code goes to the **new** number. The script never sets a password and never signs anyone in. Tested against a temp database.

### 2.8 Configuration (fail closed, `server/authConfig.ts`)
`SMS_PROVIDER` `none` (default) | `simulated`; `SIMULATED_INBOX`; `DEMO_OPERATOR_TOKEN`; `OTP_HMAC_SECRET` (required in production, 32+ characters; ephemeral per process outside production); `SIMULATED_SMS_ALLOWED_PREFIX`; `TRUSTED_DEVICE_DAYS` (1 to 30; 30 is the approved ceiling). **Production = `NODE_ENV=production` and `APP_ENV` not `test`.** Production **refuses to start** with the simulated provider, the inbox or the operator token. Errors name settings, never values. **To demo:** run with `NODE_ENV` unset or `development`, e.g. `SMS_PROVIDER=simulated SIMULATED_INBOX=1 DEMO_OPERATOR_TOKEN=<48 random hex> npm run dev`. `npm start` (production mode) deliberately cannot do new-device sign-in until a real provider exists (section 8).

### 2.9 Database migration `007_sms_verification.sql` (reversible)
Adds `users.phone_verified_at`, `users.phone_claim_expires_at`, `users.session_version` and the tables `verification_challenges`, `trusted_devices`, `otp_rate_events`, `phone_claim_holds`. Times in the new tables are integer milliseconds. Down: `server/migrations/down/007_sms_verification.down.sql`, applied with `npm run db:migrate:down -- 007_sms_verification --confirm` (refuses without `--confirm`). Tested: up, down, up again; and the migration on a database that already has accounts. Tombstoned numbers are **not** restored by the down-migration; back up before rolling back.

## 3. Endpoint list (Node, all under `/api/v1`, CSRF required for non-GET)
Public: `GET /auth/challenge`, `POST /auth/login` (changed), `/auth/verify-device`, `/auth/resend-code`, `/auth/forgot-password` (changed), `/auth/forgot-password/verify`, `/auth/reset-password` (changed: no token, uses the grant), `/auth/phone-claim/start`, `/auth/phone-claim/verify`, `POST /auth/register` (phone-claim rules, 10-character password). Signed in: `GET /account/security`, `GET /account/devices`, `DELETE /account/devices/:id`, `POST /account/devices/revoke-all`, `POST /account/password`, `POST /account/phone/confirm/start|verify`, `POST /account/phone/change/start|verify-current|verify-new`. Dev only: `GET|DELETE /dev/simulated-sms`. Test only (`APP_ENV=test` + fixture token): `/__test__/trusted-devices`, `/users/by-phone/:phone`, `/users/claim-expiry`, `/challenges/age`, `/challenges`, `/otp-rate-events`, `/audit-text`.

## 4. Audit events (no codes, tokens, phone numbers or secrets)
`otp_sent`, `otp_verified`, `otp_failed`, `otp_locked`, `device_trusted`, `device_revoked`, `devices_revoked_all`, `password_changed`, `password_reset_requested`, `password_reset_completed`, `phone_confirmed`, `phone_change_started`, `phone_changed`, `phone_claim_released`, `account_recovery_by_operator`, plus existing `login_success`/`login_failed`/`farmer_registered`.

## 5. Contract and test-fixture impact (decision 2)
* **Device verification is enforced everywhere, including in the contract runner and normal development.** There is no global switch.
* The only change to recorded behaviour would have been `login ok`. Instead of disabling verification, the test infrastructure uses a **narrow fixture adapter**: `POST /__test__/trusted-devices` (mounted only with `APP_ENV=test` and the fixture token) creates a **real** trusted-device row for an existing test user and returns its token; the test puts it in the cookie jar as `agri_device` and then signs in through the **normal** `/auth/login` path. `Step.before` (unrecorded setup hook) does this for `login ok`; the runner does it for its three setup logins.
* **Golden snapshot: unchanged.** `npm run test:contract`: all 63 requests match. No golden file was edited. The API suite helper `trustedJar()` does the same for its few logins.
* `startBackend()` now configures the simulated provider and the operator token for in-process runs (test environment only) and exposes `operatorToken`.
* Changed in the Node reference: login, register, forgot/reset (the old paste-a-token flow and its console-printed token are removed), `signSessionToken(userId, sessionVersion)`, `sessionMiddleware`, seed (demo numbers verified), fixtures.

## 6. Tests (all run in this session)
| Suite | Result |
|---|---|
| `npm run test:sms` (new, 32 tests, black-box over HTTP on a disposable DB, plus a real production-mode child server and migration/recovery scripts) | **32 / 32** |
| `test:h1` / `test:h2` | 18 / 18, 16 / 16 |
| `test:api` | 31 / 31 |
| `test:harness`, `test:offline` | 4, 22+6+3 pass |
| `test:contract` | 63 / 63 match the **unchanged** golden, 4 consecutive runs |
| `test:m3` (PHP foundation HTTP suite, uses the Node harness; PHP 8.5, MySQL 8 and MariaDB 10.4 scratch engines) | 48 / 48 |
| `tsc --noEmit`, `npm run build` | pass |
| Real-browser end-to-end, synthetic accounts, headless Chrome 375 px, real offline emulation | **37 / 37** (sign-in with code, wrong code, offline attempts, trusted device, device removal, forgot password, phone change, inbox page, lessons and calculator offline) |
| Expert workflow browser regression (signed-in expert reply, offline queue, exactly-once) | 31 / 31 |
| Mobile and accessibility audit of the 6 new screens at 320/375/768 px (18 combinations) | 0 findings (overflow, 44 px targets, labels, text size, contrast) |

The 18 requested cases: correct code (1); incorrect (2); expired (3); five failures (4); reuse/replay (5, 17); resend cooldown and cap (6, 6b); binding to browser, user, purpose, challenge (6c); unknown phone (7); duplicate/unverified/expired ownership and proof-of-possession recovery (8, 8b); new device without verification and direct API bypass (9); trusted-device login and cross-user device (10, 10b); revoked device (11); password reset incl. weak passwords and single use (12, 12b); session invalidation after reset, change, revoke-all (13); offline attempts (browser run: requests cannot reach the server, UI blocked, storage scan); unauthorised inbox (15); production restrictions in config and in a real production-mode process (16a, 16b); concurrency (17); rate limits per phone, user, IP, identifier (18a); phone change, claim, confirm, existing-account verification, password policy (19 to 19e); migration and operator recovery (20, 20b, 21); no secret in responses, audit rows or logs (99).

## 7. Known limitations and residual risks
1. **Production cannot sign in from a new device** until a real provider exists (fail closed by design, 503). Trusted devices keep working. Real farmers' numbers cannot receive demo codes (the simulated provider accepts only `+23177000xxxx`).
2. Admin accounts are subject to the same rule. Accounts created by `db:bootstrap-admin` or by an admin for a real number need an operator recovery path or a real provider before they can sign in from a new device.
3. `PHONE_EXISTS` on registration still reveals that a number is registered (existing accepted risk E-1); the new flows do not add enumeration.
4. Real-provider timing differences: a real SMS send makes the "known account" path slower than the dummy path in forgot-password. Constant-time padding is left for the provider milestone.
5. Anyone can trigger an SMS to any number up to the per-phone limit (3 claims, 5 codes per hour). SMS-pumping defences (country/prefix checks, CAPTCHA, spend caps) belong with the real provider.
6. The simulated inbox is in process memory and lost on restart; fine for a demo.
7. A registrant has a session before verifying the number (they just created the account with a password); the unverified number cannot recover the account and can be claimed by its real owner.
8. Camera, microphone, audible speech, physical phones and screen readers were not tested; SMS delivery to real phones, real network latency and multi-process SQLite locking were not tested.
9. SQLite single-process: the "atomic" guarantees are also written as conditional UPDATEs so they hold on MySQL, but concurrency was only tested on the single-process Node server.

## 8. Migration plan for a real SMS provider
1. Add `HttpSmsProvider implements SmsProvider` (`send(to, message, purpose)` returns `{accepted, providerMessageId}`) and `SMS_PROVIDER=live` in `authConfig.ts` with its own credentials (environment only, never logged). **No change** to `otp.ts`, routes or screens.
2. Choose the provider per `docs/USSD_PLAN.md` (one aggregator for MTN and Orange Liberia), agree sender ID, delivery receipts, message templates and cost caps; legal and consent review. No contact with MTN, Orange or any aggregator until you approve.
3. Add SMS-pumping defences (prefix allow-list, per-country caps, spend circuit breaker, CAPTCHA on forgot-password/claim) and delivery-failure handling (provider error → `send_failed`, generic answers preserved).
4. Template: "Agri-Advisory code 123456. Valid 5 minutes. Do not share it." (no names, no links).
5. Production gate: remove the simulated provider and operator token from production config (already refused); monitoring for send failures and abnormal volume; kill switch that fails closed; operator-recovery runbook; document support contacts.
6. Staged rollout: enable for new registrations first, then existing accounts at next sign-in; keep the 30-day grace window for old accounts; fallback is operator recovery.

## 9. Porting guide: Node to PHP 8.2 + MySQL/MariaDB (M4, not started)
* **Schema:** `002_auth.sql` with the same tables and columns (`phone_verified_at`/`phone_claim_expires_at` as DATETIME(3), `session_version` INT UNSIGNED, challenge/device times as BIGINT milliseconds or DATETIME(3)); register the new tables in `backend-php/tests/php_only.php` (the M3.1 allow-list) and keep `001_schema.sql` untouched. The `users` columns are additive to the existing table, so the M2 parity check must also allow these three PHP/Node-shared columns (they exist in both schemas after 007).
* **Atomicity:** replace each Node conditional `UPDATE` with the same statement in PDO and check `rowCount() === 1` (MySQL reports changed rows, so set `PDO::MYSQL_ATTR_FOUND_ROWS`, or add a monotonic `updated_ms` in the SET clause). Wrap multi-row operations in transactions with `SELECT ... FOR UPDATE` where Node used `BEGIN IMMEDIATE`.
* **Codes:** `random_int(0, 999999)` with `str_pad`; `hash_hmac('sha256', ...)` and `hash_equals`; same digest input string `publicId|purpose|userId|phone|code` and the same derived key (`hash_hmac('sha256','otp-v1'...)` mirrors `hmac(label, value)` in `otp.ts`), so a parity test can verify digests produced by either side.
* **Cookies/sessions:** M4's server-side sessions can replace `sv` (same behaviour: revoke by bumping or deleting rows); keep cookie names `agri_session`, `agri_device`, `agri_challenge`, `agri_claim` and flags. Use the M3.1 trusted-proxy logic for the client IP used in limits (IP-1 staging gate still applies).
* **Provider:** `SmsProvider` interface and `SimulatedSmsProvider` (non-production only; the in-memory inbox needs a database table or APCu in PHP because requests do not share memory: use a dev-only table with TTL and the same operator-token route; refuse in production in `Config::load` like the M3.1 mail checks).
* **Config:** `SMS_PROVIDER`, `OTP_HMAC_SECRET`, `DEMO_OPERATOR_TOKEN`, `SIMULATED_INBOX`, `SIMULATED_SMS_ALLOWED_PREFIX`, `TRUSTED_DEVICE_DAYS` with the same fail-closed rules (extend `Config.php`).
* **Parity tests:** reuse `tests/sms-auth.test.ts` unchanged against the PHP server via `API_BASE_URL` plus the fixture adapters (`/__test__/trusted-devices`, `challenges/age`, ...) implemented on the PHP side; expect identical status codes and bodies.
* **Operator recovery:** port `scripts/recover-account.ts` to `backend-php/bin/recover-account.php`.

## 10. Decisions status
All eight decisions you approved are implemented as written, with these concrete choices: contract handled by the fixture adapter (no global switch, golden unchanged); synthetic range checked against the demo accounts; separate operator secret with no-store headers and a production refusal; unverified claims expire (72 h new, 30 days existing) and the verified owner can recover a number by proving possession; operator recovery script documented and tested.
