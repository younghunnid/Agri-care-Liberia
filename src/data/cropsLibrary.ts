export interface CropGuideEntry {
  slug: string;
  name: string;
  localNames: string;
  category: 'Staple Grains' | 'Root & Tuber Crops' | 'Garden Vegetables' | 'Perennial & Legumes';
  summary: string;
  imageUrl: string;
  plantingWindow: string;
  marketplaceCategory: string;
  marketplaceQuery: string;
  overview: string;
  plantingInfo: string[];
  soilRequirements: string[];
  waterManagement: string[];
  commonPestsDiseases: string[];
  cropMaintenance: string[];
  harvestingInfo: string[];
  storageGuidance: string[];
  safetyDisclaimer: string;
}

export const CROPS_LIBRARY: CropGuideEntry[] = [
  {
    slug: 'rice',
    name: 'Rice',
    localNames: 'Upland & Swamp Rice · Malo / Su',
    category: 'Staple Grains',
    summary: 'Liberia’s primary staple grain grown on upland slopes and inland valley swamps across all 15 counties.',
    imageUrl: '/src/assets/images/crop_rice_1794924195882.jpg',
    plantingWindow: 'April–June (Upland) · May–August (Swamp)',
    marketplaceCategory: 'Rice and grains',
    marketplaceQuery: 'rice',
    overview:
      'Rice feeds households across Liberia. Improving seed selection, early weeding, bund leveling in swamps, and clean drying after harvest can lift usable grain yields significantly.',
    plantingInfo: [
      'Run a simple 10-seed damp-cloth germination check before sowing saved rice seed.',
      'Plant upland rice in rows or neat dibbled hills as steady rains arrive (April–May) rather than scattering unevenly.',
      'In inland swamps, transplant healthy 21-day-old seedlings at 20 cm × 20 cm spacing for stronger tillers.',
    ],
    soilRequirements: [
      'Upland plots prefer well-drained loamy soil mixed with composted weeds rather than burned bare ash.',
      'Swamp plots benefit from leveled mud bunds that hold even shallow water without washing away topsoil.',
    ],
    waterManagement: [
      'Keep swamp bunds repaired before peak August–September rains so floodwater does not submerge young plants.',
      'In upland fields, mulch between rows or leave contour grass strips on slopes to keep rainwater soaking in.',
    ],
    commonPestsDiseases: [
      'Watch for brown leaf spots, stem borers (dead central shoots), and rice birds near heading time.',
      'Remove diseased volunteer grasses on field borders and verify any severe yellowing with an extension officer.',
    ],
    cropMaintenance: [
      'Weed thoroughly at 3 weeks and again around 7–8 weeks after planting before panicles form.',
      'Inspect field dikes weekly after storms to patch small crab holes or water leaks early.',
    ],
    harvestingInfo: [
      'Harvest when about 80–85% of grains on the panicle turn golden straw-colored and feel firm.',
      'Avoid delaying harvest past full maturity to cut shattering loss and bird damage.',
    ],
    storageGuidance: [
      'Dry threshed paddy on raised mats or clean tarpaulins—never directly on bare damp earth or dusty roads.',
      'Store dry rice in clean sacks stacked on wooden pallets away from damp walls and roof leaks.',
    ],
    safetyDisclaimer:
      'Educational demonstration guide. Always check county planting dates and consult an agricultural officer before applying chemical sprays.',
  },
  {
    slug: 'cassava',
    name: 'Cassava',
    localNames: 'Cassava · Kpokpo',
    category: 'Root & Tuber Crops',
    summary: 'Liberia’s most resilient root crop, providing food security and income from fresh roots, gari, and fufu.',
    imageUrl: '/src/assets/images/crop_cassava_1794924193991.jpg',
    plantingWindow: 'April–June or August–September',
    marketplaceCategory: 'Cassava and root crops',
    marketplaceQuery: 'cassava',
    overview:
      'Cassava tolerates poor soils better than most crops, yet clean stem selection, 1m × 1m mound spacing, and drainage protect roots from mosaic curl and rot.',
    plantingInfo: [
      'Cut 20–25 cm planting stakes only from healthy middle stems of vigorous mother plants—never twisted or yellow-mottled stems.',
      'Plant stakes slanted or upright on loose mounds or ridges spaced roughly 1 meter by 1 meter.',
    ],
    soilRequirements: [
      'Prefers loose, sandy-loam mounds at least 25 cm high so heavy rains never waterlog swelling roots.',
      'Add decomposed grass compost into tired plots rather than planting continuously on depleted soil.',
    ],
    waterManagement: [
      'Cassava hates standing water; dig shallow perimeter drainage channels around low fields.',
      'Mulch mound tops lightly during short dry breaks right after planting to help shoots sprout evenly.',
    ],
    commonPestsDiseases: [
      'Cassava Mosaic patterns (yellow/green patchy curled leaves), whiteflies under young leaves, and root rot in wet clay.',
      'Uproot badly mosaic-twisted young plants early so insects do not carry infection across your field.',
    ],
    cropMaintenance: [
      'Keep fields weed-free during the first 3 months until the leafy canopy shades the ground.',
      'Keep knives clean when cutting planting stakes from different plots.',
    ],
    harvestingInfo: [
      'Most Liberian varieties mature in 9 to 12 months depending on variety and rainfall.',
      'Lift roots carefully after rain softens soil to reduce bruised or broken tubers.',
    ],
    storageGuidance: [
      'Fresh cassava spoils within 2–3 days once uprooted; harvest only what you can sell, eat, or process right away.',
      'Process surplus roots quickly into dry gari, starch, or clean dried chips stored in moisture-proof bags.',
    ],
    safetyDisclaimer:
      'Educational guide only. Do not use unverified pesticides; consult an extension agent for certified mosaic-tolerant cuttings.',
  },
  {
    slug: 'maize',
    name: 'Maize',
    localNames: 'Corn · Maize',
    category: 'Staple Grains',
    summary: 'Fast-maturing cereal grown as roasted fresh corn or dry grain, often intercropped with cassava or cowpeas.',
    imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
    plantingWindow: 'April–May & August–September',
    marketplaceCategory: 'Rice and grains',
    marketplaceQuery: 'maize',
    overview:
      'Maize grows quickly in 90–110 days and pairs well with legumes or young cassava when rows receive full sunlight and timely weeding.',
    plantingInfo: [
      'Plant 2 seeds per hole at 75 cm between rows and 40–50 cm between plants, thinning weak seedlings early.',
      'Intercrop with cowpeas or groundnuts between maize rows to protect soil and boost household protein.',
    ],
    soilRequirements: [
      'Needs fertile, well-drained loam rich in organic compost or aged poultry manure mixed into soil before planting.',
      'Avoid planting maize repeatedly on the exact same bare slope without rotating legumes.',
    ],
    waterManagement: [
      'Water stress during tasseling and cob filling shrinks grain size; stagger planting across two rounds if rains are erratic.',
      'Drain low spots after heavy rain so young maize leaves do not turn pale yellow from wet roots.',
    ],
    commonPestsDiseases: [
      'Fall armyworm caterpillars feeding inside young leaf whorls, stem borers, and cob mold when rain hits mature husks.',
      'Scout early morning once a week; crush tiny egg masses on small plots and consult an advisor before buying inputs.',
    ],
    cropMaintenance: [
      'Earth up soil slightly around the base of stems at 4 weeks to help tall stalks resist wind.',
      'Remove striga or thick grassy weeds early before tassels emerge.',
    ],
    harvestingInfo: [
      'Harvest fresh roasting corn when silks turn brown and kernels release milky juice.',
      'For dry grain, harvest once husks turn dry brown and kernels resist fingernail denting.',
    ],
    storageGuidance: [
      'Dry cobs and shelled kernels cleanly off the ground until hard.',
      'Store thoroughly dried maize in clean airtight containers or triple-layer sacks away from weevils.',
    ],
    safetyDisclaimer:
      'Educational advice only. Never mix unapproved storage chemicals with food corn.',
  },
  {
    slug: 'pepper',
    name: 'Pepper',
    localNames: 'Hot Pepper · Kpɛɛ / Chili',
    category: 'Garden Vegetables',
    summary: 'High-demand market and kitchen vegetable thriving on raised beds with steady drainage and clean nursery starts.',
    imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
    plantingWindow: 'February–April (Nursery) · Early Rains',
    marketplaceCategory: 'Vegetables',
    marketplaceQuery: 'pepper',
    overview:
      'Hot pepper brings steady cash income for Liberian women and youth growers when raised nurseries and drained beds stop damping-off and wilt.',
    plantingInfo: [
      'Start seeds in a shaded, raised nursery bed of fine sifted topsoil mixed with well-rotted compost.',
      'Transplant sturdy seedlings (4–5 leaves) in the cool late afternoon at 60 cm × 60 cm spacing.',
    ],
    soilRequirements: [
      'Raise main garden beds 25–30 cm high so heavy Liberian downpours drain fast away from tender pepper collars.',
      'Mix cured compost into beds 1 week before transplanting.',
    ],
    waterManagement: [
      'Water gently at root bases rather than splashing mud onto lower leaves.',
      'Mulch bed tops with dry grass to prevent soil splash and conserve moisture.',
    ],
    commonPestsDiseases: [
      'Aphids, whiteflies, leaf curl, bacterial wilt, and anthracnose fruit spots.',
      'Remove and dispose of curled virus plants away from the garden and wash hands before touching healthy seedlings.',
    ],
    cropMaintenance: [
      'Stake heavy branching pepper plants with light wooden sticks to keep ripe fruit off wet dirt.',
      'Keep garden borders weeded to reduce hiding spots for sucking insects.',
    ],
    harvestingInfo: [
      'Pick peppers gently with stems attached every 4–5 days during cool morning hours.',
      'Sort cracked or soft fruit immediately from firm market peppers.',
    ],
    storageGuidance: [
      'Keep fresh peppers shaded in ventilated woven baskets—never tightly sealed plastic sacks in hot sun.',
      'Surplus ripe pepper can be cleanly sun-dried on raised screens for off-season sale.',
    ],
    safetyDisclaimer:
      'Educational guidance only. Wear gloves or wash hands thoroughly after handling hot pepper.',
  },
  {
    slug: 'okra',
    name: 'Okra',
    localNames: 'Okro · Gumbo',
    category: 'Garden Vegetables',
    summary: 'Fast-growing, nutritious Liberian garden staple producing pods within 50–60 days when picked regularly.',
    imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
    plantingWindow: 'March–June & Late Rains',
    marketplaceCategory: 'Vegetables',
    marketplaceQuery: 'okra',
    overview:
      'Okra grows reliably in backyard beds and market gardens with minimal inputs when seeds are pre-soaked and pods are picked tender every few days.',
    plantingInfo: [
      'Soak okra seeds in clean room-temperature water overnight (8–12 hours) to speed up germination.',
      'Sow 2 seeds per hill at 60 cm × 45 cm spacing and thin to the strongest seedling.',
    ],
    soilRequirements: [
      'Grows in most warm Liberian soils when loosened 20 cm deep and enriched with compost.',
      'Avoid acidic waterlogged clay hollows.',
    ],
    waterManagement: [
      'Needs steady moisture while flowering and setting pods; mulch lightly around stems.',
      'Avoid overhead watering late at night to cut powdery leaf mildew.',
    ],
    commonPestsDiseases: [
      'Flea beetles chewing tiny holes in leaves, aphids, and powdery white patches on older leaves.',
      'Encourage airflow with proper spacing and clear badly yellowed lower leaves.',
    ],
    cropMaintenance: [
      'Weed lightly around shallow roots and add a handful of compost when flowering starts.',
    ],
    harvestingInfo: [
      'Cut tender pods (7–10 cm long) every 2 to 3 days using a clean knife—leaving woody pods stops new flowers.',
    ],
    storageGuidance: [
      'Keep picked okra cool in open shaded baskets and bring to local market within 24–48 hours for peak quality.',
    ],
    safetyDisclaimer: 'Educational guidance only.',
  },
  {
    slug: 'tomatoes',
    name: 'Tomatoes',
    localNames: 'Tomato · Bitterball-family Garden Crop',
    category: 'Garden Vegetables',
    summary: 'High-value vegetable requiring raised drainage, staking, and leaf-splash protection during rainy months.',
    imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
    plantingWindow: 'Late Rains / Dry Season Beds (Oct–Mar) or Sheltered Beds',
    marketplaceCategory: 'Vegetables',
    marketplaceQuery: 'tomato',
    overview:
      'Tomatoes reward careful growers in Liberia, especially during drier months or under simple rain shelters that keep wet blight off foliage.',
    plantingInfo: [
      'Raise healthy seedlings in clean nursery boxes for 3–4 weeks before transplanting in cool evening hours.',
      'Space plants 60–75 cm apart so air moves freely through branches.',
    ],
    soilRequirements: [
      'Needs deep, well-drained sandy loam with generous compost; avoid planting where pepper or eggplant wilted last season.',
    ],
    waterManagement: [
      'Water consistently at the soil surface—irregular dry-to-wet cycles crack fruit and cause blossom-end rot.',
      'Never wet leaves unnecessarily.',
    ],
    commonPestsDiseases: [
      'Early/late blight leaf spots in wet weather, bacterial wilt, and fruitworms.',
      'Staking and dry grass mulch dramatically reduce soil-splashed leaf disease.',
    ],
    cropMaintenance: [
      'Tie main stems loosely to sturdy bamboo or wood stakes and trim lower leaves touching soil.',
    ],
    harvestingInfo: [
      'Pick tomatoes at breaker (pink-orange) stage if traveling long feeder roads so fruit arrives firm.',
    ],
    storageGuidance: [
      'Pack in shallow rigid crates or padded baskets lined with clean leaves—never crush in deep sacks.',
    ],
    safetyDisclaimer:
      'Educational guidance only. Consult an extension officer before applying any fungicide.',
  },
  {
    slug: 'plantain',
    name: 'Plantain',
    localNames: 'Plantain · Banana Family',
    category: 'Perennial & Legumes',
    summary: 'Year-round perennial food and market crop well-suited to Liberia’s humid forest zones and compound plots.',
    imageUrl: '/src/assets/images/liberia_agri_market_1794996422856.jpg',
    plantingWindow: 'Start of Rains (April–June)',
    marketplaceCategory: 'Fruits and plantains',
    marketplaceQuery: 'plantain',
    overview:
      'Clean suckers, deep composted planting holes, desuckering to 2–3 stems per mat, and wind propping protect heavy bunches until harvest.',
    plantingInfo: [
      'Pare away darkened roots and outer skin on sword suckers before planting to reduce weevil transfer.',
      'Dig wide 45 cm × 45 cm holes enriched with compost and space mats 3 meters apart.',
    ],
    soilRequirements: [
      'Thrives in deep, moist, organic-rich loamy soil with rich mulch around the base.',
    ],
    waterManagement: [
      'Thick leaf and dry-grass mulch around mats feeds roots and holds moisture through dry-season months.',
    ],
    commonPestsDiseases: [
      'Banana root weevils, nematodes, and black sigatoka leaf streaks.',
      'Trim dry hanging leaves neatly to slow fungal spread and keep old cut stems away from healthy mats.',
    ],
    cropMaintenance: [
      'Leave only 1 mother stem, 1 medium follower, and 1 small peeper per mat so bunches grow large.',
      'Prop fruiting stems with forked poles before storms snap heavy bunches.',
    ],
    harvestingInfo: [
      'Harvest when fingers fill out and edges round smoothly (typically 10–14 months after planting).',
    ],
    storageGuidance: [
      'Handle bunches gently in shaded cool areas; bruising triggers premature blackening on feeder roads.',
    ],
    safetyDisclaimer: 'Educational guidance only.',
  },
  {
    slug: 'sweet-potatoes',
    name: 'Sweet Potatoes',
    localNames: 'Sweet Potato · Potato Greens',
    category: 'Root & Tuber Crops',
    summary: 'Dual-purpose Liberian staple yielding nutritious potato greens for daily sauce and fast tubers in 3–4 months.',
    imageUrl: '/src/assets/images/crop_cassava_1794924193991.jpg',
    plantingWindow: 'April–September on Raised Ridges',
    marketplaceCategory: 'Cassava and root crops',
    marketplaceQuery: 'potato',
    overview:
      'Sweet potatoes cover bare soil rapidly to fight weeds, yield harvestable greens within weeks, and produce storage roots in 90–120 days.',
    plantingInfo: [
      'Plant fresh 30 cm vine tip cuttings (free of weevil holes) along well-built ridges spaced 75–90 cm apart.',
      'Bury 2–3 stem nodes into moist ridge soil leaving tip leaves exposed.',
    ],
    soilRequirements: [
      'Loose sandy-loam ridges allow roots to expand cleanly; heavy wet clay causes misshapen tubers.',
    ],
    waterManagement: [
      'Needs steady moisture the first 6 weeks while roots form, then drier conditions near harvest so tubers stay sweet.',
    ],
    commonPestsDiseases: [
      'Sweet potato weevils burrowing into exposed roots when soil cracks open in dry spells.',
      'Hill loose soil back over cracks around ridges and rotate plots each season.',
    ],
    cropMaintenance: [
      'If harvesting potato greens for cooking, cut only scattered side tips lightly so root growth remains strong.',
    ],
    harvestingInfo: [
      'Dig carefully 3.5 to 4 months after planting when leaves begin yellowing slightly.',
    ],
    storageGuidance: [
      'Cure undamaged tubers in a shaded airy spot for 4–5 days so skins toughen before storing in dry baskets.',
    ],
    safetyDisclaimer: 'Educational guidance only.',
  },
  {
    slug: 'groundnuts',
    name: 'Groundnuts & Cowpeas',
    localNames: 'Peanut · Groundnut / Beans',
    category: 'Perennial & Legumes',
    summary: 'Soil-building legume crops that add natural nitrogen back to tired upland farms while yielding high-protein food.',
    imageUrl: '/src/assets/images/hero_liberia_farm_1794924193363.jpg',
    plantingWindow: 'April–May or August–September',
    marketplaceCategory: 'Rice and grains',
    marketplaceQuery: 'seed',
    overview:
      'Rotating groundnuts or cowpeas after rice, maize, or cassava helps rebuild poor soil fertility naturally and reduces weeding pressure.',
    plantingInfo: [
      'Shell groundnut seeds carefully just before planting so seed coats stay unbroken.',
      'Plant in clean weeded beds or ridges at 30–40 cm spacing.',
    ],
    soilRequirements: [
      'Groundnuts need loose, crumbly topsoil so flower pegs can push underground to form pods.',
    ],
    waterManagement: [
      'Good drainage prevents pod rot during heavy rains.',
    ],
    commonPestsDiseases: [
      'Rosette leaf curl spread by aphids and pod mold if harvested late in wet mud.',
      'Early planting at proper density helps canopy cover quickly and lowers aphid spread.',
    ],
    cropMaintenance: [
      'Weed carefully early, then avoid disturbing soil after yellow flowers send pegs into the ground.',
    ],
    harvestingInfo: [
      'Pull sample plants to check inside shells—harvest when inner shell walls show dark speckling and kernels are plump.',
    ],
    storageGuidance: [
      'Dry pods thoroughly on raised clean racks immediately after harvest to prevent dangerous aflatoxin mold.',
    ],
    safetyDisclaimer:
      'Discard any visibly moldy or discolored groundnuts—never feed moldy nuts to people or poultry.',
  },
];
