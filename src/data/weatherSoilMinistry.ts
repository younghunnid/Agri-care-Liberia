export interface CountyWeatherSample {
  county: string;
  region: string;
  tempMinC: number;
  tempMaxC: number;
  humidityPct: number;
  rainfallMm7d: number;
  conditionSummary: string;
  riskLevel: 'Low' | 'Moderate' | 'Elevated Rain Risk';
  riskNotice: string;
  plantingGuidance: string;
  recommendedCropSlugs: string[];
  forecast3Day: Array<{day: string; condition: string; tempRange: string; rainNote: string}>;
}

export const SAMPLE_COUNTY_WEATHER: CountyWeatherSample[] = [
  {
    county: 'Montserrado',
    region: 'Coastal Belt',
    tempMinC: 24,
    tempMaxC: 30,
    humidityPct: 84,
    rainfallMm7d: 62,
    conditionSummary: 'Warm coastal showers with humid mornings and bright afternoon breaks',
    riskLevel: 'Moderate',
    riskNotice: 'High coastal humidity increases leaf-spot and grain storage mold risk.',
    plantingGuidance: 'Keep vegetable nursery beds raised 25–30 cm high and dry harvested pepper/rice on raised tarpaulins.',
    recommendedCropSlugs: ['pepper', 'okra', 'rice'],
    forecast3Day: [
      {day: 'Day 1 (Sample)', condition: 'Passing morning showers', tempRange: '24–30°C', rainNote: 'Moderate shower (~12 mm)'},
      {day: 'Day 2 (Sample)', condition: 'Partly cloudy, humid', tempRange: '25–31°C', rainNote: 'Light coastal mist (~4 mm)'},
      {day: 'Day 3 (Sample)', condition: 'Afternoon rain squall', tempRange: '24–29°C', rainNote: 'Heavy burst (~18 mm)'},
    ],
  },
  {
    county: 'Bong',
    region: 'Central Upland & Swamp',
    tempMinC: 22,
    tempMaxC: 31,
    humidityPct: 79,
    rainfallMm7d: 48,
    conditionSummary: 'Warm days with reliable afternoon thundershowers suited to upland rice and cassava',
    riskLevel: 'Moderate',
    riskNotice: 'Watch sloped cassava mounds and poultry roofs before late-afternoon gusts.',
    plantingGuidance: 'Ideal window for weeding rice/maize and checking inland swamp bunds before stronger rains.',
    recommendedCropSlugs: ['rice', 'cassava', 'maize'],
    forecast3Day: [
      {day: 'Day 1 (Sample)', condition: 'Warm sun, evening shower', tempRange: '22–31°C', rainNote: 'Evening rain (~10 mm)'},
      {day: 'Day 2 (Sample)', condition: 'Scattered clouds', tempRange: '23–31°C', rainNote: 'Light shower (~5 mm)'},
      {day: 'Day 3 (Sample)', condition: 'Thunderstorm late day', tempRange: '22–29°C', rainNote: 'Steady rain (~16 mm)'},
    ],
  },
  {
    county: 'Nimba',
    region: 'Northern Highlands',
    tempMinC: 20,
    tempMaxC: 29,
    humidityPct: 81,
    rainfallMm7d: 74,
    conditionSummary: 'Cooler highland nights with frequent heavy rains and mist in valley bottoms',
    riskLevel: 'Elevated Rain Risk',
    riskNotice: 'Cool wet nights increase chick chilling and muddy pond runoff risk.',
    plantingGuidance: 'Divert rainwater runoff away from fish ponds and keep young poultry bedding strictly dry.',
    recommendedCropSlugs: ['rice', 'plantain', 'maize'],
    forecast3Day: [
      {day: 'Day 1 (Sample)', condition: 'Morning mist, steady rain', tempRange: '20–28°C', rainNote: 'Heavy rain (~22 mm)'},
      {day: 'Day 2 (Sample)', condition: 'Cloudy, cool breeze', tempRange: '20–29°C', rainNote: 'Showers (~14 mm)'},
      {day: 'Day 3 (Sample)', condition: 'Bright morning, late rain', tempRange: '21–29°C', rainNote: 'Moderate (~11 mm)'},
    ],
  },
  {
    county: 'Lofa',
    region: 'Upper Forest & Rice Belt',
    tempMinC: 20,
    tempMaxC: 30,
    humidityPct: 78,
    rainfallMm7d: 55,
    conditionSummary: 'Pleasant mornings with steady afternoon showers across upland and swamp plots',
    riskLevel: 'Moderate',
    riskNotice: 'Check stored groundnuts and dried rice pallets for dampness.',
    plantingGuidance: 'Good conditions for staggered maize, groundnut weeding, and swamp transplanting.',
    recommendedCropSlugs: ['rice', 'groundnuts', 'cassava'],
    forecast3Day: [
      {day: 'Day 1 (Sample)', condition: 'Sunny start, afternoon rain', tempRange: '21–30°C', rainNote: 'Moderate (~13 mm)'},
      {day: 'Day 2 (Sample)', condition: 'Partly cloudy', tempRange: '20–30°C', rainNote: 'Brief shower (~6 mm)'},
      {day: 'Day 3 (Sample)', condition: 'Steady evening rain', tempRange: '20–28°C', rainNote: 'Steady (~17 mm)'},
    ],
  },
  {
    county: 'Grand Bassa',
    region: 'Coastal & Riverine',
    tempMinC: 24,
    tempMaxC: 29,
    humidityPct: 87,
    rainfallMm7d: 88,
    conditionSummary: 'Heavy coastal rainfall cycles with strong sea breeze and warm soil moisture',
    riskLevel: 'Elevated Rain Risk',
    riskNotice: 'Low-lying cassava and pepper beds face waterlogging risk during back-to-back downpours.',
    plantingGuidance: 'Open shallow drainage trenches around cassava mounds and harvest okra/pepper during dry morning breaks.',
    recommendedCropSlugs: ['cassava', 'plantain', 'pepper'],
    forecast3Day: [
      {day: 'Day 1 (Sample)', condition: 'Heavy coastal downpour', tempRange: '24–28°C', rainNote: 'Heavy (~28 mm)'},
      {day: 'Day 2 (Sample)', condition: 'Breezy, passing showers', tempRange: '24–29°C', rainNote: 'Moderate (~15 mm)'},
      {day: 'Day 3 (Sample)', condition: 'Humid sun & rain', tempRange: '25–29°C', rainNote: 'Moderate (~14 mm)'},
    ],
  },
  {
    county: 'Margibi',
    region: 'Central Coastal Plain',
    tempMinC: 23,
    tempMaxC: 30,
    humidityPct: 83,
    rainfallMm7d: 64,
    conditionSummary: 'Warm humid plains with intermittent morning and evening rain',
    riskLevel: 'Moderate',
    riskNotice: 'Warm humidity favors whiteflies on cassava and damp litter in poultry houses.',
    plantingGuidance: 'Inspect cassava leaf undersides weekly and stake tomato/pepper gardens cleanly.',
    recommendedCropSlugs: ['cassava', 'pepper', 'tomatoes'],
    forecast3Day: [
      {day: 'Day 1 (Sample)', condition: 'Warm & partly cloudy', tempRange: '24–30°C', rainNote: 'Light shower (~7 mm)'},
      {day: 'Day 2 (Sample)', condition: 'Afternoon rainstorm', tempRange: '23–29°C', rainNote: 'Heavy (~20 mm)'},
      {day: 'Day 3 (Sample)', condition: 'Mild, occasional shower', tempRange: '23–30°C', rainNote: 'Light (~8 mm)'},
    ],
  },
];

export function getWeatherForCounty(countyName: string): CountyWeatherSample {
  const exact = SAMPLE_COUNTY_WEATHER.find((c) => c.county === countyName);
  if (exact) return exact;
  return {
    county: countyName,
    region: 'Liberia Regional Sample',
    tempMinC: 23,
    tempMaxC: 30,
    humidityPct: 82,
    rainfallMm7d: 58,
    conditionSummary: `Sample agricultural weather profile for ${countyName} County: warm humidity with periodic showers`,
    riskLevel: 'Moderate',
    riskNotice: 'Always prepare drainage furrows before heavy rain and dry harvest off bare soil.',
    plantingGuidance: 'Stagger planting across 2 weeks and keep mulch on garden beds to buffer dry-to-wet swings.',
    recommendedCropSlugs: ['rice', 'cassava', 'okra'],
    forecast3Day: [
      {day: 'Day 1 (Sample)', condition: 'Warm, afternoon cloud', tempRange: '23–30°C', rainNote: 'Passing shower (~10 mm)'},
      {day: 'Day 2 (Sample)', condition: 'Humid sunshine', tempRange: '24–31°C', rainNote: 'Brief mist (~4 mm)'},
      {day: 'Day 3 (Sample)', condition: 'Evening rain', tempRange: '23–29°C', rainNote: 'Moderate (~15 mm)'},
    ],
  };
}

export interface SoilAdvisoryOutput {
  headline: string;
  likelyFactors: string[];
  safeOrganicSteps: string[];
  fertilizerSafety: string;
  whenToTestSoil: string;
}

export function buildSoilAdvisory(crop: string, condition: string, problem: string): SoilAdvisoryOutput {
  const likelyFactors: string[] = [];
  const safeOrganicSteps: string[] = [
    'Build shaded farm compost using dry grass, crop residue, and well-aged animal manure (turn every 2 weeks).',
    'Keep bare topsoil covered with dry grass or leaf mulch to slow erosion and hold moisture.',
  ];

  if (condition === 'waterlogged') {
    likelyFactors.push('Standing rainwater removes oxygen from roots, causing leaves to yellow even if nutrients exist.');
    safeOrganicSteps.unshift('Open shallow perimeter drainage trenches and raise planting beds/mounds 25–30 cm high before adding any fertilizer.');
  } else if (condition === 'sandy') {
    likelyFactors.push('Sandy soils drain fast and leach organic matter and nitrogen quickly during heavy Liberian rain.');
    safeOrganicSteps.unshift('Mix generous dark compost into planting holes and mulch heavily to hold nutrients around roots.');
  } else if (condition === 'clay') {
    likelyFactors.push('Heavy red clay packs tightly when wet and crusts hard when dry, blocking tender seedling roots.');
    safeOrganicSteps.unshift('Work coarse dry grass compost into beds and avoid digging soaked clay soil.');
  } else if (condition === 'sloped') {
    likelyFactors.push('Fast rainwater runoff strips away the richest top 5 cm of dark soil on steep upland slopes.');
    safeOrganicSteps.unshift('Plant contour grass strips or vetiver/lemongrass lines across slopes instead of clearing bare earth.');
  } else {
    likelyFactors.push('Repeated cropping without resting land or rotating legumes gradually tires even good loamy soil.');
  }

  if (problem === 'yellowing') {
    likelyFactors.push(`Yellowing leaves on ${crop} can result from low nitrogen, wet roots, or insect/virus stress.`);
    safeOrganicSteps.push('Rotate with nitrogen-fixing groundnuts or cowpeas next season and check undersides of leaves for insects.');
  } else if (problem === 'erosion') {
    likelyFactors.push('Heavy rain droplets hitting uncovered soil detach topsoil and carry seeds downhill.');
  } else if (problem === 'low_yield') {
    likelyFactors.push(`Declining ${crop} yields after several seasons point to exhausted organic matter or soil acidity.`);
  }

  return {
    headline: `Educational Soil & Fertility Guidance for ${crop}`,
    likelyFactors,
    safeOrganicSteps,
    fertilizerSafety:
      'Team 8 never guesses precise chemical fertilizer dosages (kg/acre) without verified soil testing. Applying the wrong synthetic fertilizer wastes cash and can burn seedlings or pollute streams.',
    whenToTestSoil:
      'Seek county agricultural extension support or a laboratory soil pH/nutrient test before buying bulk lime or commercial NPK bags for larger plots.',
  };
}

export const SYNTHETIC_MINISTRY_DATA = {
  notice: 'Synthetic Demonstration Data — Not Official Ministry Statistics',
  disclaimer:
    'The Liberia Ministry of Agriculture is NOT connected to or endorsing this prototype. National food-security conclusions cannot be calculated from sample marketplace listings or unverified reports. Real deployment requires verified Ministry datasets and formal data-sharing agreements.',
  counties: [
    {county: 'Bong', demoFarmers: 420, advisoryRequests: 118, activeListings: 46, estimatedRiceTons: 145, estimatedCassavaTons: 310, topCropIssue: 'Upland rice brown spot & weeds', topLivestockIssue: 'Rainy-season chick chilling', foodSecurityIndex: 'Stable (Sample)'},
    {county: 'Nimba', demoFarmers: 390, advisoryRequests: 104, activeListings: 41, estimatedRiceTons: 138, estimatedCassavaTons: 280, topCropIssue: 'Feeder-road vegetable spoilage', topLivestockIssue: 'Pond muddy runoff', foodSecurityIndex: 'Watch — Transport (Sample)'},
    {county: 'Lofa', demoFarmers: 355, advisoryRequests: 96, activeListings: 34, estimatedRiceTons: 162, estimatedCassavaTons: 215, topCropIssue: 'Grain storage moisture', topLivestockIssue: 'Goat hoof care in mud', foodSecurityIndex: 'Stable (Sample)'},
    {county: 'Margibi', demoFarmers: 265, advisoryRequests: 84, activeListings: 39, estimatedRiceTons: 68, estimatedCassavaTons: 240, topCropIssue: 'Cassava mosaic leaf curl', topLivestockIssue: 'Poultry coop damp bedding', foodSecurityIndex: 'Stable (Sample)'},
    {county: 'Grand Bassa', demoFarmers: 230, advisoryRequests: 79, activeListings: 27, estimatedRiceTons: 62, estimatedCassavaTons: 260, topCropIssue: 'Waterlogged cassava mounds', topLivestockIssue: 'Pond oxygen drops', foodSecurityIndex: 'Watch — Heavy Rain (Sample)'},
    {county: 'Montserrado', demoFarmers: 210, advisoryRequests: 92, activeListings: 52, estimatedRiceTons: 28, estimatedCassavaTons: 145, topCropIssue: 'Pepper & tomato blight', topLivestockIssue: 'Biosecurity in backyard coops', foodSecurityIndex: 'Market Hub (Sample)'},
    {county: 'Bomi', demoFarmers: 145, advisoryRequests: 51, activeListings: 21, estimatedRiceTons: 49, estimatedCassavaTons: 165, topCropIssue: 'Soil fertility depletion', topLivestockIssue: 'Aquaculture feed cost', foodSecurityIndex: 'Watch — Inputs (Sample)'},
  ],
  productDistribution: [
    {label: 'Cassava & Roots', pct: 32, color: '#16803C'},
    {label: 'Rice & Grains', pct: 26, color: '#183B2B'},
    {label: 'Vegetables', pct: 18, color: '#F5B942'},
    {label: 'Poultry & Livestock', pct: 14, color: '#3B82F6'},
    {label: 'Fish & Inputs', pct: 10, color: '#0D9488'},
  ],
  reportedProblems: [
    {label: 'Pests & Leaf Diseases', count: 148},
    {label: 'Unpredictable Rain / Runoff', count: 124},
    {label: 'Post-Harvest Spoilage', count: 109},
    {label: 'Poor Soil / Fertility', count: 96},
    {label: 'Livestock / Poultry Care', count: 82},
    {label: 'Transport & Buyer Access', count: 74},
  ],
  productionTrends: [
    {season: '2024 Rains', riceTons: 540, cassavaTons: 1380},
    {season: '2024 Dry', riceTons: 180, cassavaTons: 1120},
    {season: '2025 Rains', riceTons: 610, cassavaTons: 1510},
    {season: '2025 Dry', riceTons: 210, cassavaTons: 1240},
    {season: '2026 Sample', riceTons: 652, cassavaTons: 1615},
  ],
};
