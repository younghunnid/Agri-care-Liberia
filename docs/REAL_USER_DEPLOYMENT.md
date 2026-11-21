# From demonstration to real users: configuration, sequence, rollback

Nothing in this document has been applied. Every value below was checked against the configuration loaders in the source (`server/authConfig.ts`, `server/runtime.ts`) by `tests/real-mode-config.test.ts`, and the whole flow is exercised by `tests/real-mode.test.ts` and `tests/real-mode-browser.ts` on disposable databases.

For the November 21 takeover findings, staged fixes, shared-file conflicts and release gates, see [REGISTRATION_USSD_TAKEOVER_REVIEW.md](REGISTRATION_USSD_TAKEOVER_REVIEW.md). No production mode change is authorized by this document.

## What "real-user mode" is in the code
`NODE_ENV=production` and `APP_ENV` not `demo` (and not `test`). Then, automatically: simulated SMS, the demo inbox and demo seeding are refused; accounts on the reserved range `+23177000xxxx` cannot be registered and are treated as demonstration accounts (they cannot reach genuine users); the participant registry accepts only signed-in genuine accounts (`/api/v1/environment` answers `registryMode: "real"`); the USSD marketplace uses the member's own account and real listings. Phone numbers are never verified (no SMS). Sign-in is phone number + password. Recovery is administrator-assisted.

## Hostinger environment variables (Node.js app > Environment variables)
| Variable | Action | Value / reason |
|---|---|---|
| `NODE_ENV` | keep | `production` |
| `START_SERVER` | keep | `1` (the host starts the app through its own loader) |
| `SESSION_SECRET` | **keep unchanged** | at least 32 random characters; changing it signs everyone out |
| `OTP_HMAC_SECRET` | keep | at least 32 random characters, different from `SESSION_SECRET` (required in production even without SMS) |
| `DB_PATH` | keep | absolute path outside the app folder, e.g. `/home/<user>/agricare-data/agri.db` (the persistent SQLite file) |
| `TRUST_PROXY` | preserve pending topology verification | `1` is accepted for one trusted proxy hop; verify the actual proxy chain before changing it (never trust all addresses) |
| `APP_URL` | keep | `https://agricare.mpgmca.com` |
| `VITE_PUBLIC_DEMO_URL` | keep | `https://agricare.mpgmca.com` (build-time, QR poster) |
| `VITE_USSD_MARKETPLACE_ENABLED` | keep | `true` (build-time; the interactive USSD marketplace) |
| `APP_ENV` | **remove** | must be absent (value `demo` keeps the demonstration mode) |
| `DEMO_ENV_ACK` | **remove** | refused without `APP_ENV=demo` |
| `SMS_PROVIDER` | **remove** (or set `none`) | `simulated` is refused in production; no live provider exists |
| `DEMO_INLINE_INBOX`, `SIMULATED_INBOX`, `DEMO_OPERATOR_TOKEN` | **remove** | refused in production |
| `ENABLE_DEMO_SEED` | **remove** | refused in production |
| `DEMO_FARMER_PASSWORD`, `DEMO_EXPERT_PASSWORD` | **remove** | refused when the demo seed is off |
| `ENABLE_DEMO_MARKET_DATA` | **remove** | refused in production |
| `STAGING_DIAG_TOKEN` | **remove** | accepted by the loader, so it would keep `/api/v1/__staging` mounted: see `docs/REMOVE_STAGING_DIAG_TOKEN.md` |
| `AUTH_REQUIRE_SMS` | leave unset (or `0`) | `1` needs an SMS provider and is refused with none |
| `TEST_FIXTURE_TOKEN` | **remove** | test fixtures must never be enabled in production |
| `COOKIE_MODE` | leave unset (or `first_party`) | `cross_site` is refused |

Build-time variables (`VITE_*`) are read when Hostinger builds: keep both. Everything else in the table is read at start-up: a restart/redeploy applies it.

## Deployment sequence (integration/deployment and real-user activation require separate explicit approval)
**Phase A: ship the code, still in demo mode (nothing changes for visitors)**
1. Back up the database: `DB_PATH=... node backup-db.js --to /home/<user>/agricare-backups` (see `docs/BACKUP_RESTORE.md`). Copy one backup off the server.
2. Review the locally integrated result described in `docs/LOCAL_INTEGRATION_REVIEW.md`, including its single worker helper and current-form protection. Push/deploy only after separate deployment approval. Existing migrations apply at start (additive); the takeover fixes add no migration. Preserve the current SQLite path and records.
3. Check: `/api/v1/environment` still shows `demoEnvironment: true`; log in; open `/ussd` directly and refresh; open `/privacy`. Run `node scripts/check-public-deployment.mjs --origin https://agricare.mpgmca.com --mode demo` (read-only).
4. Run the read-only report on the live database: `DB_PATH=... node real-mode-prep.js --check`. It lists published-password accounts (production refuses to start with them), demonstration accounts, an administrator on the demo number range, synthetic records and pending migrations.

**Phase B: switch to real users (separate approval)**
5. Back up again.
6. Create an administrator on a **real** phone number: `DB_PATH=... ADMIN_BOOTSTRAP_PHONE=... ADMIN_BOOTSTRAP_PASSWORD=... node bootstrap-admin.js` (password at least 10 characters, never the demo ones). Sign in as that administrator and confirm the Admin console and Ministry view work.
7. Fix every blocker the report names (change any published password; retire an administrator on `+23177000xxxx` by hand once the real one works).
8. Suspend demonstration accounts: `DB_PATH=... node real-mode-prep.js --suspend-demo --confirm` (administrators are never touched; nothing is deleted). Re-run `--check`: it must say `READY`.
9. Edit the variables as in the table (remove, do not blank), change **Admin > Settings > platform name** to "Agricare Liberia", restart/redeploy.
10. Verify: `curl https://agricare.mpgmca.com/api/v1/environment` returns `registryMode: "real"`, `simulatedSms: false`, `phoneVerification: "none"`, `demoEnvironment: false`; `curl -i .../api/v1/__staging/` returns 404; register with your own number, accept the privacy notice, dial `*440#`, enroll, sell and ask on the marketplace, sign out and back in, test one assisted recovery with a second person, check the Ministry panel as the administrator.

## Rollback
Prefer a reviewed previous compatible code release with the same persistent database and approved real-user configuration. Do not restore a database merely to undo a code change: that discards registrations made since the backup. Preserve old database files and sidecars; restoring production data needs separate explicit approval.

- **Emergency return to demonstration mode, only with separate approval:** put back `APP_ENV=demo`, `DEMO_ENV_ACK=synthetic-accounts-only`, `SMS_PROVIDER=simulated`, `DEMO_INLINE_INBOX=1`, and (only if you want demo seeding) `ENABLE_DEMO_SEED=1` with two private `DEMO_*_PASSWORD` values and `ENABLE_DEMO_MARKET_DATA=1`; restart. Reactivate the suspended demo accounts in Admin > Farmer & User Management. Real accounts created meanwhile stay in the database (the demo restricts numbers to `+23177000xxxx` for new registrations and sign-in, so real people cannot sign in while demo mode is on: tell them first).
- **Undo a bad deployment of code:** revert the commit and push; the new tables stay and are harmless. Restore the backup only if data was damaged (`docs/BACKUP_RESTORE.md`).
- Hostinger has no per-commit rollback: reverting is a new commit.

## Remaining production-readiness risks (not removed by this work)
1. No SMS: phone numbers are unverified; the first registrant owns a number; recovery depends on an administrator who really checks identity.
2. Privacy notice is a draft; no self-service deletion or export; backups hold personal data (keep them private, rotate, test restores).
3. Hostinger shared hosting: SQLite on one disk; read-only diagnostics observed multiple Node workers in the current release. Cross-worker locking, restore coordination, monitoring and off-site backups need operational verification.
4. USSD is a browser simulation: `*440#` is not allocated or connected to any operator; no telecom, SMS or voice service exists.
5. Real-device behaviour (iPhone Safari audio, Android TalkBack, touch long-press, installed offline app) is untested: `docs/IPHONE_TESTING.md`.
6. Rate limits and abuse controls are tuned for a demonstration; review them with real traffic.
7. Single administrator dependency; no separate Ministry role (the Ministry view requires the administrator role).
8. No malware/virus scan on uploaded photos or audio; media size is bounded.
