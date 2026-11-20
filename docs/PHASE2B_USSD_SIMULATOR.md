# Phase 2B: basic-phone (USSD-style) simulator

Status: **implemented and committed locally; not deployed, pushed or merged.** Client-side only: **no migration, no server route, no database access, no new dependency.** This is a **simulator**. It is not connected to any mobile network, uses no dial code or short code, sends no SMS, and submits nothing.

Label shown on the page and read by screen readers: **"Demonstration only — no mobile network connection."**

## 1. What it is
`/ussd-demo` shows a pretend feature phone: a monochrome (light-green LCD) screen, a 12-key keypad, and Send, Back, Home, Cancel and Delete keys. A farmer presses **Send** to start a session, types the number of a menu choice and presses Send again. Screens are limited to **182 characters** (the constant the Ministry module already uses for its USSD preview), so long advice is split into numbered pages ("1 Next").

The pretend caller is the synthetic number `+231 77 000 9001` (matches the project's synthetic-only pattern). The simulator has **no field that accepts a phone number**, stores nothing in the browser, and keeps the session only in memory.

## 2. Menu tree
```
(idle)  Press Send  ->  FARM ADVICE (DEMO)
1 Crops & planting
    crop? (9 crops) -> 1 Planting months | 2 How to plant | 3 Soil & water | 4 Care of the crop
2 Pests & disease
    1 Common problems by crop -> crop -> pests text (then "use 5 Expert help")
    2 Symptom check (simulated) -> Cassava | Rice | Poultry -> what do you see? -> 3 questions -> result pages
3 Harvest & storage
    crop? -> 1 At harvest [Library] | 2 Handling [General] | 3 Storing it [Library] | 4 Watch for [General] | 5 Before you sell [General]
4 Sell & market
    1 Harvest for sale (net) -> crop -> list of listings (live online, saved copy offline)
    2 Try selling (demo only) -> crop -> kilograms -> price -> county -> "DEMO ONLY: NOTHING WAS SENT"
5 Expert help (demo)
    1 How it works | 2 Try a question (demo) -> crop -> "DEMO ONLY: NOTHING was sent"
6 Language
    English (now) | Bassa, Mano, Liberian English, Kpelle: planned, not available
7 Help & exit
    1 How to use | 2 About this demo | 3 Exit
On every screen: 0 = Back, 00 = Home, 99 = More (long lists). Pages: 1 = Next.
```

## 3. Where the advice comes from (no new agricultural claims)
Every screen is assembled from content that already exists; a test reads each screen back and requires the **same text**:
| Screen | Source |
|---|---|
| Planting months | Phase 2A structured months (a copy of the Crops Library window) and the very same sentence builder as the planting card (`plantingSentence`), for every month of the year |
| How to plant, soil and water, care, pests | Crops Library text, unchanged |
| At harvest, storing it | Crops Library text, unchanged, tagged **[Library]** |
| Handling, watch for, before you sell | The Phase 2A "general good practice" text, tagged **[General]** |
| Symptom check | The app's own six situations, questions, point rules (`evaluateTriage`), colour wording and **advice cards** (`ADV-2026-001` to `-006`): all 162 answer combinations are compared with the app |
| Harvest for sale | The existing harvest client (live list, or the copy saved on the phone); sold-out listings hidden; **never** a seller name or phone number |
| Language | The app's language list; non-English entries only say "planned" |
Everything is labelled demonstration advice, not reviewed by an agronomist or the Ministry (headlines carry `[DEMO]`, the About page and the page legend say so).

## 4. Working, simulated and future
| | Status |
|---|---|
| Menus, numbers, Back/Home/Cancel, sessions, timeout, restart, the advice | **Working** (built into the app, works offline) |
| The phone, the "session", the caller number | **Simulated**: no network, no USSD code, no SMS |
| Harvest list | Simulated demo data online; the saved copy offline. **Needs internet** to refresh (marked "(net)") |
| Selling and expert help | **Demonstration of a possible future workflow only.** The first screen says NOTHING WAS SENT; no request is made |
| Other languages, recorded audio | **Future / planned.** No translation or recording exists; none was invented |
| A real basic-phone service | **Future**: see section 9 |

## 5. Sessions, timeout and restart
* States: idle, active, ended (exit, cancel, timeout). **Send** starts a new session; every restart is completely fresh (menu path, typed digits and notices are forgotten; the session counter increases).
* **90 seconds** with no key ends the session ("Session timed out ..."); any key press resets the clock. Digits typed after a timeout only fill the idle entry line, and Send with digits typed does not start a session (there is no dial code). A timeout wipes anything typed. For demonstrations the presenter can shorten it with `/ussd-demo?timeout=5` (5 to 300 seconds).
* Invalid entries (a number not on the menu, `*` or `#`, a quantity outside 1 to 1,000,000 kg, a price outside 1 to 50,000,000, too many digits, an empty Send) are refused with a message and change nothing.

## 6. Offline
The engine and all advice are bundled and make no network call (tested); the page is part of the precached app. Verified with the server stopped: menus, planting, storage and the symptom check work, the harvest list shows the **saved** copy labelled "saved 20 Nov, may be old", the timeout and restart work. With no saved list the screen says "No list on this phone. It needs internet once to download it." A small badge under the phone says, for every screen, whether it is built in, live, saved or needs internet.

## 7. Accessibility
Large keys (12 digit keys at least 52 px, function keys 52 px), 7:1 contrast on the screen, a gold focus ring on every key, labelled controls (Digit 1 ... Digit Star, Digit Hash, Send, Cancel and end the session, Back one screen, Home, Delete the last digit), a polite live region for the screen, the countdown hidden from screen readers. **Keyboard:** digits, `*` and `#`; **Enter** = Send; **Backspace** = Delete; **Escape** = Cancel; Tab reaches every key and Enter/Space on a focused key does what a click does. Responsive down to **320 px**. Checking this also found and fixed an existing layout bug: **every page overflowed horizontally at 320 px when the app was offline** (the shared top strip is now allowed to wrap).

## 8. Tests and verification
`tests/phase2b.test.ts` (14, `npm run test:phase2b`): an exhaustive walk of **every reachable screen** (over 900 per market state) and its error variant against the 182-character limit; pagination loses nothing; the seven main menu items; invalid input; Back/Home/Cancel and typed 0/00 equivalence; the session state machine with a fake clock; advice equals the Crops Library and Phase 2A for all nine crops and twelve months; all 162 symptom-check combinations equal the app; offline behaviour and "no private field"; "NOTHING WAS SENT" on the first screen of the demo-only flows; languages; no short code, no operator names, no phone field; keyboard, labels, focus, touch targets, contrast; routes, navigation and the walkthrough. Removing the warning or the timeout makes tests fail (checked by hand). Browser (desktop Chrome, disposable server; 320, 360, 375, 412 and desktop widths measured in same-origin frames, not on real devices): real keyboard and tap paths, online live list, real offline, 5-second timeout and restart, Tab focus ring, no console errors, no horizontal overflow.

### Continuation verification — 20 November 2026

The existing Phase 2B implementation was committed as `bf9f446`, following Phase 2A `b90c45a`. Review found one UI timeout defect: the phone screen expired, but the entry line retained typed digits and the status still said the session was open. The timer now applies the engine's expiry transition to React state as well as updating the clock, clearing the entry and displaying the ended status and restart control without another key press.

Verification passed:

| Check | Result |
|---|---|
| `npm run test:phase2b` | 14 passed |
| `npm run test:phase2a` | 12 passed |
| `npm run test:offline` | 31 passed across advice, cache and inventory |
| `npm run test:triage` | 21 passed |
| `npm run test:harvest` | 17 passed, including client tests |
| `npm run test:hardening` | 11 passed |
| `npm run test:ministry` | 15 passed |
| `npm run lint` | TypeScript passed |
| `npm run build` | Client, service worker and server built; bundle-size and mixed-import warnings remain |

The Phase 2B and Phase 2A suites, TypeScript and production build were repeated after the timeout correction. Headless Chrome checked the rebuilt production app using its own temporary profile and disposable SQLite database on an unused port: no horizontal overflow at 320, 360 or 375 px; typed input cleared on a five-second timeout; ended status and fresh restart; numeric keyboard selection, Enter and Escape; invalid selection and Cancel. Service-worker reload and bundled planting/storage advice worked with the disposable server stopped. These browser flows produced no uncaught JavaScript exceptions or non-GET requests. Browser checks are desktop emulation, not physical-device or screen-reader certification.

Timeout regression for presenters: open `/ussd-demo?timeout=5`, start a session, open a submenu, type a digit without sending it, then wait six seconds. Confirm that the screen says timed out, the entry is empty, the status says the session ended and **Start a session** appears. Press Send and confirm a fresh main menu with the next session number.

The existing server on port 3000 was identified as Node PID `33070`, running `server.ts` from this project, and `/ussd-demo` returned HTTP 200. It was not stopped or restarted. All server tests used disposable databases; the development database was not reset or migrated. Existing untracked documents and the nested project copy were left untouched.

## 9. Presenter demonstration (steps 3 and 4 of the walkthrough)
1. Open `/ussd-demo` (also linked from **My farm today** and Farm Tools). Point at the label and the legend.
2. **Send** -> `1` Send (crops) -> `1` Send (rice) -> `1` Send (planting months). Say: same text as the app, built in, works offline. Press `0` Send to go Back and `00` Send for Home.
3. Type `9` Send to show the invalid-option message. Type digits and press Backspace.
4. Go offline (airplane mode): everything above still works; `4` `1` `1` shows the **saved** harvest list with its date.
5. `4` `2`: try selling (cassava, 650 kg, 62, a county). Read the screen: **NOTHING WAS SENT**. Then `5` `2`: the expert demo says the same.
6. `6` Send: Kpelle, Bassa and Mano are **planned**; English is the only language. `7` `3` exits. Open `?timeout=5` to show a timeout and press Send to restart.

## 10. Limitations and what a real service would need
1. **Not a real USSD service.** No dial code or short code exists or is requested; nothing is registered with any operator or regulator.
2. A real service needs: a short code and agreement with a mobile operator or an aggregator; a USSD gateway that calls our server for every key press (the engine here is pure and could be reused behind such an endpoint); acceptance by the regulator; operator session limits and costs; server-side session storage; consent and privacy rules for subscriber numbers (the simulator deliberately never handles one); abuse and rate limits; monitoring.
3. **Character set:** real USSD uses the GSM 7-bit alphabet. Some library text contains characters outside it (for example en dashes and typographic quotes); a real gateway would need a reviewed transliteration. The simulator shows the text as is.
4. Screens are split by length, not by an editor's judgement; long advice takes several pages on a basic phone.
5. Sending a real expert question or a listing by USSD or SMS is **not** implemented (the demo screens say so). Languages other than English are **not** available; no translation or recording was made.
6. The advice is demonstration content, not reviewed by an agronomist or the Ministry. Planting months are the general Crops Library months, not county-specific; there is no weather on the phone menu.
7. Not verified: real feature phones, screen readers (TalkBack, VoiceOver), slow networks, the Hostinger runtime, the PHP `test:m3`.
