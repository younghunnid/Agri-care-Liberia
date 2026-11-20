# Offline Readiness Report — Agriccare Liberia (Team 8)

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
- **Security finding, now FIXED (see section 6):** the listings API returned each listing's `owner_token` to every visitor and that token was the only proof of ownership for edit/delete.
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

### 6a. Marketplace listing ownership (fixed, migration `005_listing_owner_key.sql`)
**Vulnerability:** `GET /marketplace/listings` spread the whole DB row into every response, so `owner_token` (and `seller_user_id`) were public; PATCH/DELETE accepted that same client-chosen token (DELETE even in the URL); seeded demo listings used guessable tokens (`demo-seed-N`); `?ownerToken=` worked as a filter; `?admin=1` returned hidden listings to anyone; `GET /marketplace/inquiries` returned `listing_owner_token` and `PATCH /marketplace/inquiries/:id` needed no authentication.
**Fix:**
- Public listing JSON is built from an explicit allow-list; `owner_token`, `owner_key_hash` and `seller_user_id` can never appear. A `can_manage` flag is true only for an admin or the signed-in seller.
- Ownership is a **per-listing 256-bit secret generated on the device**. The server stores only an HMAC-SHA256 hash (`owner_key_hash`), compares in constant time, and never returns the secret. It is sent only when creating (body) and as the `X-Listing-Key` header on edit/delete (never in a URL; the server logs no request bodies/headers; denied attempts are audited without any secret).
- Who may edit/delete: admin, the signed-in seller (account match), or the key holder. Legacy tokens are no longer honoured anywhere; old rows (empty hash) are manageable only by their signed-in seller or an admin. Anonymous publishing requires a well-formed key (400 otherwise).
- `?ownerToken`/`?viewerToken` are ignored; `?admin=1` works only for administrators. Inquiries: list shows only inquiries the caller can prove they manage (anonymous gets an empty list), PATCH requires management rights.
- The idempotency table stores neither the key nor a response containing it; anonymous actors are scoped by the key's hash.
- Offline workflow preserved: the draft record carries its key, create sync sends it, the confirmed listing's key is kept locally, edits send the header; a phone that lost the key fails with "Sync Failed" and a clear message and keeps its data.
**Tests:** `tests/api.test.ts` 20-25 (no leaks in create/patch/list; no credential, wrong/short key, key in body/URL, legacy/seed tokens, other signed-in farmer all get 403 and leave data unchanged; seller and admin succeed; hidden listings need admin; key required; inquiries locked; replay creates no duplicate and stores no key). Desktop-browser run: online publish, edit with key, four attacker attempts (403), offline draft -> lost response -> retry (one row) -> edit after publish.
**Remaining limits (anonymous demo mode):** whoever holds the key owns the listing; clearing site data loses the ability to edit it; the key sits unencrypted in the browser profile; pre-existing anonymous listings can no longer be edited by their original poster (their old token was public, so it cannot be trusted). Production should use real accounts (see `docs/PHP_MYSQL_MIGRATION_PLAN.md`). Set `SESSION_SECRET` in any deployment (it keys the hash; rotating it invalidates owner keys). Still open elsewhere: expert-reply, language-lab review endpoints are unauthenticated; `requester_token` for expert requests is still exposed in `GET /expert-requests/demo`.

### 6b. Expert requests, expert replies, language lab review, demo reset (fixed, migration `006_expert_request_requester_key.sql`)
**Vulnerabilities found:** every user-submitted expert request was stored as a "simulated demo" row and `GET /expert-requests/demo` returned all such rows to anyone (names, descriptions, photos, voice notes, `requester_token`); `PATCH /expert-requests/demo/:id/reply` needed no login and let the caller choose the expert's name; `PATCH /language-lab/recordings/:id/review` needed no login (anyone could approve a submission); `POST /demo/reset` needed no login and wipes and reseeds shared data.
**Fixes:**
- Expert requests: responses use an explicit allow-list (`requester_token`, `requester_key_hash`, `user_id` never returned). Visitors see only the fictional seeded samples; a device sees its own requests via a per-device 256-bit secret sent as `X-Requester-Key` (server stores only an HMAC hash, never returns it; never accepted in a URL); a signed-in farmer sees their own by account; approved experts and administrators see the full queue. Anonymous submissions require a well-formed key. `?token=` is ignored. Idempotency scopes by the key's hash.
- Replies: `requireRole('expert','admin')` (approved experts only; admins always). The replying name comes from the verified account, never from the request body. Replies are audited. 401 unauthenticated, 403 farmers/other roles, 404 unknown request. There is no hard-coded or header-based bypass (tests send spoofed `X-Role`, `Authorization`, cookie and body role claims).
- Language lab: review/approve/reject requires an approved expert or administrator, is audited, validates status and existence. Public submissions are always stored as `pending_review` (a body that claims `reviewed` is ignored).
- Demo reset: administrators only. The UI hides the shared-data reset from non-admins ("Reset My Progress" only clears local scenario progress). Review controls and reply forms are hidden from visitors in the UI.
- Offline drafts and sync preserved: the sync engine sends the device key; a draft saved offline synced after reconnect, shows "Sent", and stays invisible to other visitors (desktop-verified).
**Tests:** `tests/api.test.ts` 26-31 (no credential leakage in create/list/reply responses; per-device and per-account visibility; legacy tokens and keys in URLs grant nothing; unauthenticated, requester, other-farmer and spoofed-role replies refused and data unchanged; expert and admin replies work with account-derived name; language review authorization, status validation, audit, forced `pending_review`; demo reset 401/403/200 and no data loss on refused attempts).
**Remaining risks:** `GET /language-lab/recordings` is public and includes pending/rejected submissions with the consenting speaker's name and audio; the public Language Lab submission endpoint has no rate limit; expert requests created before this change have no key hash and are visible only to experts/admins (their authors lose access); keys are held unencrypted in the browser profile; `POST /marketplace/listings/:id/view` and inquiry creation are unauthenticated and unthrottled; the Ministry page has no sign-in; no malware scanning on uploaded photos/audio (only type and size checks); `SESSION_SECRET` must be set in any deployment. This remains a prototype.

### 6c. Other observations
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
