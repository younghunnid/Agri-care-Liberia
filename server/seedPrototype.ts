import {getDb} from './db.ts';

export function seedPrototypeData(forceResetDemo = false): void {
  const db = getDb();

  if (forceResetDemo) {
    db.prepare('DELETE FROM marketplace_inquiries WHERE is_demo_inquiry = 1').run();
    db.prepare('DELETE FROM marketplace_listings WHERE is_demo_listing = 1').run();
    db.prepare('DELETE FROM local_language_recordings WHERE is_sample_demo = 1').run();
    db.prepare('DELETE FROM demo_expert_requests WHERE is_simulated_demo = 1').run();
  }

  // 1. Seed Demo Marketplace Listings
  const listingCount = (db.prepare('SELECT COUNT(*) as cnt FROM marketplace_listings').get() as {cnt: number}).cnt;
  if (listingCount === 0) {
    const insertListing = db.prepare(
      `INSERT INTO marketplace_listings (
        owner_token, seller_name, farm_name, category, product_name, quantity, unit, price_lrd,
        county, town, description, image_url, availability_status, seller_phone, phone_consent,
        phone_verified, is_fictional_seller, view_count, is_demo_listing, moderation_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 0, 1, ?, 1, 'approved')`
    );

    const sampleListings = [
      {
        owner: 'demo-seed-0',
        seller: 'Kebbeh Flomo',
        farm: 'Flomo Family Rice Farm (Demo)',
        cat: 'Rice and grains',
        name: 'Premium Lofa Country Rice',
        qty: '15',
        unit: '50kg bag',
        price: 7500,
        county: 'Lofa',
        town: 'Voinjama',
        desc: 'Clean, fragrant Lofa country rice harvested, parboiled, and sun-dried on clean tarpaulins. Ready for direct farmgate or market pickup.',
        img: '/src/assets/images/crop_rice_1794924195882.jpg',
        avail: 'Available',
        consent: 1,
        views: 34,
      },
      {
        owner: 'demo-seed-1',
        seller: 'Kollie Rice Cooperative (Demo)',
        farm: 'Bong Farmers Co-op',
        cat: 'Rice and grains',
        name: 'Clean Parboiled Upland Rice',
        qty: '12',
        unit: '50kg bag',
        price: 11500,
        county: 'Bong',
        town: 'Gbarnga',
        desc: 'Sun-dried, stone-free upland rice harvested from Bong County plots. Available for local pickup or bulk buyer arrangement.',
        img: '/src/assets/images/crop_rice_1794924195882.jpg',
        avail: 'Available',
        consent: 1,
        views: 27,
      },
      {
        owner: 'demo-seed-2',
        seller: 'Martha Smallholder Farm (Demo)',
        farm: 'Margibi Root Harvest',
        cat: 'Cassava and root crops',
        name: 'Fresh Harvested Cassava Roots',
        qty: '20',
        unit: '50kg bag',
        price: 3800,
        county: 'Margibi',
        town: 'Kakata',
        desc: 'Firm, freshly uprooted cassava suitable for gari processing, fufu, or local market resale.',
        img: '/src/assets/images/crop_cassava_1794924193991.jpg',
        avail: 'Available',
        consent: 1,
        views: 19,
      },
      {
        owner: 'demo-seed-3',
        seller: 'Ganta Gardeners Group (Demo)',
        farm: 'Nimba Women Gardeners',
        cat: 'Vegetables',
        name: 'Fresh Red Hot Pepper & Okra Baskets',
        qty: '15',
        unit: 'basket',
        price: 2600,
        county: 'Nimba',
        town: 'Ganta',
        desc: 'Early morning picked hot pepper and tender okra sorted cleanly in woven market baskets.',
        img: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
        avail: 'Available',
        consent: 1,
        views: 14,
      },
      {
        owner: 'demo-seed-4',
        seller: 'Bensonville Poultry Shed (Demo)',
        farm: 'Montserrado Layers Co-op',
        cat: 'Poultry and eggs',
        name: 'Farm-Fresh Table Eggs',
        qty: '25',
        unit: 'crate (30 eggs)',
        price: 1850,
        county: 'Montserrado',
        town: 'Bensonville',
        desc: 'Clean, graded eggs collected daily from backyard layers. Demo listing for hackathon showcase.',
        img: '/src/assets/images/liberia_poultry_farm_1794996421585.jpg',
        avail: 'Limited Stock',
        consent: 1,
        views: 42,
      },
      {
        owner: 'demo-seed-5',
        seller: 'Bomi Aquaculture Pond (Demo)',
        farm: 'Tubmanburg Fish Ponds',
        cat: 'Fish and seafood',
        name: 'Fresh Pond-Raised Tilapia',
        qty: '45',
        unit: 'kg',
        price: 950,
        county: 'Bomi',
        town: 'Tubmanburg',
        desc: 'Healthy pond-raised tilapia harvested from clean earthen ponds. Packed in ice boxes on harvest day.',
        img: '/src/assets/images/liberia_aquaculture_pond_1794996421723.jpg',
        avail: 'Available',
        consent: 1,
        views: 31,
      },
      {
        owner: 'demo-seed-6',
        seller: 'Lofa Goat Herders (Demo)',
        farm: 'Kolahun Livestock Group',
        cat: 'Livestock',
        name: 'Healthy West African Dwarf Goats',
        qty: '6',
        unit: 'animal',
        price: 24000,
        county: 'Lofa',
        town: 'Voinjama',
        desc: 'Pasture-fed goats raised with sheltered housing and clean drinking water. Demo listing.',
        img: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg',
        avail: 'Limited Stock',
        consent: 1,
        views: 11,
      },
      {
        owner: 'demo-seed-7',
        seller: 'Grand Bassa Plantain Growers (Demo)',
        farm: 'Buchanan Growers Association',
        cat: 'Fruits and plantains',
        name: 'Green & Turning Cooking Plantains',
        qty: '30',
        unit: 'bunch',
        price: 1400,
        county: 'Grand Bassa',
        town: 'Buchanan',
        desc: 'Large, well-filled plantain bunches staked to prevent storm breakage. Farmer has not yet added a public contact number.',
        img: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
        avail: 'Available',
        consent: 0,
        views: 8,
      },
      {
        owner: 'demo-seed-8',
        seller: 'Suakoko Seed Supplier (Supplier · Demo)',
        farm: 'Suakoko Agro-Input Hub',
        cat: 'Seeds and seedlings',
        name: 'Clean Cassava Cuttings & Rice Seed Pack',
        qty: '40',
        unit: 'bundle',
        price: 1200,
        county: 'Bong',
        town: 'Suakoko',
        desc: 'Agricultural Supplier Demo: Disease-free cassava cuttings and tested upland rice seed packs for planting season.',
        img: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
        avail: 'Available',
        consent: 1,
        views: 23,
      },
      {
        owner: 'demo-seed-9',
        seller: 'Gbarnga Soil & Inputs Depot (Supplier · Demo)',
        farm: 'Bong Organic Soil Depot',
        cat: 'Agricultural supplies',
        name: 'Cured Organic Compost & Soil Starter Bags',
        qty: '35',
        unit: '25kg bag',
        price: 1650,
        county: 'Bong',
        town: 'Gbarnga',
        desc: 'Agricultural Supplier Demo: Aged poultry-litter compost bags and lime starter info for vegetable beds. Always pair with soil check.',
        img: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
        avail: 'Available',
        consent: 1,
        views: 16,
      },
      {
        owner: 'demo-seed-10',
        seller: 'Monrovia Agro-Tools Supply (Supplier · Demo)',
        farm: 'Red Light Farm Hardware',
        cat: 'Agricultural supplies',
        name: 'Knapsack Sprayer, Cutlass & Drying Tarpaulin Kit',
        qty: '15',
        unit: 'bundle',
        price: 6800,
        county: 'Montserrado',
        town: 'Paynesville',
        desc: 'Agricultural Supplier Demo: Heavy-duty drying tarpaulin, farm cutlass, and hand sprayer tools for clean harvest and weeding.',
        img: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
        avail: 'Available',
        consent: 1,
        views: 22,
      },
    ];

    let tilapiaListingId = 0;
    for (const item of sampleListings) {
      const ins = insertListing.run(
        item.owner,
        item.seller,
        item.farm,
        item.cat,
        item.name,
        item.qty,
        item.unit,
        item.price,
        item.county,
        item.town,
        item.desc,
        item.img,
        item.avail,
        item.consent,
        item.views
      );
      if (item.cat === 'Fish and seafood') {
        tilapiaListingId = Number(ins.lastInsertRowid);
      }
    }

    if (tilapiaListingId > 0) {
      db.prepare(
        `INSERT INTO marketplace_inquiries (
          listing_id, buyer_token, buyer_name, buyer_phone, buyer_county, message, status, farmer_reply, is_demo_inquiry
        ) VALUES (?, 'demo-buyer-seed', 'Monrovia Market Buyer (Demo)', '+231770000333', 'Montserrado', ?, 'New', '', 1)`
      ).run(
        tilapiaListingId,
        'Hello, I buy fresh tilapia every Friday for Duala Market. Can you supply 25 kg this week?'
      );
    }
  }

  // 2. Seed Local Language AI Lab Recordings (Bassa & Mano prioritized + English & Kpelle)
  const langCount = (db.prepare('SELECT COUNT(*) as cnt FROM local_language_recordings').get() as {cnt: number}).cnt;
  if (langCount === 0) {
    const insertRec = db.prepare(
      `INSERT INTO local_language_recordings (
        language_code, topic_slug, topic_label, question_text, answer_text,
        local_phrase_gloss, audio_data_url, speaker_name, consent_confirmed, review_status, is_sample_demo
      ) VALUES (?, ?, ?, ?, ?, ?, '', ?, 1, ?, 1)`
    );

    const recordings = [
      {
        lang: 'bas',
        slug: 'rice-cassava-farming',
        topic: 'Rice & Cassava Farming',
        q: 'Why are my cassava leaves turning yellow after heavy rain?',
        a: 'Check if rainwater is standing around the cassava mound. Open a small drainage trench so roots do not rot, and inspect under young leaves for small whiteflies.',
        gloss: 'Bassa Prototype Script (Consented Team Audio Demo — Fallback speech preview enabled until studio WAV upload)',
        speaker: 'Team 8 Bassa Contributor (Consented Demo)',
        status: 'reviewed',
      },
      {
        lang: 'bas',
        slug: 'soil-fertility',
        topic: 'Soil Fertility & Compost',
        q: 'How can I make poor sandy soil better without buying costly fertilizer?',
        a: 'Mix dry grass, kitchen peelings, and animal droppings into a shaded compost pile, turn it every two weeks, and add dark compost to planting beds before rain.',
        gloss: 'Bassa Prototype Script (Pending native speaker re-recording check)',
        speaker: 'Team 8 Bassa Contributor (Consented Demo)',
        status: 'pending_review',
      },
      {
        lang: 'man',
        slug: 'poultry-farming',
        topic: 'Poultry Farming',
        q: 'How do I keep young chicks warm and healthy during rainy nights?',
        a: 'Keep the poultry coop dry, block cold wind with woven mats or tarpaulin, use dry wood shavings on the floor, and wash water drinkers every morning.',
        gloss: 'Mano Prototype Script (Consented Team Audio Demo — Fallback speech preview enabled until studio WAV upload)',
        speaker: 'Team 8 Mano Contributor (Consented Demo)',
        status: 'reviewed',
      },
      {
        lang: 'man',
        slug: 'harvesting-storage',
        topic: 'Harvesting & Storage',
        q: 'How do I stop my harvested rice and corn from molding in storage?',
        a: 'Dry grains on raised mats or clean tarpaulins—never bare wet soil. Store only when kernels snap cleanly under your tooth, in sealed bags off the floor.',
        gloss: 'Mano Prototype Script (Consented Team Audio Demo)',
        speaker: 'Team 8 Mano Contributor (Consented Demo)',
        status: 'reviewed',
      },
      {
        lang: 'en',
        slug: 'fish-farming',
        topic: 'Fish Farming & Aquaculture',
        q: 'Why do pond fish come to the surface gasping early in the morning?',
        a: 'Early-morning gasping often signals low oxygen in pond water. Avoid overfeeding, remove uneaten feed, and let fresh clean water trickle gently into the pond.',
        gloss: 'Standard English Spoken Reference Recording',
        speaker: 'Team 8 Extension Audio Reference',
        status: 'reviewed',
      },
      {
        lang: 'kpe',
        slug: 'pest-disease',
        topic: 'Pest & Disease Prevention',
        q: 'What should I do when caterpillars eat inside my young corn?',
        a: 'Inspect the central funnel of young maize plants early morning. Hand-pick small egg clusters on small plots and consult an agricultural officer before any spray.',
        gloss: 'Kpelle Future Expansion Placeholder — Displays English guidance until community speaker recording is added',
        speaker: 'Future Kpelle Contributor Slot',
        status: 'pending_review',
      },
    ];

    for (const r of recordings) {
      insertRec.run(r.lang, r.slug, r.topic, r.q, r.a, r.gloss, r.speaker, r.status);
    }
  }

  // 3. Seed Simulated Expert Requests (so judges immediately see the live Expert Queue & workflow)
  const expCount = (db.prepare('SELECT COUNT(*) as cnt FROM demo_expert_requests').get() as {cnt: number}).cnt;
  if (expCount === 0) {
    const insertExp = db.prepare(
      `INSERT INTO demo_expert_requests (
        requester_token, farmer_name, category, county, title, description,
        status, assigned_expert_name, expert_reply, is_simulated_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );

    insertExp.run(
      'demo-seed-req-1',
      'Kortu Flomo (Demo Farmer)',
      'Poultry farming',
      'Bong',
      'Chicks huddling and sneezing after cool night rain',
      'Twelve 3-week-old chicks in my backyard coop started huddling together and breathing noisily after heavy rain last night.',
      'Answered',
      'Dr. Tarnue (Simulated Extension Queue)',
      'Check immediately for wet bedding or drafts entering the coop. Replace damp litter with dry wood shavings, keep clean warm water available, separate any weak chicks, and request an in-person veterinary officer check if breathing noise worsens.',
    );

    insertExp.run(
      'demo-seed-req-2',
      'Moses Toe (Demo Farmer)',
      'Fish farming and aquaculture',
      'Grand Bassa',
      'Green pond water turning dark brown after runoff',
      'Heavy runoff from nearby hillside entered my tilapia pond and turned the water cloudy brown.',
      'Assigned',
      'Aquaculture Desk (Simulated Extension Queue)',
      '',
    );
  }
  // Every listing carries a SELL reference (lookup number). Rows seeded here are created after migration 010 ran, so they get theirs now.
  db.prepare(
    "UPDATE marketplace_listings SET listing_code = 'SELL-' || substr(created_at, 1, 4) || '-' || printf('%06d', id) WHERE listing_code IS NULL"
  ).run();
}
