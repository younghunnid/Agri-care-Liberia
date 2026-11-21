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

## Migrations
Applied in filename order and recorded by full name: `001` to `011`, then `20261121_ussd_440_participant_registry.sql` (three additive tables; it sorts after `011`). The phone + password work needs **no** migration. A down file exists for the registry (`server/migrations/down/20261121_ussd_440_participant_registry.down.sql`, drops only those three tables). Verified: a database at `011` with data upgrades on start, keeps all users, integrity and foreign-key checks clean; restarts keep accounts and participants.

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
