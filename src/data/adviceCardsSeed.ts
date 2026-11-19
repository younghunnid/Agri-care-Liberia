import type {TriageCrop} from './triageCases';

/**
 * The six advice cards linked to the crop-check situations. DEMONSTRATION CONTENT: written by the project team from wording already in this app (Team 8
 * cassava crop-problem guidance, Crops Library, Livestock Library). No qualified agronomist or veterinary officer has reviewed any of it, so every card is
 * seeded at level `demo_sample` and the interface says so. Reference codes are fixed so the offline copy bundled in the app and the server's seeded
 * cards always agree; cards added later by an administrator receive the next ADV-<year>-NNN code from the server.
 */
export type VerificationLevel = 'demo_sample' | 'team_draft' | 'pending_review' | 'verified';

export interface AdviceCardSeed {
  code: string;
  slug: string;
  crop: TriageCrop;
  title: string;
  summary: string;
  steps: string[];
  askWhen: string;
  sourceNote: string;
}

const SRC_CASSAVA = 'Team 8 cassava crop-problem guidance (team draft) and the Crops Library. Not reviewed by an agronomist.';
const SRC_RICE = 'Team 8 Crops Library (rice). Not reviewed by an agronomist.';
const SRC_POULTRY = 'Team 8 Livestock Library (poultry). Not reviewed by a veterinary officer. Team 8 does not prescribe medicines.';

export const ADVICE_CARD_SEED: AdviceCardSeed[] = [
  {
    code: 'ADV-2026-001', slug: 'cassava-patchy-young-leaves', crop: 'cassava',
    title: 'Cassava with patchy, twisted young leaves: first steps',
    summary: 'Yellow-green, patchy or twisted new leaves are a sign people often report with cassava mosaic disease, sometimes with whiteflies. These are safe first steps. They do not confirm what the problem is.',
    steps: [
      'Uproot badly twisted young plants early so insects do not carry infection across your field.',
      'Cut planting stakes only from healthy, straight-leafed mother plants, never from twisted or yellow-mottled stems.',
      'Keep knives clean when cutting planting stakes from different plots.',
      'Ask an extension agent about certified mosaic-tolerant cuttings for your area.',
    ],
    askWhen: 'Ask an expert if many plants are affected, or before you replant or buy cuttings.',
    sourceNote: SRC_CASSAVA,
  },
  {
    code: 'ADV-2026-002', slug: 'cassava-yellow-old-leaves', crop: 'cassava',
    title: 'Cassava with yellow lower leaves: first steps',
    summary: 'Older lower leaves that yellow and drop while the top stays green can be normal ageing, a dry spell, or tired soil. These are safe first steps.',
    steps: [
      'Keep fields weed-free during the first 3 months until the leafy canopy shades the ground.',
      'Add decomposed grass compost into tired plots rather than planting continuously on depleted soil.',
      'Mulch mound tops lightly during short dry breaks.',
    ],
    askWhen: 'Ask an expert if yellowing climbs to the young leaves or most plants are affected.',
    sourceNote: SRC_CASSAVA,
  },
  {
    code: 'ADV-2026-003', slug: 'rice-brown-leaf-spots', crop: 'rice',
    title: 'Rice with brown leaf spots or dead central shoots: first steps',
    summary: 'Brown leaf spots and dead central shoots are things to watch for in rice. These are safe first steps from the Crops Library. They do not confirm what the problem is.',
    steps: [
      'Walk the field and count how many plants have brown leaf spots or dead central shoots.',
      'Remove diseased volunteer grasses on field borders.',
      'Weed thoroughly at about 3 weeks and again around 7 to 8 weeks after planting, before panicles form.',
      'Verify any severe yellowing with an extension officer.',
    ],
    askWhen: 'Ask an extension officer if the spots spread to many plants or the central shoots keep dying.',
    sourceNote: SRC_RICE,
  },
  {
    code: 'ADV-2026-004', slug: 'rice-water-too-deep', crop: 'rice',
    title: 'Rice under floodwater or with broken bunds: first steps',
    summary: 'Floodwater that covers young rice can harm it. These are safe first steps from the Crops Library for keeping water under control.',
    steps: [
      'Keep swamp bunds repaired before the peak August to September rains so floodwater does not submerge young plants.',
      'Inspect field dikes weekly after storms to patch small crab holes or water leaks early.',
      'Level mud bunds so they hold even shallow water without washing away topsoil.',
      'If young plants are already under water, ask an extension officer before you replant or change the water level.',
    ],
    askWhen: 'Ask an extension officer if plants stay under water for more than a day or two.',
    sourceNote: SRC_RICE,
  },
  {
    code: 'ADV-2026-005', slug: 'poultry-chicks-cold-sneezing', crop: 'poultry',
    title: 'Chicks huddling and sneezing after cold, wet nights: first steps',
    summary: 'Cold drafts and wet bedding are common problems for young chicks. These are safe housing steps from the Livestock Library. They do not say what is making the chicks ill.',
    steps: [
      'Shield young chicks from cold night drafts with clean tarpaulins or woven curtains while keeping top vents open.',
      'Keep wood shavings dry. Scoop out wet patches around drinkers immediately.',
      'Provide clean fresh drinking water all day.',
      'Isolate any sluggish, sneezing or ruffled bird in a separate recovery pen right away.',
    ],
    askWhen: 'Contact a licensed county livestock or veterinary officer for sudden flock illness. Team 8 does not prescribe poultry medicines.',
    sourceNote: SRC_POULTRY,
  },
  {
    code: 'ADV-2026-006', slug: 'poultry-sudden-deaths', crop: 'poultry',
    title: 'Several sick or dead birds: contact an officer today',
    summary: 'Several birds that are sick or die suddenly need an officer, not home treatment. These steps only limit the spread until you have spoken to one.',
    steps: [
      'Contact a licensed county livestock or veterinary officer today.',
      'Isolate any sluggish, sneezing or ruffled bird in a separate recovery pen right away.',
      'Place a shallow disinfectant footbath at the coop door and keep outside traders and visitors out of the pens.',
      'Do not give any medicine unless the officer tells you to.',
    ],
    askWhen: 'Contact the officer today. Do not wait.',
    sourceNote: SRC_POULTRY,
  },
];

export const cardSeedBySlug = (slug: string): AdviceCardSeed | undefined => ADVICE_CARD_SEED.find((c) => c.slug === slug);
