# Team 8 — Verified Test & Readiness Results (Marketplace Direct-Calling Update)
**Project:** **Agricare Liberia** (Inclusive Agricultural e-Advisory Platform)  
**Verification Run Date:** November 18, 2026  

---

## Automated Checks Executed & Passed

| Check | Command / Tool | Result | Notes |
|---|---|---|---|
| TypeScript Typecheck | `npm run lint` (`tsc --noEmit`) | **Passed (Exit 0)** | Zero TypeScript errors across client, shared phone helper, and server routes |
| Production Bundle Build | `npm run build` (`vite build`) | **Passed** | Clean bundle compilation after Marketplace UI, modal, and calling updates |
| API, Security & Phone Suite | `npm run test:api` (`tsx tests/api.test.ts`) | **11 / 11 Passed (Exit 0)** | Ran against isolated SQLite DB (`migrations 001 + 002 + 003`) verifying Liberian phone normalization, privacy consent masking, `maxPrice`/`availability` filters, buyer view increments, and 11-listing reset |
| Live Demo Reset & Migration | `POST /api/v1/demo/reset` on `127.0.0.1:3000` | **Passed (HTTP 200)** | Migration `003_marketplace_direct_call.sql` applied; live `./data/agri_advisory.db` restored to 11 farmer + supplier demo listings |
| Route & Filter Checks | Live HTTP `fetch` on `127.0.0.1:3000` | **All Passed (HTTP 200)** | Verified `GET /api/v1/marketplace/listings` (`11` listings, `15` counties, `9` categories including `Livestock` & `Agricultural supplies`), `?county=Lofa&maxPrice=8000&availability=Available`, and 15 frontend routes |

---

## Detailed Integration & Unit Tests (`tests/api.test.ts` — 11 / 11 Passing)
1. **Health check & public guides (`Working`):** Confirmed `/api/v1/health` returns `publishedGuides: 7` and `/api/v1/guides` serves only `approved` published guides.
2. **Language fallback (`Working`):** Confirmed `?lang=lre` serves reviewed Liberian English preview and `?lang=kpe` falls back safely to English (`fallbackApplied: true`).
3. **CSRF protection (`Working`):** Confirmed `POST /api/v1/feedback` without `X-CSRF-Token` is rejected with HTTP 403 (`CSRF_INVALID`).
4. **Farmer isolation & SQL injection resistance (`Working`):** Confirmed cross-farmer question access returns 403, role boundaries block `/admin` and `/expert`, and SQL injection payloads return zero leaked rows.
5. **AI Advisor honest unavailability & rate limiting (`Working`):** Confirmed missing API key in test isolation returns `unavailable_demo` fallback with verified guide links and enforces `ANON_QUOTA_REACHED` (429).
6. **Admin assignment & expert reply (`Working`):** Confirmed RBAC admin login, expert assignment, and answered status persistence.
7. **Agricultural Marketplace filters, Liberian phone consent, view count & ownership (`Working`):** Verified 11 seeded demo listings (including `Premium Lofa Country Rice` and `Agricultural supplies`), `county` + `maxPrice` + `availability` filtering, rejection of invalid phone numbers (`400`), normalization of `077 012 3456` -> `+231770123456` (`phone_verified: 0`), hiding unconsented phone numbers in public `GET` responses, `POST /view` count increment, `PATCH` availability update, and wrong-owner `DELETE` protection (`403`).
8. **Local Language AI Lab consent & review workflow (`Working`):** Confirmed server rejection (`400 CONSENT_REQUIRED`) when speaker consent is unchecked, saving with consent (`pending_review`), and status review updates.
9. **Demo Expert Requests & Management Summary Separation (`Working`):** Verified guest expert request submission, live Simulated Expert Reply (`Answered`), and accurate `actualData` vs `demoAndExperimentalData` separation.
10. **Demo Reset (`Working`):** Verified `POST /api/v1/demo/reset` cleanly restores `11` seeded hackathon demo listings.
11. **Liberian Phone Normalization (`Working`):** Verified `normalizeLiberianPhone` accepts `0770123456`, `+231 88-612-3456`, and `00231555123456`, and rejects empty or foreign (`+1-555-123-4567`) numbers.

---

## Honest Scope & Manual/Environment Limits
- **Why Direct Calling Was Adopted:** Written buyer inquiries were removed from the buyer-facing Marketplace UI so farmers who cannot read or write messages can connect directly by phone (`tel:` link + desktop Copy Number button). Existing `marketplace_inquiries` database tables were preserved cleanly for schema compatibility.
- **Not Verified in Physical Hardware:** Headless Chromium/Playwright was unavailable in the container environment, so mobile touch gestures and physical smartphone `tel:` dialer handoff are verified via responsive Tailwind breakpoints, accessible `dialog` markup, and API tests rather than physical device testing.
- **Simulated & Coming Soon Boundaries:** Sample Weather (`/weather`), Synthetic Ministry Dashboard (`/ministry`), Simulated Phone Service (`/phone-simulator`), Demo Marketplace fictional listings (explicitly labeled `Demo Listing` with zero invented phone numbers), and `/coming-soon` remain transparently labeled.
