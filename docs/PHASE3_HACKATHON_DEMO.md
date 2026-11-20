# Team 8 — hackathon demonstration (8–9 minutes)

Prepared 20 November 2026 for the existing React/TypeScript, Express and SQLite prototype. Companion: [feature readiness and QA](PHASE3_FEATURE_READINESS.md). In-app presenter route: `/demo/farm-to-market`.

## The story

**Problem:** the platform addresses the difficulty of reaching practical farm information, extension support and buyers when connectivity is limited. A farmer needs to decide what to plant, understand a worrying crop symptom, handle a harvest and find someone interested in buying it. These are the needs this prototype is designed around; we have not measured their prevalence or the platform's impact.

**Users:** farmers with intermittent internet and varying reading preferences; buyers looking for available produce; authorized experts handling questions; Ministry/extension viewers exploring aggregate signals. The basic-phone experience is a browser simulation of a possible future channel.

**Solution:** one connected workflow combining county/crop preferences, bundled guidance, a labelled simulated crop check, durable offline drafts, harvest discovery, private inquiries and privacy-protected aggregate demonstrations.

Opening line: “We are Team 8. Our prototype helps a farmer keep moving when the connection drops: read guidance, save work on the phone and send it when a connection returns.”

## Prepare a safe local demonstration

Use a **disposable production-build instance**, separate from the existing server and development database. Offline service workers are disabled in `npm run dev`. Do not restart port 3000, run a database reset, restore a backup, or change hosting for this presentation.

After `npm run lint` and `npm run build`, choose an unused port (3001 below). These shell commands create a new database in a new temporary folder and start a loopback-only test instance:

```sh
AGRI_DEMO_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agri-judges.XXXXXX")"
APP_ENV=test NODE_ENV=production \
DB_PATH="$AGRI_DEMO_DIR/demo.db" \
TEST_FIXTURE_TOKEN="$(openssl rand -hex 24)" \
SESSION_SECRET="$(openssl rand -hex 32)" \
OTP_HMAC_SECRET="$(openssl rand -hex 32)" \
HOST=127.0.0.1 PORT=3001 TRUST_PROXY=0 \
ENABLE_DEMO_SEED=0 ENABLE_DEMO_MARKET_DATA=1 \
node server.js
```

Open `http://127.0.0.1:3001`. This test mode includes privileged fixture routes; **keep it on loopback and never publish it or expose it through a tunnel**. It is intended only for an isolated laptop rehearsal, with synthetic records. The test database initializes itself; the development database and its backup are not involved. Stop only this newly started instance when finished.

Use two separate browser profiles: **Farmer** and **Buyer**. Separate tabs in the same profile share device keys and local storage, so they do not represent separate devices. For phone demonstrations, use responsive mode at 375 or 412 px. Only invented names and sample harvest details are needed; leave optional phone-sharing boxes unchecked.

Before presenting:

1. Visit Home, Today, guidance, crop check, harvest selling, buyer discovery, Ministry analytics, USSD and the walkthrough while connected. Wait until service-worker installation finishes and the app reports offline readiness. Dismiss that notice after reading it.
2. In the Buyer profile, open `/harvest` online to save its listing snapshot. Open `/ministry-analytics` online to save aggregate evidence for an offline fallback.
3. In Farmer Today, select **Bong** and **Cassava**. These preferences remain on that phone only.
4. Prepare a synthetic listing with **650 kg, L$62/kg, Bong, “Synthetic Gbarnga”**, today's date, and the name **“Synthetic Demo Farmer”**. Do not save it until the timed demonstration.
5. Keep this script and the readiness screenshots available locally. Rehearse the offline toggle and confirm the separate server is reachable again before starting.

## Live sequence and speaking notes

| Time | Screen / action | Say and show |
|---|---|---|
| 0:00–0:45 | `/` | Introduce the problem and the four user entry points. “This is a working prototype with demonstration data. We will identify simulations as we go.” |
| 0:45–1:30 | `/today` | Choose Bong and Cassava. Show saved preferences, five farm actions and pending work. “Weather reminders use sample profiles, not a live forecast.” |
| 1:30–2:10 | Planting months, then `/guidance?crop=cassava&tab=storage` | Read a planting-window sentence and a harvest/storage tip. “These reuse our bundled Crops Library and general guidance. They are drafts awaiting real agronomist review; they are not Ministry-approved.” |
| 2:10–3:15 | `/check-my-crop` | Choose Cassava, the patchy/twisted young-leaf situation, answer all three questions, continue and show the result. Sharing county counts is optional. “A deterministic rule uses our answers to choose a colour and advice card. This is simulated guidance, not AI diagnosis. An optional photo is not analysed.” |
| 3:15–4:35 | `/harvest/sell`, then disconnect | Submit the synthetic listing while offline. Show **Pending Sync** and that no SELL reference exists yet. Open guidance again while still disconnected. “The draft is on this phone. The server has not received it.” Reconnect; wait for the listing to publish and receive its SELL reference. Use **Send now** on Today only if the auto-sync delay would distract from the presentation. |
| 4:35–5:50 | Buyer profile `/harvest`, then Farmer profile `/harvest/sell` | Buyer refreshes, filters to Cassava/Bong, finds the new SELL code and asks “Can I collect this demonstration harvest tomorrow?” Farmer reopens Sell, reads the question and replies. Buyer refreshes to read the reply. “The owner and requester device keys protect their conversations. Phone sharing is optional. This is an inquiry, not an order or a payment.” |
| 5:50–6:50 | `/ministry-analytics#sec-live` | Show the separate app-entered and synthetic blocks, the minimum-group notice and a suppressed group. “This is not an official Ministry system. Small groups are suppressed or combined; updates are batched. One new check may intentionally not change the public counts.” Never promise an immediate count increment for a single farmer. |
| 6:50–7:50 | `/ussd-demo` | Read the simulation disclaimer. Send → `1` → a crop → planting months; use Back/Home. Show Language and the “planned” messages. “English works here. There is no telecom connection, assigned short code or SMS.” Selling/expert menu examples submit nothing. |
| 7:50–8:30 | Close with the limits and next evidence | “The expected benefits are continuity during connection loss, clearer guidance access and easier market conversations. We have tested the software, not measured farmer adoption, yield or income. Next steps require farmer usability studies, qualified content review and separately approved service integrations.” |

For a shorter seven-minute version, omit photo selection, show only one storage tip, and describe the second profile's reply using the prepared screenshot if switching profiles takes too long. Do not replace a failed live step with an invented successful result.

## What works, what is simulated, what is future

| Working in this prototype | Demonstration / unreviewed | Future / not implemented |
|---|---|---|
| Local county/crop preferences; offline guidance; saved drafts; reconnect sync and duplicate-safe server writes | Agricultural guidance is team/demo content awaiting qualified review | Agronomist/Ministry approval records; county-specific validated agronomy |
| Harvest creation, server-issued SELL lookup codes, buyer filters, inquiry/reply authorization and optional contact consent | Synthetic listings, sellers and example prices; no live market-price feed | Payments, orders and external buyer verification |
| Symptom question flow, saved assessments and optional aggregate sharing | Rule-based crop results; no photo analysis or measured diagnostic accuracy | Validated diagnostic service |
| Public suppressed aggregate calculations and saved snapshots | Synthetic statistics and illustrative Food Security Index; no official endorsement | Official data feeds, Ministry analyst accounts and measured field impact |
| Numeric USSD simulator, keyboard, timeout, restart and bundled advice | Browser phone and expert/selling examples submit nothing | Operator USSD, SMS gateway and reviewed local-language content |
| Existing English device speech and demonstration recordings where labelled | Device voice availability varies; language previews are incomplete | New human voice recordings and complete reviewed translations |

## Architecture in one minute

React/TypeScript renders the PWA; React Router preserves the existing routes. Vite builds route chunks, and the service worker precaches them for offline navigation. IndexedDB holds drafts, queued operations and snapshots. Express exposes the existing API and authorization rules. SQLite stores server records, idempotency results and audit data. Device/account ownership, consent gates, CSRF protection, throttles and aggregate suppression protect the existing workflows. This is **not** a claim of a complete Zero Trust architecture or formal privacy certification.

The USSD engine is client-side, deterministic and shares bundled content and triage rules with the app. It has no telecom endpoint. Node requires version 22.13 or later. The legacy PHP work is not the active stack for this demonstration.

## If internet access fails

- If the laptop server still runs, external internet is unnecessary for local inquiries and sync. Device speech voices or web fonts may vary; system-font fallbacks remain usable.
- If the browser cannot reach the server, show the cached Today page, planting/storage guidance, saved check and USSD menus. Save a synthetic listing and show it waiting; **do not claim it reached a buyer**.
- Buyer and Ministry screens can show previously saved snapshots. Read their saved-date warnings and say they may be out of date.
- Restore connectivity and show the existing queue syncing. If that cannot be done during the slot, use the captured screenshots and clearly state that they come from a prior tested rehearsal.
- On a never-loaded browser/device, offline first visit cannot work. Use the prewarmed profile and local screenshots. Keep the same hostname, port and profile; a different origin has a different cache and device keys.

## Likely judges' questions

| Question | Evidence-based answer |
|---|---|
| Is the crop checker AI? | No. It is a labelled deterministic symptom simulation. Its 162 answer combinations are checked against the application's existing rules and advice cards. Uploaded photos are not analysed. |
| Who approved the advice? | No external approval is claimed. Advice carries draft/demo provenance; real agronomist review remains necessary. A reference code is a lookup key, not a proof of quality. |
| How do you avoid duplicate listings after reconnecting? | Queued writes retain one operation/idempotency key. Server replay returns the original result. Automated tests cover a lost response and retry; the browser rehearsal verified one listing after offline sync. |
| Does USSD work on MTN or Orange? | No. This is an English browser simulator without a telecom connection or registered code. A real service would require separate approvals and integration. |
| What languages work? | English. Some web UI text has a Liberian-English preview; other selections fall back to English or say planned. We do not claim complete reviewed translations or local-language recordings. |
| Are these live prices and weather? | No. Prices shown in synthetic listings and sample weather are for demonstration. There is no live market-price or weather feed. |
| Can Ministry users see individual farmers? | The public aggregate endpoint omits personal details and suppresses small groups with complementary suppression and batched refreshes. It is a prototype control, not a formal anonymity guarantee or Ministry partnership. |
| What impact have you measured? | Software behavior and QA results only. No farmer adoption, income, yield, diagnostic accuracy or field-impact measurements exist. The expected benefits need field validation. |
| Is it ready to deploy? | This phase prepares a local judges' demonstration. Deployment, real data, integrations and host verification require separate work and approval. |
