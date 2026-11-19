# Phase 0 security fixes (approved scope only)

Status: **implemented locally, committed locally, not deployed, pushed or merged.** Phase 1 (advice cards, triage, harvest listings, buyer discovery, aggregates, USSD simulator) **has not been started.** Inputs: `docs/DEPLOYMENT_SECURITY_REVIEW.md` (independent pre-deployment review: findings H1 to H3, M1, M2, M4), `docs/KPAA_FEATURE_GAP_AUDIT.md` section 4, `docs/KPAA_FEATURE_IMPLEMENTATION_PLAN.md` section 3. Architecture unchanged: React, TypeScript, Node.js, SQLite.

## 1. What was fixed
| # | Priority | Problem (before) | Fix | Where |
|---|---|---|---|---|
| 1 | Shared demo expert exposed other visitors' requests | The seeded demo expert has a password **published in the project documents**. Anyone could sign in as that "approved expert", read the latest 100 expert requests of all visitors (names, descriptions, photos, voice notes) and answer them. Reproduced end to end in the review. | (a) **Strict environments (production and the protected demo) never create accounts with the published passwords.** With `ENABLE_DEMO_SEED=1` the demo environment now requires private `DEMO_FARMER_PASSWORD` / `DEMO_EXPERT_PASSWORD` (12+ characters, different, not the published ones, not a secret of the server) or refuses to start. Every strict environment also refuses a database that already holds the published passwords. (b) **Defence in depth everywhere (also local development and tests):** an account that still uses a published password is an *untrusted shared account*. It sees and can answer **only the fictional sample requests**, never a real visitor's request; an administrator or an approved expert with a private password sees the queue as before. The guard follows the password, not the name, so changing the password makes the account trusted again. | `server/runtime.ts`, `server/seed.ts`, `server.ts`, `server/security.ts` (`usesPublishedDemoPassword`), `server/routes/prototype.ts` (`responderScope`, list and reply), `server/demoGuard.ts` |
| 2 | Demo registration and sign-in restricted to synthetic numbers | Real numbers could register in the demo environment (only SMS sending was restricted). | In `APP_ENV=demo`, registration accepts only numbers starting `+23177000` (configurable prefix, local formats normalized first) and no e-mail; sign-in accepts only such numbers. Refusals are `422 PHONE_NOT_ALLOWED` / `EMAIL_NOT_ALLOWED` and happen **before any account lookup or password work**. | `server/routes/v1.ts` (register, login) |
| 3 | Login throttle bypass | The limiter key was the raw identifier text, so `+231 770 009 100`, `0770009100` and `+231770009100` each had their own allowance (40 wrong guesses on one account were all answered `401` in the review). | The identifier is normalized **before** the limiter; an existing account is keyed by its id, so phone, e-mail and every spelling share one allowance (8 per 15 minutes per address and account). | `v1.ts` login |
| 4 | Per-address login limiting | Rotating identifiers from one address had no cap. | **30 failed sign-ins per address per 15 minutes across all accounts** (`LOGIN_IP_FAIL_MAX`), checked before any work and before password hashing; throttled answers are cheap (`429` + `Retry-After: 900`). Old rate rows are pruned (25 h), so the table cannot grow without bound. | `v1.ts`, `server/limits.ts`, `server/security.ts` |
| 5 | Timing and event-loop blocking | An unknown account skipped password hashing (9 ms vs 63 ms for an existing one), and `scryptSync` froze the single Node thread about 80 ms per sign-in. | Password hashing runs on the worker pool (`crypto.scrypt`) with a small semaphore (3 at once, queue 40, then `503 SERVER_BUSY` + `Retry-After`). Unknown accounts are checked against a throw-away hash so they cost the same. Applied to sign-in, registration, password change, password reset and phone change. Same algorithm and parameters: existing hashes verify unchanged. | `server/security.ts`, `v1.ts`, `server/routes/authSecurity.ts` |
| 6 | Anonymous writes unthrottled | Expert requests, marketplace listings, inquiries and language-lab recordings could be created without limit. | Per-hour caps: anonymous **per address**, signed-in **per account**: expert request 12 / 30, listing 12 / 30, inquiry 20 / 40, recording 10 / 30 (`PUBLIC_WRITE_LIMIT_SCALE` multiplies them). The limiter sits **after** the idempotency check, so an offline sync retry of an already accepted write is replayed and does not use up the allowance. | `server/security.ts` (`writeLimit`), `server/limits.ts`, `server/routes/prototype.ts` |
| 7 | Invented USSD short code | The phone simulator showed "Dial `*440*8#`". | Removed. The idle screen now reads "SIMULATED CALL" and the text says that no telephone number, short code or telecom network is used. A test scans `src/` and `server/` for any USSD-style code. | `src/pages/public/PhoneSimulatorPage.tsx` |
| 8 | Advice labels | Seeded guides carry the workflow status `approved` and the placeholder reviewer "Sample Demo Reviewer (Unverified Demonstration)", and the guide page printed "Review Status: approved · Reviewer: Sample Demo Reviewer". | New label logic: demonstration content shows **"Demonstration advice: NOT reviewed by a qualified agronomist"** and an explanation; the placeholder reviewer name, a review date and the word "approved" are never shown for it. "Reviewed" appears only for non-demo content with a named, non-placeholder reviewer **and** status approved. "Approved" removed from the About and Pests page headings. The API and the contract golden are unchanged. | `src/lib/adviceLabels.ts`, `GuideDetailPage.tsx`, `PestsDiseasesPage.tsx`, `AboutPage.tsx` |
| 9 | Preservation | | Authentication, simulated SMS, offline sync, Ministry dashboard, H1/H2 and the deployment preparation behave as before (all suites below). | |
| extra | Review M2, M4 (small, same files) | `APP_ENV=test` mounts fixtures and relaxes production checks; a host loader could start the app without it listening; a startup error printed a stack trace. | `APP_ENV=test` is refused on a non-loopback `HOST`; `START_SERVER=1` forces listening when a loader starts the app; a startup error ends with one line (`Server did not start: ...`, setting names only) and exit code 1. | `server.ts` |

## 2. Test changes that follow from the new rules (no weakening)
* `tests/api.test.ts` tests 9, 28 and 29 asserted that the **shared demo expert** could read and answer every visitor's request. They now use a private-password expert for the legitimate cases and assert the opposite for the shared account (cannot see, cannot reply, can still work on the fictional samples).
* `tests/deploy.test.ts` tests 2 and 10 were updated for the demo-seed passwords. `tests/sms-auth.test.ts` needed no change.
* `tests/contract/run.ts` (setup, not the golden) gives the seeded demo expert a private password through a new test-only fixture (`POST /__test__/users/set-password`) so the recorded responses are identical. **The golden snapshot was not edited**; 63 of 63 requests still match.
* `tests/harness/backend.ts` raises the abuse limits for the in-process suites; the new suite and the deployment suite run real servers with the defaults.

## 3. New regression suite: `tests/phase0.test.ts` (20 tests, `npm run test:phase0`)
Real `server.js` child processes with default limits on disposable databases, plus one in-process backend. Each test names the finding it covers; the child-server tests were also run against a copy of the previous commit `a845049` to confirm they **fail on the old code** (section 4).

| Tests | Covers |
|---|---|
| 1, 2, 3 | published demo credentials cannot expose or answer another visitor's request; strict environments never seed or accept the published passwords; refusal to start on a database holding them |
| 4 | synthetic-only registration and sign-in in the demo environment; no non-synthetic number or e-mail is ever stored |
| 5, 6, 7 | normalized identifier throttle; per-address ceiling; forged `X-Forwarded-For` does not reset limits |
| 8, 9, 10 | event loop stays responsive under a burst of real sign-ins; no enumeration timing gap; "busy" instead of unbounded queueing |
| 11, 12, 13, 14 | anonymous write limits for requests, listings and inquiries; offline retries are not penalised; per-address allowances; pruning |
| 15, 16, 17 | no USSD-style short code anywhere in `src/` or `server/`; demonstration advice labelling (unit and wiring) and API flags |
| 18, 19 | `APP_ENV=test` refused off loopback; `START_SERVER` and one-line startup errors |

## 3b. Results (final run, after the last code change)
| Check | Result |
|---|---|
| `tsc --noEmit`, `npm run build` | pass |
| `test:phase0` (new) | 20 / 20 |
| `test:deploy` | 13 / 13 |
| `test:sms` | 39 / 39 |
| `test:h1` / `test:h2` | 18 / 18, 16 / 16 |
| `test:ministry` | 15 / 15 |
| `test:api` / `test:harness` | 31 / 31, 4 / 4 |
| `test:offline` | 22 / 22, 6 / 6, 3 / 3 |
| `test:contract` | 63 / 63 match the **unchanged** golden, 3 consecutive runs |
Against a copy of the previous commit `a845049`, the new child-server tests fail as intended (tests 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 18, 19); tests 12 and 17 pass there because they protect the new limiter's retry behaviour and a data flag that already existed. `test:m3` (PHP) was not run: no PHP file changed. No real-browser or Android pass was made in this phase.

## 4. Remaining vulnerabilities and limits (not fixed in Phase 0)
1. **Demo environment can still receive real data typed into free-text fields** (names, descriptions, photos, marketplace text). Phone numbers and e-mail are blocked, text cannot be. The banner is a notice, not a control. Keep the demo for synthetic data and judges only.
2. **The shared demo accounts remain usable in development and tests** (documented passwords) and, by design, in the **demo environment only if you choose to publish private passwords**. Treat `DEMO_EXPERT_PASSWORD` as a secret shared with presenters.
3. **No per-account global lockout** (a distributed guesser from many addresses is limited only by the per-address limits and the SMS device check). A global account lock would let an attacker lock victims out; not added.
4. **Registration is limited per address (10 per hour)** and cannot tell a venue network from one attacker; `audit_logs` still grows with every failed sign-in (bounded now by the limits, but not pruned).
5. **Security headers** (HSTS, a content-security policy, frame ancestors) are still missing (review M3); add after the HTTPS check on the staging subdomain.
6. **Password hashing concurrency** shares libuv's worker pool (default 4 threads) with file operations; under a flood legitimate sign-ins may see `503 SERVER_BUSY`. Tuning knobs: `PASSWORD_HASH_CONCURRENCY`, `PASSWORD_HASH_QUEUE`.
7. **Unverified on Hostinger** (unchanged): persistent storage, launcher behaviour, proxy hop count, outbound HTTPS.
8. **Advice**: the underlying `review_status = 'approved'` of seeded guides is unchanged in the database and API (changing it would change the public contract); only farmer-facing labels were corrected. A real verification level is Phase 1.
9. Per-account expert-request/listing limits count submissions, not content: abusive text is not detected.

## 5. Operating notes
* Demo environment variables are in `docs/HOSTINGER_STAGING_DEPLOYMENT.md` section 3 and `.env.example`.
* A shared venue network may need `PUBLIC_WRITE_LIMIT_SCALE` and `LOGIN_IP_FAIL_MAX` raised; a wrong `TRUST_PROXY` makes every visitor look like one address (measure with the staging diagnostics first).
