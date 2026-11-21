# Integration: phone + password sign-in, public-counter privacy, *440# enrollment and voice

Local only. Nothing here has been pushed or deployed.

## Commits (branch `feature/offline-first`, safety branch `backup/pre-ussd-merge-66801f6`)
| Commit | Content |
|---|---|
| `d6d5a70` | Agricare Liberia branding, project hero and logo, QA fixes |
| `a41d967` | Phone number + password sign-in without SMS, no timed takeover, assisted recovery |
| `66801f6` | Public management-summary counters approximate, exact for administrators |
| `36da6da` (branch `codex/ussd-offline-qa`) | *440# enrollment, voice guidance, participant registry (recovered from Codex's uncommitted work) |
| `ec2f160` | Merge of `36da6da`; only `package.json` conflicted (both script sets kept) |
| `bfee216` | Auth + USSD integration tests; the redial sale check in `tests/browser-qa.ts` now polls (it raced) |
| `20fb15d` | Integration handover; down migration for the participant registry |
| (next commit) | Administrator-assisted recovery, privacy notice and consent, synthetic-account isolation, backup/restore test, runbooks |

## Migrations
Applied in filename order and recorded by full name: `001` to `011`, then `012_privacy_consent_and_assisted_recovery.sql` (new table `privacy_consents`; four added columns and an index on `password_resets`; down file included), then `20261121_ussd_440_participant_registry.sql` (three additive tables; it sorts after `011`). The phone + password work needs **no** migration. A down file exists for the registry (`server/migrations/down/20261121_ussd_440_participant_registry.down.sql`, drops only those three tables). Verified: a database at `011` with data upgrades on start, keeps all users, integrity and foreign-key checks clean; restarts keep accounts and participants.

## Identity rules on the combined app
- A phone number never identifies or authenticates anything by itself. Enrollment accepts only `category`, `county`, `consent`, `consentVersion` (anything else, including phone, user id, role or verification fields, is refused).
- Enrollment never changes a password, phone verification, session or role. Choosing "Agricultural Expert" is a label only.
- A device participant is LINKED (not duplicated) when the same browser later enrolls while signed in; an account is recognised from any browser; a signed-out browser cannot take over a linked identity.
- One account per number in any spelling; the 72-hour release is off.
- Enrollment is available only in the protected demo environment (`APP_ENV=demo`) or tests. After the demo settings are removed for real users, enrollment answers `403 DEMO_ONLY` and the handset offers public advice only. A real-user registry needs its own approval (consent text, privacy notice, retention).

## Hostinger deployment (after approval only)
1. Back up the live database first (`node backup-db.js`, or copy the file with the app stopped). Never delete it.
2. Push `feature/offline-first` to `main` of the `agriccare` remote (this redeploys): `git -c http.postBuffer=524288000 push agriccare feature/offline-first:refs/heads/main`.
3. Keep the environment variables (`START_SERVER=1`, `NODE_ENV=production`, `APP_ENV=demo`, `DEMO_ENV_ACK`, `SMS_PROVIDER=simulated`, `DB_PATH`, secrets, `VITE_PUBLIC_DEMO_URL`, `VITE_USSD_MARKETPLACE_ENABLED=true`). Do NOT set `AUTH_REQUIRE_SMS`. The site stays demo-only (synthetic numbers) but signs in with phone + password (no demo SMS inbox).
4. After the build, check: `/api/v1/environment` (`phoneVerification: "none"`), the manifest name, login, forgot-password text, `/ussd-demo` (dial *440#, voice, enrollment), Ministry registry panel as admin, and the management summary as anonymous (approximate).
5. Rollback: revert the merge commit and push; the new tables stay in the database harmlessly (or run the down file after a backup).
6. Real-user mode is a separate step (remove `APP_ENV=demo` and demo variables, `STAGING_DIAG_TOKEN`, privacy notice, backup routine) and needs explicit approval.

## Real-device testing still required
iPhone Safari audio (tap Voice on, silent switch, lock/unlock, installed home-screen app), Android Chrome with and without a TTS voice and TalkBack, touch long-press on 0, offline reopen of the installed app. Details in `docs/USSD_440_IMPLEMENTATION_REVIEW.md` section 9.


## Added in the final local round
- **Assisted recovery:** `docs/ADMIN_ASSISTED_RECOVERY.md`. Admin-only, identity confirmed independently, admin re-enters own password, one-time 12-character code (30 minutes, single use, hashed, 5 wrong guesses cancel it), user chooses the new password, all sessions and devices end, everything audited. SMS stays off for everyone.
- **Privacy notice and consent:** `/privacy` (draft for legal review), checkbox at registration, stored in `privacy_consents`. Registration without it is refused. Existing accounts have no consent row; they are not blocked.
- **Phone status:** "Not verified" is shown on the farmer dashboard, Account Security, the admin user list and the register page; nothing says verified unless `phone_verified_at` is set (only by SMS proof or the synthetic demo range).
- **Landing after registration:** farmers now go to their dashboard (it carries the phone-status note). With SMS enabled in future they would go to Account Security to verify.
- **Synthetic isolation (real deployment, i.e. production without demo mode):** accounts on `+23177000xxxx` or flagged shared-demo cannot see or answer genuine expert requests, cannot message genuine sellers, cannot be recovered through the admin tool, and that number range cannot be registered. In the protected demo everything is synthetic, so nothing changes there.
- **Backup/restore:** `docs/BACKUP_RESTORE.md` and `tests/backup-restore.test.ts` (round trip with the new tables, damaged backup refused, old file kept).
- **STAGING_DIAG_TOKEN:** removal steps in `docs/REMOVE_STAGING_DIAG_TOKEN.md` (not done).

## Before switching the live site to real users (separate approval)
1. Back up the database (`docs/BACKUP_RESTORE.md`); deploy; confirm migration 012 applied.
2. **Suspend the two demo accounts** (`+231770000101`, `+231770000201`) in Admin > Farmer & User Management so they cannot act in real mode.
3. Remove `APP_ENV=demo`, `DEMO_ENV_ACK`, `SMS_PROVIDER=simulated`, `DEMO_*`, `ENABLE_DEMO_*`, `STAGING_DIAG_TOKEN`; keep secrets, `DB_PATH` and `START_SERVER=1`. Note the USSD enrollment and synthetic marketplace actions then close (by design).
4. Have the privacy notice reviewed, name the administrator(s) who will run recovery, and test one full recovery with a real person.

## Real-user readiness round (commit after `42b82ba`)
- **Real-user USSD enrollment:** `docs/REAL_USER_DEPLOYMENT.md` (exact variables, sequence, rollback, risks), `docs/IPHONE_TESTING.md`. In real mode the handset flow is dial, voice, category, county, **account step** (secure form for phone number + password; the browser cannot detect a number and entering one never verifies it), registry consent, menu. Only signed-in genuine accounts are enrolled; migration `20261122_participant_registry_classes.sql` (additive) adds registry classes.
- **Ministry registry classes:** genuine accounts, anonymous browser participants, synthetic records, plus a suppressed phone-status split (verified / not verified).
- **Marketplace in real mode:** option 3 works for signed-in members with real listings and their own name (no demo wording, county market town, no phone published). Option 8 is unchanged.
- **Operator tool:** `real-mode-prep.js --check | --suspend-demo --confirm` (read-only report; suspends demonstration accounts, never administrators, deletes nothing).
- **New tests:** `test:real-mode` (8), `test:real-mode-config` (3), `tests/ussd-real-market.test.ts` (4, in `test:ussd-marketplace`), `test:real-mode-browser` (11 scenarios).
