/**
 * Crop check ("triage") cases. SIMULATED, rule-based and symptom-guided: NO computer program looks at a photo, and nothing here is a diagnosis.
 * The farmer answers three plain questions about one of six common situations (cassava, rice, poultry); a fixed point table turns the answers into a
 * Green / Yellow / Red ATTENTION band and a linked advice card. The wording of every case and card reuses text already in this app (Team 8 cassava
 * crop-problem guidance, Crops Library, Livestock Library); no new agronomic claim and no treatment, dose or product is introduced.
 *
 * This module is imported by BOTH the browser and the server (server/routes/advice.ts re-evaluates every report; the band is never trusted from the client).
 */
export type TriageCrop = 'cassava' | 'rice' | 'poultry';
export type TriageBand = 'green' | 'yellow' | 'red';

export interface TriageOption {
  id: string;
  label: string;
  points: number;
  /** An answer that always means urgent attention, whatever the score. */
  urgent?: boolean;
}
export interface TriageQuestion {
  id: string;
  text: string;
  hint?: string;
  options: TriageOption[];
}
export interface TriageCase {
  id: string;
  crop: TriageCrop;
  /** What the farmer sees on the card they tap. */
  title: string;
  whatYouSee: string;
  questions: TriageQuestion[];
  /** Advice card (slug) linked to this situation. */
  cardSlug: string;
  /** The result is never lower than this band (for situations that are never "just watch"). */
  minBand?: TriageBand;
}

export const CROP_LABELS: Record<TriageCrop, string> = {cassava: 'Cassava', rice: 'Rice', poultry: 'Poultry (chickens)'};

const EXTENT = (what: string): TriageQuestion => ({
  id: 'extent',
  text: `How many ${what} show this?`,
  options: [
    {id: 'few', label: `Only a few (about 1 in 10 or fewer)`, points: 0},
    {id: 'some', label: 'Some (about 1 in 4)', points: 1},
    {id: 'many', label: 'Many, or most of them', points: 2},
  ],
});
const SPREAD: TriageQuestion = {
  id: 'spread',
  text: 'Is it getting worse?',
  hint: 'Compare with 3 days ago.',
  options: [
    {id: 'same', label: 'No, about the same', points: 0},
    {id: 'slow', label: 'A little worse', points: 1},
    {id: 'fast', label: 'Much worse in a few days', points: 2},
  ],
};

export const TRIAGE_CASES: TriageCase[] = [
  {
    id: 'cassava-patchy-young-leaves', crop: 'cassava', cardSlug: 'cassava-patchy-young-leaves',
    title: 'Young leaves are yellow-green, patchy or twisted',
    whatYouSee: 'Look at the newest leaves at the top of the cassava plant.',
    questions: [
      EXTENT('cassava plants'), SPREAD,
      {id: 'insects', text: 'Do you see tiny white insects under the young leaves?', hint: 'Turn a young leaf over to look.', options: [
        {id: 'no', label: 'No', points: 0}, {id: 'yes', label: 'Yes', points: 1}, {id: 'unsure', label: 'I am not sure', points: 0},
      ]},
    ],
  },
  {
    id: 'cassava-yellow-old-leaves', crop: 'cassava', cardSlug: 'cassava-yellow-old-leaves',
    title: 'Older, lower leaves turn yellow and fall off',
    whatYouSee: 'The top of the plant may still look green.',
    questions: [
      EXTENT('cassava plants'), SPREAD,
      {id: 'top', text: 'Are the newest leaves at the top still green?', options: [
        {id: 'green', label: 'Yes, the top is green', points: 0}, {id: 'unsure', label: 'I am not sure', points: 1}, {id: 'yellow', label: 'No, yellowing reaches the top', points: 2},
      ]},
    ],
  },
  {
    id: 'rice-brown-leaf-spots', crop: 'rice', cardSlug: 'rice-brown-leaf-spots',
    title: 'Rice leaves have brown spots, or the middle shoot is dead',
    whatYouSee: 'Look at the leaves, and gently pull the central shoot of a few plants.',
    questions: [
      EXTENT('rice plants'), SPREAD,
      {id: 'shoots', text: 'Are central shoots dead (they pull out easily)?', options: [
        {id: 'no', label: 'No', points: 0}, {id: 'some', label: 'A few', points: 1}, {id: 'many', label: 'Many', points: 2},
      ]},
    ],
  },
  {
    id: 'rice-water-too-deep', crop: 'rice', cardSlug: 'rice-water-too-deep',
    title: 'Young rice is under floodwater, or the bunds are broken',
    whatYouSee: 'Floodwater covers young plants in a swamp or low field.',
    questions: [
      EXTENT('rice plants'), SPREAD,
      {id: 'submerged', text: 'How long have the plants been under water?', options: [
        {id: 'lt1', label: 'Less than one day', points: 0}, {id: 'd12', label: 'One to two days', points: 1}, {id: 'gt2', label: 'More than two days', points: 2},
      ]},
    ],
  },
  {
    id: 'poultry-chicks-cold-sneezing', crop: 'poultry', cardSlug: 'poultry-chicks-cold-sneezing',
    title: 'Chicks huddle together and sneeze after cold, wet nights',
    whatYouSee: 'Young chicks crowd together and breathe noisily.',
    questions: [
      EXTENT('chicks'), SPREAD,
      {id: 'eating', text: 'Are the chicks still eating and drinking?', options: [
        {id: 'yes', label: 'Yes, most are', points: 0}, {id: 'some', label: 'Some are not', points: 1}, {id: 'no', label: 'Most are not', points: 2},
      ]},
    ],
  },
  {
    id: 'poultry-sudden-deaths', crop: 'poultry', cardSlug: 'poultry-sudden-deaths', minBand: 'yellow',
    title: 'Several birds are sick or have died suddenly',
    whatYouSee: 'Birds are sluggish, ruffled or dead without a clear reason.',
    questions: [
      EXTENT('birds'), SPREAD,
      {id: 'deaths', text: 'How many birds died in the last 2 days?', options: [
        {id: 'none', label: 'None', points: 0}, {id: 'one-two', label: 'One or two', points: 1}, {id: 'three-plus', label: 'Three or more', points: 3, urgent: true},
      ]},
    ],
  },
];

export const caseById = (id: string): TriageCase | undefined => TRIAGE_CASES.find((c) => c.id === id);
export const casesForCrop = (crop: TriageCrop): TriageCase[] => TRIAGE_CASES.filter((c) => c.crop === crop);

/** Score thresholds (the same for every case): 0-1 Green, 2-3 Yellow, 4 or more Red. An "urgent" answer is always Red. */
export const BAND_RULE = {yellowAt: 2, redAt: 4} as const;

export const BAND_INFO: Record<TriageBand, {label: string; headline: string; actions: string[]}> = {
  green: {
    label: 'GREEN: keep watching',
    headline: 'Nothing here looks urgent from your answers.',
    actions: ['Follow the advice card below.', 'Look again in 3 days. If it gets worse, check again.'],
  },
  yellow: {
    label: 'YELLOW: check soon',
    headline: 'Your answers point to a problem that needs attention.',
    actions: ['Follow the advice card below.', 'Ask an agricultural extension officer this week.', 'Check again in 2 days.'],
  },
  red: {
    label: 'RED: urgent, contact an officer',
    headline: 'Your answers point to an urgent situation.',
    actions: [
      'Contact your county agriculture or veterinary officer TODAY.',
      'Do not wait for the next market day or the next check.',
      'Do not use any chemical or medicine unless the officer tells you to.',
    ],
  },
};

export const SIMULATED_BANNER =
  'SIMULATED CHECK. This is not a diagnosis. No computer program has analysed your photo or your plants. The result comes only from your answers and a simple point table. It cannot tell you what the problem is.';
export const NO_CONFIDENCE_NOTE =
  'No confidence percentage is shown because none was measured. Showing a number would make a simple rule look like a test.';
