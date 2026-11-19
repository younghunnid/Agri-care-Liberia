import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {BookOpen, Clock, Wifi, WifiOff} from 'lucide-react';
import {LESSONS} from '../../data/lessons';
import {loadProgress, resetProgress, stateOf, summarise, type ProgressMap} from '../../lib/lessonProgress';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';
import {LessonStateBadge} from '../../components/LessonStateBadge';
import {ConfirmDialog} from '../../components/ConfirmDialog';

/** H2: list of short farming lessons with local progress. Lessons are bundled, so the whole section works offline. */
export const LearnPage: React.FC = () => {
  const {isOnline} = useApp();
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const refresh = useCallback(async () => {
    try { setProgress(await loadProgress()); setProblem(null); }
    catch { setProblem('Your saved progress could not be read on this phone. The lessons still work.'); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const sum = summarise(progress);
  const pct = Math.round((sum.completed / sum.total) * 100);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="learn-page">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel kind="working" /><StatusLabel kind="draft" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Learn farming</h1>
        <p className="text-base text-[#183B2B]/80">Short lessons with a quiz at the end. They work without internet, and your progress is saved on this phone.</p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${isOnline ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-amber-100 text-amber-900'}`} data-testid="online-indicator">
          {isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}
          {isOnline ? 'Online' : 'Offline: lessons and quizzes still work'}
        </p>
        <p className="text-sm text-[#183B2B]/75">All lessons are Team 8 draft content. No agricultural expert has reviewed them yet. They are general education, not advice for your own field.</p>
      </header>

      <section aria-labelledby="progress-h" className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-2">
        <h2 id="progress-h" className="text-lg font-extrabold text-[#183B2B]">Your progress</h2>
        <p className="text-base text-[#183B2B]" data-testid="progress-summary">
          {loaded ? <><strong>{sum.completed}</strong> of {sum.total} lessons completed{sum.inProgress > 0 ? `, ${sum.inProgress} in progress` : ''}</> : 'Loading your progress…'}
        </p>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Lessons completed" className="h-3 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-[#16803C]" style={{width: `${pct}%`}} />
        </div>
        <p className="text-xs text-[#183B2B]/70">A lesson is completed when you score at least 3 out of 5 (or 60 percent) in its quiz.</p>
        {problem && <p role="alert" className="text-sm font-semibold text-amber-900">{problem}</p>}
      </section>

      <ul className="space-y-3" data-testid="lesson-list">
        {LESSONS.map((l, i) => {
          const p = progress[l.id];
          const state = stateOf(p);
          return (
            <li key={l.id} className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-2" data-lesson={l.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-display text-xl font-extrabold text-[#183B2B]"><span className="text-[#0F5C2A]">Lesson {i + 1}.</span> {l.title}</h2>
                <LessonStateBadge state={state} />
              </div>
              <p className="text-sm text-[#183B2B]/80">{l.subtitle}</p>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#183B2B]/75">
                <span className="inline-flex items-center gap-1"><Clock className="w-4 h-4" aria-hidden /> About {l.minutes} minutes</span>
                <span>{l.quiz.length} quiz questions</span>
                {p && p.attempts > 0 && <span data-testid="best-score">Best score: <strong>{p.bestScore} of {p.total}</strong></span>}
              </p>
              <Link to={`/learn/${l.id}`} className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-[#16803C] hover:bg-[#0F6B30] text-white text-base font-bold px-5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]" data-testid={`open-${l.id}`}>
                <BookOpen className="w-5 h-5" aria-hidden /> {state === 'not_started' ? 'Start lesson' : 'Open lesson'}
              </Link>
            </li>
          );
        })}
      </ul>

      {Object.keys(progress).length > 0 && (
        <button type="button" onClick={() => setConfirmReset(true)} className="min-h-[48px] rounded-xl border border-red-200 bg-white text-red-700 text-sm font-bold px-4" data-testid="reset-progress">
          Clear my lesson progress…
        </button>
      )}
      {confirmReset && (
        <ConfirmDialog title="Clear your lesson progress?" confirmLabel="Yes, clear it" onConfirm={() => { setConfirmReset(false); void resetProgress().then(refresh); }} onCancel={() => setConfirmReset(false)}>
          <p>This removes your quiz scores and "read" marks from this phone. The lessons stay. It cannot be undone.</p>
        </ConfirmDialog>
      )}
      <p className="text-xs text-[#183B2B]/60">Coming later: more lessons, audio lessons and local-language lessons. <Link to="/guides" className="underline">More farming guides</Link></p>
    </div>
  );
};
