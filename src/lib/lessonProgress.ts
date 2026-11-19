import {LESSONS, PASS_FRACTION, type Lesson} from '../data/lessons';
import {idbKv, type KvStore} from './kvStore';

export const PROGRESS_KEY = 'h2.lessons.progress';

export interface LessonProgress {
  lessonId: string;
  readAt: string | null;
  attempts: number;
  bestScore: number;
  lastScore: number;
  total: number;
  lastAttemptAt: string | null;
  /** Chosen option per question on the last attempt (null = not answered). */
  lastAnswers: (number | null)[];
}
export type ProgressMap = Record<string, LessonProgress>;
export type LessonState = 'not_started' | 'in_progress' | 'completed';

export interface QuestionResult {
  id: string;
  question: string;
  chosen: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string;
  chosenText: string | null;
  correctText: string;
}
export interface QuizResult {
  score: number;
  total: number;
  percent: number;
  passed: boolean;
  results: QuestionResult[];
}

/** Scores answers. Anything unanswered, out of range or not an integer counts as wrong. */
export function scoreQuiz(lesson: Lesson, answers: (number | null | undefined)[]): QuizResult {
  const results = lesson.quiz.map((q, i): QuestionResult => {
    const a = answers[i];
    const chosen = typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null;
    return {
      id: q.id, question: q.question, chosen, correctIndex: q.correct, correct: chosen === q.correct, explanation: q.explanation,
      chosenText: chosen === null ? null : q.options[chosen], correctText: q.options[q.correct],
    };
  });
  const score = results.filter((r) => r.correct).length;
  const total = lesson.quiz.length;
  return {score, total, percent: total ? Math.round((score / total) * 100) : 0, passed: total > 0 && score / total >= PASS_FRACTION, results};
}

export function stateOf(p: LessonProgress | undefined): LessonState {
  if (!p) return 'not_started';
  if (p.total > 0 && p.bestScore / p.total >= PASS_FRACTION) return 'completed';
  if (p.readAt || p.attempts > 0) return 'in_progress';
  return 'not_started';
}

export function summarise(map: ProgressMap): {completed: number; inProgress: number; total: number} {
  let completed = 0;
  let inProgress = 0;
  for (const l of LESSONS) {
    const s = stateOf(map[l.id]);
    if (s === 'completed') completed++; else if (s === 'in_progress') inProgress++;
  }
  return {completed, inProgress, total: LESSONS.length};
}

const blank = (lessonId: string): LessonProgress => ({lessonId, readAt: null, attempts: 0, bestScore: 0, lastScore: 0, total: 0, lastAttemptAt: null, lastAnswers: []});

/** Rebuilds progress from untrusted stored data: unknown lessons are dropped, numbers are clamped, anything odd resets to a safe value. */
export function sanitizeProgress(raw: unknown): ProgressMap {
  const out: ProgressMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const lesson of LESSONS) {
    const r = (raw as Record<string, Partial<LessonProgress>>)[lesson.id];
    if (!r || typeof r !== 'object') continue;
    const total = lesson.quiz.length;
    const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
    const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
    const p = blank(lesson.id);
    p.readAt = date(r.readAt);
    p.attempts = int(r.attempts, 1000);
    p.total = p.attempts > 0 ? total : 0;
    p.bestScore = Math.min(int(r.bestScore, total), p.total);
    p.lastScore = Math.min(int(r.lastScore, total), p.total);
    p.lastAttemptAt = date(r.lastAttemptAt);
    p.lastAnswers = Array.isArray(r.lastAnswers) ? lesson.quiz.map((q, i) => { const a = r.lastAnswers![i]; return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null; }) : [];
    out[lesson.id] = p;
  }
  return out;
}

export async function loadProgress(kv: KvStore = idbKv): Promise<ProgressMap> {
  return sanitizeProgress(await kv.get<unknown>(PROGRESS_KEY));
}

async function update(lessonId: string, kv: KvStore, fn: (p: LessonProgress) => void): Promise<ProgressMap> {
  const map = await loadProgress(kv);
  if (!LESSONS.some((l) => l.id === lessonId)) return map;
  const p = map[lessonId] ?? blank(lessonId);
  fn(p);
  map[lessonId] = p;
  await kv.set(PROGRESS_KEY, map);
  return map;
}

export const markRead = (lessonId: string, now: Date = new Date(), kv: KvStore = idbKv) =>
  update(lessonId, kv, (p) => { p.readAt ??= now.toISOString(); });

export const recordAttempt = (lesson: Lesson, result: QuizResult, answers: (number | null)[], now: Date = new Date(), kv: KvStore = idbKv) =>
  update(lesson.id, kv, (p) => {
    p.attempts += 1;
    p.total = result.total;
    p.lastScore = result.score;
    p.bestScore = Math.max(p.bestScore, result.score);
    p.lastAttemptAt = now.toISOString();
    p.lastAnswers = lesson.quiz.map((_, i) => answers[i] ?? null);
  });

export async function resetProgress(kv: KvStore = idbKv): Promise<ProgressMap> {
  await kv.set(PROGRESS_KEY, {});
  return {};
}
