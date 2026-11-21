# Team 8 — Post-Hackathon Discussion & Team Review Questions
**Project:** Inclusive Agricultural e-Advisory Platform (**Agricare Liberia**)  
**Purpose:** Checklist of 26 practical decisions for Team 8 members covering all 8 agricultural problem statements before field pilots and judge Q&A.

---

## Agricultural Marketing & Supplier Ecosystem
1. **Farmer vs. Supplier Verification:** Inside our Agricultural Marketplace, what community or Ministry verification check will distinguish genuine seed/tool **Agricultural Suppliers** from unverified resellers after the hackathon?
2. **Preventing Fraud Without Online Payments:** Because Team 8 avoids payment processing and stays isolated from commercial AgriConnect systems, how should we alert rural farmers against mobile money scams or fake pickup agreements?
3. **County Price Transparency:** Should post-hackathon market updates pair farmer/supplier listings with weekly enumerator price ranges across Red Light, Gbarnga, Ganta, and Buchanan?

## Weather, Soil & Crop Advisory Accuracy
4. **Live Weather Feed Partnership:** Which meteorological or regional climate partner (Liberia Meteorological Service, satellite rainfall feeds, or local radio stations) will replace our **Sample Weather Information** module?
5. **Soil Testing & Agronomist Sign-Off:** Who at CARI or the Ministry of Agriculture (MOA) will validate our interactive **Soil & Fertilizer Advisory** tips and establish safe local soil-testing referral clinics?
6. **Validating All 9 Crop Guides:** Before removing "Prototype Demonstration" notices on our 9 crop pages (Rice, Cassava, Maize, Pepper, Okra, Tomatoes, Plantain, Sweet Potatoes, Groundnuts), which county extension lead will sign off on each seasonal calendar?
7. **Pesticide & Dosage Guardrails:** Our Pests & Diseases module and AI Advisor strictly avoid inventing chemical mixing ratios—under what formal license or written extension protocol should county officers share specific treatment prescriptions?

## Livestock, Poultry & Aquaculture Safety
8. **Veterinary Referral Network:** Across our 6 animal categories (Poultry, Goats, Cattle, Pigs, Sheep, Fish Farming), which county veterinary technicians can handle urgent escalation requests submitted with photos or voice notes?
9. **Biosecurity Early Warning:** If multiple farmers in one county report sudden poultry or pig losses in `/pests` or `/experts`, should the system trigger an automatic alert card in the Ministry Dashboard?

## Local Language (Bassa, Mano & Kpelle) & Basic-Phone Access
10. **Dialect Selection:** Which regional variants of **Bassa** and **Mano** are most widely understood across Grand Bassa, Bong, and Nimba so recorded lessons feel natural?
11. **Resolving "Recording Coming Soon" Slots:** Who on Team 8 will coordinate native-speaker consent recording sessions inside `/language-lab` to fill every remaining **`Recording Coming Soon`** agricultural lesson before rural testing?
12. **Consent & Intellectual Property:** What written or verbal consent protocol will we archive for rural elders and farmers contributing local-language voice clips?
13. **Honest AI & Telecom Boundaries:** How do we ensure community ambassadors explain transparently that our current button-phone simulator and keyword preview are demonstrations—not yet live telecom IVR or automated Bassa/Mano speech translation?
14. **Toll-Free IVR Carrier Costs:** Which Liberian mobile network partnership (Orange Liberia / Lonestar Cell MTN) or voice gateway can subsidize toll-free minutes for basic-phone farmers?
15. **Call Duration Budget:** Should every phone voice lesson stay under 45 seconds so basic-phone callers do not hang up due to battery or airtime limits?

## Ministry Food Security Dashboard & Data Governance
16. **Replacing Synthetic Ministry Metrics:** What MOA data-sharing memorandum and anonymization policy are needed before live aggregated farmer questions, pest reports, and county listings replace our **Synthetic Demonstration Data** dashboard?
17. **Privacy Protection on County Reports:** How will we aggregate county pest spikes and product distribution in `/ministry` so individual smallholders' names and phone numbers are never exposed to policy viewers?
18. **Using Dashboard Insights for Extension Staffing:** How can Ministry planners use the "Reported Agricultural Problems" chart to deploy extension officers and seed suppliers to underserved counties faster?

## Accessibility, Offline Reliability & Hackathon Readiness
19. **Non-Literate 2-Tap Usability:** During village testing, can a first-time visitor activate **Listen Mode** and reach Rice, Cassava, or Poultry voice playback within two taps without someone reading labels aloud?
20. **Low-Bandwidth Page Weight:** Our Low-Bandwidth Mode hides heavy photos; what strict payload ceiling (`< 120 KB` per view) should we enforce for 2G rural connectivity?
21. **Offline Sync Resilience:** When farmers draft expert questions or marketplace edits offline, how should queued actions sync safely when brief connectivity returns?
22. **Database Scaling Plan:** Our prototype runs on SQLite for fast portable hackathon demos—when scaling across all 15 counties, will Team 8 migrate to managed PostgreSQL/MySQL and object storage?
23. **Strict Isolation from AgriConnect:** How will Team 8 maintain clean separation in Git repositories, hosting domains, credentials, and databases from the owner's personal AgriConnect Liberia marketplace?
24. **Judge Q&A Role Assignment:** Which team member presents Journeys 1–2 (Inclusion & Local Languages), which presents Journey 3 (Marketplace & Suppliers), and which presents Journey 4 (Ministry Dashboard & Tech/Safety)?
25. **Resetting Demo State Between Judges:** Who is responsible for pressing **Reset Demo Data** in `/demo` before every judge panel so all 10 sample listings and queues start clean?
26. **6-Month Impact Metrics:** What measurable farm outcomes (fewer chick losses, lower post-harvest cassava spoilage, faster buyer connections) will prove real farmer impact after the hackathon?
