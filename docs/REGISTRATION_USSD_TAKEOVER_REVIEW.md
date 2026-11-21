# Registration and QR USSD takeover review — 2026-11-21

Historical review for commit `80dd61f`. The combined development implementation and current worker policy are documented in [LOCAL_INTEGRATION_REVIEW.md](LOCAL_INTEGRATION_REVIEW.md); its single canonical helper is now `public/sw-update.js`. References below to Claude’s uncommitted work describe the earlier pre-integration snapshot.

Local branch: `codex/registration-ussd-takeover`, isolated worktree `/private/tmp/agricare-registration-ussd-takeover`, based on committed `8cb5464354909631f22623310a0d18a88ed26595`. The original Codex worktree remains at `36da6da`. No merge, rebase, reset, push, deployment, production mode change or production database write was performed.

## Findings and root causes

**Real phone registration: verified configuration problem.** The live public GET `/api/v1/environment` returns `demoEnvironment: true`, `syntheticAccountsOnly: true`, `registryMode: "synthetic"`, `simulatedSms: false`, `phoneVerification: "none"`. The demo identity guard correctly rejects non-reserved phone numbers. Phone/password authentication, normalization, privacy consent, duplicate protection, sessions, CSRF, rate limits, administrator-assisted recovery and the authenticated participant registry already exist in the base commit. Removing the synthetic guard would weaken the protected demo environment; the correct activation is the separately approved configuration transition below. This local patch does not activate it.

**QR page: stale-client recovery defect reproduced locally.** Live `/ussd`, `/ussd/` and `/ussd-demo` return HTTP 200 HTML. The deployed entry bundle contains the standalone `UssdOnlyPage` chunk; the deployed worker precaches it. The QR destination source already uses `/ussd`. Thus a missing route in the current release is not the observed server problem. An old active worker can keep serving an old shell that has no `/ussd` route, while its replacement waits for a prompt unavailable on that page. A legacy-worker browser fixture reproduces “We could not find that page”; the replacement worker recovers it. This supports the stale-client explanation, but does not prove the exact state of the user's physical iPhone.

Current live HTML/worker HTTP headers permit revalidation (`public, max-age=0`); they do not clear an old active worker. The live deployment lacks the recovery bridge. A read-only public release checker confirms this and intentionally reports `ready: false` for real-user readiness.

## Read-only Hostinger evidence

The existing known-host entry matched the SSH endpoint `145.223.77.204:65002`, user `u392111798`, using strict host-key verification and `UpdateHostKeys=no`. Pinned ED25519 fingerprint: `SHA256:0Rc0n5JhhUeShohp32ntmN6IlnvDPzOtoV/rgw5nsPk`. No SSH configuration or keys were changed, and no unknown key was accepted.

Current release: `/home/u392111798/domains/agricare.mpgmca.com/hbuilds/versions/01a1fdc6-c427-724e-a780-9d971b858d91`, via `hbuilds/current`, application under `nodejs`. Deployment log `2026-11-21_11-03-45_deploy.log` reported build success with no error lines. Runtime console confirms password sign-in, no SMS and unverified numbers; `stderr.log` was empty. Several Node workers were observed. The default SSH PATH does not expose `node`; use the hosting application's documented Node runtime, not an invented binary path.

Environment **names and presence only** were inspected in `hbuilds/config/.env`; no secret values were displayed. `DB_PATH` is configured, absolute, exists and is outside the replaceable application directory. Database records were not inspected. Surviving a real redeploy, current administrator readiness, published-password blockers and backup restorability of the actual production data remain approval-gated checks.

## Local changes

- `public/ussd-update-bridge.js`: imported worker script probes same-origin `/ussd` and `/ussd/` clients through a MessageChannel. Legacy pages without an acknowledgement trigger replacement activation and targeted navigation. Current pages acknowledge and retain their current inputs. No storage is cleared or account/draft data read. Navigation does not hold activation open, avoiding an activation/navigation dependency in WebKit.
- `vite.config.ts`: imports that bridge without globally enabling `skipWaiting`; hashed application resources retain the existing precache policy.
- `src/lib/pwaUpdate.ts`: installs the acknowledgement before registration, checks for updates on entry, and reloads current pages only after their user requests an update. An externally activated worker offers an update notice rather than discarding a current form.
- `server.ts`: `Cache-Control: no-store` on the HTML shell, SPA deep-link fallback, worker and recovery bridge. Hashed `/assets` remain immutable for a year. This HTTP policy does not disable service-worker offline precaching.
- `src/pages/public/UssdOnlyPage.tsx`: small “Back to Website” control. Existing minimal branding, handset, *440#, speed, voice, enrollment and numbered menus are retained.
- `scripts/check-public-deployment.mjs`: public GET-only mode/health/deep-link/chunk/worker readiness gate. Does not register users, log cookies or change configuration.
- Regression tests: `tests/public-deployment.test.ts`, `tests/ussd-update-bridge.test.ts`, `tests/ussd-recovery-browser.ts`; updated cache assertions in `tests/deploy.test.ts` and `tests/phase0b.test.ts`, button text assertion in `tests/ussd-only-browser.ts`, explicit no-SMS configuration case in `tests/real-mode-config.test.ts`.
- `.env.example`: corrects the marketplace flag comment to include authenticated real mode, retaining the disabled default.
- This review and `docs/REAL_USER_DEPLOYMENT.md`: verified activation settings, integration boundaries and safer rollback guidance.

## Database and identity integration

**No new tables, migrations, schema numbering or identity stores are added by this patch.** Existing migrations remain the sole schema authority. Existing USSD registration links `participant_registrations.user_id` to the authenticated `users` account; participant consent/channel records and aggregate Ministry queries use the same SQLite database. Phone possession is not inferred: `phone_verified_at` stays NULL. A phone number alone never signs in. Returning users authenticate with the existing password system and reuse their account and participant record. Expert self-selection remains a participant category and does not confer expert/admin privileges. Ministry aggregates retain authorization, synthetic/real separation and small-group suppression.

## Verified environment target — source-derived, not applied

These values are validated by `server/authConfig.ts`, `server/runtime.ts` and `tests/real-mode-config.test.ts`. The table is the intended target, not a disclosure of current secret values.

| Setting | Intended real-user configuration |
|---|---|
| `NODE_ENV` | `production` |
| `START_SERVER` | `1` |
| `APP_ENV`, `DEMO_ENV_ACK` | Remove both; do not set `test` or leave `demo` |
| `SMS_PROVIDER` | `none` or absent |
| `AUTH_REQUIRE_SMS` | `0` or absent; never `1` without a provider |
| `SESSION_SECRET` | Preserve existing valid secret; loader requires at least 32 characters and rejects placeholders |
| `OTP_HMAC_SECRET` | Preserve existing valid secret, at least 32 random characters, distinct from session secret; required even without SMS |
| `DB_PATH` | Preserve the existing absolute persistent SQLite path outside `hbuilds`, `public_html` and the application tree; do not substitute an example or create a new database |
| `TRUST_PROXY` | Preserve pending topology verification; `1` is valid only for the intended single trusted proxy hop, not proof of Hostinger topology |
| `COOKIE_MODE` | `first_party` or absent |
| `APP_URL` | `https://agricare.mpgmca.com` |
| `VITE_PUBLIC_DEMO_URL` | `https://agricare.mpgmca.com`, at build time (existing variable name retained) |
| `VITE_USSD_MARKETPLACE_ENABLED` | `true`, at build time |
| Remove demo/inbox flags | `DEMO_INLINE_INBOX`, `SIMULATED_INBOX`, `DEMO_OPERATOR_TOKEN`, `ENABLE_DEMO_SEED`, `DEMO_FARMER_PASSWORD`, `DEMO_EXPERT_PASSWORD`, `ENABLE_DEMO_MARKET_DATA` |
| Remove diagnostic/test credentials | `STAGING_DIAG_TOKEN`, `TEST_FIXTURE_TOKEN` |

Keep SQLite and Node >=22.13.0. No PHP/MySQL migration. Existing production fail-closed checks may reject published-password accounts: run the preparation report only after approval and resolve its blockers before activation. Administrative bootstrap, account suspension or password changes are separate explicit production actions; no such changes occurred here.

## Backup and restore verification

`tests/backup-restore.test.ts` uses a disposable SQLite database and synthetic identity: consistent `VACUUM INTO` backup, SHA-256 manifest, integrity check, private file permissions, refusal of damaged backup, dry run without mutation, confirmed restore preserving the previous database, and password login plus consent/recovery records after restore. This verifies the tools, not an existing production backup.

Approved deployment procedure: locate the actual hosting Node executable; preserve the existing `DB_PATH`; use `backup-db.js --to <private-backup-directory>` with that DB path, inspect success/checksum/integrity, retain an off-server copy. Restore that backup to a **different disposable SQLite path** with the tool and verify integrity, foreign keys, schema and expected account/consent counts privately. Do not copy a live WAL file as a backup or print personal rows. Record backup identity and timestamp. The backup tool has retention; review `--keep` before use. Do not execute any of these production actions without approval.

A real production restore requires its own approval and all Hostinger app workers stopped so none retains an open database handle. First run `restore-db.js --from <verified-backup> --dry-run`; only then the separately approved `--confirm`. The tool preserves the old DB and sidecars; never delete or overwrite them manually. Any restore loses records newer than its snapshot; code rollback alone does not justify it.

## Integration, deployment and rollback

1. Review this branch against base `8cb5464`. Claude's original worktree is untouched. It currently has uncommitted `src/lib/pwaUpdate.ts`, `vite.config.ts`, `public/sw-update.js` and `scripts/sw-update-simulation.mts`. The first two conflict directly with this patch; the latter two overlap its update strategy. Resolve together after integration approval. Do not stack two recovery workers or adopt unconditional page reloads that discard a registration or unsynchronized draft.
2. Integrate the reviewed local commit through the chosen Git workflow only after approval. Re-run typecheck, production build and regression/browser checks on the combined result. Build with the two `VITE_*` settings above. Review the resulting worker's bridge import and precache list.
3. After deployment approval, take and verify the production backup, deploy the code **with the existing demo configuration unchanged**, and run `node scripts/check-public-deployment.mjs --origin https://agricare.mpgmca.com --mode demo`. Directly scan/open `/ussd`, refresh, confirm minimal layout and test the affected iPhone's returning browser profile. Preserve cache/IndexedDB data; do not tell users to clear all site data as the first remedy.
4. Real-user activation needs a separate approval. Run `real-mode-prep.js --check` read-only on the actual DB, privately review administrator and published-password/demo-account blockers, resolve only explicitly approved items without deleting records, back up again, then apply the verified environment target. Do not seed a fresh DB or reset existing users. Keep numbers unverified and recovery administrator-assisted.
5. After approved activation, verify `/api/v1/environment` reports `demoEnvironment:false`, `syntheticAccountsOnly:false`, `registryMode:"real"`, `simulatedSms:false`, `phoneVerification:"none"`; the public checker must pass with `--mode real`, and `/api/v1/__staging/` must return 404. Production registration/login/recovery/marketplace smoke tests create records and need approval; the local synthetic tests do not substitute for them.
6. For code rollback, deploy a reviewed previous **real-mode-compatible** release while preserving the current SQLite database and configuration. Additive tables can remain. Once real users exist, switching back to demo mode locks them out and is not the default rollback. Database restore is a separate last-resort recovery, never routine rollback. Preserve the release artifact, configuration snapshot privately, backup and new data until recovery is verified.

## Test results and limitations

Final combined automated run: **230/230 tests passed**, covering password authentication/normalization, consent and assisted recovery, configuration, auth/USSD identity linking, enrollment, USSD marketplace/real-market contracts, harvest/client sync, API/security/hardening, offline advisor/cache/inventory, Ministry/role dashboards, backup/restore and deployment startup. The targeted changed-suite rerun also passed 36/36. TypeScript (`npm run lint`) passed.

Chromium production-browser suites passed: 11 real-mode journeys (`tests/real-mode-browser.ts`), 7 offline/marketplace/navigation checks (`tests/browser-qa.ts`) and 9 standalone QR/layout checks (`tests/ussd-only-browser.ts`). The recovery browser suite reproduces the old missing route, checks recovery without losing saved browser data, protects modern input during an external update, verifies all four requested widths, and retains voice, enrollment and all menus. Its final Chromium run passed **6/6**, for **33 passed Chromium browser scenarios** across the four suites. The final `VITE_USSD_MARKETPLACE_ENABLED=true VITE_PUBLIC_DEMO_URL=https://agricare.mpgmca.com npm run build` passed (185 precached resources); typecheck and whitespace checks passed. WebKit results and the offline-emulation failure are disclosed below.

All application-writing tests use disposable databases, synthetic fixtures and unused local ports. No test targets production or port 3000. The only live release-check requests are public GETs; the observed `ready:false` result is expected until approved deployment and mode activation. See the final review message for the local commit hash.

Browser checks are automation, not real iPhone testing. Chromium uses mobile/touch emulation at 320, 360, 375 and 412px. This Mac runs an older OS: the isolated WebKit compatibility runner uses Playwright 1.45.3 / WebKit 17.4; the repository's pinned Playwright version is unchanged. Current Safari and a physical iPhone remain untested. Speech is instrumented to verify calls, screen transitions and mute/speed controls; actual audible playback, installed voices, iOS audio policy and screen-reader interaction need physical-device verification. Playwright's [release notes](https://playwright.dev/docs/release-notes#version-145) document that WebKit compatibility generation.

The WebKit 17.4 runner passes the five online recovery/handset scenarios but `context.setOffline(true)` followed by reload fails with “WebKit encountered an internal error.” This also reproduces in a clean application profile and in an independent minimal service-worker page, without Agricare or the migration. Reconnecting the clean profile works. This is an offline-emulation limitation of this available runner, not a demonstrated fix for current iPhone Safari. Chromium offline/reconnect tests pass. Current Safari and physical-iPhone offline reopening remain release checks.

Legacy pages cannot acknowledge that they contain unsaved input; an old `/ussd` tab may reload once during recovery. Old non-cooperating application code may also have its own reload-on-controller-change handler. New clients are protected, but the old bundle cannot be retroactively changed. A backgrounded/unresponsive current client may miss the timed acknowledgement. Saved IndexedDB/localStorage is preserved; unsaved legacy input cannot be guaranteed. Offline clients cannot download a fix until connected.

*440# remains exclusively a browser simulation, with browser speech synthesis. No telecom short code, network USSD, SMS delivery or phone ownership verification is claimed.
