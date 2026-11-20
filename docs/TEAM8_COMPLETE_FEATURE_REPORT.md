# Team 8 — Complete Feature & Status Report (Phase 2)
**Project:** Inclusive Agricultural e-Advisory Platform (**Agriccare Liberia**)  
**Event:** Liberia Agricultural Innovation Hackathon (November 20–22, 2026)  
**Isolation Notice:** Completely independent of the owner's personal AgriConnect Liberia marketplace. Uses its own isolated SQLite database (`./data/agri_advisory.db`) and zero payment or cart modules.

---

## Status Classification Legend
- **Working:** Implemented end-to-end and verified in local compilation, API tests, and HTTP route checks.
- **Partially Working:** Core interface works, with browser/hardware or coverage limits transparently labeled (e.g., Web Speech API audio synthesis in English, browser microphone capture).
- **Simulated:** Interactive demonstration workflow using clearly labeled sample or synthetic data (e.g., Basic-Phone Call Simulator, Sample County Weather, Synthetic Ministry Food Security Dashboard, Demo Marketplace listings/inquiries, Simulated Expert Reply Queue).
- **Experimental:** Early community research workflow (e.g., Language Lab keyword-matched preview without automated Bassa/Mano speech translation).
- **Coming Soon:** Clearly labeled placeholder scripts, unrecorded local-dialect slots (`Recording Coming Soon`), and post-hackathon features on `/coming-soon`.

---

## The Eight Agricultural Problem Statements (Phase 2 Modules)

### Problem Statement 1: Agricultural Marketing (`/marketplace`) — **Working** (UI & Direct-Call Backend) / **Simulated** (Demo Listings)
- **Why Direct Calling Replaces Written Inquiries:** Many Liberian smallholder farmers cannot read or reply to written buyer messages. Removing required written inquiries eliminates literacy barriers and lets buyers call farmers directly by phone.
- **Two-Column Desktop Layout & Mobile Filter Drawer:**
  - **Left Sidebar (`Filter Products`):** County filter (all 15 counties), all 9 categories (`Rice and grains`, `Cassava and root crops`, `Vegetables`, `Fruits and plantains`, `Poultry and eggs`, `Livestock`, `Fish and seafood`, `Seeds and seedlings`, `Agricultural supplies`), Maximum Price (`LRD`), Product Availability (`Available`, `Limited Stock`, `Sold Out`), and `Clear Filters`. Collapses into an accessible drawer on mobile viewports.
  - **Right Product Grid:** Responsive 3-column desktop / 2-column tablet / 1-column mobile cards showing large image, category badge, availability badge, county badge, product name, seller/farm name, `LRD` price + measurement unit, available quantity, and two primary buttons: **Details** and **Call Farmer**.
- **Large Centered Product Details Modal:** Displays category & county badges, large image, highlighted green price & quantity banner, `PRODUCT DETAILS & QUALITY`, `Harvest & Market Location` (Town, County, Liberia), `Market Engagement` (listing date, availability, live incremented buyer views), and `PRODUCER / SELLER INFORMATION` (farmer name, farm/business name, consented phone number, honest verification status, and prominent **Call Farmer** action). Supports `X` close, `Escape` key close, scroll lock, and mobile scrolling.
- **Direct Calling Rules & Safety:**
  - Listings with a real, consented Liberian phone number open `tel:+231...` and provide a desktop **Copy Number** button (never claiming automatic calling or fake verification).
  - Seeded fictional demo listings (`11` sample items including `Premium Lofa Country Rice` and `Agricultural Supplier` inputs) show a clearly labeled **Demo Listing — Simulated Direct Call** panel without inventing fake telephone numbers.
  - Listings without a phone number or without consent display **Phone Number Unavailable** (and unconsented numbers are masked at the API layer).
- **Farmer Self-Management:** Farmers can still create, view, edit, update availability (`Available` / `Limited Stock` / `Sold Out`), update contact number + consent, and delete own listings without reading written buyer messages. Historical `marketplace_inquiries` DB tables remain intact for backend compatibility.

### Problem Statement 2: Agricultural Weather Information (`/weather`) — **Simulated** (`Sample Weather Information — Not Live Meteorological API`)
- County picker for **all 15 Liberian counties**.
- Displays sample temperature (`°C`), humidity (`%`), 7-day sample rainfall (`mm`), 3-day short-term demonstration outlook, weather risk notices, and rainfall planting guidance.
- Includes `<SpeakButton>` Smart Listen playback and connected links to county-recommended Crops and Soil drainage guidance.
- Explicitly displays **`Sample Weather Information — Not Live Meteorological API`** banner.

### Problem Statement 3: Pests and Diseases (`/pests`) — **Working** (Knowledge + AI/Expert Routing)
- Interactive symptom & prevention library filtering across **Rice**, **Cassava**, **Vegetables**, **Poultry**, and **Livestock**, alongside SQLite-published approved guides.
- Every card features non-diagnostic prevention steps, `<SpeakButton>` read-aloud, and escalation links to **AI Agricultural Advisor** (`/advisor` with optional photo) and **Ask an Agricultural Expert** (`/experts`).
- Enforces preliminary non-diagnosis safety disclaimers and zero invented pesticide or veterinary medicine dosages.

### Problem Statement 4: Translation of Local Dialects (`/language-lab` & `/phone-simulator`) — **Experimental** / **Simulated**
- Prioritizes **English**, **Bassa**, and **Mano**, alongside **Kpelle** expansion.
- Plays approved recorded clips when audio exists and displays explicit **`Recording Coming Soon`** labels for unrecorded sample script slots, linking directly to matching Crops/Livestock/Soil modules.
- Team audio recorder & upload form enforces server-side **Speaker Consent Confirmed** (`CONSENT_REQUIRED` 400 if unchecked) and review status tracking (`reviewed`, `pending_review`, `needs_rerecording`).
- **Basic-Phone Voice Advisory Simulator (`/phone-simulator`):** Interactive 12-key keypad (`1–9, *, 0, #`) with Web Audio DTMF tones, clearly labeled **`SIMULATED PHONE CALL — REAL TELECOM INTEGRATION COMING SOON`**.

### Problem Statement 5: Ministry of Agriculture Food Security Dashboard (`/ministry` & `/food-security`) — **Simulated** (`Synthetic Demonstration Data — Not Official Ministry Statistics`)
- County selector filtering regional metrics across Liberia.
- Displays KPI cards (Synthetic Registered Farmers, Estimated Seasonal Output, Reported Field Cases, Active Demo Marketplace Listings) and **4 visual charts**:
  1. Bar Chart: Farmers & Activity by County
  2. Pie Chart: Product & Crop Distribution
  3. Bar Chart: Reported Agricultural Problems
  4. Line Chart: Sample Seasonal Production Trends
- Connects live SQLite marketplace listing counts transparently alongside synthetic Ministry indicators, displaying prominent **`Synthetic Demonstration Data — Not Official Ministry Statistics`** notices.

### Problem Statement 6: Soil and Fertilizer Advisory (`/soil`) — **Working** (Interactive Rule-Based Guidance)
- Covers soil health fundamentals, Liberian land preparation, compost making, organic matter safety, fertilizer safety awareness (zero invented NPK kg dosage rates), and soil testing guidance.
- Interactive **1-2-3 Soil Advisory Selector** (`Crop` + `Soil Condition` + `Problem`) generating practical step-by-step guidance with `<SpeakButton>` audio playback and links to `/advisor` and `/experts`.

### Problem Statement 7: Crops Library (`/crops` & `/crops/:slug`) — **Working**
- Searchable, category-filtered illustrated library covering all **9 Liberian staple and cash crops**:
  - **Rice**, **Cassava**, **Maize**, **Pepper**, **Okra**, **Tomatoes**, **Plantain**, **Sweet Potatoes**, **Groundnuts / Cowpeas**.
- Each crop page details Overview, Planting Seasons & Spacing, Soil & Compost Prep, Water Management, Pests & Diseases, Routine Maintenance, Harvesting, Post-Harvest Storage, live related Marketplace listings, and Smart Listen `<SpeakButton>` playback.

### Problem Statement 8: Animal Husbandry and Livestock Advisory (`/livestock` & `/livestock/:slug`) — **Working**
- Covers all **6 required categories**: **Poultry (Chickens & Eggs)**, **Goats**, **Cattle**, **Pigs**, **Sheep**, and **Fish Farming & Aquaculture**.
- Each category details General Care, Feeding & Clean Water, Housing & Sanitation, Animal Welfare, Breeding Basics, Disease Prevention & Biosecurity, mandatory **Veterinary Expert Referral** warnings (no invented antibiotic dosages), live Marketplace linkage, and Smart Listen playback.

---

## Core Platform Foundations (Preserved from Phase 1)
- **Accessibility & Smart Listen Mode:** Global Listen Mode toggle, `ListenModeBar` (`Play/Pause/Resume/Replay/Stop` + speed controls), `Low-Bandwidth Mode`, large >=44px touch targets, and Back/Home navigation.
- **Conversational AI Advisor (`/advisor`):** Multi-turn Gemini multimodal advisor (`gemini-4-hydrogen`) with safe fallback (`unavailable_demo`), voice dictation preview, optional photo disclaimer, and one-tap **Ask Expert** escalation.
- **Ask an Expert (`/experts`) & Management (`/management`):** Farmer question submission with photo/voice notes, Simulated Extension Reply Dashboard, formal authenticated RBAC (`/farmer`, `/expert`, `/admin`), and clear separation of actual SQLite records vs. demo records.
- **Hackathon Demo Mode (`/demo`):** Launches all **4 Hackathon Demonstration Journeys** plus one-click **Reset Demo Data** (`POST /api/v1/demo/reset`).
