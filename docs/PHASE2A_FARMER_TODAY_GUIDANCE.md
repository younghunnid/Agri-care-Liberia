# Phase 2A: farmer "Today" screen, planting months, harvest and storage guidance

Status: **implemented and committed locally; not deployed, pushed or merged.** Stack unchanged (React, TypeScript, Node.js, SQLite, offline-first PWA). **No migration, no server change and no new dependency**: everything here is bundled, static content plus browser-side logic, so it works offline and does not touch any database.

## 1. What a farmer gets
* **My farm today** (`/today`; the first tab of the phone's bottom bar, and a banner at the top of Home). Greeting and month; a green/amber **Online / Offline** badge and a "N waiting to send" badge; **five big actions** (Check my crop, Agricultural advice, Sell my harvest, Find buyers, Expert support); **My farm** (county and the crops grown, saved on the phone only); **Reminders for today**; sample weather for the chosen county; **Saved on this phone** with one large "Send now" button; a plain list of what is working, simulated, draft and future; a "Read this page" button (the phone's own voice).
* **Planting and storage guidance** (`/guidance`, with `?crop=`, `?county=`, `?tab=planting|storage`). Crop and county choosers, two tabs, a "this month at a glance" list of all nine crops, links to the full crop guide, sample weather, an expert and the Today screen.
* **Inside the existing Crops Library** (`/crops/:slug`): the planting card and the harvest/storage card now appear on every crop's page, under the same labels.
* Navigation: "Planting months by crop" and "Harvest handling and storage by crop" under Get Advice; "My farm today" under Farm Tools; the demonstration walkthrough has two new first steps (now 14).

## 2. Where the content comes from (nothing new is claimed)
| Content | Source | Label shown |
|---|---|---|
| Planting months, nine crops | A structured copy of the `plantingWindow` text already in the Crops Library. A test re-reads that text and requires the same months for every crop (including the wrap Oct to Mar). Where the library gives no months ("early rains", "late rains", "sheltered beds") the screen says so. | Demonstration guidance, not reviewed |
| County notes | The bundled **sample** weather profiles (six counties). The other nine counties say "no county sample is bundled; not verified". | Sample, not live, not a forecast |
| At harvest, storing it | The Crops Library sentences, unchanged (a test compares them word for word). | "From the Crops Library" |
| Handling, watch for, before you sell, checks for every crop | General good practice written for this demonstration: no numbers, doses, products, yields, prices or dates. | "General good practice (demonstration)" |
| Reminders | Calendar month against the planting months; the county's sample risk notice; a damp-storage check for rice, maize and groundnuts only when the sample profile is humid or wet. | Each reminder carries a tag |

Every guidance screen carries: *"DEMONSTRATION GUIDANCE ... NOT been reviewed by the Ministry of Agriculture or by an agronomist ... check with your county extension officer"*, the line that it works without internet, and (planting) *"Regional data is not verified ... not adjusted for your county, your soil or this year's rains"*. Sample weather always reads *"SAMPLE weather. Not live. Not a forecast for today."* No page claims official approval, certainty or a prediction; a test scans all generated text (every crop, county and month) for doses, products, prices, certainty words and any un-negated "forecast".

## 3. Offline and synchronization
* The guidance, the profile logic and both screens make **no network call** (tested). They are part of the app bundle that the service worker precaches (`globPatterns` includes js/css/html, `navigateFallback` is `/index.html`).
* **Verified in a real browser with the server stopped:** `/today` opens with the Offline badge and the offline notice, the saved county and crops, the reminders; `/guidance` (storage tab) and `/crops/rice` open with all cards.
* "Saved on this phone" counts **waiting or failed** harvest listings and questions (existing offline drafts) and crop checks the farmer chose to share (existing triage store); "Send now" runs the **two existing engines** (`syncNow` and `triageSync.sync`), nothing new. After a listing was saved offline, `/today` showed "1 waiting to send"; when the server came back it synced by itself ("Synced 1 item."), the badge returned to Online, and the server holds exactly one listing with its SELL reference.
* The farm profile (county and crops) is kept in the phone's local storage, validated on every load (unknown counties and crops are dropped; damaged or blocked storage never breaks the screen, and the page says when it could not save).

## 4. Screens, routes and files
Routes: `/today`, `/guidance`. Pages: `FarmerTodayPage`, `GuidancePage`. Components: `components/guidance/GuidanceBits.tsx` (banner, planting card, storage card, reused on the crop page). Data: `data/farmGuidance.ts`. Logic: `lib/farmerToday.ts` (reminders, profile, pending work; pure and tested). Edited: `App.tsx`, `data/navGroups.ts`, `components/Layout.tsx` (the first bottom tab is now Today; Home is one tap away from the logo and the header), `HomePage.tsx`, `CropsLibraryPage.tsx`, `FarmToMarketDemoPage.tsx` (steps 1 and 2 are new).

## 5. Phone usability (measured)
Large touch targets (every control 44 px or more; the five actions 112 px tall; "Send now" 56 px), 16 px body text, labelled fields, one column. On 360 x 640, 375 x 667, 320 x 568 and 412 x 915 screens: no horizontal scroll, no control under 44 px, no text under 12 px, every input labelled. The first two action rows (four actions) are visible together without scrolling once the shared header is accounted for; the fifth (Expert support) needs a short scroll. In the demonstration environment the shared banner and header use 227 px before the page starts.

## 6. Tests
`tests/phase2a.test.ts` (12, `npm run test:phase2a`): months equal the library for all nine crops; window status for 108 crop-month pairs against an independent computation; fifteen counties; storage text equals the library; a content-safety scan of all generated text; reminders (calendar, sample weather, damp storage, unknown input, determinism); profile storage (damaged, tampered, blocked); pending-work counts; the cards rendered to HTML with the labels and the date-dependent sentence; routes, navigation, five real actions, empty states, touch-target and no-tiny-text checks, field order on a phone; no network calls, reuse of the existing sync engines, no migration; the 14-step walkthrough. Changing a planting month or dropping the sample-weather label makes tests fail (checked by hand).

## 7. Demonstration walkthrough (additions)
1. **My farm today** (working + simulated): choose Nimba and tomatoes, rice, groundnuts; show the reminders and their tags; reload to show they persist.
2. **Planting months and storage guidance** (draft): open `/guidance`, switch crop, county and tab; point at the banner and the regional-data line; switch to airplane mode and reopen it.
Then steps 3 to 14 are the earlier crop check, offline listing, buyer, inquiry and Ministry steps. At any time, `/today` shows "N waiting to send" while offline and "Synced" after reconnecting.

## 8. Known limitations
1. **Not agronomist- or Ministry-reviewed**, and said so everywhere. Planting months are one national set from the Crops Library, not county-, soil- or year-specific.
2. **Weather is a bundled sample** for six counties; there is no live weather, forecast or alert.
3. Reminders are calendar and sample-profile rules; they do not know the farmer's actual planting date, field, rain or harvest date, and there are no push notifications.
4. The "damp storage" reminder covers rice, maize and groundnuts only; perishable crops get handling advice but no reminder.
5. English only; the "Read this page" button uses the phone's own voice, and no local-language audio exists yet.
6. The farm profile lives in one browser; clearing site data removes it. It is never sent to the server.
7. Not verified: real devices, screen readers, slow networks, the Hostinger runtime, the PHP `test:m3`.
8. The fifth quick action needs a short scroll on a 360 x 640 screen.

## 9. Not in this phase
Zero Trust Security, English-Kpelle voice recordings, real USSD or SMS, payments, live AI, live weather. Still open from earlier plans: USSD simulator, distinct buyer / extension-officer / Ministry accounts, an administrator screen for advice-card review.

## 10. Your existing development database: what is pending and a proposed backup (approval needed)
* **Pending:** migration `011_demo_seed_keys` (from the hardening pass) is the **only** pending migration on `data/agri_advisory.db`. It applies automatically the next time that database's server starts. **Phase 2A adds none.**
* **Running:** the `npm run dev --host 0.0.0.0` server (started 22:53) has the database open in WAL mode on `:3000`; an older one from 00:06 holds no handle. Nothing was stopped or changed.
* **Proposed backup (needs your approval; I have not run it):** use the repository's own online-safe tool, which takes a consistent snapshot with SQLite `VACUUM INTO` while the server keeps running (it never copies a live WAL file by hand).
  1. `npm run build` (creates `backup-db.js`; touches only build output).
  2. `DB_PATH=<absolute path of data/agri_advisory.db> node backup-db.js --to ~/agri-backups/pre-011 --keep 14`. This writes `agri-<time>.db` and a `.sha256` file, runs `PRAGMA integrity_check` on the copy and prints the account count. The folder is created private (0700), outside the project.
  3. Check the printed integrity result and account count (the database has 2 shared demo accounts and 11 prototype listings), and keep the file until the migration has been confirmed.
* **Proposed recovery (also only with your approval):** stop the dev server first, then `DB_PATH=<same path> node restore-db.js --from ~/agri-backups/pre-011/<file> --dry-run` (verifies the checksum and integrity without changing anything), then the same command with `--confirm`, which moves the current database aside as `<db>.before-restore-<time>` (never deletes it) and restores the copy; restart and check the account count. Migration 011 can also be reversed on its own with `npm run db:migrate:down` (its down file keeps all records; it only drops the two key columns).
* **What I need from you:** (a) permission to run step 2 against the live file (read-only snapshot; the live database is opened for reading by the backup tool), and (b) when you restart the server, 011 applies. I will not do either without your answer.
