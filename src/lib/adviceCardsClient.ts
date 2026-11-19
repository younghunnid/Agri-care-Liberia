import {ADVICE_CARD_SEED, type AdviceCardSeed} from '../data/adviceCardsSeed';
import {cardVerification, type CardVerification} from './adviceLabels';
import {idbKv, type KvStore} from './kvStore';

/**
 * Advice cards for the phone. Order of preference: the server (newest, with version history) -> the copy saved on this phone the last time it was online
 * -> the demonstration copy bundled in the app (so the six cards open even on a phone that has never been online with this version of the app).
 * Every answer says WHERE it came from, so the screen can say "Saved copy" or "Bundled demonstration copy" instead of implying it is current.
 */
export interface CardLevelView extends CardVerification {reviewerName?: string; reviewerOrg?: string; reviewedAt?: string}
export interface CardSummaryView {code: string; slug: string; crop: string; version: number; title: string; summary: string; createdAt: string; verification: CardLevelView}
export interface CardVersionListItem {version: number; title: string; changeNote: string; createdAt: string; verification: CardLevelView}
export interface CardFullView extends CardSummaryView {steps: string[]; askWhen: string; sourceNote: string; versions?: CardVersionListItem[]}
export type CardSource = 'server' | 'saved' | 'bundled';
export interface Loaded<T> {data: T; source: CardSource; savedAt?: string}

export const LIST_KEY = 'phase1a.advice.list';
export const cardKey = (code: string): string => `phase1a.advice.card.${code}`;
interface Saved<T> {savedAt: string; data: T}

export const bundledSummary = (c: AdviceCardSeed): CardSummaryView => ({
  code: c.code, slug: c.slug, crop: c.crop, version: 1, title: c.title, summary: c.summary, createdAt: '', verification: cardVerification({level: 'demo_sample'}),
});
export const bundledFull = (c: AdviceCardSeed): CardFullView => ({
  ...bundledSummary(c), steps: c.steps, askWhen: c.askWhen, sourceNote: c.sourceNote,
  versions: [{version: 1, title: c.title, changeNote: 'First version (demonstration content)', createdAt: '', verification: cardVerification({level: 'demo_sample'})}],
});

export interface AdviceClientDeps {
  /** GET helper (the app passes apiFetch). Must throw when offline or on an error status. */
  get: <T>(path: string) => Promise<T>;
  kv?: KvStore;
  now?: () => number;
  bundled?: AdviceCardSeed[];
}

export function createAdviceClient(deps: AdviceClientDeps) {
  const kv = deps.kv ?? idbKv;
  const bundled = deps.bundled ?? ADVICE_CARD_SEED;
  const stamp = () => new Date((deps.now ?? Date.now)()).toISOString();
  const remember = async <T>(key: string, data: T): Promise<void> => { try { await kv.set<Saved<T>>(key, {savedAt: stamp(), data}); } catch { /* storage full or blocked: the answer is still returned */ } };

  return {
    async listCards(): Promise<Loaded<CardSummaryView[]>> {
      try {
        const r = await deps.get<{cards: CardSummaryView[]}>('/advice-cards');
        await remember(LIST_KEY, r.cards);
        return {data: r.cards, source: 'server'};
      } catch {
        const saved = await kv.get<Saved<CardSummaryView[]>>(LIST_KEY);
        if (saved?.data?.length) return {data: saved.data, source: 'saved', savedAt: saved.savedAt};
        return {data: bundled.map(bundledSummary), source: 'bundled'};
      }
    },
    /** `ref` is a reference code (ADV-2026-001) or a slug. */
    async getCard(ref: string): Promise<Loaded<CardFullView> | null> {
      const seed = bundled.find((c) => c.code.toLowerCase() === ref.toLowerCase() || c.slug === ref.toLowerCase());
      try {
        const r = await deps.get<{card: CardFullView}>(`/advice-cards/${encodeURIComponent(ref)}`);
        await remember(cardKey(r.card.code), r.card);
        return {data: r.card, source: 'server'};
      } catch (e) {
        if ((e as {status?: number}).status === 404) return null; // the server answered: there is no such card
        const code = seed?.code ?? ref.toUpperCase();
        const saved = await kv.get<Saved<CardFullView>>(cardKey(code));
        if (saved?.data) return {data: saved.data, source: 'saved', savedAt: saved.savedAt};
        return seed ? {data: bundledFull(seed), source: 'bundled'} : null;
      }
    },
    /** While online, keeps a full copy of every card on the phone (small: six cards). Failures are ignored. */
    async prefetchAll(list: CardSummaryView[]): Promise<number> {
      let n = 0;
      for (const c of list) {
        try { const r = await deps.get<{card: CardFullView}>(`/advice-cards/${encodeURIComponent(c.code)}`); await remember(cardKey(r.card.code), r.card); n++; } catch { /* offline or unavailable */ }
      }
      return n;
    },
  };
}
export type AdviceClient = ReturnType<typeof createAdviceClient>;

export const SOURCE_LABELS: Record<CardSource, string> = {
  server: 'Up to date from the server',
  saved: 'Saved copy on this phone (may be older than the server)',
  bundled: 'Demonstration copy built into the app (version 1)',
};
