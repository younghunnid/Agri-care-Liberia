# Team 8 — Complete Application Audit Report (`Agricare Liberia`)

**Audit Mode:** Strictly Read-Only Inspection & Non-Destructive Verification  
**Project:** Inclusive Agricultural e-Advisory Platform (`Agricare Liberia`, Team 8)  
**Audit Date:** 2026-11-17  

---

## Status Classification Legend

Every capability in this report is classified into one of six strict categories:
1. **Implemented and verified** — Code inspected and directly verified via executed tests or live read-only HTTP/DB inspection.
2. **Implemented but not tested** — Code exists and compiles cleanly, but runtime execution could not be verified (e.g., no browser/microphone in container, or mutating endpoints not invoked against live DB during read-only audit).
3. **Partially implemented** — Core structure exists, but parity, completeness, or integration is unfinished.
4. **Missing** — Feature or guardrail is absent.
5. **Broken** — Code contains a defect that causes failure or unintended behavior when exercised.
6. **Blocked by configuration or unavailable external services** — Runtime dependency, credential, or environment service (e.g., PHP 8.3, MySQL 8, Chromium, admin account bootstrap) is unavailable in this environment.

---

## Part 1 — Project Architecture & Technology Mismatch

### 1.1 Actual Runtime Stack (Live on Port 3000)

| Layer | Implemented Technology | Evidence |
|---|---|---|
| Frontend Framework | React `19.0.1`, TypeScript (`~7.0.2`), `react-router-dom` `7.18.5` | `/package.json`, `/src/App.tsx` |
| Build Tool & Styling | Vite `8.3.0`, `@tailwindcss/vite` `4.3.3`, `lucide-react` `0.546.0` | `/vite.config.ts`, `/src/index.css` |
| PWA / Offline | `vite-plugin-pwa` `2.0.0` (Workbox SW) + `localStorage` + Cache API | `/vite.config.ts`, `/src/lib/offlineStorage.ts`, `/dist/sw.js` |
| Backend Runtime | Node.js `v22.23.2` + Express `4.21.2` executed via `tsx` `4.21.0` | `/server.ts`, `/package.json` |
| Database (Active) | Built-in `node:sqlite` (`DatabaseSync`, WAL mode) at `./data/agri_advisory.db` | `/server/db.ts`, `./data/agri_advisory.db` |
| Authentication | Stateless HMAC-SHA256 signed `HttpOnly` cookie (`agri_session`) + `scrypt` password hashing + double-submit CSRF (`agri_csrf`) | `/server/security.ts` |
| AI Integration | `@google/genai` `^3.4.0` server-side client in `/server/ai.ts` | `/server/ai.ts`, `/package.json` |
| Voice Input / Output | Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) + `window.speechSynthesis` | `/src/lib/voice.ts` |
| Testing | Node built-in `node:test` + `tsx` integration suite (isolated `/tmp` SQLite DB) | `/tests/api.test.ts` |

### 1.2 Architecture Diagram

```
+------------------------------------------------------------------------+
|                  Browser / Mobile PWA Client (React 19)                |
|  - Option C UI (28 routes: 11 Public, 5 Farmer, 4 Expert, 8 Admin)     |
|  - Web Speech API STT/TTS (src/lib/voice.ts)                           |
|  - Offline Guides (localStorage + Cache API via offlineStorage.ts)     |
|  - Workbox Service Worker (dist/sw.js: assets + public guides GET)    |
+-----------------------------------+------------------------------------+
                                    | HTTPS/HTTP Fetch + Cookies
                                    | (agri_session, agri_anon, agri_csrf)
                                    v
+------------------------------------------------------------------------+
|           Express 4 API & Vite/Static Server (server.ts :3000)         |
|  - Security headers + CORS allowlist + JSON body limit (256kb)         |
|  - CSRF verification middleware + RBAC guards (server/security.ts)     |
|  - Versioned REST API /api/v1/* (server/routes/v1.ts, 1516 lines)      |
+----------------+----------------------------------+--------------------+
                 |                                  |
                 v                                  v
+-------------------------------+    +-----------------------------------+
| SQLite (node:sqlite)          |    | Google GenAI SDK (@google/genai)  |
| ./data/agri_advisory.db       |    | server/ai.ts                      |
| 22 app tables + migrations    |    | HARDCODED MODEL:                  |
| (WAL mode, FK ON)             |    | 'gemini-4-hydrogen' (BROKEN ID)   |
+-------------------------------+    +-----------------------------------+

[NON-LIVE COMPANION CODEBASE - NOT EXECUTABLE IN CONTAINER]
  php-backend/ (PHP 8.3 partial API: 7 of 30+ routes, no vendor/, no PHP binary)
  database/mysql/001_initial_schema.sql (19 tables; MySQL absent in container)
```

### 1.3 Technology Mismatch vs. Intended PHP 8.3 + MySQL 8 Stack

- **Intended Architecture:** React + TypeScript + Vite + PHP 8.3+ (PDO) + MySQL 8.
- **Actual Live Architecture:** React 19 + TypeScript + Vite served by **Node.js Express (`server.ts`)** backed by **SQLite (`node:sqlite`)**.
- **Companion PHP/MySQL Status:**
  - Container inspection (`which php mysql sqlite3`) confirms **neither PHP nor MySQL is installed** in this container.
  - `php-backend/public/index.php` implements only **7 endpoints** (`/health`, `/csrf-token`, `/crops`, `/guides` list, `/advisor/ask`, `/auth/login`, `/admin/overview`) and lacks registration, guide detail, farmer workspaces, expert workspaces, admin CRUD/review/settings/audit endpoints, and rate limiting.
  - `php-backend/vendor/autoload.php` does not exist (no `composer install` run).
  - `database/mysql/001_initial_schema.sql` defines 19 tables and omits `advisor_conversations`, `password_resets`, and `platform_settings` present in `server/migrations/001_initial_schema.sql`.
- **Isolation Verification:** Verified completely independent of any marketplace. Zero commerce, cart, order, payment, or inventory code exists anywhere in the codebase.

---

## Part 2 — UI/UX & Accessibility Audit

### 2.1 Option C Design System Adherence
- Brand colors match specification (`#16803C` primary green, `#F3F8F0` background, `#183B2B` ink, `#F5B942` gold accent, `#FFFFFF` cards, `#DDEFE0` soft green) in `/src/index.css` and components.
- No flags are used for language selection (`Layout.tsx:124-129`, `i18n.ts:11-40`).
- Online/offline status pairs icons (`Wifi`/`WifiOff`) with text (`Online`/`Offline`) (`Layout.tsx:100-110`).
- Skip-to-main link (`Layout.tsx:57-62`), `*:focus-visible` `3px` ring (`src/index.css:29-32`), and `prefers-reduced-motion` (`src/index.css:35-44`) are implemented.

### 2.2 Identified UI/UX & WCAG 2.2 AA Gaps
1. **Unlabeled Form Controls (WCAG 1.3.1 / 3.3.2):**
   - `CropGuideManagementPage.tsx:74-84`: Title, crop select, category select, summary, and markdown textarea rely solely on `placeholder` with no `<label>` or `aria-label`.
   - `ExpertManagementPage.tsx:79-86`: All 6 inputs/selects lack `<label>` or `aria-label`.
   - `AdvisoryContentReviewPage.tsx:65-70`: Optional review note `<input>` lacks `<label>` or `aria-label`.
2. **Modal Focus Management Missing (`Layout.tsx:261-435`, `PWAInstallButton.tsx:38-73`):**
   - Dialogs have `role="dialog"` and `aria-modal="true"`, but do not handle `Escape` key closing, focus trapping inside the modal, or returning focus to the opener button on close.
3. **Missing `<html lang>` Synchronization (`AppContext.tsx`, `index.html:2`):**
   - Selecting `lre` (Liberian English) or future languages does not update `document.documentElement.lang`.
4. **Silent Failure on Mutation Errors:**
   - `CropGuideManagementPage.tsx`, `AdvisoryContentReviewPage.tsx`, `FarmerManagementPage.tsx`, `QuestionManagementPage.tsx`, `SavedAdvicePage.tsx`, `ProfilePreferencesPage.tsx`, `ExpertProfilePage.tsx`, and `MyQuestionsPage.tsx` do not catch and display API errors in UI alerts when requests fail.
5. **Contrast & Touch Targets:**
   - `FarmerManagementPage.tsx:69` (`min-h-[40px]`) and `AdvisorPage.tsx:354` (`min-h-[40px]`) are slightly below the `44px` minimum touch target standard.
   - `text-[#183B2B]/65` on small `text-xs` text and `#16803C` on `#DDEFE0` soft green fall near or slightly below WCAG AA 4.5:1 for normal-weight small text.
6. **Responsive Viewport Testing (Blocked):**
   - No Chromium/Playwright binary exists in this container; visual layout checks at `320px`, `360px`, `390px`, `430px`, `768px`, `1024px`, and `1440px` could **not** be executed.
   - **Static code inspection note for 320px:** `MyQuestionsPage.tsx:148` reply input lacks `min-w-0` inside a horizontal `flex gap-2`, and `HomePage.tsx:201` `grid-cols-2` leaves ~136px card width on 320px screens.

---

## Part 3 — AI Farming Advisor Audit

- **Server-Side Key Handling:** `GEMINI_API_KEY` is accessed strictly server-side (`server/ai.ts:93,157`); never exposed to the frontend. Live `/api/v1/health` reports `"aiConfigured": true` in the port 3000 process (though absent in `.env` / CLI).
- **CRITICAL DEFECT — Invalid Model Name (`server/ai.ts:189`, `php-backend/src/AiAdvisor.php:27`):**
  - Both files hardcode `model: 'gemini-4-hydrogen'`, which is not a standard valid Gemini API model identifier (such as `gemini-2.5-flash`). Any live API invocation is likely throwing an upstream 404/invalid-model error and catching into `unavailable_demo` fallback (`server/ai.ts:238-263`). (Live mutating `POST /api/v1/advisor/ask` was not called against `./data/agri_advisory.db` to preserve read-only audit integrity.)
- **Fallback Behavior Verified:** Isolated execution with temp DB (`GEMINI_API_KEY=""`) verified that all test questions (cassava yellowing, upland rice spots, maize caterpillar pesticide request, prompt injection) return safe, non-fabricated structured responses with `uncertaintyNote`, `clarifyingQuestions`, `practicalLowRiskSteps`, and matched approved guides (`findMatchingGuides`).
- **Quota & Settings Disconnect:**
  - `server/routes/v1.ts:564-565` reads `process.env.AI_ANON_DAILY_LIMIT` (5) and `process.env.AI_AUTH_HOURLY_LIMIT` (30) rather than `platform_settings` updated in Admin Settings.
  - Guest rate limiting tracks `anon:${req.anonToken}` cookie (`v1.ts:578`), which is trivially bypassed by clearing or omitting cookies.

---

## Part 4 — Voice Input & Audio Output Audit

- **Architecture:** Pure client-side Web Speech API (`src/lib/voice.ts`), requiring zero audio upload to the server.
- **Safety & UX Guardrails:** Properly hides voice button when `SpeechRecognition` is unsupported, requires explicit `"Confirm & Use Text"` before submitting dictated text (`AdvisorPage.tsx:297-319`), and includes `"Listen"` / `"Stop Audio"` TTS on both `AdvisorPage` and `GuideDetailPage`.
- **Limitations:** Hardcodes `'en-US'` for both STT and TTS (`src/lib/voice.ts:67,117`) regardless of selected language; cannot transcribe Liberian English, Kpelle, or Bassa natively.
- **Runtime Verification:** **Blocked** — no browser or microphone device exists in this container.

---

## Part 5 — Local Language & i18n Audit

- **Implemented Policy:** Strictly avoids fabricating unreviewed translations (`src/lib/i18n.ts`, `server/routes/v1.ts:185,238`).
- **Verified Live Behavior:**
  - `GET /api/v1/guides/cassava-yellow-leaves-mosaic-check?lang=lre` returns the reviewed Liberian English translation (`fallbackApplied: false`).
  - `GET /api/v1/guides/cassava-yellow-leaves-mosaic-check?lang=kpe` falls back safely to English (`fallbackApplied: true`).
- **Gaps:**
  - Only **1 of 7** published guides has a Liberian English translation.
  - UI translation dictionary `EN_STRINGS` covers only 16 homepage/nav keys (`LRE_REVIEWED_STRINGS` covers only 9). All interior pages, forms, workspaces, and error messages are hardcoded in English.
  - `platform_settings` keys `default_language` and `liberian_english_mode` are stored but unused at runtime.

---

## Part 6 — Offline & PWA Capability Audit

- **Built Artifacts Verified:** `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-63c18b4d.js`, `dist/registerSW.js`, and 4 PNG icons in `public/` & `dist/` exist and serve HTTP `200` on port 3000.
- **Offline Caching Architecture:**
  - Service Worker caches app shell JS/CSS/HTML/PNG/SVG and caches `/api/v1/(crops|categories|guides)` with `NetworkFirst`, explicitly excluding `/api/v1/auth`, `/farmer`, `/expert`, `/admin`, and `/advisor` (`vite.config.ts:67-80`).
  - Manual `"Save Offline"` stores complete guide markdown + metadata in `localStorage` (`agri_advisory_offline_guides_v1`) and caches the guide image + JSON in `agri-offline-guide-assets-v1` Cache Storage (`src/lib/offlineStorage.ts`).
- **Gaps & Risks:**
  1. Workbox `globPatterns` (`**/*.{js,css,html,ico,png,svg}`) excludes `.jpg` images; unvisited guides' ~1.2 MB JPEGs (`5.45 MB` total across 5 images) are not precached until viewed or explicitly saved offline.
  2. `offlineStorage.ts` keys entries solely by `guide.id`, so saving a guide in `lre` overwrites its `en` offline copy (or vice versa).
  3. `GuidesLibraryPage.tsx` hides search/crop/category filters whenever `!isOnline`.
- **Browser Offline Reload Verification:** **Blocked** (no headless browser/DevTools in container).

---

## Part 7 — Database & Persistence Audit

- **Live Persistence Confirmed:** `./data/agri_advisory.db` (`node:sqlite`, WAL mode, `PRAGMA foreign_keys = ON`).
- **Read-Only Row Inventory:**
  - `crops`: 6 | `guide_categories`: 9 | `agricultural_guides`: 9 (7 approved & published, 2 `pending_review` & unpublished) | `guide_translations`: 1 (`lre`).
  - `users`: 2 (1 synthetic demo farmer `+231770000101`, 1 synthetic demo approved expert `+231770000201`, **0 admin accounts**).
  - `advisory_questions`: 2 | `audit_logs`: 0.
- **Operational & Parity Issues:**
  - **Admin Account Missing (P0):** Live DB has zero `admin` role users until `npm run db:bootstrap-admin` is executed.
  - **Dead Admin Settings:** `anon_ai_daily_limit`, `auth_ai_hourly_limit`, `allow_public_registration`, `default_language`, `liberian_english_mode` in `platform_settings` are editable in UI but ignored by backend enforcement.
  - **No Pagination / Cleanup:** List endpoints (`/admin/users`, `/admin/questions`, `/farmer/saved`, `/farmer/questions`, `/expert/questions`) lack `LIMIT`/`OFFSET`; `rate_limit_attempts` and expired `password_resets` are never pruned.

---

## Part 8 — Security Audit Summary

*(Full details in `docs/TEAM8_SECURITY_FINDINGS.md`.)*
- **High:**
  1. Ephemeral `SESSION_SECRET` fallback invalidates all sessions on server restart (`/server/security.ts:6-12`).
  2. Guest AI rate limit bypassed by clearing/omitting `agri_anon` cookie (`/server/routes/v1.ts:578`).
  3. `Secure` cookie attribute set whenever `NODE_ENV=production`, breaking `http://localhost:3000` local production runs (`/server/security.ts:95-104`).
- **Medium:** Missing CSP/Permissions-Policy & exposed `X-Powered-By: Express` (`/server.ts:17-26`); `trust proxy = 1` IP spoofing risk (`/server.ts:18`); basic regex prompt-injection defense (`/server/ai.ts:25-36`); ignored `allow_public_registration` (`/server/routes/v1.ts:282`); stateless sessions not invalidated on password reset (`/server/routes/v1.ts:524-528`); `php-backend` lacks rate limiting.
- **Low:** Admin `PATCH`/`POST` routes return `{ok: true}` and log audits even for nonexistent IDs; dev password reset tokens logged to stdout in non-production.

---

## Parts 9–13 — Workspaces, Content Governance, Error Handling & Readiness Summary

- **Farmer Workspace (5 pages):** Implemented with strict ownership isolation (`farmer_id === req.user.id` verified in `tests/api.test.ts`). Missing error banners on delete/reply failures; no pagination.
- **Expert Workspace (4 pages):** Implemented with strict `approved` status check and farmer phone/email redaction (`server/routes/v1.ts:950-958`).
- **Admin Console (8 pages):** Implemented and RBAC-protected (`tests/api.test.ts` verified 403 for farmers), but currently inaccessible in live DB because no admin user has been bootstrapped, and several admin forms lack accessible labels and error alerts.
- **Content Governance:** Public `/guides` and `/guides/:id` strictly filter `is_published = 1 AND review_status = 'approved'` (verified: unpublished guide `plantain-wind-staking-and-suckers` returned HTTP `404` on port 3000).
- **Automated Tests:** `npm run lint` (`tsc --noEmit`) passed (`0` errors); `npm run test:api` passed **6/6** integration subtests against an isolated `/tmp` DB.
