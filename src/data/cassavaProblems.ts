/**
 * Guided cassava crop-problem content (H1 demonstration).
 *
 * HONESTY RULES (enforced by tests/h1.test.ts):
 *  - This is TEAM 8 DRAFT advice. `review.status` is 'team_draft' because no agricultural expert has reviewed it.
 *    It may only become 'reviewed' when a named reviewer and a review date are filled in.
 *  - The tool lists POSSIBLE causes for what a farmer can see. It never states a confirmed diagnosis.
 *  - No pesticide names, mixtures, doses or quantities. Only cultural / observation steps and "ask an extension officer".
 *  - Where wording comes from the existing Crops Library (cassava) it is reused unchanged and marked with `source`.
 */

export interface ReviewInfo {
  status: 'team_draft' | 'reviewed';
  reviewedBy: string | null;
  reviewedOn: string | null;
}

export const CASSAVA_REVIEW: ReviewInfo = {status: 'team_draft', reviewedBy: null, reviewedOn: null};

export const NOT_A_DIAGNOSIS_NOTICE =
  'This is NOT a confirmed diagnosis. These are possible causes based only on what you chose. A photo or a list cannot replace a visit from an agricultural extension officer. Do not use any chemical on the advice of this page.';

export interface Symptom {
  id: string;
  /** Simple English, what a farmer can see. */
  label: string;
  hint: string;
}

export const CASSAVA_SYMPTOMS: Symptom[] = [
  {id: 'yellow-patchy-curled', label: 'Young leaves are yellow-green and patchy, curled or twisted', hint: 'Look at the newest leaves at the top of the plant.'},
  {id: 'yellow-lower-leaves', label: 'Older, lower leaves turn yellow and fall off', hint: 'The top of the plant still looks green.'},
  {id: 'wilting-wet-field', label: 'Plant wilts or collapses, and the field or mound is wet', hint: 'Water stands near the plants after rain.'},
  {id: 'tiny-white-insects', label: 'Tiny white insects under the leaves, or sticky black coating on leaves', hint: 'Turn a young leaf over to look.'},
  {id: 'white-cottony-clusters', label: 'White cotton-like clusters at the shoot tips, shoots stunted or bunched', hint: 'Check the growing tips.'},
  {id: 'brown-angular-spots', label: 'Brown spots with straight edges on leaves, or shoots drying from the tip', hint: 'Spots are often worse after heavy rain.'},
  {id: 'roots-soft-smelly', label: 'Roots are soft, dark or smell bad when dug up', hint: 'Dig up one plant to check.'},
];

export interface Cause {
  id: string;
  name: string;
  /** Symptom ids that are consistent with this possible cause. */
  matches: string[];
  whyItMayMatch: string;
  /** What to look for to tell it apart from the other possibilities. */
  checks: string[];
  /** Safe, general, non-chemical first response. */
  firstResponse: string[];
  askExpertWhen: string;
  /** Present when the wording is reused from the existing Crops Library. */
  source?: string;
}

export const CASSAVA_CAUSES: Cause[] = [
  {
    id: 'mosaic',
    name: 'Cassava mosaic disease (a virus spread by cuttings and whiteflies)',
    matches: ['yellow-patchy-curled', 'tiny-white-insects'],
    whyItMayMatch: 'Yellow-green patchy, curled or twisted young leaves are a typical sign people report with cassava mosaic, often with whiteflies on the plants.',
    checks: [
      'Is the patchy yellowing on the newest leaves, with leaves smaller or twisted?',
      'Do neighbouring plants grown from the same cuttings look the same?',
      'Are tiny white insects under the young leaves?',
    ],
    firstResponse: [
      'Uproot badly mosaic-twisted young plants early so insects do not carry infection across your field.',
      'Cut planting stakes only from healthy, straight-leafed mother plants, never from twisted or yellow-mottled stems.',
      'Keep knives clean when cutting planting stakes from different plots.',
      'Ask an extension agent about certified mosaic-tolerant cuttings for your area.',
    ],
    askExpertWhen: 'Ask an expert if many plants are affected, or before you replant or buy cuttings.',
    source: 'Reuses the cassava wording in the Crops Library and the Pests & Diseases page.',
  },
  {
    id: 'whitefly',
    name: 'Whitefly attack',
    matches: ['tiny-white-insects', 'yellow-patchy-curled'],
    whyItMayMatch: 'Tiny white insects under young leaves, sometimes with a sticky or black sooty coating, can weaken plants and may also carry disease.',
    checks: ['Do small white insects fly up when you shake a young shoot?', 'Is the underside of young leaves crowded with tiny insects or white specks?'],
    firstResponse: [
      'Check young leaves every week in the morning and note how many plants are affected.',
      'Remove badly infested shoots and bury them well away from the field.',
      'Keep the field free of weeds that can shelter insects.',
      'Ask an extension officer before using any product.',
    ],
    askExpertWhen: 'Ask an expert if the insects keep coming back or spread to most of the field.',
  },
  {
    id: 'mealybug',
    name: 'Mealybug attack',
    matches: ['white-cottony-clusters'],
    whyItMayMatch: 'White cotton-like clusters at the shoot tips with stunted, bunched shoots can point to mealybugs.',
    checks: ['Are the white clusters soft and cotton-like, on the growing tips?', 'Are shoots short and bunched together?'],
    firstResponse: [
      'Cut off and destroy affected shoot tips away from the field; do not carry them to other plots.',
      'Do not take planting stakes from affected plants.',
      'Report it to the local agricultural office, because mealybug can spread to neighbouring farms.',
    ],
    askExpertWhen: 'Ask an expert soon, because this problem can spread between farms.',
  },
  {
    id: 'ageing-nutrients',
    name: 'Natural leaf ageing, dry spell or poor soil',
    matches: ['yellow-lower-leaves'],
    whyItMayMatch: 'Older lower leaves yellowing and dropping, while the top stays green, can be normal ageing, a dry spell, or tired soil.',
    checks: ['Is only the oldest, lowest leaf layer yellowing?', 'Has it been dry for several days, or has this plot been planted with cassava many times in a row?'],
    firstResponse: [
      'Keep fields weed-free during the first 3 months until the leafy canopy shades the ground.',
      'Add decomposed grass compost into tired plots rather than planting continuously on depleted soil.',
      'Mulch mound tops lightly during short dry breaks.',
    ],
    askExpertWhen: 'Ask an expert if yellowing climbs to the young leaves or most plants are affected.',
  },
  {
    id: 'waterlog-rot',
    name: 'Waterlogging or root rot',
    matches: ['wilting-wet-field', 'roots-soft-smelly'],
    whyItMayMatch: 'Wilting in a wet field, or soft, dark, bad-smelling roots, can mean the roots are rotting because water stands around the mounds.',
    checks: ['Does water stand around the plants after rain?', 'Are roots soft, dark or smelly when you dig up one plant?'],
    firstResponse: [
      'Cassava hates standing water; dig shallow perimeter drainage channels around low fields.',
      'Plant on loose mounds at least 25 cm high so heavy rain never waterlogs the roots.',
      'Harvest and use or process the roots that are still firm right away, because rotting roots spoil fast.',
      'Do not replant stakes from rotting plants.',
    ],
    askExpertWhen: 'Ask an expert if many plants wilt even after the water drains.',
  },
  {
    id: 'bacterial-leaf',
    name: 'Leaf spot or bacterial blight',
    matches: ['brown-angular-spots'],
    whyItMayMatch: 'Brown spots with straight edges, or shoots drying from the tip, often get worse after heavy rain and may be a leaf disease.',
    checks: ['Are the spots angular, with straight edges between the leaf veins?', 'Did it get worse after heavy rain?'],
    firstResponse: [
      'Avoid working in the field when leaves are wet, so you do not spread the problem on your hands and tools.',
      'Keep knives clean, and take planting stakes only from healthy plants.',
      'Remove badly affected shoots and keep them out of the planting area.',
    ],
    askExpertWhen: 'Ask an expert if spots spread quickly or shoots keep dying back.',
  },
];

/** Advice that applies whatever causes are listed. */
export const GENERAL_GUIDANCE: string[] = [
  'Walk the field in the morning once a week and note which plants are affected and how many.',
  'Take a clear photo of a leaf and of the whole plant to show an extension officer or expert.',
  'Do not mix or spray chemicals on the advice of this page. Ask an agricultural extension officer first.',
  'Do not carry cuttings from affected plots to healthy plots.',
];

export const NONE_OF_THESE_ADVICE =
  'None of these match? Describe what you see in your own words and ask an agricultural expert. Take a photo of the leaf and the whole plant.';
