export interface KnowledgeArticle {
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  steps: string[];
  cautionNote: string;
  imageUrl: string;
}

export interface KnowledgeCategory {
  id: string;
  number: number;
  name: string;
  shortName: string;
  description: string;
  imageUrl: string;
  iconKey:
    | 'sprout'
    | 'layers'
    | 'package'
    | 'bug'
    | 'feather'
    | 'heart'
    | 'fish'
    | 'home'
    | 'cloud-rain'
    | 'warehouse'
    | 'store'
    | 'truck'
    | 'landmark'
    | 'wrench'
    | 'graduation'
    | 'shield';
  articles: KnowledgeArticle[];
}

export interface CommonProblemItem {
  id: string;
  question: string;
  categoryName: string;
  quickSummary: string;
  steps: string[];
  safetyDisclaimer: string;
}

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  {
    id: 'rice-cassava-maize-veg',
    number: 1,
    name: 'Rice, cassava, maize, and vegetable farming',
    shortName: 'Crops & Vegetables',
    description: 'Planting spacing, weeding timing, and crop rotation for Liberian staple and garden crops.',
    imageUrl: '/src/assets/images/crop_rice_1794924195882.jpg',
    iconKey: 'sprout',
    articles: [
      {
        id: 'art-1a',
        categoryId: 'rice-cassava-maize-veg',
        title: 'Spacing Upland Rice, Cassava & Maize for Stronger Yields',
        summary: 'Good spacing reduces fungal spread and makes weeding much easier.',
        steps: [
          'Plant cassava cuttings at about 1 meter by 1 meter on loose mounds or ridges so roots swell well.',
          'Plant maize in straight rows rather than crowded random holes to help sunlight reach every plant.',
          'Weed twice early—around 3 weeks and 8 weeks after planting—before weeds choke young roots.',
        ],
        cautionNote: 'Educational demonstration guide. Adjust spacing to your local variety and soil slope.',
        imageUrl: '/src/assets/images/crop_cassava_1794924193991.jpg',
      },
      {
        id: 'art-1b',
        categoryId: 'rice-cassava-maize-veg',
        title: 'Keeping Hot Pepper & Okra Productive',
        summary: 'Healthy raised beds and frequent picking extend harvest weeks.',
        steps: [
          'Build raised beds 20–30 cm high so heavy Liberian rain drains away from pepper stems.',
          'Pick tender okra pods every 2 to 3 days so the plant keeps producing fresh flowers.',
        ],
        cautionNote: 'Educational guide only. Wash hands after handling hot pepper seeds.',
        imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
      },
    ],
  },
  {
    id: 'soil-fertility-land-prep',
    number: 2,
    name: 'Soil fertility and land preparation',
    shortName: 'Soil & Land Prep',
    description: 'Composting, mulching, raised beds, and protecting topsoil from heavy rain runoff.',
    imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
    iconKey: 'layers',
    articles: [
      {
        id: 'art-2a',
        categoryId: 'soil-fertility-land-prep',
        title: 'Making Rich Farm Compost from Local Waste',
        summary: 'Turn dry grass, cassava peels, and poultry manure into dark soil food.',
        steps: [
          'Layer brown dry grass and leaves with green kitchen waste and well-aged animal droppings in a shaded heap.',
          'Keep the pile damp like a wrung-out sponge and turn it every 2 weeks for airflow.',
          'Mix dark, crumbly compost into planting holes 1–2 weeks before sowing.',
        ],
        cautionNote: 'Never put fresh, uncomposted manure directly against tender seedlings—it can burn roots.',
        imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
      },
    ],
  },
  {
    id: 'seeds-and-seedlings',
    number: 3,
    name: 'Seeds and seedlings',
    shortName: 'Seeds & Seedlings',
    description: 'Selecting vigorous cuttings, testing germination, and protecting nursery beds.',
    imageUrl: '/src/assets/images/crop_cassava_1794924193991.jpg',
    iconKey: 'package',
    articles: [
      {
        id: 'art-3a',
        categoryId: 'seeds-and-seedlings',
        title: 'Simple 10-Seed Germination Test Before Planting',
        summary: 'Check saved seed quality before wasting land preparation labor.',
        steps: [
          'Wrap 10 seeds in a damp clean cloth or tissue inside a shaded plate.',
          'Keep damp for 5 to 7 days and count how many sprout.',
          'If fewer than 7 sprout, plant thicker or source fresher seed from trusted cooperatives.',
        ],
        cautionNote: 'Does not certify seed genetics; verify certified seed sources through local agricultural offices.',
        imageUrl: '/src/assets/images/crop_rice_1794924195882.jpg',
      },
    ],
  },
  {
    id: 'pest-disease-management',
    number: 4,
    name: 'Pest and crop disease management',
    shortName: 'Pests & Diseases',
    description: 'Early scouting, field sanitation, and safe non-chemical first responses.',
    imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
    iconKey: 'bug',
    articles: [
      {
        id: 'art-4a',
        categoryId: 'pest-disease-management',
        title: 'Weekly Morning Field Scouting Routine',
        summary: 'Catch whiteflies, caterpillars, and leaf spots before they spread.',
        steps: [
          'Walk your plot early morning once or twice a week, turning over young leaves.',
          'Remove heavily diseased volunteer shoots early and avoid cutting cassava stems from twisted plants.',
          'Ask an extension officer before buying or mixing any chemical spray.',
        ],
        cautionNote: 'Team 8 never provides pesticide mixing dosages online. Always verify with a qualified officer.',
        imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
      },
    ],
  },
  {
    id: 'poultry-farming',
    number: 5,
    name: 'Poultry farming',
    shortName: 'Poultry Farming',
    description: 'Dry housing, clean water, chick warmth, and biosecurity for layers and broilers.',
    imageUrl: '/src/assets/images/liberia_poultry_farm_1794996421585.jpg',
    iconKey: 'feather',
    articles: [
      {
        id: 'art-5a',
        categoryId: 'poultry-farming',
        title: 'Keeping Backyard Chickens Healthy in Rainy Weather',
        summary: 'Dry bedding and clean drinkers prevent many common poultry losses.',
        steps: [
          'Keep coop roofs leak-free and raise floors slightly so rainwater never wets wood shavings.',
          'Wash water drinkers daily with clean water and keep feed off wet ground.',
          'Block strong night drafts around young chicks while keeping top airflow open.',
        ],
        cautionNote: 'Consult a veterinary officer for vaccination schedules and never dose antibiotics without guidance.',
        imageUrl: '/src/assets/images/liberia_poultry_farm_1794996421585.jpg',
      },
    ],
  },
  {
    id: 'livestock-management',
    number: 6,
    name: 'Cattle, goats, pigs, and livestock management',
    shortName: 'Livestock',
    description: 'Dry shelter, clean water, hoof care, and quarantine for newly purchased animals.',
    imageUrl: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg',
    iconKey: 'heart',
    articles: [
      {
        id: 'art-6a',
        categoryId: 'livestock-management',
        title: 'Simple Housing & Feeding Care for Goats and Pigs',
        summary: 'Raising animals off muddy ground lowers hoof rot and worm buildup.',
        steps: [
          'Build raised slatted or dry-floored shelters with shade from midday sun and rain.',
          'Provide fresh drinking water in clean troughs separate from manure areas.',
          'Keep newly brought-in animals separate for 2 weeks to watch for coughing or diarrhea.',
        ],
        cautionNote: 'Educational guide only. Seek a licensed veterinary officer for sick animals or medicine dosing.',
        imageUrl: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg',
      },
    ],
  },
  {
    id: 'fish-farming-aquaculture',
    number: 7,
    name: 'Fish farming and aquaculture',
    shortName: 'Fish Farming',
    description: 'Earthen pond dikes, water quality checks, feeding balance, and surface gasping response.',
    imageUrl: '/src/assets/images/liberia_aquaculture_pond_1794996421723.jpg',
    iconKey: 'fish',
    articles: [
      {
        id: 'art-7a',
        categoryId: 'fish-farming-aquaculture',
        title: 'Managing Tilapia & Catfish Pond Water Safely',
        summary: 'Prevent low oxygen stress and protect pond dikes from storm washouts.',
        steps: [
          'Check pond edges at dawn; if fish gasp at the surface, stop feeding and trickle fresh water over a splash board.',
          'Dig small diversion channels around upper banks so muddy rainwater runoff bypasses the pond.',
          'Feed fish at the same spot and time daily, and reduce feed if pellets remain uneaten after 20 minutes.',
        ],
        cautionNote: 'Do not use chemicals or wild toxins to clear ponds. Seek local aquaculture extension support.',
        imageUrl: '/src/assets/images/liberia_aquaculture_pond_1794996421723.jpg',
      },
    ],
  },
  {
    id: 'backyard-home-gardening',
    number: 8,
    name: 'Backyard and home gardening',
    shortName: 'Home Gardens',
    description: 'Growing greens, pepper, okra, and herbs in sacks, tires, or small compound beds.',
    imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
    iconKey: 'home',
    articles: [
      {
        id: 'art-8a',
        categoryId: 'backyard-home-gardening',
        title: 'Starting a Kitchen Garden in Sacks or Raised Beds',
        summary: 'Grow potato greens, okra, and pepper close to your kitchen.',
        steps: [
          'Fill perforated rice sacks or small wood-framed beds with topsoil mixed with compost.',
          'Place gardens where they receive 5–6 hours of sunlight and stay protected from free-roaming goats.',
          'Water at the root base early morning or late afternoon rather than midday heat.',
        ],
        cautionNote: 'Sample guide for household nutrition and backyard income.',
        imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
      },
    ],
  },
  {
    id: 'rainfall-planting-seasons',
    number: 9,
    name: 'Rainfall and planting seasons',
    shortName: 'Seasons & Rain',
    description: 'Preparing for heavy rainy months, unpredictable dry spells, and drainage planning.',
    imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
    iconKey: 'cloud-rain',
    articles: [
      {
        id: 'art-9a',
        categoryId: 'rainfall-planting-seasons',
        title: 'Farming When Rainfall Starts Late or Stops Unexpectedly',
        summary: 'Spread planting dates and protect soil moisture with mulch.',
        steps: [
          'Avoid planting your entire seed supply on a single early shower; plant in two staggered rounds.',
          'Cover bare soil between rows with dry grass mulch to slow evaporation during mid-season dry spells.',
          'Keep upland drainage channels and swamp spillways clear before heavy peak rains.',
        ],
        cautionNote: 'Team 8 does not invent live weather forecasts; always observe local skies and official radio advisories.',
        imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
      },
    ],
  },
  {
    id: 'harvesting-and-storage',
    number: 10,
    name: 'Harvesting and storage',
    shortName: 'Harvest & Storage',
    description: 'Preventing mold, rot, and weevil loss after harvest.',
    imageUrl: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
    iconKey: 'warehouse',
    articles: [
      {
        id: 'art-10a',
        categoryId: 'harvesting-and-storage',
        title: 'Stopping Harvest Spoilage After Picking',
        summary: 'Dry crops off bare ground and store in clean, raised, dry spaces.',
        steps: [
          'Dry harvested rice, maize, or pepper on raised mats or clean tarpaulins—never bare damp dirt.',
          'Sort out bruised or cracked roots and vegetables right away so rot does not spoil the rest.',
          'Stack grain bags on wooden pallets off cement floors and away from damp walls.',
        ],
        cautionNote: 'Never treat food grains with unapproved storage chemicals.',
        imageUrl: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
      },
    ],
  },
  {
    id: 'agricultural-markets-prices',
    number: 11,
    name: 'Agricultural markets and prices',
    shortName: 'Markets & Prices',
    description: 'Grading harvest, reducing middleman loss, and finding direct buyers.',
    imageUrl: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
    iconKey: 'store',
    articles: [
      {
        id: 'art-11a',
        categoryId: 'agricultural-markets-prices',
        title: 'Preparing Produce to Attract Fair Market Buyers',
        summary: 'Clean sorting, honest weights, and group selling strengthen farmer bargaining power.',
        steps: [
          'Remove stones, broken grains, and spoiled vegetables before packing bags or baskets.',
          'Agree on clear measurement units (50kg bag, basket, crate, or kg) before loading.',
          'List available harvest on the Team 8 Marketplace Prototype and compare offers from multiple town buyers.',
        ],
        cautionNote: 'Educational business guidance only—Team 8 does not publish verified daily market prices.',
        imageUrl: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
      },
    ],
  },
  {
    id: 'transportation-logistics',
    number: 12,
    name: 'Transportation and logistics',
    shortName: 'Transport & Roads',
    description: 'Protecting fragile harvest on rough feeder roads and pooling group transport.',
    imageUrl: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
    iconKey: 'truck',
    articles: [
      {
        id: 'art-12a',
        categoryId: 'transportation-logistics',
        title: 'Moving Harvest Safely on Bad Feeder Roads',
        summary: 'Better packing and shared community transport cut road bruising and fuel cost.',
        steps: [
          'Pack tomatoes, peppers, and plantains in rigid crates or lined baskets instead of crushing them in tall sacks.',
          'Travel during cooler early morning hours to reduce heat spoilage.',
          'Coordinate with 3–5 nearby farmers so one truck or motorbike trip carries pooled bags at lower cost per farmer.',
        ],
        cautionNote: 'Practical logistics tips; live transport dispatch is a Coming Soon platform feature.',
        imageUrl: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
      },
    ],
  },
  {
    id: 'finance-and-cooperatives',
    number: 13,
    name: 'Agricultural finance and cooperatives',
    shortName: 'Finance & Co-ops',
    description: 'Keeping simple farm records, village savings groups (Susu), and cooperative strength.',
    imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
    iconKey: 'landmark',
    articles: [
      {
        id: 'art-13a',
        categoryId: 'finance-and-cooperatives',
        title: 'Preparing Your Farm Group for Credit or Grants',
        summary: 'Simple notebooks and registered farmer groups open doors to fair finance.',
        steps: [
          'Write down every seed, labor, transport, and sale amount in a single farm notebook.',
          'Form or join a trusted community cooperative to buy tools in bulk and apply for group loans safely.',
          'Read loan interest rates and repayment dates carefully before signing any agreement.',
        ],
        cautionNote: 'Educational overview only—Team 8 does not issue loans or verify financial institutions.',
        imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
      },
    ],
  },
  {
    id: 'agricultural-equipment',
    number: 14,
    name: 'Agricultural equipment',
    shortName: 'Farm Tools',
    description: 'Caring for cutlasses, hoes, sprayers, and shared small processing tools.',
    imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
    iconKey: 'wrench',
    articles: [
      {
        id: 'art-14a',
        categoryId: 'agricultural-equipment',
        title: 'Cleaning & Storing Hand Tools and Knapsack Sprayers',
        summary: 'Proper tool care prevents rust and reduces disease transfer between fields.',
        steps: [
          'Scrape mud off hoes, cutlasses, and spades after work, dry them, and wipe metal lightly with oil.',
          'Keep separate clean knives for cutting healthy cassava planting stems.',
          'Triple-rinse shared sprayers safely away from wells, streams, and fish ponds.',
        ],
        cautionNote: 'Always store sharp tools and farm chemicals safely locked out of children’s reach.',
        imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
      },
    ],
  },
  {
    id: 'training-modern-methods',
    number: 15,
    name: 'Agricultural training and modern farming methods',
    shortName: 'Modern Training',
    description: 'Farmer field schools, demonstration plots, and step-by-step skill building.',
    imageUrl: '/src/assets/images/expert_agronomist_1794924193763.jpg',
    iconKey: 'graduation',
    articles: [
      {
        id: 'art-15a',
        categoryId: 'training-modern-methods',
        title: 'Learning New Farming Methods Without High Risk',
        summary: 'Test new spacing or seed varieties on one small corner plot before changing your whole farm.',
        steps: [
          'Set aside a small 10m × 10m test patch beside your regular field to compare new methods side by side.',
          'Listen to audio guides in Team 8 Smart Listen Mode together with your family or youth group.',
          'Ask local extension workers about district demonstration farm days.',
        ],
        cautionNote: 'Audio academy courses are part of our post-hackathon roadmap.',
        imageUrl: '/src/assets/images/expert_agronomist_1794924193763.jpg',
      },
    ],
  },
  {
    id: 'farm-safety-environment',
    number: 16,
    name: 'Farm safety and environmental protection',
    shortName: 'Safety & Land Care',
    description: 'Protecting waterways, reducing slash-and-burn soil damage, and keeping clear farm boundaries.',
    imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
    iconKey: 'shield',
    articles: [
      {
        id: 'art-16a',
        categoryId: 'farm-safety-environment',
        title: 'Protecting Farm Soil, Streams, and Boundaries',
        summary: 'Keep buffer grass near streams and plant living boundary trees around plots.',
        steps: [
          'Leave natural grass and tree strips along creek banks to prevent soil erosion and muddy runoff.',
          'Plant useful boundary crops or trees (such as palm, citrus, or fast-growing fence stakes) to mark plot borders clearly.',
          'Avoid burning crop residue excessively—compost or mulch stems back into the soil instead.',
        ],
        cautionNote: 'For land title or formal boundary disputes, consult county land authorities.',
        imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
      },
    ],
  },
];

export const COMMON_AGRICULTURAL_PROBLEMS: CommonProblemItem[] = [
  {
    id: 'prob-pests-diseases',
    question: 'How do I prevent pests and diseases?',
    categoryName: 'Pest and crop disease management',
    quickSummary: 'Start with clean planting stems/seeds, good spacing for airflow, and weekly early-morning leaf inspections.',
    steps: [
      'Inspect the underside of young leaves early every week so insects are caught early.',
      'Space crops properly and keep plot borders weeded so pests have fewer hiding places.',
      'Remove severely diseased volunteer plants quickly and consult an expert before spraying.',
    ],
    safetyDisclaimer: 'Educational guidance only—no pesticide dosages or diagnoses are prescribed here.',
  },
  {
    id: 'prob-poor-soil',
    question: 'How do I improve poor soil?',
    categoryName: 'Soil fertility and land preparation',
    quickSummary: 'Add well-rotted compost, mulch bare soil with dry grass, and rotate cereals with legumes like beans or groundnuts.',
    steps: [
      'Build a shaded compost heap from crop residue, dry leaves, and aged animal manure.',
      'Keep soil covered with mulch so heavy rain does not wash away rich topsoil.',
      'Rotate maize or upland rice with nitrogen-fixing cowpeas or groundnuts.',
    ],
    safetyDisclaimer: 'Soil laboratory testing requires a local agricultural office.',
  },
  {
    id: 'prob-quality-seeds',
    question: 'Where can I get quality seeds?',
    categoryName: 'Seeds and seedlings',
    quickSummary: 'Select healthy mother plants from your best harvest, test 10 seeds for germination, or check trusted district seed cooperatives.',
    steps: [
      'Mark vigorous, disease-free cassava or rice plants before harvest to save clean planting material.',
      'Run a 10-seed damp-cloth germination check before planting a full field.',
      'Look for cooperative seed listings in the Marketplace or ask county extension agents.',
    ],
    safetyDisclaimer: 'Team 8 does not certify seed vendors; inspect seed quality before purchase.',
  },
  {
    id: 'prob-agri-loans',
    question: 'How can I access agricultural loans?',
    categoryName: 'Agricultural finance and cooperatives',
    quickSummary: 'Keep simple written farm expense/sales logs and apply through registered farmer cooperatives or community Susu groups.',
    steps: [
      'Record every bag harvested, input bought, and sale earned in a notebook.',
      'Join or strengthen a registered local farmer cooperative for stronger group credibility.',
      'Verify interest terms and grace periods matching harvest dates before signing any loan.',
    ],
    safetyDisclaimer: 'Educational overview only—Team 8 does not provide credit or financial advice.',
  },
  {
    id: 'prob-harvest-spoilage',
    question: 'How do I prevent harvest spoilage?',
    categoryName: 'Harvesting and storage',
    quickSummary: 'Dry grains off bare damp soil, sort bruised crops immediately, and store in dry, raised, airtight containers.',
    steps: [
      'Dry rice, maize, and pepper on clean mats or raised racks rather than damp soil.',
      'Separate damaged or bruised produce so mold does not spread to healthy harvest.',
      'Keep storage sacks on wooden pallets off the floor in dry, airy rooms.',
    ],
    safetyDisclaimer: 'Never mix unapproved chemicals into stored food crops.',
  },
  {
    id: 'prob-buyers-prices',
    question: 'How can I find buyers and fair prices?',
    categoryName: 'Agricultural markets and prices',
    quickSummary: 'Clean and grade your harvest, agree on clear units, pool bags with neighbors, and post listings in the Marketplace.',
    steps: [
      'Clean, sort, and pack produce consistently so buyers trust your quality.',
      'Post your available quantity and county in the Team 8 Marketplace Prototype.',
      'Compare inquiries from multiple buyers before transporting produce.',
    ],
    safetyDisclaimer: 'Team 8 does not publish verified daily market prices or process payments.',
  },
  {
    id: 'prob-bad-roads',
    question: 'How can I transport produce on bad roads?',
    categoryName: 'Transportation and logistics',
    quickSummary: 'Use sturdy crates for soft crops, harvest early morning, and share transport trips with neighboring farmers.',
    steps: [
      'Pack delicate vegetables and plantains in lined baskets or rigid crates.',
      'Coordinate harvest days with nearby growers to split truck or kekeh/motorbike fares.',
      'Keep dry grains covered tightly with waterproof tarpaulins during rainy season travel.',
    ],
    safetyDisclaimer: 'Practical community guidance; live transport booking is planned post-hackathon.',
  },
  {
    id: 'prob-unpredictable-rain',
    question: 'How can I farm when rainfall is unpredictable?',
    categoryName: 'Rainfall and planting seasons',
    quickSummary: 'Stagger planting dates across 2–3 weeks, mulch beds to save water, and maintain clean drainage channels.',
    steps: [
      'Avoid planting all your seed after the very first light shower.',
      'Apply dry grass mulch around seedlings to hold moisture during dry spells.',
      'Clear perimeter drainage furrows before peak rainy months.',
    ],
    safetyDisclaimer: 'Team 8 does not generate weather forecasts; follow official local meteorological updates.',
  },
  {
    id: 'prob-protect-land',
    question: 'How do I protect my agricultural land?',
    categoryName: 'Farm safety and environmental protection',
    quickSummary: 'Prevent gully erosion with grass strips, protect stream banks, plant living boundary markers, and keep simple farm records.',
    steps: [
      'Plant contour grass strips on sloped land to slow rainwater runoff.',
      'Leave natural trees and brush along creeks and swamp edges.',
      'Plant clear living boundary trees and document community land agreements with local leaders.',
    ],
    safetyDisclaimer: 'Consult local land authorities for legal land registration or disputes.',
  },
  {
    id: 'prob-modern-techniques',
    question: 'How can I learn modern agricultural techniques?',
    categoryName: 'Agricultural training and modern farming methods',
    quickSummary: 'Use the Knowledge Center Listen Mode, test new practices on a small corner plot first, and join community demo days.',
    steps: [
      'Listen to step-by-step guides in Smart Listen Mode or the Local Language AI Lab.',
      'Try one new practice on a small 10m × 10m test patch beside your main crop.',
      'Use Ask an Expert to clarify questions before investing extra labor.',
    ],
    safetyDisclaimer: 'Structured audio courses are marked Coming Soon on our roadmap.',
  },
  {
    id: 'prob-when-to-plant',
    question: 'When should I plant different crops in Liberia?',
    categoryName: 'Rainfall and planting seasons',
    quickSummary: 'Most upland staple crops start as main rains stabilize (April–June), with second-season maize/cassava options around August–September.',
    steps: [
      'Upland rice & maize: commonly planted as steady rains arrive (April–May), with second-season maize in August–September.',
      'Cassava: planted during early rains (April–June) or late rainy season (August–September) on well-drained mounds.',
      'Vegetables (pepper, okra): start nurseries late dry season or early rains with careful watering and drainage.',
    ],
    safetyDisclaimer: 'Exact planting weeks vary across Liberia’s counties; confirm with local county extension staff.',
  },
];
