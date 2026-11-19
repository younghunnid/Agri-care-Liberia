/**
 * H2 farming lessons and quizzes (hackathon prototype).
 *
 * HONESTY RULES (enforced by tests/h2.test.ts):
 *  - Every lesson is TEAM 8 DRAFT. `review.status` is 'team_draft' until an agricultural expert has actually reviewed it;
 *    'reviewed' is only valid together with a reviewer name and date.
 *  - General education only. No pesticide or chemical product names, mixtures, doses or amounts, and no treatment claims.
 *    Where chemicals come up the lesson says to ask an agricultural extension officer.
 *  - Facts are taken from the app's own Crops Library and Knowledge Center content (same wording or a plain-English paraphrase).
 *  - Simple English, short sentences, one idea per point.
 */
import type {ReviewInfo} from './cassavaProblems';

export const LESSON_REVIEW: ReviewInfo = {status: 'team_draft', reviewedBy: null, reviewedOn: null};

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Index into `options`. */
  correct: number;
  explanation: string;
}

export interface LessonSection {
  heading: string;
  points: string[];
}

export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  intro: string;
  sections: LessonSection[];
  keyMessage: string;
  review: ReviewInfo;
  quiz: QuizQuestion[];
}

export const PASS_FRACTION = 0.6;

export const LESSONS: Lesson[] = [
  {
    id: 'cassava-basics',
    title: 'Cassava farming basics',
    subtitle: 'Healthy cuttings, good drainage, careful harvest',
    minutes: 5,
    intro: 'Cassava grows well on poor soil. A good start with clean cuttings and dry mounds protects your roots later.',
    sections: [
      {heading: 'Choose healthy cuttings', points: [
        'Cut planting stakes 20 to 25 cm long from the healthy middle part of strong mother plants.',
        'Never cut stakes from twisted or yellow-patchy stems.',
        'Keep your knife clean when you cut stakes from different plots.',
      ]},
      {heading: 'Plant on loose mounds', points: [
        'Plant on loose mounds or ridges about 1 metre apart in each direction.',
        'Make mounds at least 25 cm high so heavy rain does not flood the roots.',
        'Cassava hates standing water. Dig shallow drain channels around low fields.',
      ]},
      {heading: 'Care in the first months', points: [
        'Keep the field free of weeds for the first 3 months, until the leaves shade the ground.',
        'Look at young leaves often. Ask an extension officer if you see twisted, yellow-patchy leaves.',
      ]},
      {heading: 'Harvest', points: [
        'Most Liberian varieties are ready in 9 to 12 months, depending on the variety and the rain.',
        'Lift roots carefully after rain has softened the soil, so they do not break.',
        'Fresh cassava spoils in 2 to 3 days. Harvest only what you can sell, eat or process right away.',
      ]},
    ],
    keyMessage: 'Clean cuttings, dry mounds and weed-free young plants give cassava a strong start.',
    review: LESSON_REVIEW,
    quiz: [
      {id: 'c1', question: 'Where should you cut cassava planting stakes from?', options: ['Twisted, yellow-patchy stems', 'The healthy middle part of strong mother plants', 'Any old stem on the ground'], correct: 1,
        explanation: 'Cuttings from healthy, straight plants give healthy new plants. Twisted or patchy stems can pass problems to the next crop.'},
      {id: 'c2', question: 'Why do we plant cassava on high, loose mounds?', options: ['So water does not stand around the roots', 'So the plants grow taller leaves', 'So birds cannot reach them'], correct: 0,
        explanation: 'Cassava roots rot in standing water. Mounds at least 25 cm high let rain drain away.'},
      {id: 'c3', question: 'For how long should young cassava be kept free of weeds?', options: ['One week', 'The first 3 months', 'Only after harvest'], correct: 1,
        explanation: 'Weeds compete with young plants. After about 3 months the leaves shade the ground and stop most weeds.'},
      {id: 'c4', question: 'How long can fresh cassava roots wait after harvest?', options: ['2 to 3 days', 'Two weeks', 'Two months'], correct: 0,
        explanation: 'Fresh roots spoil fast. Harvest only what you can sell, eat or process, for example into dry gari or chips.'},
    ],
  },
  {
    id: 'rice-basics',
    title: 'Rice cultivation basics',
    subtitle: 'Good seed, water control, weeding and drying',
    minutes: 5,
    intro: 'Rice feeds families across Liberia. Good seed, early weeding and clean drying help you keep more of your grain.',
    sections: [
      {heading: 'Test your seed', points: [
        'Before sowing saved seed, do a simple test. Put 10 seeds on a damp cloth and count how many sprout.',
        'Plant upland rice in rows or neat hills when the steady rains come, usually April to May.',
        'In swamps, move strong 21-day-old seedlings to the field, 20 cm apart.',
      ]},
      {heading: 'Control the water', points: [
        'In swamp fields, repair the mud bunds before the heavy rains of August and September.',
        'In upland fields, use mulch or strips of grass across a slope so rain soaks in and does not wash soil away.',
      ]},
      {heading: 'Weed on time', points: [
        'Weed well at 3 weeks and again at 7 to 8 weeks after planting, before the grain heads form.',
        'Check field dikes every week after storms and mend small leaks early.',
      ]},
      {heading: 'Harvest and dry', points: [
        'Harvest when most grains on the head (about 8 or 9 out of every 10) turn golden and feel firm.',
        'Do not wait too long. Late harvest means more grain falls and more is eaten by birds.',
        'Dry the grain on raised mats or clean tarpaulins. Never dry it on bare wet ground or a dusty road.',
      ]},
    ],
    keyMessage: 'Test your seed, weed twice, and dry your rice on clean mats.',
    review: LESSON_REVIEW,
    quiz: [
      {id: 'r1', question: 'How can you check saved rice seed before sowing?', options: ['Smell the seed', 'Put 10 seeds on a damp cloth and count how many sprout', 'Plant it all and wait'], correct: 1,
        explanation: 'A small damp-cloth test shows if the seed is alive before you spend time and work planting it.'},
      {id: 'r2', question: 'When is a good time to weed rice?', options: ['Only after harvest', 'At about 3 weeks and again at 7 to 8 weeks', 'Never, rice does not need weeding'], correct: 1,
        explanation: 'Early weeding stops weeds from taking food and water from young rice plants.'},
      {id: 'r3', question: 'When is rice ready to harvest?', options: ['When most grains on the head are golden and firm', 'When the leaves first appear', 'When the rain stops'], correct: 0,
        explanation: 'Golden, firm grains are mature. Waiting much longer lets grain fall and birds take it.'},
      {id: 'r4', question: 'Where should you dry harvested rice?', options: ['On bare wet ground', 'On a dusty road', 'On raised mats or clean tarpaulins'], correct: 2,
        explanation: 'Clean mats keep out dirt and damp, which can cause mould and spoil the grain.'},
      {id: 'r5', question: 'What should swamp farmers do before the heaviest rains?', options: ['Repair the mud bunds', 'Cut the rice early', 'Plant more seed'], correct: 0,
        explanation: 'Strong bunds hold the right amount of water and stop floods from covering young plants.'},
    ],
  },
  {
    id: 'soil-health',
    title: 'Soil health',
    subtitle: 'Compost, covered soil and crop rotation',
    minutes: 5,
    intro: 'Healthy soil grows stronger crops. You can look after your soil with things you already have on the farm.',
    sections: [
      {heading: 'Make compost', points: [
        'Layer dry grass and leaves with green kitchen waste and well-aged animal droppings in a shaded heap.',
        'Keep the heap damp, like a wrung-out sponge. Turn it every 2 weeks so air gets in.',
        'Put dark, crumbly compost into the planting holes 1 to 2 weeks before sowing.',
        'Never put fresh, uncomposted manure against young seedlings. It can burn the roots.',
      ]},
      {heading: 'Keep the soil covered', points: [
        'Mulch the ground with dry grass or leaves so rain does not wash the topsoil away.',
        'On slopes, leave strips of grass across the slope to slow the water.',
        'Raised beds help vegetables in wet places.',
      ]},
      {heading: 'Rotate your crops', points: [
        'Do not plant the same crop on the same spot every season.',
        'Move pepper and tomato to a new spot each time.',
      ]},
      {heading: 'When to ask for help', points: [
        'This lesson is general education. It does not tell you how much fertilizer your field needs.',
        'For advice about your own field, ask an agricultural extension officer or an expert. Ask about a soil test.',
      ]},
    ],
    keyMessage: 'Compost, mulch and rotation are low-cost ways to keep your soil healthy.',
    review: LESSON_REVIEW,
    quiz: [
      {id: 's1', question: 'How damp should a compost heap be?', options: ['Dry like dust', 'Like a wrung-out sponge', 'Covered in standing water'], correct: 1,
        explanation: 'Too dry and it will not rot. Too wet and it goes sour. A wrung-out sponge is about right.'},
      {id: 's2', question: 'Why should you not put fresh manure against young seedlings?', options: ['It can burn the roots', 'It makes the seeds too big', 'It attracts rain'], correct: 0,
        explanation: 'Fresh manure is too strong for tender roots. Use manure that is well aged or composted.'},
      {id: 's3', question: 'What does mulch do for the soil?', options: ['It covers the soil and helps stop rain washing it away', 'It makes weeds grow faster', 'It dries the soil out completely'], correct: 0,
        explanation: 'A cover of dry grass or leaves protects the topsoil and helps keep moisture in.'},
      {id: 's4', question: 'Why do farmers rotate crops?', options: ['To use the same spot every year', 'To avoid wearing out the soil and building up problems', 'Because it is the law'], correct: 1,
        explanation: 'Changing the crop on a spot helps the soil rest and cuts the build-up of pests and diseases.'},
      {id: 's5', question: 'Who should you ask how much fertilizer your own field needs?', options: ['A neighbour who guessed', 'An agricultural extension officer, after a soil test if possible', 'Nobody, any amount is fine'], correct: 1,
        explanation: 'Every field is different. A trained officer can advise on your soil. This lesson gives general education only.'},
    ],
  },
  {
    id: 'safe-pest-prevention',
    title: 'Safe pest prevention',
    subtitle: 'Look early, keep clean, ask before you spray',
    minutes: 5,
    intro: 'Most pest and disease problems are easier to stop early. Careful looking and a clean field come first.',
    sections: [
      {heading: 'Look every week', points: [
        'Walk your plot early in the morning once or twice a week.',
        'Turn over young leaves and look underneath.',
        'Write down or remember which plants have a problem and how many.',
      ]},
      {heading: 'Keep the field clean', points: [
        'Use clean, healthy planting material.',
        'Keep your knives and tools clean, especially when you move between plots.',
        'Remove badly affected young plants or shoots early, and keep them away from the field.',
        'Keep weeds down. They can hide insects.',
      ]},
      {heading: 'Help plants stay strong', points: [
        'Use raised beds and drain channels so water does not stand around the plants.',
        'Mulch the soil so mud does not splash up onto the leaves after rain.',
        'Rotate crops so the same problem does not build up on the same spot.',
      ]},
      {heading: 'Chemicals and getting help', points: [
        'Do not buy, mix or spray any chemical without advice from an agricultural extension officer.',
        'This app does not give chemical amounts. Wrong use can harm you, your family, your animals and your crop.',
        'A photo can help an expert, but a photo alone cannot confirm what is wrong. Treat what you see as a possible cause.',
      ]},
    ],
    keyMessage: 'Look early, keep clean, and ask an extension officer before using any chemical.',
    review: LESSON_REVIEW,
    quiz: [
      {id: 'p1', question: 'When is a good time to look for pests in your field?', options: ['Early in the morning, once or twice a week', 'Only after the crop is lost', 'Never, pests go away alone'], correct: 0,
        explanation: 'Regular looking finds small problems before they spread.'},
      {id: 'p2', question: 'What should you do before buying or using a chemical spray?', options: ['Ask an agricultural extension officer', 'Mix two products to make it stronger', 'Copy what a stranger said'], correct: 0,
        explanation: 'Wrong products or amounts can harm people, animals and crops. A trained officer can advise you safely.'},
      {id: 'p3', question: 'Why keep knives and tools clean?', options: ['Clean tools look better', 'Dirty tools can carry a problem from one plant or plot to another', 'It makes the knife sharper'], correct: 1,
        explanation: 'Sap and dirt on tools can spread disease between plants.'},
      {id: 'p4', question: 'A photo of a sick leaf shows a spot. What is the best way to treat the photo?', options: ['As proof of exactly what is wrong', 'As a help for an expert, with the cause still only a possibility', 'As a reason to spray at once'], correct: 1,
        explanation: 'A photo helps, but only a trained person looking at your field can say more. Treat the cause as possible, not confirmed.'},
    ],
  },
  {
    id: 'harvest-storage',
    title: 'Harvesting and storage',
    subtitle: 'Pick at the right time, dry well, store dry',
    minutes: 5,
    intro: 'Much food is lost after harvest. Careful picking, good drying and clean, dry storage protect your work.',
    sections: [
      {heading: 'Harvest with care', points: [
        'Harvest when the crop is ready, not too early and not too late.',
        'Handle roots, fruit and vegetables gently so they do not bruise or crack.',
        'Sort out bruised or cracked items right away, so rot does not spread to the rest.',
      ]},
      {heading: 'Dry well', points: [
        'Dry rice, maize or pepper on raised mats or clean tarpaulins.',
        'Never dry food on bare damp ground or on a dusty road.',
      ]},
      {heading: 'Store dry and off the floor', points: [
        'Keep dry grain in clean sacks.',
        'Stack sacks on wooden pallets, away from damp walls, cement floors and leaking roofs.',
        'Never treat food grain with chemicals that are not approved for food. Ask an extension officer.',
      ]},
      {heading: 'Fresh roots', points: [
        'Fresh cassava spoils in 2 to 3 days. Process extra roots quickly into dry gari or clean dry chips.',
        'Store dried products in clean, moisture-proof bags.',
      ]},
    ],
    keyMessage: 'Sort early, dry on clean mats, and store dry sacks on pallets away from damp.',
    review: LESSON_REVIEW,
    quiz: [
      {id: 'h1', question: 'What should you do with bruised or cracked roots and vegetables?', options: ['Mix them back in with the good ones', 'Sort them out right away', 'Leave them until the end of the week'], correct: 1,
        explanation: 'One rotting item can spoil the others, so remove it early.'},
      {id: 'h2', question: 'Where should grain bags be stacked?', options: ['On wooden pallets, away from damp walls and leaks', 'On bare cement next to a damp wall', 'Outside in the rain'], correct: 0,
        explanation: 'Pallets keep air moving under the bags. Damp causes mould and rot.'},
      {id: 'h3', question: 'What is the safe rule about treating stored food grain with chemicals?', options: ['Use any chemical you can find', 'Never use chemicals that are not approved for food, and ask an extension officer', 'Use more than you think you need'], correct: 1,
        explanation: 'Unapproved chemicals can poison people. An officer can tell you what is safe.'},
      {id: 'h4', question: 'You have more fresh cassava than you can sell. What is a good choice?', options: ['Leave it in the field for weeks', 'Pile it in the sun on the road', 'Process the extra quickly into dry gari or clean dry chips'], correct: 2,
        explanation: 'Fresh cassava spoils in 2 to 3 days, so quick processing saves it.'},
    ],
  },
];

export function getLesson(id: string | undefined): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
