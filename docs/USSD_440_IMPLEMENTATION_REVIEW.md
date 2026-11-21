# Proposed *440# browser USSD, voice and participant registry — review handoff

Date: 21 November 2026 (Africa/Monrovia). The user approved a **local commit only** after review. This document accompanies that commit. No merge, rebase, cherry-pick, reset, push or deployment is authorized or performed.

## 1. Audit and compatibility

- Dedicated worktree: `/Applications/XAMPP/xamppfiles/htdocs/Agri-AdvisoryLib-codex`, branch `codex/ussd-offline-qa`, starting HEAD `ade54ff9959c4f84b7e684609052a78fecf1986e`; initially clean.
- Local `main` is older: this branch contains 44 commits absent from `main`, with none missing from it. The active development branch `feature/offline-first` at `d6d5a70eb95d5850e76ec173bd48aec14896230e` was four commits ahead at inspection. No fetch or branch synchronization was performed.
- Those four commits cover the homepage, integration of the previous Codex QA commit, Linux dependency lockfile fixes and branding/security QA. This implementation was deliberately built on the current Codex snapshot, not silently synchronized with Claude's changes.
- The existing pure USSD engine, numbered functions, crop/pest/soil/harvest guidance, original **8 Sell & market**, interactive option 3, marketplace ownership, inquiries, reference generation and queue remain in place. A new enrollment wrapper precedes the existing engine.
- Existing `users`, `user_roles`, sessions and expert approval are reused unchanged. Device enrollment uses the existing browser requester secret with a domain-separated server hash. No phone is detected or requested.
- Among edited files, **`tests/phase2a.test.ts`** also differs in Claude's committed development branch. Reconcile that test hunk; retain Claude's homepage assertions. There are no edits here to `server.ts`, `vite.config.ts`, package files, branding/assets, the pure `src/lib/ussd/engine.ts` or global authentication/security code. Keep Claude's newer null-reference fallback in the USSD engine during integration.
- Required dependencies already exist in this branch: browser speech APIs at runtime, and existing Playwright/fake-indexeddb/tsx tools for tests. No new package dependency was added. Preserve Claude's Linux optional-dependency lockfile fix.
- Claude's uncommitted work was not inspected. Only Git objects and worktree metadata were read outside this worktree.

## 2. Implementation

### Dial and enrollment

Dial `*440#` using the handset or keyboard, then Send. The code is explicitly **proposed and browser-only**, not assigned, registered or connected to a telecom service. The welcome screen offers `1` for automatic screen reading or `2` without voice.

A returning participant is looked up using the current signed-in account or private browser identity and current recorded consent. New participants select Farmer, Buyer, Agricultural Expert, Cooperative or Other, then a county. The complete versioned consent text is displayed over numbered pages before the final Agree & register action. Only category, county and the necessary identity/consent metadata are stored. There is no free-text name, phone, password or PIN collection.

Personal marketplace actions require successful enrollment in the handset. Decline, or the always-visible public-advice shortcut, opens the existing public advice/practice menus with private listings/inquiries hidden and submissions disabled. This preserves guidance when registration is unavailable or offline.

Anonymous registration does not create a fake login account. It creates a centrally recorded participant identified by the same device secret already used in the application. An explicit consented request while authenticated can link that device registration to the current account. Client-supplied account IDs are rejected. Account-bound records are never exposed by the old device key after sign-out. Shared demonstration logins cannot enroll; they must use a private device identity or a private account.

Category is descriptive data, **never a role grant**. Selecting Agricultural Expert cannot assign `expert`, create an approved expert profile, or bypass existing authorization. Duplicate retries reuse one participant and one consent event per version/identity kind. Category/county are not edited by retrying registration.

### Voice

The handset reads visible screen headings, choices, instructions and safe notices. It never reads typed input or identity metadata. Credential-bearing lines, phone-shaped numbers and long secret-like strings are filtered; private inquiry bodies are replaced by a safe navigation announcement. Voice persists between screens within the mounted handset, including Back/Home and restarted sessions.

Activation calls speech synthesis directly in the activating user gesture, then subsequent screens read automatically. Local English voices are preferred. Visible Voice on/off and Repeat controls remain available. Holding pointer/keyboard `0` for 1.5 seconds mutes without typing zero; short presses retain the original digit/navigation behavior. Space on the focused zero key also supports a hold; Enter keeps the normal button click.

Unavailable speech, synthesis errors or speech that never starts produce visible fallback text. The latter is bounded by a four-second start watchdog. Replay works without enabling automatic voice. No telecom voice, SMS, background audio guarantee or language translation is implied.

### Offline behavior

The existing service-worker and listing synchronization code are unchanged. Public guidance and menus remain bundled. Device-only participants may reopen using minimal saved enrollment metadata, bound to a SHA-256 fingerprint of the existing device key; the raw secret is not copied into that metadata. This local copy grants no server permissions.

New registration requires a server reply. Offline attempts are explicitly unconfirmed and are not put into the harvest queue. County/category/consent progress remains on screen so a user can reconnect and retry. Account enrollment is never recovered from localStorage as if it were an authenticated session. A fresh/offline browser with no registration can still browse public advice. Existing queued sales retain their existing synchronization behavior. Inquiries still require internet.

### Ministry view

The existing Ministry overview mounts a separate participant registry panel. `/api/v1/ministry/participants` requires the existing **admin** role; ordinary farmers, self-selected experts and anonymous users cannot read it. No raw directory, phone, key, participant ID or account ID is returned.

Totals, category and county are separate distributions. Existing small-group suppression (minimum three distinct participants, including complementary merging) is reused. Counts round down to multiples of three; changes publish in durable batches of three. Snapshot payloads are stored in the same database, so a process/database reopen cannot reveal one added registration. No cross-filtering or individual registration times are exposed. Synthetic demo participants and real data are separate blocks. This flow creates **synthetic records only**, never invented real-farmer totals. Registry responses are `no-store` and are not cached offline by the panel or service worker.

## 3. Database and API

`server/migrations/20261121_ussd_440_participant_registry.sql` is additive. It creates:

- `participant_registrations`: unique nullable `user_id` referencing existing users, unique hashed requester identity, allowlisted category, county, registration channel, synthetic flag and creation time.
- `participant_consents`: immutable versioned consent text/time and identity kind, referencing the participant; retries do not rewrite history.
- `participant_registry_publications`: separate real/synthetic suppressed publication batches.

No existing table or record is changed by the migration. Enrollment may explicitly attach a previously unlinked participant to the authenticated account. No existing account role or approval is altered. Foreign keys preserve participant/consent history; there is no destructive down migration or new deletion route.

Routes mount through the existing `v1Router`, after its CSRF middleware:

| Method/path | Authorization and contract |
| --- | --- |
| `GET /api/v1/participants/me` | Strong `X-Requester-Key`; returns only the current account's or unlinked device's participant with current consent, otherwise `null`. Ignores query identity selectors. |
| `POST /api/v1/participants/enroll` | Protected demo/test environment only; CSRF, strong requester key and explicit `{category, county, consent: true, consentVersion: 'ussd-demo-v1'}`. Other fields rejected. Per-IP limit 12/hour using existing test scaling and `Retry-After`. |
| `GET /api/v1/ministry/participants` | Existing admin authorization. Only suppressed, rounded, separately labelled aggregates; query filters cannot narrow groups. |

## 4. Changed files

Edited existing files:

- `server/routes/v1.ts`: mount the isolated registry router behind CSRF.
- `src/components/ussd/UssdPhone.tsx`: enrollment integration, public/personally identified gates, voice, hold handling and late-response guards. Redial preserves session/command counters so confirmed operations cannot collide.
- `src/pages/public/UssdDemoPage.tsx`: truthful proposed-code, consent and voice instructions.
- `src/pages/public/FarmToMarketDemoPage.tsx`: update the existing walkthrough's entry instructions.
- `src/pages/public/MinistryWorkspacePage.tsx`: mount the separate admin registry panel in Overview.
- `tests/browser-qa.ts`: enter through enrollment before the existing marketplace journeys, plus verify two distinct sales after redial in the same page.
- `tests/phase0.test.ts`: replace the old blanket prohibition on any code with an exact allowance for the one proposed browser-only code; preserve all other telecom safety checks.
- `tests/phase2a.test.ts`, `tests/phase2b.test.ts`: replace historical blanket migration bans with checks that original guidance and the pure engine remain independent of the additive registry; update the walkthrough wording assertion.

New files:

- `server/migrations/20261121_ussd_440_participant_registry.sql`
- `server/participantRegistry.ts`
- `server/routes/participants.ts`
- `src/lib/participantRegistry.ts`
- `src/lib/ussd/enrollment.ts`
- `src/lib/ussd/registryClient.ts`
- `src/lib/ussd/screenVoice.ts`
- `src/lib/ussd/useEnrollment.ts`
- `src/components/ministry/ParticipantRegistryPanel.tsx`
- `tests/ussd-enrollment.test.ts`
- `tests/ussd-enrollment-browser.ts`
- `tests/ussdBrowserHelpers.ts`
- This review document.

## 5. Verification

Verification passed:

- **299 tests passed, 0 failed** in the combined USSD/offline/marketplace/identity/security/Ministry/guidance run. The registry suite was then extended with an existing-schema upgrade/source-separation regression and rerun: **11 passed, 0 failed** (300 distinct test cases across these runs; the registry cases overlap the combined run).
- Existing API golden contract: **63 requests matched**, with no golden-file rewrite.
- Enrollment/voice/registry browser suite: **7 scenarios passed**, Chrome 150.0.7871.125, isolated loopback port **61400**. This includes the complete dial-to-consent journey, returning identity, duplicate prevention, replay, pointer/physical-key holds, unavailable and stalled speech fallback, offline refusal/retry, consent decline, and admin registry visibility. Both the handset and populated Ministry panel were checked at **320, 360, 375 and 412px** without horizontal overflow. The 320px screenshots were visually inspected.
- Preserved marketplace/offline browser suite: **7 scenarios passed**, separate protected demo server on loopback port **63386**. Offline unvisited route reopening/refresh, original option 8, keyboard controls, persistent offline sale, exactly-once reference generation, offline inquiry refusal, authorized buyer/seller reply and **two distinct sales after redialing in the same page** all passed.
- The latter suite now logs failures before cleanup and bounds temporary profile cleanup. One repeat had left its own QA process waiting after Chrome closed; only that known disposable process/database was stopped/removed, and the bounded-cleanup repeat exited successfully. Port 3000 and other processes were not affected.
- Browser speech calls are instrumented to verify timing and safe text. A TypeScript-runner helper initially prevented mock installation; the harness now injects a literal browser script. These are not claims of audible speech on a real phone.
- `npm run lint` (TypeScript) passed. Production client/server builds passed with the existing opt-in marketplace flag and with default configuration. The final local build uses the default configuration. Cache regression tests ran after the build completed and passed; the build precaches 154 shipped resources (about 11.7 MiB).
- `git diff --check` passed. The original base is `ade54ff`; the user subsequently approved committing these changes locally, without integration.

All API suites use the existing disposable SQLite harness, with `API_BASE_URL` unset and random loopback ports. The marketplace browser suite creates its own protected synthetic demo server, database and browser profile. The enrollment browser suite creates a separate disposable test backend and profiles. No test uses Claude's database, port 3000, the public demo, Hostinger, SSH or any production database.

Re-run in this worktree with Node 22.13+ and installed desktop Chrome (`QA_CHROME` can select another executable):

```sh
npm ci
VITE_USSD_MARKETPLACE_ENABLED=true npm run build
npm run lint
node --import tsx --test tests/ussd-enrollment.test.ts tests/phase2b.test.ts tests/ussd-marketplace.test.ts tests/harvest.test.ts tests/harvest-client.test.ts tests/phase2a.test.ts tests/offline-qa.test.ts tests/offlineAdvisor.test.ts tests/offlineInventory.test.ts tests/dataCache.test.ts tests/hardening.test.ts tests/phase0.test.ts tests/phase0b.test.ts tests/api.test.ts tests/sms-auth.test.ts tests/ministry-workspace.test.tsx tests/role-dashboards.test.tsx tests/h1.test.ts tests/h2.test.ts tests/triage.test.ts tests/ministry.test.ts
node --import tsx tests/contract/run.ts
node --import tsx tests/ussd-enrollment-browser.ts
node --import tsx tests/browser-qa.ts
npm run build
```

Keep the build and cache-manifest tests sequential. Browser suites need the existing opt-in marketplace flag for interactive marketplace checks; default builds retain the existing disabled-by-default marketplace policy.

## 6. Limitations

- No real telecom USSD/voice service, shortcode allocation, SIM detection or phone-number detection exists. This is a browser simulator with a proposed code.
- Browser evidence uses headless desktop Chrome with mobile viewport and offline emulation. Speech calls and fallback behavior are instrumented. Audible output, installed voices, touch behavior, storage eviction and installed PWA behavior still need real-device testing, especially iOS/Safari and Android.
- First offline use requires an initial successful online PWA installation on HTTPS or localhost. Browser speech may need an installed local voice and explicit playback permission.
- Fresh registration cannot be confirmed offline. Account-bound returning identity still needs a valid authenticated session; it is never inferred from cached account metadata. Clearing browser storage loses anonymous device identity; no phone-based account lookup or recovery is introduced.
- A device identity represents one private browser profile, not proof of a unique human. Rate limiting limits abuse; synthetic totals are not population statistics. One person may hold more than one device identity. A user with existing registrations under multiple identities is not automatically merged across keys.
- This change does not provide real-person enrollment, edit/withdrawal administration, expert credential verification or a raw participant directory. Creating synthetic registrations is rejected outside protected demo/test environments.
- A final consented request may finish after End/Cancel; the interface states this. Cancel is not consent withdrawal.
- Tests validate the Codex snapshot plus these changes. Claude's newer branding/security/dependency changes and uncommitted edits are not silently included; integration needs another build/test pass.

## 7. Exact integration procedure — only after approval

1. Review the local USSD commit and this document. Do not reset either worktree. Let Claude finish and record their authentication work separately.
2. Local committing was approved for this assignment; identify the resulting commit with `git log -1 codex/ussd-offline-qa`. This approval does not authorize applying it to another branch or worktree.
3. After separate integration approval, create/use a clean integration worktree from the then-current `feature/offline-first` commit. Apply the approved Codex commit there; do not apply it into Claude's actively edited worktree.
4. Reconcile `tests/phase2a.test.ts`: retain Claude's homepage assertions and the new guidance/registry independence assertion. Retain all Claude branding, password policy, native optional dependency fixes and the newer USSD null-reference fallback. The shared router/panel edits here are additive; check for newer uncommitted registration or Ministry work before resolving conflicts.
5. Use the date-qualified `20261121_ussd_440_participant_registry.sql`. It deliberately leaves sequential slot 012 to authentication. The migration loader sorts and records full filenames, and applies all missing files rather than skipping lower numbers. Review Claude's final committed migration set for table/column dependencies before integration. Never rename a migration already applied to a shared database.
6. Run the verification commands in that clean integration worktree against disposable databases and unused ports, including the unchanged contract snapshot and both browser suites. On Claude's branch, run branded JSX suites with `node --import ./tests/assets-loader/register.mjs --import tsx --test ...`, and run their `test:home`, `test:brand`, `test:password-policy` and updated `test:ussd-marketplace` scripts as well. Do not overwrite the dependency lockfile or downgrade asset/build configuration.
7. Review the integrated UI on real devices and confirm the proposed-code wording. Any shared/production migration, publishing or deployment requires explicit approval and the existing deployment workflow. Nothing here starts the PHP/MySQL migration.


Integration command outline (documentation only; the integration writes below were not executed):

```sh
# Review the locally approved commit:
git log -1 --oneline codex/ussd-offline-qa
git show --stat codex/ussd-offline-qa

# Only after integration approval, from the repository's normal Git context:
# Replace the destination with the user-approved clean integration path.
git worktree add -b integrate/ussd-440 <approved-integration-path> feature/offline-first
cd <approved-integration-path>
git cherry-pick <approved-Codex-commit>
# Resolve the noted shared test hunk, then run section 5 and Claude's newer suites.
```

The reviewed base remains `ade54ff9959c4f84b7e684609052a78fecf1986e`; the inspected development tip remains `d6d5a70eb95d5850e76ec173bd48aec14896230e`. Re-check both tips before integrating; the user has authorized only the local commit, not integration or deployment.


## 8. Local-commit confirmations and phone/password authentication handoff

The user approved only the local commit. Pre-commit checks confirm:

1. The first welcome screen owns its own numbered choices. Its `1` enables automatic voice; it is consumed by enrollment and cannot select an old menu item. Once the original main menu opens, `1` still selects Crops & planting and **8 Sell & market** is unchanged.
2. Automatic voice remains enabled across subsequent USSD screens and navigation until muted. Browser checks compare the spoken safe text against category, county, every consent page, main menu, crop menu and invalid-choice notices without pressing Repeat. Private inquiry bodies are intentionally not spoken, and credentials/phone-shaped values are redacted.
3. Holding `0` for approximately 1.5 seconds disables voice and calls speech cancellation while the pointer is still held. Releasing the hold does not type a zero. Short zero still enters the ordinary navigation digit; `0` plus Send retains Back. Later screens stay silent while muted. Physical-key holds and visible toggle/repeat controls are covered too.
4. Registrations and consent history persist in the existing SQLite database. Unique account IDs and hashed device keys prevent duplicate enrollment for the same identity, including retries and concurrent requests. Account linkage reuses the existing participant when no account registration exists. Ministry aggregates are admin-only, separately synthetic/real, rounded/suppressed and published in batches of three, not as an individually observable counter. No phone numbers or raw identity keys are returned.
5. Agricultural Expert is participation metadata only. Enrollment cannot add an expert/admin role, approve an expert, or mark a phone verified. Tests assert both privileged endpoints remain denied to a self-selected expert with a farmer account.
6. All three new tables are additive and confined to participant registration/consent/publication data. The migration does not alter `users`, authentication columns or role tables. It was renamed **before shared application** from the draft `012_ussd_participant_registry.sql` to **`20261121_ussd_440_participant_registry.sql`**. Only disposable test databases had seen the draft filename. The committed development branch inspected still contains 001–011. Claude's uncommitted authentication migration was deliberately not read; no claim is made that its final SQL has already been integration-tested. A numbering fixture reserves a separate `012` version and verifies that this independent registry migration still applies once.

### Responsibility boundaries

| Concern | Owner and rule |
| --- | --- |
| Phone normalization, account uniqueness and password checking | Claude's existing authentication/account service. Keep its unique normalized-phone constraint and canonical account lookup. USSD must not create a second `users` record or implement another password database. |
| Authenticated identity | Trust only the server-established session's `req.user.id`, after normal session validation. Never bind a participant using a submitted phone number, category, PIN, token in a URL or client-provided user ID. |
| Phone ownership verification | Remains exclusively an authentication concern. A successful phone/password login, a populated `users.phone`, or USSD consent is **not** evidence that a phone is verified. |
| USSD participation | Registry owns category, county, synthetic/channel metadata and explicit versioned consent, plus an optional foreign key to the existing user. Category never grants account privileges. |

### Integration flow once Claude's authentication is committed

1. When an account is desired, complete phone/password signup or login through Claude's authentication UI/API. Reuse an existing canonical account for that normalized phone; do not create a separate USSD account, placeholder phone, password, or recovery identity. Mandatory SMS is not required by the participant registry.
2. After authentication succeeds, refresh the app's existing authenticated-user context (`refreshUser`/`/auth/me`). The handset resets its enrollment state when the authenticated account changes. Only a validated server session supplies the account ID to the registry.
3. Look up `/participants/me` with the existing private browser requester key and authenticated cookies. An existing account registration is returned even from a new device/key; no new participant is needed. If absent, show the registration/consent flow. Do not treat a device cache as an authenticated account or bypass fresh consent when linking.
4. Submit the existing consented `/participants/enroll` request. The server links the unlinked device participant to the current account when applicable, or creates the single account-bound participant. The unique `user_id` and requester hash plus the transaction make repeated requests safe. Other-account device claims are refused; signing out cannot reveal an account-bound registration through the old device key.
5. Leave `phone_verified_at`, phone claim/recovery state, passwords, roles, approval and session-version fields exactly as authentication supplied them. The registry rejects extra `phoneVerified`, `phone_verified_at`, phone and user-ID request fields. It does not call SMS verification or recovery endpoints.
6. Keep an unverified phone visibly unverified in authentication/account UI. Never describe registry enrollment, a password login or selecting Agricultural Expert as phone ownership verification or professional verification.

A focused test creates an explicitly unverified synthetic account and issues a valid test-only session to emulate the future password-authenticated session boundary. It links and retries enrollment, verifies one account registration, and compares phone/password/claim/session fields before and after: they remain unchanged and `phone_verified_at` stays NULL. This verifies the registry boundary, **not Claude's unfinished login implementation**. Integration must repeat the real phone/password login → enrollment journey after Claude commits it, including invalid credentials, session revocation, consent decline and expert/admin access checks.

Duplicate prevention is per authenticated account or private device identity. Separate anonymous profiles cannot be proven to represent the same human without more identity evidence. If an account and an unrelated anonymous participant already both exist, the current code returns the account's canonical registration; it does not silently merge or delete historical anonymous records, infer identity from an unverified phone, or transfer another person's data. Authenticate first for account-based enrollment and treat anonymous totals as labelled synthetic device participation, not unique population counts. Any additional identity reconciliation requires an explicitly reviewed policy.

Pre-commit evidence: 40 focused registry/USSD tests passed, including the new unverified-account boundary test and the migration namespace fixture; TypeScript and production build passed. The browser and contract rechecks are recorded in the local commit handoff.

## 9. Recovery and handover note (Claude took over after the Codex usage limit)

- The Codex working tree was found uncommitted at base `ade54ff`. A backup of the tracked diff and the untracked files was written outside the repository before anything else was done. Nothing was reset or overwritten. The newest edits (`tests/ussd-enrollment.test.ts`, `tests/ussd-enrollment-browser.ts`, this document) were kept as found.
- Re-verified in this worktree before committing: TypeScript passes; `tests/ussd-enrollment.test.ts` passes 12 of 12; the enrollment/voice browser suite passes all 7 scenarios (voice activation, automatic reading, replay, pointer and keyboard long-press mute, returning participant, offline refusal, decline path, 320 to 412 px layouts, admin-only Ministry panel).
- Added npm scripts `test:ussd-enrollment` and `test:ussd-enrollment-browser`. No other change was made to Codex's code.

### Real-device testing still required (not established by any automated test here)
1. **iPhone Safari audio.** Safari starts speech only after a user gesture and may stay silent while the ring switch is on silent or the volume is low. Check: tap "Voice on" and hear the welcome; every later screen is read automatically; "Repeat screen" works; the 1.5 second hold on key 0 stops speech without typing a 0; locking and unlocking the phone does not leave speech stuck; an installed (home-screen) app behaves the same as the browser tab. Also check iOS 16 and the newest iOS if available.
2. **Android Chrome** with and without an installed English text-to-speech voice, and with TalkBack on.
3. **Touch long-press** on key 0 on real touchscreens (pointer capture, no text-selection or context menu).
4. **Offline reopen** of an installed app after a first online visit, and storage eviction on low-storage phones.
5. The wording of the proposed `*440#` code with the team: it is not assigned or connected to any telecom service.


## 10. Voice speed (default 0.75)
The default speaking rate is **0.75** (`VOICE_RATE` in `src/lib/ussd/screenVoice.ts`). `speechText()` turns each screen line into its own sentence and adds an extra pause mark (an ellipsis) after every menu option, in ONE utterance per screen so activation stays inside the user gesture (needed on iPhone Safari). The privacy filter is unchanged. Whether the pauses sound right on each device voice needs a real-device check.
