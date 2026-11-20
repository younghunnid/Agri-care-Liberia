# Team 8 — Hackathon Judge Presentation Script (5–7 Minutes)
**Event:** Liberia Agricultural Innovation Hackathon (November 20–22, 2026)  
**Platform:** **Agriccare Liberia** (Inclusive Agricultural e-Advisory Platform)  
**Target Duration:** ~6 minutes (leaving ~2 minutes for Judge Q&A)

---

## Pre-Presentation 30-Second Setup
1. Open `/demo` (**Hackathon Demo Mode**) and click **Reset Demo Data** (`POST /api/v1/demo/reset` restores clean 10 farmer + supplier listings and clears demo progress).
2. Confirm device volume is up cleanly for Smart Listen Mode and Phone Simulator DTMF key tones.
3. Verify `/` (Homepage), `/demo`, `/crops/cassava`, `/phone-simulator`, `/marketplace`, and `/ministry` load smoothly.

---

## Minute 0:00 – 1:00 | Liberia's 8 Agricultural Challenges & Inclusive Entry (`/`)
- **Speaker:** Team Lead
- **Action:** Show Homepage (`/`) — highlight the 4 clear primary actions, top **Low-Data** and **Listen Mode** toggles, and scroll briefly to the **Eight Liberian Agricultural Problem Statements** grid.
- **Script:**
  > "Good afternoon judges. Across Liberia's 15 counties, smallholder farmers face eight interconnected daily challenges: finding buyers and reliable input suppliers, unpredictable rainfall, crop pests and livestock diseases, language barriers in Bassa and Mano, poor soil health, limited crop & aquaculture guidance, and gaps in county-level food security visibility.
  >  
  > Team 8 built **Agriccare Liberia** as an independent, mobile-first, inclusive platform—completely separate from commercial marketplaces. From our clean green-and-white homepage, any farmer sees four clear starting buttons and direct access to all **eight agricultural problem-statement modules**, plus **Low-Data Mode** and **Smart Listen Mode** right at the top."

---

## Minute 1:00 – 2:15 | Journey 1: Accessible Crop Advice — Cassava + Smart Listen Mode (`/crops/cassava?listen=1` & `/soil`)
- **Speaker:** Agronomy & Accessibility Lead
- **Action:** Open `/demo` and click **Launch Journey 1 (Cassava + Listen)**. Tap a `<SpeakButton>` on Planting or Pests & Diseases, scroll to Soil & Marketplace links, and briefly preview `/soil` (1-2-3 Crop/Condition/Problem selector).
- **Script:**
  > "Let's walk through **Journey 1: Accessible Crop Advice**. Many farmers cannot read dense agricultural manuals. Pressing **Launch Journey 1** opens our illustrated **Cassava guide** with **Smart Listen Mode** enabled—so tapping any Listen button reads planting spacing, whitefly checks, and dry-chip storage aloud with Pause, Replay, and speed controls.
  >  
  > Our library covers **nine staple Liberian crops**—from rice and cassava to pepper, okra, tomatoes, plantain, sweet potatoes, and groundnuts—connected directly to our interactive **Soil & Fertilizer Advisory** (`/soil`), **Sample County Weather** (`/weather`), and **Livestock & Fish Farming** (`/livestock`)."

---

## Minute 2:15 – 3:30 | Journey 2: Local-Language Access — Simulated Phone Service (`/phone-simulator` & `/language-lab`)
- **Speaker:** Community & Inclusion Lead
- **Action:** Return to `/demo` -> click **Launch Journey 2 (Simulated Phone)** -> press **Call / Start** -> press **`2`** (Bassa slot) -> press **`1`** (Rice & Cassava). Briefly open `/language-lab` to show Speaker Consent and **`Recording Coming Soon`** honesty labels.
- **Script:**
  > "What if a farmer in Grand Bassa or Nimba has no smartphone and no internet? **Journey 2** launches our button-phone simulator—explicitly labeled **SIMULATED PHONE CALL — REAL TELECOM INTEGRATION COMING SOON**.
  >  
  > Farmers press physical-style keys with audible tones to choose **Bassa**, **Mano**, or English slots and hear structured rice, cassava, or poultry advice. Behind it sits our **Local Language Lab**, where community speakers upload native clips only after checking **Speaker Consent Confirmed**, and where unrecorded scripts honestly display **Recording Coming Soon** rather than faking automated Bassa or Mano speech translation."

---

## Minute 3:30 – 4:45 | Journey 3: Direct-Calling Agricultural Marketplace (`/marketplace`)
- **Speaker:** Product Lead
- **Action:** Return to `/demo` -> click **Launch Journey 3 (Marketplace + Call Farmer)** -> filter by **Lofa County** -> select **Premium Lofa Country Rice** -> click **Details** to show the large modal (location, market engagement views, seller info) -> click **Call Farmer** to demonstrate the clearly labeled demo simulation (and optionally show a listing with a real consented number opening `tel:` + Copy Number).
- **Script:**
  > "**Journey 3** solves Problem Statement 1: **Agricultural Marketing**—and removes a major barrier: written buyer inquiries fail farmers who cannot read or type replies.
  >  
  > In our redesigned marketplace, buyers use the left **Filter Products** sidebar (or mobile filter drawer) to filter across all 15 counties, 9 categories, maximum LRD price, and availability. Every product card offers two clear actions: **Details** and **Call Farmer**.
  >  
  > Clicking **Details** opens a large product popup with harvest location, buyer views, and producer information. Clicking **Call Farmer** connects buyers directly to the farmer's phone dialer when they've consented to share a valid Liberian number—or displays a clearly labeled **Simulated Direct Call** on fictional demo listings without ever inventing fake phone numbers."

---

## Minute 4:45 – 6:00 | Journey 4: Ministry of Agriculture Food Security Dashboard + Safety (`/ministry` & `/advisor`)
- **Speaker:** Engineering & Data Lead
- **Action:** In `/demo`, click **Launch Journey 4 (Ministry Dashboard)**. Change the County filter from `All 15 Counties` to `Bong` or `Nimba` to show live filtered KPIs and charts (`Farmers by County`, `Product Distribution`, `Reported Agricultural Problems`, `Sample Production Trends`). Briefly mention `/advisor` and `/pests` non-diagnostic safety guardrails.
- **Script:**
  > "Finally, **Journey 4** shows how field questions and listings inform national planning through our **Ministry of Agriculture Food Security Dashboard**. Policymakers can filter by county across four interactive charts tracking farmer reach, crop diversity, and reported pest or weather problems—combined with live demo marketplace totals and clearly labeled **Synthetic Demonstration Data — Not Official Ministry Statistics**.
  >  
  > Across all eight modules—including our **Gemini AI Advisor** and **Pests & Diseases** guide—we enforce strict safety disclaimers: never inventing pesticide dosages, never diagnosing animal illnesses, and always routing complex cases to human extension or veterinary experts. Thank you—we welcome your questions!"

---

## Judge Q&A Quick Facts
- **Are weather and Ministry charts live national feeds?** No—honestly labeled **Sample Weather Information** and **Synthetic Demonstration Data** until post-hackathon MOA and Meteorological Service partnerships go live.
- **How is this separate from AgriConnect Liberia?** Completely standalone directory, separate SQLite database (`./data/agri_advisory.db`), independent advisory schemas, and zero payment/cart code.
- **What happens if Gemini AI key is unavailable?** The backend serves topic-aware static fallback guidance tagged `unavailable_demo` without crashing or inventing unsafe dosages.
