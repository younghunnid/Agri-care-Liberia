# Homepage redesign (Agricare Liberia)

Implements the approved "Design 2" mockup as an improvement to the existing site. No backend, database or route changes.

## Homepage (src/pages/public/HomePage.tsx, components/home/*)
1. `HeroSection`: full-width photo with dark-green gradient, headline "Practical Farming Help, Online or Offline", three buttons (Get Farming Advice `/advisor`, Explore Knowledge & Guides `/guides`, Try USSD `/ussd-demo`). A note states the USSD option is a browser simulation, not a live telecom service. Low-Data Mode skips the photo.
2. `ServiceCards`: My Farm Today `/today`, Ask Agricultural Advisor `/advisor`, Farming Knowledge & Guides `/guides`, Find Harvest / Marketplace `/harvest`, Basic Phone / USSD Demo `/ussd-demo`. No statistics.
3. `OfflineInfo`: accurate offline statement; links to `/offline`. Does not claim the whole site works offline; the simulator is "not a live Orange or MTN shortcode" (the mockup's `*777#` image was deliberately not used).
4. `CommonQuestions`: the same 11 questions, answers, Listen text and expand/collapse (data unchanged in `data/knowledgeCenter.ts`); two columns (6 + 5) from tablet up, one column on phones; link "See All 11 Solutions". Behaviour change: all answers start collapsed (as in the mockup; before, the first was open).
5. `KnowledgeCta`: "Get Full Crop & Plant Guidance in Farming Knowledge & Guides" -> `/guides`.

## Replacing the hero photo
The hero is `assets-source/brand/hero.JPG` (1600x900). To use another photograph: replace that file and run `python3 scripts/generate-brand-assets.py` (needs Pillow). It writes four hashed WebP sizes into `src/assets/brand/`; `src/data/homeHero.ts` imports them, so no other change is needed. See `docs/AGRICARE_BRANDING_AND_QA.md`.

## Content moved to Farming Knowledge & Guides (`/guides`)
`components/knowledge/KnowledgeResources.tsx`, rendered at the bottom of `GuidesLibraryPage`, now holds what used to fill the homepage: the eight module cards (marketplace, weather, pests, local language lab, Ministry view, soil, crops library, livestock & fish), language access, the "What do you need today?" directory, and new links (existing routes) to planting months & storage, advice cards, short lessons and the farm calculator. The 16 categories, 11 problems and crop guides were already the tabs of that page, so they were removed from the homepage rather than duplicated.
Removed from the homepage without a replacement block: the hackathon judge banner (Demo Mode is in the footer and menu), the "About Team 8" card (footer has project info; Farmer Dashboard demo and Ministry links are in the footer), the "Listen to Farming Advice" tile (Listen Mode toggle is in the utility bar).

## Navigation (Layout.tsx)
Header: Home, Advisor, Knowledge & Guides, Find Harvest, USSD Demo. Guests see Login and Register (header from 640 px; in the menu drawer on phones). Signed-in users see Dashboard/Expert/Admin, Account and Logout. All use the existing routes and session; no new authentication. Footer reduced to two link columns plus project information.

## Verification
tsc, production build, new `tests/home-redesign.test.tsx` (`npm run test:home`) and the regression suites listed in the final report. Headless Chrome at 320, 360, 375, 412, 768, 1024 and 1280 px: no horizontal overflow, one h1, no header overlap, hero buttons and cards at least 44 px tall, all 11 questions expand and collapse with Listen buttons present, hero buttons and all five cards navigate to working pages, guest Login/Register reachable (header or menu), signed-in Dashboard/Account/Logout, UI login through the existing form. Screenshots (compressed JPEG; knowledge page cropped to its top): `docs/home-screenshots/`.

## Limitations
Hero uses the existing project photograph (not the mockup's photo); replace it as described. Real phones, screen readers and offline behaviour of the new homepage were not tested.
