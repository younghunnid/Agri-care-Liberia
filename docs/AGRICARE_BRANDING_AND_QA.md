# Agricare Liberia: branding, image integration and functional QA

Official name: **Agricare Liberia** (short name in the app and install prompt: **Agricare**). Subdomain `agricare.mpgmca.com`, GitHub repository `Agri-care-Liberia`, API paths, cookie names (`agri_*`), local-storage keys and database column names are intentionally unchanged.

## 1. Branding
- All displayed names changed from "Agriccare / Agri-Advisory Liberia / AgriLiberia" to "Agricare Liberia": header, footer, drawer, Ministry sidebar, login, register, 404, About, poster, dashboards, page titles, HTML metadata, PWA manifest (`name`, `short_name`), iOS home-screen title, install instructions, SMS/USSD demo labels (`Agricare demo:`), QR title and alt text, the advisor prompt, the verification SMS text, `metadata.json`, README and the docs.
- The seeded setting `platform_name` now reads "Agricare Liberia" for **new** databases. A database that already exists (for example the one on Hostinger) keeps its stored value: change it once in Admin, Settings.
- The API contract golden was updated for exactly two values: that setting, and the advisor sentence (section 4, item 5).
- Left unchanged on purpose: `backend-php/` and the MySQL seed export (their files are hash-checked by the PHP parity suite), the dev certificate name in `scripts/make-dev-cert.sh`, and demo e-mail addresses at `agri-advisory.lr`.

## 2. Images
| Role | Source (kept, unmodified) | Generated (Vite-hashed, `src/assets/brand/`) |
|---|---|---|
| Hero | `assets-source/brand/hero.JPG` (1600x900) | `hero-640/960/1280/1600.webp` (59 / 103 / 149 / 210 KB) |
| Logo, whole artwork | `assets-source/brand/logo.JPG` (1536x1024, opaque near-white JPEG) | `logo-full-512/1024.webp`; shown whole on the About page |
| Logo, emblem | cut out of the logo by `scripts/generate-brand-assets.py` | `logo-emblem-128/256/512.webp`: a **real transparent** WebP (the JPEG has no transparency; the mask is built from it) used in the header, drawer, footer, hero chip, login, register, 404, poster and Ministry sidebar |
| Favicons and PWA icons | the emblem | `public/favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180), `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png` (opaque, inside the 80% safe zone) |

- The original icons and the previous hero are kept in `assets-source/previous-brand/`.
- `logo1.JPG` in the project root is a byte-identical duplicate of `logo.JPG`; the root copies of `hero.JPG`, `logo.JPG` and `logo1.JPG` were left untouched and are not committed.
- Hero behavior: from 768 px the photograph fills the section behind a dark-green gradient (strongest under the text); on phones the whole photograph is shown at the top (same ratio, never stretched) and fades into solid green so the headline sits on a plain background. Low-Data Mode shows the green background only. The photo has a short descriptive `alt`.
- To change a photograph: replace the file in `assets-source/brand/` and run `python3 scripts/generate-brand-assets.py` (needs Pillow). Hashed file names mean a replaced image is never served from an old cache. The service worker precaches the images, so the old fixed-path runtime cache rule for `/images/home/` was removed.
- Previews: `docs/brand-screenshots/` (home at 375 and 1280, login, About, icon contact sheet on light/dark/green, USSD at 320 and 412).

## 3. Test results
Commands (all run from the project root; disposable SQLite databases and random or separate ports; the port-3000 server was not touched):
`npm run lint`, `npm run build`, `npm run test:{brand,home,role-dashboards,ministry-workspace,ministry,offline,offline-qa,password-policy,phase0,phase0b,phase2a,phase2b,ussd-marketplace,triage,harvest,h1,h2,sms,api,harness,deploy,hardening,contract}`, then `VITE_USSD_MARKETPLACE_ENABLED=true npm run build && npm run test:browser-qa`.

Additional QA run against throw-away production-style servers (scripts were scratch, not committed):
| Area | Result |
|---|---|
| API-level QA (authentication, roles, advisory, marketplace, Ministry privacy, secrets, database) | 74 checks, 73 pass; the one other item is the observation in section 5 |
| Browser QA (77 routes at 375 and 1280, UI sign-up and login for farmer, expert and admin, dashboards, unauthorized screens, keyboard focus, drawer, advisor, guide search, harvest search, service-worker privacy, offline reopen, logout) | 73 of 73 pass |
| USSD engine exploration (6 market/connectivity situations, about 13,000 screens each, every menu option explored to completion) | all screens at most 182 characters, no `null`/`undefined`, Back / Home / "0" / "00" correct on every sampled screen; one defect found and fixed |
| USSD phone UI (320 to 1280 px, real keypad) | 24 of 24 pass |
| Migration compatibility | a database at migration 006 with data upgrades to 011, keeps all rows, integrity and foreign-key checks clean |
| Restart safety | data, sessions and demo seed survive a restart (0.8 s to listen); the published demo password is rejected |
| Performance (local) | hero is the largest paint at about 0.35 s; images 114 KB (phone) and 202 KB (desktop) |

## 4. Defects found and fixed
1. The PWA manifest and install name still said "Agri-Advisory Liberia" / "AgriLiberia", plus the iOS home-screen title, the install instructions, the SMS/USSD demo labels and one seeded setting.
2. USSD "Buy & Sell" inquiry confirmation printed "To listing null." for a listing without a server reference. Now "To listing without a server reference." (`tests/ussd-null-code.test.ts`, verified to fail without the fix).
3. Passwords such as `password1234` or `Qwerty-9876` were accepted because the blocklist compared exact strings. A common base word plus digits or symbols is now refused (`tests/password-policy.test.ts`). Ordinary passwords are unaffected.
4. Advice-card detail pages had no `<h1>` (the title was an `<h2>`). A heading-level option makes it an `<h1>` on that page; the crop-check embed keeps `<h2>`.
5. The advisor fallback said "Verified Static Guidance" and "matching approved guides" although the guides are labeled sample, unverified demonstration content. Now "Demonstration Guidance (not reviewed)" and "matching demonstration guides (not reviewed by a qualified agronomist)". The wording guard in `tests/phase0b.test.ts` was extended.
6. Component tests could not load image imports in plain Node; a small test-only loader (`tests/assets-loader/`) is used by the four component test scripts.

## 5. Observations and limitations (not changed)
- `GET /api/v1/prototype/management-summary` is public and returns seven exact counters (registered farmers, questions, demo counts). No personal data, but not suppressed like the Ministry aggregates. It feeds the public `/management` page. Gate it behind the admin role before real farmer data exists.
- Listing descriptions longer than 1,200 characters are accepted and silently truncated, not rejected.
- `scripts/migrate-down.ts` re-opens the database through the normal runner, so it can undo only one migration and can lose a later migration's change. The supported rollback is restore from backup.
- The API `/crops` table has 6 crops while the Crops Library screens (bundled data) show 9.
- Staging diagnostics (`/api/v1/__staging/*`) exist on the live site while `STAGING_DIAG_TOKEN` is set (they answer 401). Remove the variable once the Hostinger checks are done.
- Not tested: Safari (no automation available without enabling it or downloading a browser), real phones and tablets, screen readers, an installed PWA on a device, live telecom USSD (none exists), and the live Hostinger site beyond read-only requests.
