# Phase 1 Test Results — Agricare Liberia

## Executed Automated Checks

| Suite | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| TypeScript Check | `npm run lint` (`tsc --noEmit`) | PASS (0 errors) | All frontend, server, and test TypeScript modules typechecked cleanly |
| Production & PWA Build | `npm run build` (`vite build`) | PASS | Built `dist/` bundle, manifest, and service worker cleanly |
| API & Security Suite | `npm run test:api` (`tsx tests/api.test.ts`) | PASS (6 / 6) | Verified against isolated temporary SQLite DB |

## API & Security Test Cases Verified (`tests/api.test.ts`)

1. **Health & Public Guide Filtering:** `/api/v1/health` reports `status: ok`, latest migration, and 7 published approved guides (2 pending_review guides remain excluded from public search).
2. **Language Fallback:** `?lang=lre` serves the reviewed Liberian English preview for `cassava-yellow-leaves-mosaic-check`, while unreviewed languages (`kpe`) fall back cleanly to `en` with `fallbackApplied: true`.
3. **CSRF Enforcement:** State-changing `POST /api/v1/feedback` without `X-CSRF-Token` returns `403 CSRF_INVALID`.
4. **Farmer Registration, Isolation & SQLi Resistance:** Farmer B receives `403 FORBIDDEN` accessing Farmer A's question and `403` on `/api/v1/admin/overview` and `/api/v1/expert/questions`; `' OR 1=1 --` returns `401` on login and `0` rows on guide search.
5. **AI Missing-Key Fallback & Guest Rate Limiting:** With `GEMINI_API_KEY` unset, `/api/v1/advisor/ask` returns `unavailable_demo` with matching static guides and returns `429 ANON_QUOTA_REACHED` after the guest limit.
6. **Admin Assignment & Expert Response:** Admin assigns a farmer question to an approved expert, and the expert posts a response marking the question `Answered`.

## Limitations & Unexecuted Checks in This Container

- **PHP 8.3 & MySQL 8 Runtime Execution:** Neither `php` nor `mysql` binaries are installed in the AI Studio Linux build container, so the PHP/MySQL companion backend (`php-backend/`, `database/mysql/`) was verified by static review and schema alignment rather than live execution in this container.
- **Browser Responsive Viewport Matrix (320px–1440px) & Offline DevTools Emulation:** Responsive layout classes (`sm:`, `md:`, `lg:`), `min-h-[44px]` touch targets, and PWA Workbox configuration were implemented and compiled, and should be visually inspected across `320px`, `360px`, `390px`, `430px`, `768px`, `1024px`, and `1440px` in a browser on local startup.
