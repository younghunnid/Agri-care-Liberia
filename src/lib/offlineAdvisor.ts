import {getOfflineGuides, type OfflineGuideRecord} from './offlineStorage';
import {getLibraryEntries, isOutdated, moduleLabel, type LibraryEntry, type ModuleKey} from './offlineLibrary';

/**
 * Offline Guide Assistant: a small, deterministic, fully local search over guides saved on the
 * device. It NEVER generates text. Everything it shows is an excerpt copied word-for-word from a
 * saved guide, with the guide named as the source. There is no network code in this file.
 *
 * Method (same input -> same output):
 *  1. Normalise the question, drop filler words, reduce words to a rough stem.
 *  2. Each question word may match a guide word exactly, through a short list of farming synonyms
 *     (e.g. hen -> chicken) at lower weight, or through a spelling tolerance (edit distance) at lower
 *     weight.
 *  3. Rank guides with a TF-IDF-style score (title and headings count more than body text).
 *  4. Answer only if enough of the question's meaningful words are covered; otherwise say so.
 */

export type SourceModule = ModuleKey;

export interface CorpusDoc {
  id: string;
  kind: 'library' | 'guide';
  module: SourceModule;
  title: string;
  subtitle: string;
  summary: string;
  units: {heading: string; text: string}[];
  safetyNotice: string;
  lastUpdated: string | null;
  to: string;
  isSample: boolean;
}

export interface Excerpt {
  heading: string;
  text: string;
}

export interface AdvisorSource {
  id: string;
  kind: 'library' | 'guide';
  module: SourceModule;
  moduleLabel: string;
  title: string;
  to: string;
  excerpts: Excerpt[];
  safetyNotice: string;
  lastUpdated: string | null;
  outdated: boolean;
  isSample: boolean;
  score: number;
  coverage: number;
}

export type Confidence = 'good' | 'weak' | 'none' | 'empty';

export interface AdvisorAnswer {
  confidence: Confidence;
  query: string;
  matchedWords: string[];
  sources: AdvisorSource[];
  /** Plain warnings the interface must show (dose / weather / price questions). */
  notes: string[];
  corpusSize: number;
}

// ---------------------------------------------------------------- text helpers

const STOPWORDS = new Set(
  (
    'a an and are as at be but by can could did do does for from get got had has have how i if in into is it its just ' +
    'me my no not of on or our so should than that the their them then there these they this to up us was we were ' +
    'what when where which who why will with would you your am been being very much many some any more most ' +
    'please help need want know tell about problem problems issue issues farm farms farmer farming liberia liberian ' +
    'thing things way ways make use using used going go day days time best good bad new old ' +
    'want like also still keep'
  ).split(' ')
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 0);
}

/** Meaningful (stemmed) words of a question. */
export function contentTerms(text: string): string[] {
  const out: string[] = [];
  for (const t of tokens(text)) {
    if (STOPWORDS.has(t)) continue;
    if (t.length < 2 && !/\d/.test(t)) continue;
    const s = stem(t);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

// Farming-word groups: a question word may be answered by any word in its group, at reduced weight.
// These only widen what is SEARCHED; they never add advice text.
const SYNONYM_GROUPS: string[][] = [
  ['chicken', 'hen', 'fowl', 'poultry', 'rooster', 'broiler', 'layer', 'chick', 'egg'],
  ['fish', 'tilapia', 'catfish', 'aquaculture', 'pond'],
  ['cassava', 'casava', 'cassada', 'manioc'],
  ['rice', 'paddy', 'swamp', 'upland'],
  ['goat', 'sheep', 'cattle', 'cow', 'pig', 'livestock', 'animal'],
  ['pest', 'insect', 'bug', 'borer', 'worm', 'pests', 'disease', 'blight', 'mosaic', 'spot'],
  ['soil', 'land', 'fertility', 'compost', 'manure', 'mulch'],
  ['harvest', 'store', 'storage', 'dry', 'drying', 'spoilage', 'mold'],
  ['sell', 'market', 'buyer', 'price', 'trader'],
  ['loan', 'credit', 'finance', 'cooperative', 'borrow', 'money'],
  ['plant', 'sow', 'seed', 'seedling', 'nursery', 'transplant'],
  ['rain', 'rainfall', 'season', 'drought', 'flood', 'wet', 'dry'],
  ['weed', 'weeding', 'grass'],
  ['yellow', 'yellowing', 'wilt', 'wilting', 'curl', 'leaf'],
  ['road', 'transport', 'truck', 'logistics'],
  ['tool', 'equipment', 'machine', 'sprayer', 'cutlass'],
];

const synonymIndex = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const stems = group.map(stem);
  for (const s of stems) {
    const set = synonymIndex.get(s) ?? new Set<string>();
    stems.forEach((o) => o !== s && set.add(o));
    synonymIndex.set(s, set);
  }
}

/** Optimal-string-alignment edit distance with an early cap. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev2: number[] = [];
  let prev: number[] = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
    }
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

function fuzzyLimit(len: number): number {
  if (len < 4) return 0;
  return len < 8 ? 1 : 2;
}

// ---------------------------------------------------------------- corpus

export function corpusFromStores(): CorpusDoc[] {
  const docs: CorpusDoc[] = [];
  for (const e of getLibraryEntries() as LibraryEntry[]) {
    docs.push({
      id: e.id,
      kind: 'library',
      module: e.module,
      title: e.title,
      subtitle: e.subtitle,
      summary: e.summary,
      units: e.sections.flatMap((s) => s.items.map((text) => ({heading: s.heading, text}))),
      safetyNotice: e.safetyNotice,
      lastUpdated: e.lastUpdated,
      to: `/offline/read/${encodeURIComponent(e.id)}`,
      isSample: false,
    });
  }
  for (const g of getOfflineGuides() as OfflineGuideRecord[]) {
    docs.push(guideToDoc(g));
  }
  return docs;
}

export function guideToDoc(g: OfflineGuideRecord): CorpusDoc {
  const units: {heading: string; text: string}[] = [];
  let heading = g.title;
  for (const raw of g.contentMarkdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      heading = h[1].trim();
      continue;
    }
    units.push({heading, text: line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '')});
  }
  return {
    id: `guide:${g.id}`,
    kind: 'guide',
    module: g.isPestDisease ? 'pests' : 'crops',
    title: g.title,
    subtitle: `${g.cropName} · ${g.categoryName}`,
    summary: g.summary,
    units,
    safetyNotice: '',
    lastUpdated: g.lastReviewedAt,
    to: `/guides/${g.slug}`,
    isSample: g.isSampleDemo,
  };
}

// ---------------------------------------------------------------- scoring

interface IndexedDoc {
  doc: CorpusDoc;
  /** stemmed word -> weighted term frequency */
  tf: Map<string, number>;
  /** words in the title, subtitle, summary or a section heading (what the guide is ABOUT) */
  topical: Set<string>;
  /** words in the title or subtitle */
  headline: Set<string>;
  unitTokens: Set<string>[];
}

const FIELD_WEIGHT = {title: 4, subtitle: 2, summary: 2, heading: 2, body: 1};

function addField(tf: Map<string, number>, text: string, weight: number): Set<string> {
  const seen = new Set<string>();
  for (const t of tokens(text)) {
    if (STOPWORDS.has(t)) continue;
    const s = stem(t);
    seen.add(s);
    tf.set(s, (tf.get(s) ?? 0) + weight);
  }
  return seen;
}

function indexDoc(doc: CorpusDoc): IndexedDoc {
  const tf = new Map<string, number>();
  const headline = new Set<string>();
  const topical = new Set<string>();
  addField(tf, doc.title, FIELD_WEIGHT.title).forEach((w) => {
    headline.add(w);
    topical.add(w);
  });
  addField(tf, doc.subtitle, FIELD_WEIGHT.subtitle).forEach((w) => {
    headline.add(w);
    topical.add(w);
  });
  addField(tf, doc.summary, FIELD_WEIGHT.summary).forEach((w) => topical.add(w));
  const unitTokens = doc.units.map((u) => {
    addField(tf, u.heading, FIELD_WEIGHT.heading / Math.max(1, doc.units.length / 4)).forEach((w) => topical.add(w));
    return addField(tf, u.text, FIELD_WEIGHT.body);
  });
  return {doc, tf, topical, headline, unitTokens};
}

interface TermMatch {
  word: string;
  weight: number; // 1 exact, <1 related
}

/** Which document words does a question word stand for, and how strongly? */
function expandTerm(term: string, vocab: Set<string>): TermMatch[] {
  const out = new Map<string, number>();
  if (vocab.has(term)) out.set(term, 1);
  for (const syn of synonymIndex.get(term) ?? []) if (vocab.has(syn) && !out.has(syn)) out.set(syn, 0.5);
  const limit = fuzzyLimit(term.length);
  if (limit > 0 && !out.has(term)) {
    for (const w of vocab) {
      if (w[0] !== term[0] || out.has(w) || Math.abs(w.length - term.length) > limit) continue;
      if (editDistance(term, w, limit) <= limit) out.set(w, 0.7);
    }
  }
  return Array.from(out, ([word, weight]) => ({word, weight}));
}

const MIN_COVERAGE = 0.5;
const GOOD_COVERAGE = 0.67;
const MIN_SCORE = 3;

const DOSE_PATTERN = /\b(dose|dosage|how much|mg|ml|gram|grams|litre|liter|spray|sprays|pesticide|insecticide|herbicide|fungicide|chemical|poison|antibiotic|vaccine|vaccinate|medicine|drug|injection|treat|treatment|cure)\b/i;
const WEATHER_PATTERN = /\b(weather|forecast|tomorrow|tonight|next week|will it rain|temperature)\b/i;
const PRICE_PATTERN = /\b(price today|current price|market price|how much does .* cost|selling price)\b/i;

export function searchGuides(query: string, corpus: CorpusDoc[]): AdvisorAnswer {
  const answer: AdvisorAnswer = {confidence: 'none', query, matchedWords: [], sources: [], notes: [], corpusSize: corpus.length};
  if (DOSE_PATTERN.test(query)) {
    answer.notes.push(
      'Saved guides do not give chemical doses, medicines or vaccine schedules. Ask an agricultural extension officer or a veterinary officer when you are connected.'
    );
  }
  if (WEATHER_PATTERN.test(query)) {
    answer.notes.push('This phone cannot give a weather forecast offline. Guides only describe usual planting seasons.');
  }
  if (PRICE_PATTERN.test(query)) {
    answer.notes.push('This phone cannot show current market prices offline.');
  }

  if (corpus.length === 0) {
    answer.confidence = 'empty';
    return answer;
  }

  const terms = contentTerms(query);
  if (terms.length === 0) return answer;

  const indexed = corpus.map(indexDoc);
  const df = new Map<string, number>();
  for (const d of indexed) for (const w of d.tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const n = indexed.length;
  const idf = (w: string) => Math.log(1 + n / (1 + (df.get(w) ?? 0)));

  const globalVocab = new Set(df.keys());
  const expansions = new Map<string, TermMatch[]>(terms.map((t) => [t, expandTerm(t, globalVocab)]));
  const matchedAnywhere = terms.filter((t) => (expansions.get(t) ?? []).length > 0);
  answer.matchedWords = matchedAnywhere;

  // How much each question word matters: rare words (pig, cassava) count more than common ones (sick, turn).
  const meanIdf = Array.from(df.keys()).reduce((sum, w) => sum + idf(w), 0) / Math.max(1, df.size);
  const termWeight = new Map<string, number>(
    terms.map((t) => {
      const ex = expansions.get(t) ?? [];
      return [t, ex.length ? Math.max(...ex.map((m) => idf(m.word))) : meanIdf];
    })
  );
  const totalWeight = Array.from(termWeight.values()).reduce((a, b) => a + b, 0);

  type Scored = {d: IndexedDoc; score: number; coverage: number; used: Map<string, number>};
  const scored: Scored[] = [];
  for (const d of indexed) {
    let score = 0;
    let coveredWeight = 0;
    let topicalHit = false;
    const used = new Map<string, number>(); // doc word -> weight, for excerpt selection
    for (const t of terms) {
      let best = 0;
      let bestWord = '';
      for (const m of expansions.get(t) ?? []) {
        const tfv = d.tf.get(m.word);
        if (!tfv) continue;
        const s = m.weight * (1 + Math.log(tfv)) * idf(m.word);
        if (s > best) {
          best = s;
          bestWord = m.word;
        }
      }
      if (best > 0) {
        score += best;
        coveredWeight += termWeight.get(t) ?? 0;
        used.set(bestWord, 1);
        // One-word questions must name the guide (title/subtitle); longer ones may match a summary or heading.
        if (terms.length === 1 ? d.headline.has(bestWord) : d.topical.has(bestWord)) topicalHit = true;
        // A question word that names the guide itself is the strongest signal.
        if (d.headline.has(bestWord)) score += 1.5 * idf(bestWord);
      }
    }
    // Words found only deep in body text are not enough: the guide must be ABOUT the question.
    if (coveredWeight > 0 && topicalHit) scored.push({d, score, coverage: coveredWeight / totalWeight, used});
  }

  const ranked = scored
    .filter((s) => s.coverage >= MIN_COVERAGE && s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.d.doc.title.localeCompare(b.d.doc.title))
    .slice(0, 3);

  if (ranked.length === 0) return answer;

  answer.sources = ranked.map((r) => {
    const doc = r.d.doc;
    // Excerpts: the saved lines that contain the most matched words, copied unchanged.
    const lineScores = doc.units.map((u, i) => {
      let s = 0;
      r.d.unitTokens[i].forEach((w) => {
        if (r.used.has(w)) s += 1;
      });
      return {i, s};
    });
    const chosen = lineScores
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, 3)
      .sort((a, b) => a.i - b.i)
      .map((x) => doc.units[x.i]);
    const excerpts: Excerpt[] = chosen.length > 0 ? chosen : [{heading: 'Summary', text: doc.summary}];
    return {
      id: doc.id,
      kind: doc.kind,
      module: doc.module,
      moduleLabel: moduleLabel(doc.module),
      title: doc.title,
      to: doc.to,
      excerpts,
      safetyNotice: doc.safetyNotice,
      lastUpdated: doc.lastUpdated,
      outdated: isOutdated(doc.lastUpdated),
      isSample: doc.isSample,
      score: Math.round(r.score * 100) / 100,
      coverage: Math.round(r.coverage * 100) / 100,
    };
  });
  // A single matching word is never enough to call an answer reliable.
  answer.confidence = ranked[0].coverage >= GOOD_COVERAGE && terms.length > 1 ? 'good' : 'weak';
  return answer;
}

export function askOffline(query: string): AdvisorAnswer {
  return searchGuides(query, corpusFromStores());
}
