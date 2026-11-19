import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {AlertTriangle, ArrowLeft, CheckCircle2, MessageCircleQuestion, RotateCcw, Wifi, WifiOff, XCircle} from 'lucide-react';
import {LESSONS, getLesson} from '../../data/lessons';
import {loadProgress, markRead, recordAttempt, scoreQuiz, stateOf, type LessonProgress, type QuizResult} from '../../lib/lessonProgress';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';
import {LessonStateBadge} from '../../components/LessonStateBadge';
import {SpeakButton} from '../../components/SpeakButton';

/** H2: one lesson (read, listen) plus its multiple-choice quiz with scores and explanations. Progress is saved in IndexedDB. */
export const LessonPage: React.FC = () => {
  const {id} = useParams();
  const lesson = getLesson(id);
  const {isOnline} = useApp();
  const [progress, setProgress] = useState<LessonProgress | undefined>();
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [note, setNote] = useState<{kind: 'ok' | 'err'; text: string} | null>(null);

  const refresh = useCallback(async () => {
    if (!lesson) return;
    try { setProgress((await loadProgress())[lesson.id]); } catch { setNote({kind: 'err', text: 'Saved progress could not be read on this phone.'}); }
  }, [lesson]);
  useEffect(() => { setAnswers(lesson ? lesson.quiz.map(() => null) : []); setResult(null); setNote(null); void refresh(); }, [lesson?.id, refresh]);

  const spoken = useMemo(() => lesson ? [lesson.title, lesson.intro, ...lesson.sections.flatMap((s) => [s.heading, ...s.points]), lesson.keyMessage].join('. ') : '', [lesson]);

  if (!lesson) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-4" data-testid="lesson-not-found">
        <h1 className="font-display text-2xl font-extrabold text-[#183B2B]">Lesson not found</h1>
        <p>We could not find that lesson.</p>
        <Link to="/learn" className="inline-flex items-center min-h-[48px] rounded-xl bg-[#16803C] text-white font-bold px-5">Back to all lessons</Link>
      </div>
    );
  }

  const idx = LESSONS.findIndex((l) => l.id === lesson.id);
  const next = LESSONS[idx + 1];
  const answered = answers.filter((a) => a !== null).length;
  const state = stateOf(progress);

  const saveSafely = async (fn: () => Promise<unknown>, okText: string) => {
    try { await fn(); setNote({kind: 'ok', text: okText}); await refresh(); }
    catch { setNote({kind: 'err', text: 'This phone could not save your progress (storage full or blocked). You can keep using the lesson.'}); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (answered < lesson.quiz.length) return;
    const r = scoreQuiz(lesson, answers);
    setResult(r);
    await saveSafely(() => recordAttempt(lesson, r, answers), 'Your score is saved on this phone.');
    setTimeout(() => document.getElementById('quiz-result')?.focus(), 50);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="lesson-page" data-lesson-id={lesson.id}>
      <Link to="/learn" className="inline-flex items-center gap-1 min-h-[44px] text-sm font-bold text-[#183B2B] underline"><ArrowLeft className="w-4 h-4" aria-hidden /> All lessons</Link>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel kind="working" /><StatusLabel kind="draft" /><LessonStateBadge state={state} /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">{lesson.title}</h1>
        <p className="text-base text-[#183B2B]/80">{lesson.intro}</p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${isOnline ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-amber-100 text-amber-900'}`} data-testid="online-indicator">
          {isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}
          {isOnline ? 'Online' : 'Offline: this lesson and quiz still work'}
        </p>
        <div role="note" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden />
          <p><strong>Team 8 draft.</strong> No agricultural expert has reviewed this lesson yet. It is general education, not advice for your own field. Ask an extension officer before using any chemical.</p>
        </div>
        <SpeakButton id={`lesson-${lesson.id}`} label="this lesson" text={spoken} />
      </header>

      <article className="space-y-4" data-testid="lesson-body">
        {lesson.sections.map((s) => (
          <section key={s.heading} className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-2">
            <h2 className="font-display text-xl font-extrabold text-[#183B2B]">{s.heading}</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-base text-[#183B2B]/90">{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
          </section>
        ))}
        <p className="rounded-2xl bg-[#DDEFE0] border border-[#16803C]/30 p-4 text-base font-bold text-[#0F5C2A]" data-testid="key-message">Remember: {lesson.keyMessage}</p>
      </article>

      <div className="flex flex-wrap gap-3 items-center">
        {progress?.readAt ? (
          <p className="inline-flex items-center gap-2 text-sm font-bold text-[#0F5C2A]" data-testid="read-mark"><CheckCircle2 className="w-5 h-5" aria-hidden /> You marked this lesson as read</p>
        ) : (
          <button type="button" onClick={() => void saveSafely(() => markRead(lesson.id), 'Saved. This lesson is marked as read on this phone.')} data-testid="mark-read"
            className="min-h-[48px] rounded-xl border-2 border-[#16803C] bg-white text-[#0F5C2A] text-base font-bold px-5 focus:outline-none focus:ring-2 focus:ring-[#16803C]">I have read this lesson</button>
        )}
      </div>

      <section aria-labelledby="quiz-h" className="space-y-4 border-t border-[#183B2B]/15 pt-5" data-testid="quiz-section">
        <h2 id="quiz-h" className="font-display text-2xl font-extrabold text-[#183B2B]">Quiz: {lesson.quiz.length} questions</h2>
        {progress && progress.attempts > 0 && <p className="text-sm text-[#183B2B]/80" data-testid="previous-best">Your best score so far: <strong>{progress.bestScore} of {progress.total}</strong> · attempts: {progress.attempts}</p>}

        {!result && (
          <form onSubmit={(e) => void submit(e)} className="space-y-5">
            {lesson.quiz.map((q, qi) => (
              <fieldset key={q.id} className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-2" data-question={q.id}>
                <legend className="text-base font-extrabold text-[#183B2B] px-1">Question {qi + 1}. {q.question}</legend>
                {q.options.map((o, oi) => (
                  <label key={o} className={`flex items-start gap-3 min-h-[52px] rounded-xl border-2 p-3 cursor-pointer ${answers[qi] === oi ? 'border-[#16803C] bg-[#DDEFE0]' : 'border-[#183B2B]/15 bg-white'}`}>
                    <input type="radio" name={q.id} value={oi} checked={answers[qi] === oi} onChange={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))} className="mt-1 w-5 h-5 accent-[#16803C]" data-testid={`answer-${q.id}-${oi}`} />
                    <span className="text-base text-[#183B2B]">{o}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <p className="text-sm text-[#183B2B]/80" aria-live="polite" data-testid="answered-count">{answered} of {lesson.quiz.length} answered{answered < lesson.quiz.length ? '. Answer every question to see your score.' : '.'}</p>
            <button type="submit" disabled={answered < lesson.quiz.length} data-testid="submit-quiz"
              className="w-full min-h-[56px] rounded-2xl bg-[#16803C] disabled:bg-slate-300 disabled:text-slate-700 text-white text-lg font-extrabold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]">See my score</button>
          </form>
        )}

        {result && (
          <div className="space-y-4" data-testid="quiz-results">
            <div id="quiz-result" tabIndex={-1} role="status" className={`rounded-2xl border-2 p-4 space-y-1 focus:outline-none ${result.passed ? 'border-[#16803C] bg-[#DDEFE0] text-[#0F5C2A]' : 'border-amber-400 bg-amber-50 text-amber-950'}`}>
              <p className="text-2xl font-extrabold" data-testid="score">You scored {result.score} out of {result.total} ({result.percent}%)</p>
              <p className="text-base font-semibold">{result.passed ? 'Well done. This lesson is completed.' : 'Not there yet. Read the explanations, then try again.'}</p>
            </div>
            <ol className="space-y-3">
              {result.results.map((r, i) => (
                <li key={r.id} className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-1" data-result={r.correct ? 'correct' : 'wrong'}>
                  <p className="text-base font-extrabold text-[#183B2B]">Question {i + 1}. {r.question}</p>
                  <p className={`inline-flex items-center gap-1 text-sm font-bold ${r.correct ? 'text-[#0F5C2A]' : 'text-red-800'}`}>
                    {r.correct ? <CheckCircle2 className="w-4 h-4" aria-hidden /> : <XCircle className="w-4 h-4" aria-hidden />}{r.correct ? 'Correct' : 'Not quite'}
                  </p>
                  {!r.correct && <p className="text-sm text-[#183B2B]">Your answer: {r.chosenText ?? 'not answered'}</p>}
                  <p className="text-sm text-[#183B2B]">Right answer: <strong>{r.correctText}</strong></p>
                  <p className="text-sm text-[#183B2B]/85">{r.explanation}</p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => { setResult(null); setAnswers(lesson.quiz.map(() => null)); setNote(null); }} data-testid="retry-quiz" className="inline-flex items-center gap-2 min-h-[48px] rounded-xl border-2 border-[#16803C] bg-white text-[#0F5C2A] text-base font-bold px-5"><RotateCcw className="w-5 h-5" aria-hidden /> Try the quiz again</button>
              {next && <Link to={`/learn/${next.id}`} className="inline-flex items-center min-h-[48px] rounded-xl bg-[#16803C] text-white text-base font-bold px-5">Next lesson: {next.title}</Link>}
            </div>
          </div>
        )}
        {note && <p role="status" data-testid="progress-note" className={`text-sm font-semibold rounded-xl p-3 ${note.kind === 'ok' ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-red-50 text-red-800'}`}>{note.text}</p>}
      </section>

      <Link to="/experts" className="flex items-center justify-center gap-2 min-h-[52px] rounded-2xl border-2 border-[#183B2B]/25 bg-white text-[#183B2B] font-bold px-4"><MessageCircleQuestion className="w-5 h-5" aria-hidden /> Have a question? Ask an agricultural expert</Link>
    </div>
  );
};
