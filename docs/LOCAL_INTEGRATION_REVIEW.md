# Local development integration — 2026-11-21

Development parent: `f4bda08fb0288205f2381c3af306aa93690821d5` (`feature/offline-first`). Approved Codex parent: `80dd61f2c2c2beefce8d9fe18d75abea37b2c766` (`codex/registration-ussd-takeover`). Integration is prepared in `/private/tmp/agricare-ussd-local-integration` on `integrate/registration-ussd-local`, preserving both histories. See the final report for the merge commit hash and development branch fast-forward result.

## Preflight and conflict resolution

Claude's tracked files were clean at `f4bda08`; unrelated untracked references remain untouched. Codex's approved branch was clean at `80dd61f`. The merge had textual conflicts only in `src/lib/pwaUpdate.ts` and `vite.config.ts`.

- Keep Claude's immediate, hourly and five-minute foreground update detection.
- Keep the Codex handshake, targeted legacy `/ussd` recovery and explicit current-page update choice.
- Use **one registration of `/sw.js` and one helper, `public/sw-update.js`**. Replace Claude's blanket all-page navigation with the targeted helper. Remove the redundant `public/ussd-update-bridge.js` from the combined tree; the earlier commit still preserves its history.
- Remove global `skipWaiting: true` and the `AGRICARE_SW_UPDATED` unconditional reload listener. First installs never navigate a new visitor. Current form pages acknowledge the probe and retain input even if another tab activates the replacement.
- Retain HTTP `no-store` for HTML, worker and helper, immutable hashed assets, the complete offline precache, downloaded content and IndexedDB synchronization queue. No browser storage is cleared by the recovery helper.
- Update Claude's helper tests and historical-build simulation to assert this combined policy. The simulation now validates revision arguments through Git and builds archives without shell interpolation. It preserves the historical route-failure reproduction and checks bounded recovery rather than requiring all tabs to reload.
- Replace site-data deletion as the first iPhone troubleshooting instruction, since it can erase pending offline work.

## Database and authentication

No schema changes or migrations are introduced. SQLite, existing accounts, roles, privacy/participant consents and recovery protections remain unchanged. Registration uses an existing authenticated identity for participant enrollment, preserves one account per normalized number, never accepts a phone number alone as authentication and never marks ownership verified. Self-selected participant categories do not grant expert/admin permissions. Ministry aggregates remain authorized and privacy protected.

All application-writing tests use disposable databases, synthetic fixtures and random local ports. Neither the existing development database nor the live database is used for tests. No service on port 3000 is stopped or restarted.

## Validation

Execution results are recorded below after the integrated suites finish. Coverage includes every tracked Node `.test.ts`/`.test.tsx` file, API contract verification, real-mode browser registration/login, standalone/QR/voice/navigation browser tests, offline listings/inquiries/reconnect synchronization, targeted recovery with active form/enrollment preservation, historical production-build recovery, TypeScript, production build and built-server startup from another working directory. PHP/MySQL migration suites are outside this SQLite integration and are not started.

## Remaining limits and deployment gate

Modern cooperating forms and active enrollment sessions are browser-tested against unnecessary reloads. A service worker cannot inspect the DOM of a non-cooperating legacy bundle: old `/ussd` input cannot be distinguished from its missing-route page, and an unresponsive client may miss the timed acknowledgement. Legacy pages may reload once; old bundle code can also reload itself on controller changes. This cannot be retroactively prevented by editing the new bundle. Save work before manually applying updates, and never clear site data without accounting for offline drafts.

Browser results are automation with synthetic data. Chromium uses desktop Chrome with mobile/touch emulation. The available WebKit 17.4 compatibility runner supports the online checks, but its offline emulation fails even on an independent minimal service-worker page. Current Safari, physical iPhone behavior and audible speech need device verification. No telecom *440# service or SMS delivery is claimed.

This local merge does not enable real-user mode on the live site. The previously verified live deployment remains synthetic-only until separately approved configuration changes. Source-derived settings, backup/restore verification, persistent SQLite requirements and rollback procedures are in `docs/REAL_USER_DEPLOYMENT.md` and the historical takeover review. Preserve `DB_PATH` and secrets; do not reset the database or use a fresh one for deployment. Take and restore-verify an actual production backup only through the separately approved deployment procedure.

No push, deployment, Hostinger/environment change, production registration or live database write is part of this integration. A separate explicit deployment approval is required after reviewing the final commit and limitations.


## Validation results (completed after Codex's usage limit; fresh run in this worktree, disposable databases only)
- `npm run lint` (tsc) and `npm run build`: pass. Final default build restored after the browser suites.
- Node suites, all pass: sw-update 4, ussd-update-bridge 4, public-deployment 4, brand 9, home 8, role-dashboards 7, ministry-workspace 9, ministry 15, offline 22+6+3, offline-qa 3, password-policy 3, password-auth 9, recovery 8, backup-restore 1, auth-ussd 6, real-mode 8, real-mode-config 4, ussd-enrollment 14, phase0 20, phase0b 11, phase2a 12, phase2b 15, ussd-marketplace 18, triage 21, harvest 17, h1 18, h2 16, sms 39, api 32, harness 4, deploy 13, hardening 11; API contract: all 63 requests match the golden snapshot. (Codex's own earlier run of every `.test.ts` file: 394 of 394.)
- Chromium browser suites (production build with the marketplace flag): browser-qa 7, ussd-enrollment-browser 10, real-mode-browser 11, voice-mobile 1, ussd-only 9, ussd-recovery 6; historical-build simulation (`c7b80eb` to `8cb5464` to this tree): 6 steps, RESULT OK.
- WebKit 17.4 compatibility runner (`QA_BROWSER=webkit`, Playwright 1.45.3): `ussd-recovery-browser` passes 5 of 6 (legacy recovery, current-input preservation, standalone navigation, voice/speed/enrollment/all eight menus/mute). Legacy recovery causes one extra settling page load in WebKit (Chromium: none), then the load count stays constant; the test now accepts at most one extra load and requires stability afterwards. The 6th check (offline reopen and refresh) fails in this runner with a WebKit internal error that also reproduces on an independent minimal service-worker page (see the takeover review); it is a runner limitation, not evidence about current Safari.
- Not verified: a physical iPhone, current Safari, audible speech.
