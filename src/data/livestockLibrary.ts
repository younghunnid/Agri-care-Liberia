export interface LivestockGuideEntry {
  slug: string;
  name: string;
  subtitle: string;
  summary: string;
  imageUrl: string;
  marketplaceCategory: string;
  marketplaceQuery: string;
  careGuide: string[];
  feedingEducation: string[];
  housingSanitation: string[];
  welfareGuidance: string[];
  breedingInfo: string[];
  diseasePrevention: string[];
  vetReferralNote: string;
}

export const LIVESTOCK_LIBRARY: LivestockGuideEntry[] = [
  {
    slug: 'poultry',
    name: 'Poultry (Broilers & Layers)',
    subtitle: 'Backyard & small-scale chicken management',
    summary: 'Dry bedding, clean daily drinkers, chick warmth, and strict visitor hygiene cut common poultry losses.',
    imageUrl: '/src/assets/images/liberia_poultry_farm_1794996421585.jpg',
    marketplaceCategory: 'Poultry and eggs',
    marketplaceQuery: 'egg',
    careGuide: [
      'Observe flock alertness, droppings, and water intake first thing every morning before letting birds move around.',
      'Keep chicks, growers, and older adult hens in separate pens so younger birds are not bullied or exposed to germs.',
    ],
    feedingEducation: [
      'Provide clean fresh drinking water all day—birds stop eating quickly if drinkers run empty or smell sour.',
      'Never feed damp, clumped, or moldy mash; store feed sacks on wooden pallets away from roof leaks.',
    ],
    housingSanitation: [
      'Build poultry coops raised slightly above rainwater runoff with overhang eaves and wire mesh airflow.',
      'Keep wood shavings dry; scoop out wet patches around drinkers immediately and disinfect empty pens between batches.',
    ],
    welfareGuidance: [
      'Avoid overcrowding so birds have space to reach feed troughs, rest comfortably, and stay cool at midday.',
      'Shield young chicks from cold night drafts with clean tarpaulins or woven curtains while keeping top vents open.',
    ],
    breedingInfo: [
      'For local dual-purpose flocks, keep 1 vigorous healthy rooster per 8–10 hens and collect clean hatching eggs daily.',
      'Do not breed closely related birds season after season—exchange healthy breeding roosters with trusted neighbors.',
    ],
    diseasePrevention: [
      'Place a shallow disinfectant footbath at the coop door and limit outside traders from walking inside pens.',
      'Isolate any sluggish, sneezing, or ruffled bird in a separate recovery pen right away.',
    ],
    vetReferralNote:
      'Team 8 does not prescribe poultry antibiotics or vaccine dosages. Contact a licensed county livestock/veterinary officer for vaccination schedules or sudden flock illness.',
  },
  {
    slug: 'goats',
    name: 'Goats',
    subtitle: 'West African Dwarf goats & smallholder herds',
    summary: 'Raised slatted shelters, dry hoof care during rainy months, and clean pasture rotation protect goats from worms and pneumonia.',
    imageUrl: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg',
    marketplaceCategory: 'Livestock',
    marketplaceQuery: 'goat',
    careGuide: [
      'Check hooves, eyes, and breathing daily—healthy goats stay curious, chew cud calmly, and have shiny coats.',
      'Keep newly bought goats separate from your existing herd for at least 14 days before mixing.',
    ],
    feedingEducation: [
      'Offer diverse browse leaves, clean grass, cassava peelings (thoroughly dried first), and clean mineral salt blocks.',
      'Provide fresh water in raised troughs rather than muddy ground puddles where parasites gather.',
    ],
    housingSanitation: [
      'Build raised wooden slatted pens 60–90 cm off the ground so droppings fall through and rain mud stays below hooves.',
      'Sweep dung from under shelters regularly into compost pits away from living troughs.',
    ],
    welfareGuidance: [
      'Never tether goats in heavy rain or hot midday sun without shade, water, and dry ground.',
      'Move tethered goats carefully to fresh clean pasture strips rather than grazing the same soiled spot every day.',
    ],
    breedingInfo: [
      'Wait until young does reach good body growth (typically 8–10 months) before first mating so kids are born strong.',
      'Provide pregnant does clean dry bedding and extra browse leaves in the final month before kidding.',
    ],
    diseasePrevention: [
      'Trim overgrown hooves gently and inspect between toes during peak rainy months to prevent painful hoof rot.',
      'Watch closely for coughing, nasal discharge, or severe diarrhea (scours) and separate sick goats early.',
    ],
    vetReferralNote:
      'Consult a licensed veterinary officer for deworming timing, PPR vaccination programs, and safe animal treatment.',
  },
  {
    slug: 'cattle',
    name: 'Cattle',
    subtitle: 'Pasture care, kraal hygiene & herd health',
    summary: 'Rotated grazing paddocks, clean watering points, shade shelters, and tick checks maintain strong herd condition.',
    imageUrl: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg',
    marketplaceCategory: 'Livestock',
    marketplaceQuery: 'cattle',
    careGuide: [
      'Inspect herds daily for limping, unusual salivation, eye discharge, or ticks around ears and udders.',
      'Use calm, low-stress handling races or crushes rather than chasing or beating animals.',
    ],
    feedingEducation: [
      'Rotate grazing areas so pasture grass recovers and worm larvae die down between grazing cycles.',
      'Provide clean drinking troughs separate from streams that villages use for household water.',
    ],
    housingSanitation: [
      'Locate night kraals on slightly sloped, well-drained ground rather than deep wet hollows.',
      'Rotate kraal sites or scrape manure cleanly so mud does not trap hooves.',
    ],
    welfareGuidance: [
      'Ensure shaded resting trees or simple roofed shelters during intense dry-season sun.',
      'Keep newborn calves dry and ensure they nurse colostrum within the first hours of life.',
    ],
    breedingInfo: [
      'Keep simple written birth and breeding records to avoid inbreeding and track strong milk/beef mothers.',
      'Ensure cows maintain healthy body condition before re-breeding.',
    ],
    diseasePrevention: [
      'Quarantine newly purchased cattle for 2–3 weeks and inspect regularly for external ticks.',
      'Protect community crop farms with sturdy living fences or supervised herding to prevent farmer-herder disputes.',
    ],
    vetReferralNote:
      'Never administer injectable medicines without guidance from a certified veterinary officer.',
  },
  {
    slug: 'pigs',
    name: 'Pigs',
    subtitle: 'Clean pens, heat protection & safe feeding',
    summary: 'Sloped concrete or clean raised floors, cool shade, and boiled/clean feed keep pig herds healthy and fast-growing.',
    imageUrl: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg',
    marketplaceCategory: 'Livestock',
    marketplaceQuery: 'pig',
    careGuide: [
      'Pigs cannot sweat well—provide deep shade and clean drinking water at all hours so they do not overheat.',
      'Observe appetite at each meal; a pig refusing feed is an early sign to check temperature and separation.',
    ],
    feedingEducation: [
      'Feed balanced mixtures of rice bran, maize meal, palm kernel cake, and safe cooked scraps—never spoiled moldy garbage.',
      'If feeding kitchen or market scraps, boil thoroughly and cool before serving to prevent fever spread.',
    ],
    housingSanitation: [
      'Sloped pens drained into a covered waste pit make daily washing quick and keep sleeping corners dry.',
      'Strictly restrict outside visitors and boots from entering pig sties to prevent African Swine Fever spread.',
    ],
    welfareGuidance: [
      'Provide dry straw or clean sleeping boards in farrowing pens so newborn piglets stay warm and uncrushed.',
      'Ensure troughs are wide enough that smaller pigs are not pushed out at mealtime.',
    ],
    breedingInfo: [
      'Allow gilts to reach full body maturity before breeding and separate pregnant sows quietly before farrowing.',
      'Provide creep warmth corners for newborn piglets during rainy nights.',
    ],
    diseasePrevention: [
      'Wash boots, wheelbarrows, and tools before moving between pens, and never bring meat scraps into pig areas.',
      'Report sudden high fever or multiple sudden deaths immediately to county veterinary officers.',
    ],
    vetReferralNote:
      'Consult a licensed veterinary specialist for iron support, vaccinations, and safe treatment plans.',
  },
  {
    slug: 'sheep',
    name: 'Sheep',
    subtitle: 'Dry shelter, grazing rotation & lamb care',
    summary: 'Clean dry sleeping sheds, gentle pasture rotation, and careful wet-season hoof checks keep sheep thriving.',
    imageUrl: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg',
    marketplaceCategory: 'Livestock',
    marketplaceQuery: 'goat',
    careGuide: [
      'Check fleece/coat and hooves regularly for burrs, ticks, or wet-season foot soreness.',
      'Handle sheep calmly as a group—sheep get stressed easily if isolated alone.',
    ],
    feedingEducation: [
      'Sheep graze closer to the ground than goats, making clean rotated pastures critical for avoiding stomach worms.',
      'Supplement dry-season grass with safe hay, dried legume vines, and clean water.',
    ],
    housingSanitation: [
      'Keep sheep sleeping sheds dry, raised above floodwater, and free from sharp protruding nails.',
    ],
    welfareGuidance: [
      'Ensure newborn lambs are dried, warm, and nursing cleanly within the first hour after birth.',
    ],
    breedingInfo: [
      'Keep healthy unrelated rams and separate young lambs gradually at weaning to protect ewe recovery.',
    ],
    diseasePrevention: [
      'Avoid grazing low marshy mud right after sunrise when parasite larvae sit high on wet grass tips.',
    ],
    vetReferralNote:
      'Contact a veterinary officer for herd vaccination programs and suspected parasitic anemia.',
  },
  {
    slug: 'fish-farming',
    name: 'Fish Farming & Aquaculture',
    subtitle: 'Tilapia & catfish pond management',
    summary: 'Diverting muddy storm runoff, feeding cleanly at fixed spots, and acting quickly at dawn surface gasping protect pond harvests.',
    imageUrl: '/src/assets/images/liberia_aquaculture_pond_1794996421723.jpg',
    marketplaceCategory: 'Fish and seafood',
    marketplaceQuery: 'tilapia',
    careGuide: [
      'Walk pond dikes early every morning (6:00–7:00 AM) when pond oxygen is lowest to watch fish behavior.',
      'Keep simple logs of fingerling stocking date, pond size, and daily feed amount.',
    ],
    feedingEducation: [
      'Feed fish at the same corner and time each day; watch closely for 15–20 minutes and reduce rations if feed floats uneaten.',
      'Store fish feed in cool, dry, sealed drums so mold toxins never enter ponds.',
    ],
    housingSanitation: [
      'Build sturdy sloped pond dikes planted with low binding grass to prevent rainy-season collapse.',
      'Dig storm diversion trenches around upper hillsides so red muddy runoff bypasses fish ponds.',
    ],
    welfareGuidance: [
      'Avoid overcrowding fingerlings beyond pond aeration capacity and handle fish wet and gently during sampling.',
      'Fit fine screen meshes over water inlets and overflow pipes to stop wild predator fish from entering.',
    ],
    breedingInfo: [
      'Source vigorous, uniform-sized fingerlings from reputable hatcheries so tilapia do not stunt from early over-breeding.',
    ],
    diseasePrevention: [
      'If fish gasp at the surface at dawn, stop feeding immediately, trickle fresh clean water over a splash board, and stir surface water gently.',
      'Never dump household soap, farm chemicals, or wild plant poisons near pond banks.',
    ],
    vetReferralNote:
      'Seek county aquaculture extension specialists for pond liming advice or unexplained fish mortality.',
  },
];
