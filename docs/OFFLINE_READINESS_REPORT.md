# Offline Readiness Report — Agri-Advisory Liberia (Team 8)

Branch `feature/offline-first`. **Hackathon prototype, not a production system.**
Testing so far was done in **desktop Chrome with simulations** (server stopped, `fetch` forced to fail, a 360/390 px iframe). **Nothing has been
tested on a physical Android phone.** Treat every "verified" below as "verified in desktop Chrome".

## 0. Physical Android findings (first real-phone test) and follow-up
Tested at `http://192.168.100.96:3000`: Starter Pack saved 43/43 guides + 7 server guides but **0/9 pictures** ("This browser cannot store images offline"); Chrome said "This app cannot be installed"; text too small; utility controls took too much height.
- **Cause (reproduced on desktop at the same LAN address):** plain http is not a secure context, so Cache Storage, service workers, `storage.estimate`, `crypto.randomUUID`, Web Locks and the microphone API are absent; IndexedDB still works. Picture URLs were fine (200, image/webp).
- **Fixes (commit `a936eb2`):** pictures stored as Blobs in IndexedDB (DB v3) and rendered from there; retry fetches only missing pictures; offline-readiness card on `/downloads`; HTTPS test proxy + name-constrained 90-day local CA (`docs/ANDROID_HTTPS_TESTING.md`); mobile type scale (body 16 px, captions 15 px), one-row utility strip, grouped menu, 44 px controls.
- **Desktop-verified:** 9/9 pictures at the insecure address, retry, persistence after tab reopen, 360/390 px layouts (no overflow; min font 15 px on guides/experts/downloads/offline, 14 px badges on marketplace), PWA manifest/icons/SW/install prompt on localhost, proxy blocking by curl.
- **Still needs the physical phone:** CA trust, install, airplane-mode launch, touch use, camera/microphone, real readability.

## 0b. Second Android observation pass (header, Marketplace empty state, Farmer Dashboard)
Reported from the phone: header/logo partly hidden near Chrome's toolbar; Marketplace showed zero products with a generic "No matching products found"; dashboard states unclear. I did not have the screenshots, so I reasoned from the code.
- **Header:** the header was `sticky top-0` with no safe-area handling and the page had no `viewport-fit=cover`. Hardened: `viewport-fit=cover`, header `padding-top: env(safe-area-inset-top)`, `min-h-dvh`, `scroll-padding-top` for anchors. Desktop emulation confirms the header stays at top 0 after scrolling and the bottom nav is flush; **`env(safe-area-inset-*)` cannot be emulated on desktop, and Chrome's own toolbar is not part of the app, so whether the phone symptom is gone must be confirmed on the phone.** If it persists, send the screenshot and the installed-vs-browser mode.
- **Marketplace states (desktop-verified):** offline -> "Live listings need internet" (no Clear Filters button; filters are not the problem) + Prepare a Listing; failed request -> "Could not load listings" + Try Again (not reported as "no products"); filters/search/seller-type active -> "No products match your filters" + Clear Filters; real empty answer -> "No products are published yet"; stale list while offline -> "Saved Information — Not Live" banner.
- **Farmer Dashboard (desktop-verified):** new "Saved on This Phone vs Published Online" panel (Draft / Pending Sync / Sync Failed / Published; questions Sent). Server-backed cards are labelled "(server)" and show "—" offline or on error, never a false zero. **Bug fixed:** "My listings" counted every listing on the server (the query parameter was ignored); it now counts only listings with this phone's owner token.
- **Found, not fixed (security):** the listings API returns each listing's `owner_token` to every visitor, and that token is the only proof of ownership for edit/delete. Anyone could copy it and edit someone's listing. Must be replaced by real account ownership (see migration plan).
- **Layout regression found and fixed:** at 360 px the toolbar overflowed by ~16 px when the "Offline" label appeared; tightened. Measured at 360/390 px, offline: no horizontal overflow, 0 controls under 44 px on Marketplace, Knowledge Center, Expert Support, Dashboard; minimum font 15 px (14 px on a few Marketplace badges).
- **HTTPS limitation:** install and offline opening still require the https URL with the dev CA trusted on the phone (`docs/ANDROID_HTTPS_TESTING.md`); not yet confirmed on a device.

## 1. Completed features

| Stage | Feature | Commit |
|---|---|---|
| 1-2 | IndexedDB storage, service-worker caching that actually matches routes, update prompt (never reloads without a tap), reachability probe | `e3fab19` |
| 3 | Starter Pack (43 bundled guides, 9 pictures, 6 modules) + server guides, search, reader, safety notices, outdated/updated labels, optimised WebP pictures (~417 KB vs ~10 MB), error handling, retry | `64bf45a` |
| 4 | Offline marketplace listing drafts, offline expert questions, IndexedDB sync queue, idempotent server endpoints (`Idempotency-Key`), conflict detection, phone-consent enforcement, photo compression | `9927907` |
| 5 | Optional offline audio (IndexedDB Blobs), English *demonstration* recording only, Kpelle/Bassa/Mano registered as "awaiting recordings" | `f46552e` |
| 6 | Offline Guide Assistant: deterministic local search, copied excerpts, sources, safety notices, no network | `567cc06` |
| 7 | Saved Ministry counts and a tested stale/expired path for future weather, with exact "last updated" times | `1fb43bf` |
| 8 | **My Offline Downloads** (`/downloads`): storage, counts, dates, safe delete with confirmation, pause automatic sync; Starter Pack low-storage self-recheck; this report; migration plan | this commit |

## 2. What works offline (desktop-verified)
App shell and 16 main pages open with the backend stopped (home, guides, crops, livestock, pests, soil, weather, ministry, advisor, offline
library, reader, downloads, marketplace, experts, language lab, about). Saved guides open with text, pictures and safety notices; saved guides are
searchable; audio plays; the assistant answers from saved guides; marketplace and question drafts can be written and are kept; saved Ministry counts
show with an exact time and a "Not Live" label.

## 3. What needs internet
Gemini advisor, expert replies, the live marketplace list, downloading anything, refreshing Ministry counts, and sync. **There is no live weather source
at all**; the Weather page shows bundled sample profiles and says so.

## 4. Test results

| Check | Result |
|---|---|
| `npm run lint` (tsc) | pass |
| `npm run build` | pass |
| `npm run test:api` | 19 / 19 |
| `npm run test:offline` | advisor 22, data cache 6, inventory 3 — all pass |
| First-time install, Starter Pack download (43 guides, 9 pictures, 7 server guides) | verified |
| 16 pages with backend stopped | verified |
| Reload and fresh-tab reopen with backend stopped (data persisted) | verified |
| Marketplace/expert drafts: create, cancel-delete, confirm-delete | verified |
| Plain drafts and "save for expert" drafts **not** sent on reconnect; paused auto-sync sends nothing until Sync Now | verified |
| Lost response during sync -> one server row, local item becomes Published | verified |
| Interrupted download -> partial, Retry completes without duplicates | verified |
| Low storage (faked estimate): download refused, nothing saved; warning clears when space is freed | verified (after fixing a bug found in this stage) |
| Audio: download, play with backend stopped, delete frees space | verified (decode/playback only) |
| Assistant: 6 modules, spelling variants, no-match, no external requests | verified |
| Weather stale/expired and Ministry failed-refresh/empty states | verified |
| 360 px and 390 px: no horizontal overflow on `/downloads`, `/offline`, `/advisor` | verified |

**Not tested:** physical Android, speaker output, real network switching (we stopped the server instead), quitting and relaunching the whole browser
(we closed and reopened a tab), true quota-exceeded errors, Safari/Firefox, Background Sync (not used), very low-end device performance, long-term
IndexedDB eviction.

## 5. Known limitations
- Keyword search, not understanding: odd wording can miss; a one-word match is only ever "weak".
- English only. No translation, no offline speech recognition. Smart Listen (browser voice) may not work offline.
- Audio is a computer-voice demonstration of one Rice passage, not a lesson. No Kpelle, Bassa or Mano audio exists.
- Weather is sample data; the stale/expired logic is only exercised with injected test data.
- No Ministry sign-in or role exists in the prototype; `/ministry` is public.
- Public marketplace listings are not cached; offline you can only prepare listings.
- A published listing's photo cannot be changed (existing behaviour).
- Sync uses timers/events, not Background Sync, so it runs only while the app is open.
- Several "Sample Guide" entries from the server are demonstration content.

## 6. Security and privacy observations
- Good: CSRF double-submit kept; protected endpoints return 401 unauthenticated; the cache accepts only an allow-list of public aggregate keys; phone numbers are
  stored/sent only with consent (client and server); idempotency prevents duplicate writes; unsent drafts need explicit confirmation to delete; the service
  worker caches only public assets.
- **Weak (pre-existing prototype design):** marketplace ownership uses a browser-chosen `ownerToken`, so anyone who learns it can edit that listing.
  `PATCH /expert-requests/demo/:id/reply`, language-lab review and inquiry updates need no authentication. These must be fixed before any real use.
- Data on the phone is **not encrypted**: drafts (including a consented phone number, photos and voice notes) sit in IndexedDB readable by anyone with the
  unlocked device/browser profile. Shared phones are a risk; the page offers deletion.
- The audit log and rate limits only protect online endpoints.
- Offline assistant questions never leave the device; saving one for an expert is an explicit draft.

## 7. Android testing checklist (to run on a real phone)
1. Open the site over HTTPS in Chrome for Android; install via "Add to Home screen"; confirm icon, standalone launch.
2. Online: open `/downloads`, download the Starter Pack and the audio; note storage figures.
3. Turn on airplane mode; force-stop and reopen the installed app; open guides, search, assistant, audio (with headphones and speaker; check volume).
4. Create a marketplace draft with a camera photo and a question with a voice note offline; confirm the photo is small and the mic permission prompt works.
5. Turn airplane mode off; confirm only items marked "send when online" sync; check no duplicates; try Pause automatic sync.
6. Fill storage (many large files) and retry a download; confirm the message.
7. Test Low-Data Mode, 360 px layout, text size 130%, and TalkBack on the main buttons.
8. Check battery/CPU on a low-end device while searching with 50+ guides.
9. Record failures here with device model, Android and Chrome versions.

## 8. Hackathon demonstration steps
1. `npm run build && NODE_ENV=production DB_PATH=<throwaway>.db npx tsx server.ts` (never the real `data/`); open `http://localhost:3000`.
2. `/downloads` -> Download Starter Pack -> show size and counts. Download the audio lesson.
3. Stop the server (or enable airplane mode). Show the offline banner, open a guide, play audio, ask the assistant "my fish are gasping at the surface of the pond".
4. Marketplace -> Post Farmer Listing -> Save & Sync When Online; Expert Support -> save a question. Show "Saved on This Phone" and Pending Sync.
5. Restart the server -> watch Pending become Published; show a plain draft was *not* sent.
6. `/weather` (sample labelling) and `/ministry` (Saved Information - Not Live).
7. Be honest on stage: sample/synthetic data, English only, no live weather, desktop-tested.

## 9. Outstanding production requirements
Real accounts and authorization for every write (replace owner tokens); a real weather provider and a Ministry role/data-sharing agreement; native-speaker
reviewed Kpelle/Bassa/Mano recordings; encryption or auto-expiry of on-device drafts; HTTPS hosting (PWA needs it); physical device testing; accessibility
audit; content review of all guides by agricultural officers; rate limiting for sync endpoints; backups; monitoring; PHP/MySQL migration (see
`docs/PHP_MYSQL_MIGRATION_PLAN.md`) because production hosting is PHP/MySQL.
