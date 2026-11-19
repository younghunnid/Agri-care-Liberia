# Deployment security review: Node.js on Hostinger (preparation phase)

Scope: the code and configuration changes of the deployment-preparation commit, reviewed against production use on a public subdomain. Method: code review of the diff, plus the automated checks in `tests/deploy.test.ts` (13 tests, real `server.js` child processes on disposable databases) and the earlier SMS/H1/H2/API suites. Not a penetration test; **not verified on Hostinger.**

## 1. Findings fixed in this phase
| # | Finding (before) | Risk | Now | Verified by |
|---|---|---|---|---|
| S1 | Demo farmer/expert accounts with **published passwords** were created in any environment whose users table was empty, including production | Anyone reading our docs could sign in (confirmed locally in the assessment) | Created only with `ENABLE_DEMO_SEED=1`; production refuses that flag; production **refuses to start** on a database that already contains those credentials (checked by password verification, nothing printed) | tests 5, 6 |
| S2 | `SESSION_SECRET` optional with an ephemeral fallback | Silent sign-out on every restart; weak or absent secret on a public host | Required (32+ chars, placeholder-rejecting) in production and demo; error names the setting, never the value | tests 1, 6, 7 |
| S3 | Cookie `Secure`/`SameSite=None; Partitioned` decided partly from the **client-supplied `Origin` header**; `SameSite=None` in production | Attacker-influenced cookie attributes; unnecessary cross-site cookie exposure | `req.secure` only (Express, honouring `TRUST_PROXY`); production/demo use first-party `SameSite=Lax; Secure; HttpOnly` (CSRF cookie readable by design); `cross_site` refused in production | tests 7, 10 |
| S4 | Unknown `/api/*` answered `200 text/html` (SPA fallback); stack/parse details possible from errors | Masks routing errors, odd client behaviour, information leakage | JSON 404/400/413/500 with a stable `error.code`; no stack, no parser text; `X-Powered-By` removed | test 4 |
| S5 | Database path inside the app folder by default | Data loss at every deployment; possible web exposure if mis-placed under `public_html` | Production/demo require an absolute `DB_PATH` outside the app folder, not under `hbuilds`/`public_html`, no `..`; start-up write/fsync/read-back probe | tests 1, 6 |
| S6 | Proxy depth hard-coded (1) | Wrong depth collapses all rate limits into one bucket (denial of service for everyone) or lets forged `X-Forwarded-For` choose the bucket | `TRUST_PROXY` configurable and validated (hop count, address list, never "everyone"); staging endpoint to measure; **tested**: with one hop, forged left-hand addresses do not reset limits; with `0`, forwarding headers are ignored | test 8 |
| S7 | `esbuild ^0.25` made `npm ci` fail on Vite 8; no lockfile | Unreproducible or failed install on the host; surprise upgrades | Lockfile committed; `esbuild ^0.28.2`; verified `npm ci` + build + start from a clean copy | clean-copy run (below) |
| S8 | Hashed assets not cacheable, `index.html`/`sw.js` policy implicit | Slow loads on poor networks; stale app risk | Immutable one-year cache for `/assets/*` only; shell and service worker revalidated | test 3 |

## 2. Simulated SMS and the demonstration environment
* Unchanged protections (see `docs/SIMULATED_SMS_SECURITY.md`): production refuses `SMS_PROVIDER=simulated`, the operator inbox and `DEMO_OPERATOR_TOKEN`; `APP_ENV=demo` requires the simulated provider, `DEMO_ENV_ACK=synthetic-accounts-only`, strong `OTP_HMAC_SECRET` **and now `SESSION_SECRET`, an external `DB_PATH` and first-party cookies**; only synthetic `+23177000xxxx` numbers receive messages; the in-website inbox is bound to the challenge cookie of the browser that asked.
* New: `GET /api/v1/environment` returns three booleans (`demoEnvironment`, `simulatedSms`, `syntheticAccountsOnly`) and nothing else; the interface shows a persistent banner in the demo environment ("simulated SMS, synthetic accounts only. Please do not enter real personal information or real phone numbers").
* The demo environment is **not** appropriate for real farmers: anyone who can reach the page can read their own simulated codes by design. Use it for judges and synthetic data only. Real accounts require a real provider and a separate review.
* In-memory inbox: lost on restart; no codes are logged or written (checked by the SMS suite's leak scan).

## 3. Staging diagnostics (new, temporary)
`/api/v1/__staging/{proxy,storage,marker,wal-test}` exist **only** when `STAGING_DIAG_TOKEN` (32+ random chars, separate from the other secrets) is set. Constant-time token comparison on SHA-256 digests, 60 requests/minute cap, `no-store`, no secrets/paths/account data in output (test 9 scans for them), the WAL test uses a scratch file and never the real database, the marker is a small file next to the database. Remove the variable after staging; without it the routes answer 404.

## 4. Backup tools
`backup-db.js`: `VACUUM INTO` (consistent while live), integrity check of the copy, `0700/0600` permissions, refuses `public_html`, SHA-256 sidecar, retention. `restore-db.js`: requires `--confirm`, verifies checksum and integrity first, moves the current database aside (never deletes), atomic rename into place. Tested against a live server, tampered file, damaged live file (test 11). Residual risk: backups hold personal data; encryption and off-host copies are the operator's responsibility.

## 5. Residual risks and open items (not fixed here)
1. **Unverified on Hostinger:** persistent writable storage (B1), WAL on its file system, Node patch version, actual proxy hop count and headers, SSL on the subdomain, idle-stop behaviour, cron for backups, outbound HTTPS. The staging procedure resolves each.
2. **Login throttling is per (address + identifier)**: a client can rotate identifiers from one address without hitting the per-identifier cap (SMS code requests and verification have their own separate limits, not re-reviewed here). Pre-existing; consider a per-address ceiling before a public pilot.
3. **No HSTS/CSP/frame-ancestors headers**: not added because they need a decision on embedded previews and on the subdomain's HTTPS being final. Add after the staging HTTPS check.
4. **No real SMS provider**: production-like deployment cannot sign in from new devices; the demo environment is the only working mode.
5. **Gemini model id `gemini-4-hydrogen`** in `server/ai.ts` is invalid; live AI stays off (leave `GEMINI_API_KEY` unset). Needs an approved change.
6. **Photos/voice stored in SQLite** (data URLs): database growth and backup size; consider limits before a pilot.
7. `node:sqlite` is experimental in Node 22; behaviour may change in later Node versions: pin Node 22 on the host and re-test before upgrading.
8. The health endpoint's `latestMigration` can be inexact when two migrations share a timestamp second (known contract-test flake; left unfixed by instruction).
9. Admin accounts: create one with `bootstrap-admin.js` using a strong password you generate; remove the variables afterwards.
10. Dependencies: `npm audit` reports advisories (not triaged in this phase).
