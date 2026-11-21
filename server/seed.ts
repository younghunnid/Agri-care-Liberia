import {getDb} from './db.ts';
import {hashPassword} from './security.ts';
import {seedPrototypeData} from './seedPrototype.ts';
import {seedAdviceCards} from './adviceCards.ts';

/**
 * `demoAccounts`: also create the synthetic demo farmer and approved demo expert. Without `demoPasswords` they get the passwords PUBLISHED in project documents
 * (development/test only); strict environments pass private passwords. Off by default;
 * production refuses to start with it on (server/runtime.ts) and refuses to start if such accounts already exist (server/demoGuard.ts).
 */
export function seedInitialData(opts: {demoAccounts?: boolean; demoPasswords?: {farmer: string; expert: string}} = {}): void {
  const db = getDb();

  // 1. Seed Roles
  const roleCount = (db.prepare('SELECT COUNT(*) as cnt FROM roles').get() as {cnt: number}).cnt;
  if (roleCount === 0) {
    const insertRole = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)');
    insertRole.run('farmer', 'Farmer account with saved advice, history, and expert consultation access');
    insertRole.run('expert', 'Agricultural extension specialist approved to answer farmer questions');
    insertRole.run('admin', 'Platform administrator managing users, guides, reviews, and audit logs');
  }

  // 2. Seed Crops (Rice, Cassava, Maize, Pepper, Okra, Plantain)
  const cropCount = (db.prepare('SELECT COUNT(*) as cnt FROM crops').get() as {cnt: number}).cnt;
  if (cropCount === 0) {
    const insertCrop = db.prepare(
      `INSERT INTO crops (slug, name, local_names, summary, season_note, image_url, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insertCrop.run(
      'cassava',
      'Cassava',
      'Kpokpo / Cassava',
      'Resilient staple root crop grown across all 15 Liberian counties for gari, fufu, and dumboy.',
      'Plant at onset of rains (April–June) or late rainy season (August–September).',
      '/src/assets/images/crop_cassava_1794924193991.jpg',
      1
    );
    insertCrop.run(
      'rice',
      'Rice',
      'Upland & Lowland Swamp Rice',
      'Liberia’s primary staple grain cultivated in upland clearings and inland valley swamps.',
      'Upland planting April–May; swamp nursery & transplanting May–July.',
      '/src/assets/images/crop_rice_1794924195882.jpg',
      2
    );
    insertCrop.run(
      'maize',
      'Maize',
      'Corn / Maize',
      'Fast-maturing cereal intercropped with cassava or grown in pure stands for food and feed.',
      'First planting April–May; second season August–September.',
      '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
      3
    );
    insertCrop.run(
      'pepper',
      'Pepper',
      'Hot Pepper / Liberian Pepper',
      'High-value garden and smallholder spice crop needing well-drained beds and steady moisture.',
      'Nursery starts February–April or late rainy season with mulch protection.',
      '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
      4
    );
    insertCrop.run(
      'okra',
      'Okra',
      'Okro / Gumbo',
      'Nutritious, fast-harvest vegetable thriving in warm Liberian soils with regular picking.',
      'Sow directly after soil warms and early rains begin; harvest begins 50–60 days.',
      '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
      5
    );
    insertCrop.run(
      'plantain',
      'Plantain',
      'Plantain / Musa',
      'Perennial cooking fruit crop suited to humid forest zones and backyard agroforestry.',
      'Plant clean suckers at the start of rains; stake heavy bunches against wind.',
      '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
      6
    );
  }

  // 3. Seed 9 Guide Categories
  const catCount = (db.prepare('SELECT COUNT(*) as cnt FROM guide_categories').get() as {cnt: number}).cnt;
  if (catCount === 0) {
    const insertCat = db.prepare(
      'INSERT INTO guide_categories (slug, name, description, display_order) VALUES (?, ?, ?, ?)'
    );
    const categories = [
      ['planting', 'Planting', 'Seed selection, stem cuttings, spacing, and planting calendars'],
      ['soil-preparation', 'Soil Preparation', 'Composting, mulching, raised beds, and drainage'],
      ['watering', 'Watering', 'Moisture conservation, swamp water control, and dry-spell watering'],
      ['crop-care', 'Crop Care', 'Weeding intervals, thinning, staking, and nutrient care'],
      ['pest-prevention', 'Pest Prevention', 'Scouting, mechanical barriers, and integrated pest management'],
      ['disease-awareness', 'Disease Awareness', 'Early leaf symptom checks, sanitation, and clean planting material'],
      ['harvesting', 'Harvesting', 'Maturity signs, careful digging/picking, and reducing damage'],
      ['storage', 'Storage', 'Drying, moisture checks, and safe post-harvest storage'],
      ['climate-resilience', 'Climate Resilience', 'Handling heavy rains, dry spells, and wind protection'],
    ];
    categories.forEach(([slug, name, desc], i) => insertCat.run(slug, name, desc, i + 1));
  }

  // 4. Seed Sample Demonstration Agricultural Guides (clearly labeled sample content)
  const guideCount = (db.prepare('SELECT COUNT(*) as cnt FROM agricultural_guides').get() as {cnt: number}).cnt;
  if (guideCount === 0) {
    const cropRows = db.prepare('SELECT id, slug FROM crops').all() as {id: number; slug: string}[];
    const catRows = db.prepare('SELECT id, slug FROM guide_categories').all() as {id: number; slug: string}[];
    const cropMap = Object.fromEntries(cropRows.map((c) => [c.slug, c.id]));
    const catMap = Object.fromEntries(catRows.map((c) => [c.slug, c.id]));

    const insertGuide = db.prepare(
      `INSERT INTO agricultural_guides (
        slug, crop_id, category_id, title, summary, content_markdown, image_url,
        language_code, source_attribution, is_sample_demo, is_pest_disease,
        review_status, is_published, reviewed_by_name, last_reviewed_at, version, offline_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'en', ?, 1, ?, ?, ?, ?, ?, ?, 1)`
    );

    const guides = [
      {
        slug: 'cassava-yellow-leaves-mosaic-check',
        crop: 'cassava',
        cat: 'disease-awareness',
        title: 'Cassava Yellow Leaves & Mosaic Awareness (Sample Guide)',
        summary: 'How to tell nutrient or water stress apart from Cassava Mosaic Disease and take safe, low-risk next steps.',
        content: `## Important Notice
This is a **sample demonstration guide** prepared for Team 8 hackathon evaluation until reviewed by a certified Liberian agronomist.

## 1. Check the Pattern on the Leaves
- **Even yellowing on older bottom leaves:** Often linked to wet, poorly drained soil, dry spells, or low soil nitrogen.
- **Patchy yellow-green mosaic pattern with twisted young leaves:** Possible viral infection (Cassava Mosaic Disease) spread by infected stem cuttings or whiteflies.

## 2. Safe Immediate Steps
1. Check soil drainage around mounds or ridges—clear standing water channels if the plot is waterlogged.
2. Inspect the underside of young leaves in the early morning for tiny whiteflies.
3. Mark healthy, symptom-free plants now so you only cut clean stems for your next planting season.
4. Remove severely stunted, twisted volunteer shoots if only a few plants are affected, and do not share suspect cuttings with neighbors.

## 3. When to Contact an Expert
If more than 1 in 10 plants show twisted yellow-green patches on new growth, request an Agricultural Expert review before replanting.`,
        img: '/src/assets/images/crop_cassava_1794924193991.jpg',
        source: 'Team 8 Sample Demonstration Dataset (Based on West African Smallholder Extension Practices)',
        pest: 1,
        status: 'approved',
        pub: 1,
        reviewer: 'Sample Demo Reviewer (Unverified Demonstration)',
        reviewedAt: '2026-10-15',
        ver: 1,
      },
      {
        slug: 'cassava-healthy-stem-planting',
        crop: 'cassava',
        cat: 'planting',
        title: 'Selecting & Planting Healthy Cassava Cuttings (Sample Guide)',
        summary: 'Choosing mature 20–25 cm stem cuttings, proper spacing on mounds or ridges, and early weeding.',
        content: `## Important Notice
This is a **sample demonstration guide** for offline testing and hackathon demonstration.

## 1. Selecting Clean Cuttings
- Use mature, woody stems from the middle section of healthy 9–12 month plants.
- Cut stems 20–25 cm long with 5–7 healthy nodes (buds) using a sharp, clean cutlass.

## 2. Soil & Spacing
- Plant on loose mounds or ridges in heavy rain areas so roots do not rot.
- Space plants about 1 meter × 1 meter for good airflow and root swelling.
- Weed carefully at 3–4 weeks and again at 8–10 weeks after planting.`,
        img: '/src/assets/images/crop_cassava_1794924193991.jpg',
        source: 'Team 8 Sample Demonstration Dataset',
        pest: 0,
        status: 'approved',
        pub: 1,
        reviewer: 'Sample Demo Reviewer (Unverified Demonstration)',
        reviewedAt: '2026-10-15',
        ver: 1,
      },
      {
        slug: 'rice-swamp-water-management',
        crop: 'rice',
        cat: 'watering',
        title: 'Inland Valley Swamp Rice Water Control (Sample Guide)',
        summary: 'Practical bunding and shallow water depth practices to support rice tillering and reduce weed pressure.',
        content: `## Important Notice
This is a **sample demonstration guide** until formally reviewed by an agricultural extension specialist.

## 1. Bund Maintenance
- Inspect earthen bunds weekly during heavy rains to prevent breaches.
- Keep drainage spillways clear so floodwater drains gently without washing away young seedlings.

## 2. Water Depth by Growth Stage
- **Transplanting:** Keep soil moist to shallow (2–3 cm) so seedlings establish strong roots.
- **Tillering:** Maintain shallow standing water (3–5 cm) to suppress weeds naturally.
- **Two weeks before harvest:** Drain the plot gradually so panicles ripen evenly and harvesting is easier.`,
        img: '/src/assets/images/crop_rice_1794924195882.jpg',
        source: 'Team 8 Sample Demonstration Dataset',
        pest: 0,
        status: 'approved',
        pub: 1,
        reviewer: 'Sample Demo Reviewer (Unverified Demonstration)',
        reviewedAt: '2026-10-18',
        ver: 2,
      },
      {
        slug: 'rice-blast-and-bird-scouting',
        crop: 'rice',
        cat: 'pest-prevention',
        title: 'Rice Leaf Spot & Field Scouting Basics (Sample Guide)',
        summary: 'Early morning field checks for diamond-shaped leaf spots, stem borers, and timely weeding.',
        content: `## Important Notice
Sample demonstration content — seek local extension confirmation before applying any crop protection products.

## 1. Weekly Scouting Checklist
- Walk the edges and center of your rice plot once a week.
- Look for diamond-shaped brown spots on leaves (possible blast) or dead central shoots ("deadhearts").
- Clear grassy weeds along bunds that harbor insects between seasons.

## 2. Low-Risk Prevention
- Avoid excessive overcrowding during transplanting so air moves freely between rice hills.
- Save clean seed only from healthy, disease-free panicles.`,
        img: '/src/assets/images/crop_rice_1794924195882.jpg',
        source: 'Team 8 Sample Demonstration Dataset',
        pest: 1,
        status: 'approved',
        pub: 1,
        reviewer: 'Sample Demo Reviewer (Unverified Demonstration)',
        reviewedAt: '2026-10-20',
        ver: 1,
      },
      {
        slug: 'maize-fall-armyworm-scouting',
        crop: 'maize',
        cat: 'pest-prevention',
        title: 'Early Scouting for Maize Leaf-Feeding Caterpillars (Sample Guide)',
        summary: 'How to spot pinhole damage and sawdust-like frass inside maize whorls during the first 4 weeks.',
        content: `## Important Notice
Sample demonstration guide — consult an agricultural expert before purchasing or mixing any pesticide.

## 1. Spot Damage Early
- Check 10–20 maize plants across the field every 3–4 days starting 10 days after emergence.
- Look inside the central leaf funnel (whorl) for small translucent window-pane marks, pinholes, or wet frass.

## 2. Safe Community Practices
- Hand-pick small egg masses or caterpillars on small home plots if caught early.
- Keep plots weeded and encourage natural predators like wasps and birds around field borders.`,
        img: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
        source: 'Team 8 Sample Demonstration Dataset',
        pest: 1,
        status: 'approved',
        pub: 1,
        reviewer: 'Sample Demo Reviewer (Unverified Demonstration)',
        reviewedAt: '2026-10-22',
        ver: 1,
      },
      {
        slug: 'pepper-raised-beds-wilt-prevention',
        crop: 'pepper',
        cat: 'soil-preparation',
        title: 'Raised Beds & Wilt Prevention for Hot Pepper (Sample Guide)',
        summary: 'Preventing root rot during heavy Liberian rains with composted raised beds and clean mulching.',
        content: `## Important Notice
Sample demonstration content for Team 8 Phase 1 testing.

## 1. Building Raised Beds
- Raise planting beds 20–30 cm high with drainage furrows between rows so rainwater never pools around pepper stems.
- Mix well-rotted compost into the top layer before transplanting healthy seedlings.

## 2. Mulching & Sanitation
- Cover soil with dry grass mulch to stop rain splash from carrying soil fungi onto lower leaves.
- Avoid working in wet pepper beds when foliage is soaked to reduce spreading bacterial or fungal spots.`,
        img: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
        source: 'Team 8 Sample Demonstration Dataset',
        pest: 1,
        status: 'approved',
        pub: 1,
        reviewer: 'Sample Demo Reviewer (Unverified Demonstration)',
        reviewedAt: '2026-10-25',
        ver: 1,
      },
      {
        slug: 'okra-harvesting-and-aphid-care',
        crop: 'okra',
        cat: 'crop-care',
        title: 'Okra Pod Harvesting & Leaf Curl Awareness (Sample Guide)',
        summary: 'Picking tender pods every 2–3 days and spotting sap-sucking aphids or leaf curl early.',
        content: `## Important Notice
Sample demonstration guide — not a substitute for in-person extension inspection.

## 1. Frequent Harvesting Boosts Yield
- Harvest okra pods when they are 7–10 cm long and snap easily; leaving oversized pods on the plant slows new flowering.
- Wear light gloves or long sleeves when harvesting to protect skin from fine plant hairs.

## 2. Checking Leaf Undersides
- Curled young leaves with sticky residue often indicate aphids; wash small garden plots gently with plain water or consult an expert if curling spreads.`,
        img: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
        source: 'Team 8 Sample Demonstration Dataset',
        pest: 1,
        status: 'approved',
        pub: 1,
        reviewer: 'Sample Demo Reviewer (Unverified Demonstration)',
        reviewedAt: '2026-10-27',
        ver: 1,
      },
      {
        slug: 'plantain-wind-staking-and-suckers',
        crop: 'plantain',
        cat: 'climate-resilience',
        title: 'Staking Plantain Bunches & Sucker Management (Sample Guide)',
        summary: 'Supporting heavy bunches during storm winds and selecting one healthy follower sucker per mat.',
        content: `## Important Notice
Sample demonstration guide pending agricultural expert review in Admin Review queue.

## 1. Sucker Selection
- Keep one main bearing stem, one medium follower sucker, and one small peeper per mat so nutrients go into full bunches.

## 2. Storm Protection
- Prop heavy fruiting stems with sturdy forked bamboo or hardwood poles before strong squall winds arrive.`,
        img: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
        source: 'Team 8 Sample Demonstration Dataset',
        pest: 0,
        status: 'pending_review',
        pub: 0,
        reviewer: null,
        reviewedAt: null,
        ver: 1,
      },
      {
        slug: 'maize-post-harvest-drying-storage',
        crop: 'maize',
        cat: 'storage',
        title: 'Safe Maize Drying & Weevil-Resistant Storage (Sample Guide)',
        summary: 'Drying maize cobs off the ground and checking grain dryness before sealing in airtight sacks.',
        content: `## Important Notice
Sample demonstration guide in review queue.

## 1. Clean Drying
- Dry harvested maize on raised racks, mats, or tarpaulins rather than bare damp soil to reduce mold risk.

## 2. Storage Readiness
- Store dry grain in clean, dry, tightly sealed containers off the floor and away from walls.`,
        img: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
        source: 'Team 8 Sample Demonstration Dataset',
        pest: 0,
        status: 'pending_review',
        pub: 0,
        reviewer: null,
        reviewedAt: null,
        ver: 1,
      },
    ];

    for (const g of guides) {
      const res = insertGuide.run(
        g.slug,
        cropMap[g.crop],
        catMap[g.cat],
        g.title,
        g.summary,
        g.content,
        g.img,
        g.source,
        g.pest,
        g.status,
        g.pub,
        g.reviewer,
        g.reviewedAt,
        g.ver
      );
      const guideId = Number(res.lastInsertRowid);

      // Seed a single reviewed-status Liberian English preview for the cassava yellow leaves guide
      if (g.slug === 'cassava-yellow-leaves-mosaic-check') {
        db.prepare(
          `INSERT INTO guide_translations (guide_id, language_code, title, summary, content_markdown, translation_status, reviewed_by)
           VALUES (?, 'lre', ?, ?, ?, 'reviewed', 'Team 8 Language Preview Reviewer (Sample)')`
        ).run(
          guideId,
          'When Cassava Leaf Turn Yellow (Sample Guide)',
          'How for check why cassava leaf turning yellow — water trouble, soil food, or mosaic sickness — and safe small steps for take.',
          `## Small Notice First
Dis na **sample demo guide** for Team 8 hackathon testing until one qualified Liberia agricultural officer check am.

## 1. Look Good at the Leaf
- **All the old bottom leaf turning yellow same-same:** Plenty time water standing too much under the soil, or the soil need compost/food.
- **Leaf get mix-mix yellow and green spot and young leaf twisting:** Could be Cassava Mosaic sickness from bad stick or small white fly under leaf.

## 2. Safe Steps You Can Take Now
1. Check if rain water standing round the cassava mound—open small gutter so water can pass.
2. Turn the young leaf over early morning to look for tiny white fly.
3. Mark the strong, clean cassava plant them now so next planting time you only cut clean stick.

## 3. When for Call Expert
If plenty plant (more than 1 out of 10) get twist-twist yellow leaf on the new top growth, send message to Agricultural Expert on dis app.`
        );
      }
    }
  }

  // 5. Seed Synthetic Hackathon Demo Farmer & Approved Demo Expert (no admin password seeded!)
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as {cnt: number}).cnt;
  if (userCount === 0 && opts.demoAccounts) {
    const farmerRole = db.prepare("SELECT id FROM roles WHERE name = 'farmer'").get() as {id: number};
    const expertRole = db.prepare("SELECT id FROM roles WHERE name = 'expert'").get() as {id: number};

    const insertUser = db.prepare(
      `INSERT INTO users (display_name, phone, email, password_hash, status)
       VALUES (?, ?, ?, ?, 'active')`
    );

    // Synthetic Demo Farmer
    const fRes = insertUser.run(
      'Martha Kollie (Demo Farmer)',
      '+231770000101',
      'farmer.demo@agri-advisory.lr',
      hashPassword(opts.demoPasswords?.farmer ?? 'FarmerDemo!2026')
    );
    const farmerId = Number(fRes.lastInsertRowid);
    // Accounts seeded with the PUBLISHED passwords are shared, untrusted demo accounts: flagged permanently (see server/security.ts).
    if (!opts.demoPasswords) db.prepare('UPDATE users SET is_shared_demo = 1 WHERE id = ?').run(farmerId);
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(farmerId, farmerRole.id);
    db.prepare(
      `INSERT INTO farmer_profiles (user_id, county, preferred_language, crops_of_interest, farm_notes)
       VALUES (?, 'Bong', 'en', '["cassava","rice","pepper"]', 'Synthetic demonstration profile in Bong County')`
    ).run(farmerId);
    db.prepare('INSERT INTO language_preferences (user_id, language_code, tts_enabled) VALUES (?, ?, 1)').run(
      farmerId,
      'en'
    );

    // Synthetic Demo Approved Expert
    const eRes = insertUser.run(
      'Samuel Tarnue (Demo Agronomist)',
      '+231770000201',
      'expert.demo@agri-advisory.lr',
      hashPassword(opts.demoPasswords?.expert ?? 'ExpertDemo!2026')
    );
    const expertId = Number(eRes.lastInsertRowid);
    if (!opts.demoPasswords) db.prepare('UPDATE users SET is_shared_demo = 1 WHERE id = ?').run(expertId);
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(expertId, expertRole.id);
    db.prepare(
      `INSERT INTO expert_profiles (user_id, specialty, county, bio, approval_status, approved_at)
       VALUES (?, 'Root Crops & Integrated Pest Management', 'Bong',
       'Synthetic demonstration agricultural specialist supporting Bong and Nimba smallholder farmers.',
       'approved', datetime('now'))`
    ).run(expertId);

    // Synthetic Advisory Questions
    const cassavaId = (db.prepare("SELECT id FROM crops WHERE slug = 'cassava'").get() as {id: number}).id;
    const riceId = (db.prepare("SELECT id FROM crops WHERE slug = 'rice'").get() as {id: number}).id;

    const q1 = db
      .prepare(
        `INSERT INTO advisory_questions (farmer_id, crop_id, topic, county, title, description, status, assigned_expert_id)
         VALUES (?, ?, 'Disease Awareness', 'Bong', ?, ?, 'Assigned', ?)`
      )
      .run(
        farmerId,
        cassavaId,
        'Yellow patches on 3-month cassava leaves',
        'About 15 cassava plants on the lower edge of my Bong County plot started showing yellow-green patches on new top leaves after heavy rains. What steps should I take?',
        expertId
      );
    const q1Id = Number(q1.lastInsertRowid);
    db.prepare(
      `INSERT INTO advisory_messages (question_id, sender_id, sender_role, message_text, is_official_expert_advice)
       VALUES (?, ?, 'farmer', ?, 0)`
    ).run(
      q1Id,
      farmerId,
      'About 15 cassava plants on the lower edge of my Bong County plot started showing yellow-green patches on new top leaves after heavy rains. What steps should I take?'
    );
    db.prepare(
      `INSERT INTO expert_assignments (question_id, expert_id) VALUES (?, ?)`
    ).run(q1Id, expertId);

    const q2 = db
      .prepare(
        `INSERT INTO advisory_questions (farmer_id, crop_id, topic, county, title, description, status, assigned_expert_id)
         VALUES (?, ?, 'Watering', 'Bong', ?, ?, 'Answered', ?)`
      )
      .run(
        farmerId,
        riceId,
        'Swamp rice bund overflow after heavy night rain',
        'Heavy rain flooded our lowland rice plot to knee depth overnight. Will draining down to 4 cm today hurt newly transplanted rice?',
        expertId
      );
    const q2Id = Number(q2.lastInsertRowid);
    db.prepare(
      `INSERT INTO advisory_messages (question_id, sender_id, sender_role, message_text, is_official_expert_advice)
       VALUES (?, ?, 'farmer', ?, 0)`
    ).run(
      q2Id,
      farmerId,
      'Heavy rain flooded our lowland rice plot to knee depth overnight. Will draining down to 4 cm today hurt newly transplanted rice?'
    );
    db.prepare(
      `INSERT INTO advisory_messages (question_id, sender_id, sender_role, message_text, is_official_expert_advice)
       VALUES (?, ?, 'expert', ?, 1)`
    ).run(
      q2Id,
      expertId,
      'Draining excess floodwater gradually down to 3–4 cm will protect your newly transplanted seedlings from submergence stress. Open the spillway slowly so soil around young roots is not washed away, and check that bunds have no weak cracks.'
    );
    // Synthetic demonstration numbers (+23177000xxxx) belong to nobody: treat them as verified so the demo accounts work (a new device still needs a code).
    db.prepare("UPDATE users SET phone_verified_at = datetime('now'), phone_claim_expires_at = NULL WHERE phone GLOB '+23177000[0-9][0-9][0-9][0-9]'").run();
  }

  // 6. Default Platform Settings
  const settingsCount = (db.prepare('SELECT COUNT(*) as cnt FROM platform_settings').get() as {cnt: number}).cnt;
  if (settingsCount === 0) {
    const insertSet = db.prepare('INSERT INTO platform_settings (key, value) VALUES (?, ?)');
    insertSet.run('platform_name', 'Agricare Liberia');
    insertSet.run('anon_ai_daily_limit', '5');
    insertSet.run('auth_ai_hourly_limit', '30');
    insertSet.run('allow_public_registration', 'true');
    insertSet.run('default_language', 'en');
    insertSet.run('liberian_english_mode', 'preview_reviewed_only');
    insertSet.run('daily_tip_title', "Today's Farming Tip (Sample)");
    insertSet.run(
      'daily_tip_body',
      'Inspect the underside of cassava and pepper leaves early in the morning once a week. Spotting whiteflies or aphids early prevents heavy spread across your plot.'
    );
  }

  // 7. Seed Hackathon Prototype Modules (Marketplace, Local Language AI Lab, Simulated Expert Queue)
  seedPrototypeData(false);
  seedAdviceCards(); // six demonstration advice cards (never verified)
}
