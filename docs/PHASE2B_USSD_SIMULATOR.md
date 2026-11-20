# Basic-phone USSD browser simulator — interactive presentation extension

Updated 20 November 2026. Extends the existing Phase 2B simulator and Phase 3 polish; does not replace the application or change its authentication/database schema.

**Public route:** `/ussd-demo`. **Printable poster:** `/ussd-demo/poster`.

**Demonstration only — no mobile network connection.** There is no assigned short code, telecom gateway, SMS, payment, money transfer or completed order. The phone/session are simulated. When explicitly enabled on the protected demo server, confirmed marketplace actions create **actual synthetic records through the existing browser APIs**. Agricultural advice remains bundled and unreviewed demonstration content.

## Phone and menus

The handset fills the mobile content width up to 440 px and uses a tall portrait layout: speaker detail, monochrome LCD, typed entry, countdown/status, Call / Send, End, Back, Home, Cancel, Delete and a 12-key numeric keypad. Text on the screen is 16 px, controls are at least 44 px and numeric keys at least 56 px high. The mobile bottom navigation is hidden on this route to keep it from covering the phone; the shared header/menu and related-page links remain available. PWA update/offline-ready notices appear in the page flow here so they cannot cover the keypad.

```
Call / Send → FARM ADVICE (DEMO)
1 Crops & planting
2 Pests & disease (including the existing simulated symptom check)
3 Buy & Sell Produce
    1 Buy Produce
        crop → county → available demo listing → details → question template
        → paged review → explicit Send demo inquiry confirmation
    2 Sell My Harvest
        crop → whole kilograms → whole LRD/kg → county → synthetic town
        → paged review → explicit Save & send when online confirmation
    3 My Listings (USSD demo drafts on this browser)
    4 My Inquiries (authorized buyer/seller conversations)
    5 Back
4 Harvest & storage
5 Expert help (practice only; no expert request submitted)
6 Language (English; others marked planned)
7 Help & exit
    1 How to use
    2 About this demo
    3 Exit
    4 Original selling practice (nothing submitted)
    5 Original read-only harvest list
8 Sell & market (original Phase 2B submenu)
    1 Harvest for sale (net)
    2 Try selling (demo only)
```

`0` = Back, `00` = Home. `99 More` paginates long menus; numbering restarts on each menu page. `1 Next` advances advice/review pages. A confirmation action only appears on the **last review page**. Enter on a focused key activates that key; elsewhere Enter sends, digits enter choices, Backspace deletes and Escape cancels. All keys are reachable with Tab. End/Cancel clear the session; Call / Send restarts it. The inactivity timeout remains 90 seconds, with `/ussd-demo?timeout=5` available for presenters (5–300 seconds).

Screens retain the 182-character limit and word-boundary pagination. Invalid selections, oversized quantities/prices, disabled submissions, offline inquiries, loading, failures and uncertain delivery have explicit states. A late response cannot reopen a cancelled or expired session. **End, Cancel, Home or timeout cannot undo an action already confirmed.** Its outcome remains available through My Listings/My Inquiries.

## Additive compatibility and original options

Every original Phase 2B option remains reachable. The required new marketplace uses `3`; existing harvest/storage guidance moved to `4`, and the **original named Sell & market submenu is retained as `8`**. Its original two options and no-submit behavior are preserved together. The Help shortcuts introduced by the extension remain aliases.

| Original option | Current location |
|---|---|
| Crops & planting, including all nine crops and all advice pages | `1`, unchanged |
| Pests & disease and all symptom-check situations/questions/results | `2`, unchanged |
| Harvest & storage and all five guidance sections | `4` (previously `3`) |
| Sell & market → Harvest for sale | `8 → 1`; also `7 → 5` |
| Sell & market → Try selling (demo only) | `8 → 2`; also `7 → 4`; never submits |
| Expert help and question practice | `5`, unchanged; never submits |
| Language and future-language notices | `6`, unchanged |
| How to use, About, Exit | `7 → 1/2/3`, unchanged |
| Back, Home, Cancel, Delete, numeric/keyboard input, timeout and restart | Preserved; End is an extra control |

The original read-only harvest view uses the **complete existing public snapshot**, including ordinary app-created listings, with exactly the original safe fields (reference, crop, kg, price, county and availability). Its online/saved/offline behavior is preserved. Only the **new interactive** marketplace is narrowed to synthetic demo listings. No contact details, identity keys or new write actions are added to the original view.

Verification before this compatibility correction: the **untouched original 14 Phase 2B tests** passed from an isolated Git snapshot of pre-enhancement `3b03a0f`; the then-current `5c98619` suite also passed **14/14**. Afterward, the Phase 2B suite passes **15/15**, including an added test for the original submenu and equivalent Help aliases. The marketplace tests also assert that filtering interactive demo rows cannot remove rows from the original read-only snapshot.

The compatibility test confirms that original selling practice submits nothing even when interactive demo writes are enabled. Phase 2A (12 tests), the marketplace suite (13 tests), TypeScript and build also passed after the correction. Seven isolated browser checks verified the full public snapshot online and after offline reload, unchanged practice/Help aliases, storage guidance, expert/language notices and all four mobile widths.

## Buy, sell and private identity

| Flow | Actual behavior |
|---|---|
| Buy | Chooses among structured harvest crops and Liberia counties; shows available **synthetic** listings, quantity, asking price and town. Saved lists are marked stale. The adapter rechecks the selected listing online before submitting. |
| Inquiry | One of three labelled synthetic question templates (availability, collection or asking price). Final review names the data sent. Confirmation posts an inquiry; no purchase/order/payment is created. No phone is collected or shared. |
| Sale | Uses the existing crop/quantity/date validation, asking-price limits, county list and offline draft queue. The two town choices are explicitly invented `Demo Town A` and `Demo Town B`. Harvest date defaults to today and is shown in the review. |
| Pending/synced/failed | Pending means the phone has saved and queued the listing, not that the server accepted it. A SELL code is shown only after the existing sync engine records server confirmation. Failures remain on the phone; an owned failed draft can be explicitly retried or reviewed in the existing Sell my harvest workspace. |
| My Listings | Shows USSD-marked demo drafts saved on this browser, including accurate queue state and server reference. It does not pretend that a phone number retrieves listings on another device. |
| My Inquiries | Uses `X-Requester-Key` for buyer conversations and `X-Listing-Key` for each locally owned listing, plus the existing signed-in cookie where applicable. Server authorization is unchanged. Replies are made through the existing authorized harvest workspace and read back here after refresh. |

There is **no invented phone-number identity or new buyer/farmer role**. The historical fake caller number is no longer displayed. Synthetic display names are labels, not authentication. Existing signed-in account cookies and existing random browser keys provide the same authority as the normal marketplace. If requester storage is unstable, inquiry submission fails closed. No seller or buyer phone field enters the simulator's projections, even when another client has consent to see it. Server CSRF, owner/account checks, consent rules, rate limits and idempotency remain unchanged.

The engine stays pure (no network, storage or clock). It emits a command only after the final numbered confirmation. The browser adapter deduplicates concurrent dispatch, uses the existing harvest queue/owner keys, and gives inquiries a stable idempotency key. Requests have a 12-second adapter deadline. An uncertain inquiry response says delivery is unconfirmed and offers retry of **the same operation**. It never says an offline inquiry succeeded or puts one into an invented outbox.

## Demo isolation and enabling interaction

The ordinary build remains **read-only/practice by default**. Advice, practice and QR setup do not need write access. Interactive submissions require both:

1. The public build setting `VITE_USSD_MARKETPLACE_ENABLED=true`.
2. The existing `/api/v1/environment` response reporting **both** `demoEnvironment: true` and `syntheticAccountsOnly: true` (`APP_ENV=demo`, using the project's existing protected demonstration configuration).

A query parameter, QR link, hostname, fake phone number or client account label cannot enable submissions. The adapter checks the existing environment endpoint again before each online write. A page already verified online can prepare an offline sale while open. After an offline reload, guidance/drafts still open, but new submissions stay disabled until that page verifies the protected server online again.

**Use a separate demonstration database, origin and browser profile.** Do not point a demo server at the development database. Listing filtering accepts the server's synthetic seed marker or the fixed `USSD DEMO: synthetic harvest. No payments.` description on records created by this interface. These labels help presentation and filtering; they are **not a database isolation boundary**. Actual separation is the existing dedicated demo database/runtime. No reset, seed or migration was run against the development database for this work.

The existing server on port 3000 remains running unchanged; its development mode does not satisfy the protected-demo write gate. To rehearse interaction, use a separately started disposable protected demo instance on another port with the existing HTTPS proxy. Configure its existing `APP_ENV=demo`, `DEMO_ENV_ACK=synthetic-accounts-only`, simulated SMS and independent random secrets as documented in `.env.example` and `docs/SIMULATED_SMS_SECURITY.md`. Secure cookies require HTTPS. Do not expose test fixture mode publicly or assume `APP_ENV=test` enables this gate. Synthetic background data may be loaded only into that separate disposable instance, never the current database.

## Offline behavior

- The service worker precaches the simulator route and all route chunks in a production build. First visit/installation still needs a connection; Vite development mode has no offline service worker.
- Bundled planting, pest, harvest/storage and symptom guidance reuse the existing Crops Library, Phase 2A sentence builder, advice cards and triage rules. No agricultural claims or translations were invented.
- Explicitly confirmed sales reuse `saveListingDraft` → `queueRecord('listing', ...)` → the existing `syncSoon`/reconnect processing. Existing auto-sync pause and retry rules still apply. A failed/draft record is never silently reported as published.
- New interactive produce browsing reuses the existing saved harvest snapshot and labels it old; only available demo listings enter that interactive view. The original read-only menu retains the complete public snapshot and its existing sold-out filtering.
- Inquiries need a live connection and listing revalidation. Private inquiry lists remain in the current session's memory, are labelled previously loaded and need refresh for new replies; they are not newly persisted offline by this feature.
- A queued listing survives session End/restart or page reload. Confirmation explicitly authorizes later sync. Clearing browser data can lose local drafts/private keys; no new recovery identity is invented.

## QR destination and printable poster

Set **`VITE_PUBLIC_DEMO_URL`** to the **actual public HTTPS origin that hosts this application**, or that origin's `/ussd-demo` URL, then rebuild. This setting is public client configuration; it is separate from the server's existing `APP_URL`. Do not put any secret in a `VITE_` setting.

The QR encodes exactly the configured origin plus `/ussd-demo`. It is generated locally as SVG using pinned `qrcode-generator`; no external QR service receives the URL. The code has a four-module quiet zone and medium error correction. The same component appears on `/ussd-demo`, `/demo/farm-to-market` and `/ussd-demo/poster`.

No configured URL means **setup instructions and no QR image**. Validation also refuses localhost, IP literals, local/placeholder suffixes, HTTP, custom ports, credentials, query strings, fragments and unrelated paths. Request headers and the current localhost address are never used as fallback. The title is **“Scan to Try the Agri-Advisory Basic-Phone Demo.”** The poster has a print stylesheet and a normal accessible destination link.

Before printing: verify that the configured public address actually serves this app, open `/ussd-demo` on a second device, compare the printed destination and scan the QR. **No real public demo URL was supplied or configured during this implementation.** QR encoding/decoding and its matching navigation link are tested with an explicit URL fixture; live navigation to an operator-configured public deployment and physical-camera scanning remain presenter setup checks. No invented public domain or authentication link is shipped as the default.

## Verification

- Existing Phase 2B tests retain exhaustive advice/menu pagination, all crops/months, 162 symptom combinations, keyboard/labels, offline guidance, timeout/restart and untouched expert/practice simulations. Main-menu references were updated for marketplace `3` and harvest/storage `4`.
- `npm run test:ussd-marketplace`: **13 tests** cover keypad sale and buy confirmation, actual disposable-backend listing/inquiry calls, ownership denial, seller reply, validation, storage failure, offline pending/reconnect, disabled gates, demo-only/phone-free projections, same-operation lost-response retry, stalled-request deadline, session boundaries, owned failed-draft retry, unstable requester storage, invalid QR destinations and QR decoding/link equality. Queue storage is injected in these contract tests; the real IndexedDB queue is verified in Chrome.
- Browser: actual protected `APP_ENV=demo` runtime on a disposable SQLite database, temporary local HTTPS and isolated farmer/buyer profiles. **16 checkpoints passed**, including real IndexedDB offline save, reconnect auto-sync, one server listing/code, inquiry transport failure/retry, owner-authorized reply and keypad conversation retrieval. All four mobile widths (320/360/375/412) fit with no horizontal overflow; every key measured at least 44×44 px. Keyboard/invalid input and the unconfigured print poster also passed. No uncaught JavaScript exceptions.
- Initial extension verification: **234 tests passed**: 221 existing tests across Phase 2B, Phase 2A, H1/H2, triage, harvest, offline, hardening, Ministry, API, harness and Phase 0/0B, plus the 13 new tests. All **63 contract requests** matched the unchanged golden snapshot. TypeScript and the production build passed. The main entry is about **444 kB** raw / **135 kB** gzip; the local QR module is about **24 kB** raw / **9 kB** gzip, and route chunks remain precached. No bundle-size or mixed-import warning remains. The final default-build browser check also passed the disabled write gate, QR/poster navigation, print generation, presenter QR setup, timeout/restart and inline PWA notice. No database or server route/schema/authentication change is part of this feature.

Not certified: real feature phones or telecom networks, physical-camera QR scans, screen-reader/native-audio compatibility, live public hosting, production security certification or qualified agricultural approval. English is the only USSD language; other languages and real expert submission remain future work. No actual payments or orders exist.

## Presenter sequence

1. Show the browser/telecom disclaimer. If a real public URL is configured, scan its QR; otherwise show why setup is required.
2. Call / Send → `1` → crop → planting months. Show Back/Home and the same bundled advice offline.
3. `3` → `2` Sell My Harvest → crop → kg → asking price → county → synthetic town. Read every review page. **Nothing is saved until the final confirmation.**
4. Disconnect, confirm, and show Pending Sync without a reference. Reconnect and use My Listings to read the actual server SELL reference.
5. In a separate buyer profile: `3` → `1` Buy Produce → crop/county/listing → template → review → confirm online. Read the server confirmation, not a payment claim.
6. My Inquiries shows each participant's authorized conversation. Reply through Sell my harvest, refresh and read it on the buyer phone.
7. `6` shows English and future-language notices. `8` retains the original Sell & market submenu and no-submit selling practice; Help shortcuts remain. Expert demonstration stays at `5`. End, invalid selection and `?timeout=5` can be used for a brief session-control demonstration.
