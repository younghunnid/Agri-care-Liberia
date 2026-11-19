import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle, ArrowLeft, Bird, Camera, CheckCircle2, Leaf, OctagonAlert, RefreshCw, Sprout, Trash2, Wifi, WifiOff} from 'lucide-react';
import {LIBERIA_COUNTIES} from '../../../server/constants';
import {BAND_INFO, CROP_LABELS, NO_CONFIDENCE_NOTE, SIMULATED_BANNER, TRIAGE_CASES, caseById, casesForCrop, type TriageBand, type TriageCrop} from '../../data/triageCases';
import {evaluateTriage, type TriageResult} from '../../lib/triageRules';
import {MAX_PHOTO_CHARS, newId, photoProblem, type SavedAssessment} from '../../lib/triageStore';
import {buildEscalationDraft} from '../../lib/triageEscalation';
import {adviceClient, triageStore, triageSync} from '../../lib/triageApp';
import {cardSeedBySlug} from '../../data/adviceCardsSeed';
import {bundledFull, type CardFullView, type CardSource} from '../../lib/adviceCardsClient';
import {saveQuestionDraft, queueRecord} from '../../lib/offlineDrafts';
import {syncSoon} from '../../lib/syncEngine';
import {compressImageFileToBase64} from '../../lib/demoStorage';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';
import {SpeakButton} from '../../components/SpeakButton';
import {AdviceCardView} from '../../components/advice/AdviceCardView';

type Stage = 'crop' | 'case' | 'questions' | 'extras' | 'result';
const CROP_ICON: Record<TriageCrop, React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>> = {cassava: Leaf, rice: Sprout, poultry: Bird};
const BAND_STYLE: Record<TriageBand, {cls: string; Icon: React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>}> = {
  green: {cls: 'bg-[#DDEFE0] border-[#16803C] text-[#0F5C2A]', Icon: CheckCircle2},
  yellow: {cls: 'bg-[#FFF1C2] border-[#B7791F] text-[#4A2F00]', Icon: AlertTriangle},
  red: {cls: 'bg-[#FDE2E2] border-[#B42318] text-[#7A1010]', Icon: OctagonAlert},
};

function syncText(a: SavedAssessment): string {
  if (!a.share) return 'Kept on this phone only. Not sent anywhere.';
  switch (a.sync.status) {
    case 'synced': return `Added to the anonymous county counts. Receipt ${a.sync.receipt?.ref ?? ''}${a.sync.receipt?.status === 'DUPLICATE' ? ' (already received earlier, nothing was counted twice)' : ''}.`;
    case 'pending': return a.sync.lastError ? `Waiting to send. ${a.sync.lastError}` : 'Waiting to send. It will be sent when you are online.';
    case 'failed': return `Not sent. ${a.sync.lastError ?? ''} Your check is still saved on this phone.`;
    default: return 'Kept on this phone only.';
  }
}

/** Farmer crop check: SIMULATED, rule-based, symptom-guided. Works fully offline; every result is labelled as not a diagnosis. */
export const CropCheckPage: React.FC = () => {
  const {isOnline, user} = useApp();
  const [stage, setStage] = useState<Stage>('crop');
  const [crop, setCrop] = useState<TriageCrop | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [county, setCounty] = useState<string>(user?.county && (LIBERIA_COUNTIES as readonly string[]).includes(user.county) ? user.county : 'Bong');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [share, setShare] = useState(false);
  const [current, setCurrent] = useState<{a: SavedAssessment; result: Extract<TriageResult, {ok: true}>; card: CardFullView; source: CardSource} | null>(null);
  const [saved, setSaved] = useState<SavedAssessment[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [sendPhoto, setSendPhoto] = useState(false);
  const [askName, setAskName] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async () => { try { setSaved(await triageStore.list()); } catch { setSaved([]); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { headingRef.current?.focus(); }, [stage, current?.a.id]);
  // The open result follows the stored record, so a send that finishes after the result appeared (receipt, retry wait, failure) is shown at once.
  useEffect(() => {
    setCurrent((c) => {
      if (!c) return c;
      const fresh = saved.find((s) => s.id === c.a.id);
      return fresh && (JSON.stringify(fresh.sync) !== JSON.stringify(c.a.sync) || fresh.escalated !== c.a.escalated) ? {...c, a: fresh} : c;
    });
  }, [saved]);
  useEffect(() => { if (isOnline) void triageSync.sync().then(refresh).catch(() => undefined); }, [isOnline, refresh]);

  const theCase = caseId ? caseById(caseId) : undefined;
  const allAnswered = theCase ? theCase.questions.every((q) => answers[q.id]) : false;
  const step = stage === 'crop' ? 1 : stage === 'case' ? 2 : stage === 'questions' ? 3 : stage === 'extras' ? 4 : 5;

  const reset = () => { setStage('crop'); setCrop(null); setCaseId(null); setAnswers({}); setPhoto(null); setPhotoMsg(null); setShare(false); setCurrent(null); setMsg(null); setAskOpen(false); setSendPhoto(false); };

  const onPhoto = async (file: File | undefined) => {
    setPhotoMsg(null);
    if (!file) return;
    try {
      let out = await compressImageFileToBase64(file, 800);
      if (out.dataUrl.length > MAX_PHOTO_CHARS) out = await compressImageFileToBase64(file, 520);
      const problem = photoProblem(out.dataUrl);
      if (problem) { setPhoto(null); setPhotoMsg(problem); return; }
      setPhoto(out.dataUrl);
    } catch (e) { setPhoto(null); setPhotoMsg((e as Error).message || 'Could not use that photo. You can continue without it.'); }
  };

  const loadCard = async (slug: string): Promise<{card: CardFullView; source: CardSource}> => {
    const r = await adviceClient.getCard(slug);
    if (r) return {card: r.data, source: r.source};
    const seed = cardSeedBySlug(slug)!;
    return {card: bundledFull(seed), source: 'bundled'};
  };

  const showResult = async () => {
    if (!caseId) return;
    const result = evaluateTriage(caseId, answers);
    if (!result.ok) { setMsg(result.error); return; }
    const {card, source} = await loadCard(result.cardSlug);
    const a: SavedAssessment = {
      id: newId(), opId: newId(), caseId: result.caseId, crop: result.crop, county, answers: {...answers}, score: result.score, band: result.band,
      cardSlug: result.cardSlug, adviceCode: card.code, adviceVersion: card.version, adviceLevel: card.verification.level, createdAt: new Date().toISOString(),
      photo: photo ? {dataUrl: photo, addedAt: new Date().toISOString()} : undefined, share, escalated: false,
      sync: {status: share ? 'pending' : 'local', attempts: 0, nextAttemptAt: 0},
    };
    try { await triageStore.save(a); setMsg('Saved on this phone.'); } catch (e) { setMsg(`Not saved: ${(e as Error).message}`); }
    setCurrent({a, result, card, source}); setStage('result'); void refresh();
    if (share && isOnline) void triageSync.sync().then(refresh);
  };

  const openSaved = async (a: SavedAssessment) => {
    const result = evaluateTriage(a.caseId, a.answers);
    if (!result.ok) { setMsg('This saved check uses an older list of questions and cannot be opened.'); return; }
    const {card, source} = await loadCard(a.cardSlug);
    setMsg(null); setAskOpen(false); setSendPhoto(false); setCurrent({a, result, card, source}); setStage('result');
  };

  const removeSaved = async (a: SavedAssessment) => {
    await triageStore.remove(a.id); if (current?.a.id === a.id) reset(); await refresh(); setMsg('Deleted from this phone.');
  };
  const retry = async () => { setMsg('Trying to send...'); await triageSync.sync({manual: true}); await refresh(); setMsg(null); };

  const sendQuestion = async () => {
    if (!current) return;
    try {
      const draft = buildEscalationDraft(current.a, {sendPhoto: sendPhoto && Boolean(current.a.photo), farmerName: askName});
      const rec = await saveQuestionDraft(draft);
      await queueRecord('question', rec.localId);
      syncSoon();
      await triageStore.update(current.a.id, (x) => ({...x, escalated: true}));
      setCurrent({...current, a: {...current.a, escalated: true}}); setAskOpen(false); await refresh();
      setMsg(isOnline ? 'Your question is on its way to an extension officer. Follow it on the Ask an Expert page.' : 'Your question is saved on this phone. It will be sent when you are online.');
    } catch (e) { setMsg(`Could not prepare the question: ${(e as Error).message}`); }
  };

  const spokenResult = useMemo(() => current ? `${BAND_INFO[current.a.band].label}. ${BAND_INFO[current.a.band].headline} ${current.result.actions.join(' ')} This is a simulated check and not a diagnosis.` : '', [current]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="crop-check-page">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel kind="simulated" text="Simulated check" /><StatusLabel kind="draft" /></div>
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl font-extrabold text-[#183B2B] focus:outline-none">Check my crop</h1>
        <p className="text-base text-[#183B2B]/85">Answer a few simple questions about what you see. You get a colour, an advice card and what to do next. <strong>This is not a diagnosis.</strong></p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${isOnline ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-amber-100 text-amber-900'}`}>
          {isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}
          {isOnline ? 'Online' : 'Offline: this page still works and saves on your phone'}
        </p>
      </header>

      <div aria-live="polite" role="status" className="min-h-[1.5rem] text-base font-bold text-[#0F5C2A]" data-testid="check-message">{msg}</div>

      {stage !== 'result' && <p className="text-sm font-bold text-[#183B2B]/75" data-testid="check-step">Step {step} of 4</p>}

      {stage === 'crop' && (
        <section aria-labelledby="s-crop" className="space-y-3">
          <h2 id="s-crop" className="text-xl font-extrabold text-[#183B2B]">1. What are you checking?</h2>
          <div className="grid gap-3">
            {(Object.keys(CROP_LABELS) as TriageCrop[]).map((c) => { const Icon = CROP_ICON[c]; return (
              <button key={c} type="button" onClick={() => { setCrop(c); setCaseId(null); setAnswers({}); setStage('case'); }} data-testid={`crop-${c}`}
                className="min-h-[64px] rounded-2xl border-2 border-[#183B2B]/20 bg-white px-4 text-left text-xl font-extrabold text-[#183B2B] flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-[#16803C]">
                <Icon className="w-7 h-7 text-[#16803C]" aria-hidden /> {CROP_LABELS[c]}
              </button>); })}
          </div>
        </section>
      )}

      {stage === 'case' && crop && (
        <section aria-labelledby="s-case" className="space-y-3">
          <button type="button" onClick={() => setStage('crop')} className="inline-flex items-center gap-1 min-h-[44px] font-bold text-[#0F5C2A] underline"><ArrowLeft className="w-4 h-4" aria-hidden /> Back</button>
          <h2 id="s-case" className="text-xl font-extrabold text-[#183B2B]">2. What do you see on your {CROP_LABELS[crop].toLowerCase()}?</h2>
          <div className="grid gap-3">
            {casesForCrop(crop).map((c) => (
              <button key={c.id} type="button" onClick={() => { setCaseId(c.id); setAnswers({}); setStage('questions'); }} data-testid={`case-${c.id}`}
                className="min-h-[72px] rounded-2xl border-2 border-[#183B2B]/20 bg-white px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-[#16803C]">
                <span className="block text-lg font-extrabold text-[#183B2B]">{c.title}</span>
                <span className="block text-sm text-[#183B2B]/80 mt-1">{c.whatYouSee}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {stage === 'questions' && theCase && (
        <section aria-labelledby="s-q" className="space-y-5">
          <button type="button" onClick={() => setStage('case')} className="inline-flex items-center gap-1 min-h-[44px] font-bold text-[#0F5C2A] underline"><ArrowLeft className="w-4 h-4" aria-hidden /> Back</button>
          <h2 id="s-q" className="text-xl font-extrabold text-[#183B2B]">3. {theCase.title}</h2>
          {theCase.questions.map((q) => (
            <fieldset key={q.id} className="space-y-2" data-testid={`q-${q.id}`}>
              <legend className="text-lg font-bold text-[#183B2B]">{q.text}</legend>
              {q.hint && <p className="text-sm text-[#183B2B]/75">{q.hint}</p>}
              {q.options.map((o) => (
                <label key={o.id} className={`flex items-center gap-3 min-h-[52px] rounded-xl border-2 px-3 py-2 cursor-pointer text-base ${answers[q.id] === o.id ? 'border-[#16803C] bg-[#DDEFE0] font-bold' : 'border-[#183B2B]/20 bg-white'}`}>
                  <input type="radio" name={q.id} value={o.id} checked={answers[q.id] === o.id} onChange={() => setAnswers((a) => ({...a, [q.id]: o.id}))} className="w-6 h-6 accent-[#16803C]" data-testid={`a-${q.id}-${o.id}`} />
                  <span>{o.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <div className="space-y-1">
            <label htmlFor="county" className="text-lg font-bold text-[#183B2B]">Your county</label>
            <select id="county" value={county} onChange={(e) => setCounty(e.target.value)} className="w-full min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 px-3 text-base bg-white" data-testid="county">
              {LIBERIA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button type="button" disabled={!allAnswered} onClick={() => setStage('extras')} data-testid="to-extras"
            className="w-full min-h-[56px] rounded-2xl bg-[#16803C] text-white text-lg font-extrabold disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]">Next</button>
        </section>
      )}

      {stage === 'extras' && theCase && (
        <section aria-labelledby="s-x" className="space-y-5">
          <button type="button" onClick={() => setStage('questions')} className="inline-flex items-center gap-1 min-h-[44px] font-bold text-[#0F5C2A] underline"><ArrowLeft className="w-4 h-4" aria-hidden /> Back</button>
          <h2 id="s-x" className="text-xl font-extrabold text-[#183B2B]">4. Optional: photo and sharing</h2>
          <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-3">
            <h3 className="text-lg font-bold text-[#183B2B]">Add a photo (optional)</h3>
            <p className="text-sm text-[#183B2B]/85" data-testid="photo-notice"><strong>The photo is not analysed by any computer program.</strong> It is only kept on this phone with this check, so you or an officer can look at it later. It is never sent unless you choose to send it to an extension officer.</p>
            <label className="inline-flex items-center gap-2 min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 px-4 font-bold cursor-pointer focus-within:ring-2 focus-within:ring-[#16803C]">
              <Camera className="w-5 h-5" aria-hidden /> {photo ? 'Change photo' : 'Take or choose a photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" data-testid="photo-input" onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </label>
            {photo && (
              <div className="space-y-2">
                <img src={photo} alt="The photo you chose, kept on this phone" className="max-h-48 rounded-xl border border-[#183B2B]/15" data-testid="photo-preview" />
                <button type="button" onClick={() => { setPhoto(null); setPhotoMsg(null); }} className="min-h-[44px] font-bold text-[#7A1010] underline">Remove photo</button>
              </div>
            )}
            {photoMsg && <p className="text-sm font-bold text-[#7A1010]" role="alert">{photoMsg}</p>}
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-white border border-[#183B2B]/10 p-4 cursor-pointer">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="w-6 h-6 mt-0.5 accent-[#16803C]" data-testid="share-box" />
            <span className="text-base text-[#183B2B]"><strong>Add my result to the anonymous county counts.</strong> Only the situation, your answers, the colour and your county are sent. No name, no phone number and no photo. Leave this empty to keep everything on this phone.</span>
          </label>
          <button type="button" onClick={() => void showResult()} data-testid="show-result"
            className="w-full min-h-[56px] rounded-2xl bg-[#16803C] text-white text-lg font-extrabold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]">Show my result</button>
        </section>
      )}

      {stage === 'result' && current && (() => {
        const {a, result, card, source} = current;
        const {cls, Icon} = BAND_STYLE[a.band];
        const theC = caseById(a.caseId);
        return (
          <section aria-labelledby="s-r" className="space-y-5" data-testid="check-result" data-band={a.band}>
            <p role="note" className="rounded-2xl border-2 border-[#4A2F00]/40 bg-[#FFF8E1] p-4 text-base font-bold text-[#4A2F00]" data-testid="simulated-banner">{SIMULATED_BANNER}</p>
            <div className={`rounded-3xl border-4 p-5 space-y-2 ${cls}`}>
              <h2 id="s-r" ref={headingRef} tabIndex={-1} className="flex items-center gap-3 text-2xl font-extrabold focus:outline-none" data-testid="band-label"><Icon className="w-8 h-8 shrink-0" aria-hidden /> {BAND_INFO[a.band].label}</h2>
              <p className="text-lg font-bold">{result.headline}</p>
              <ul className="list-disc pl-6 space-y-1 text-base" data-testid="band-actions">{result.actions.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            {a.band === 'red' && (
              <div role="alert" className="rounded-2xl border-2 border-[#B42318] bg-white p-4 space-y-2" data-testid="emergency-box">
                <h3 className="text-xl font-extrabold text-[#7A1010]">Emergency guidance</h3>
                <p className="text-base text-[#183B2B]">Do not wait. Contact your county agriculture or veterinary officer today. If you cannot reach one, ask the nearest agriculture office or a trusted extension worker. Keep sick animals or affected plants away from healthy ones until you have been advised.</p>
              </div>
            )}
            <SpeakButton id="check-result-speak" label="Listen to this result" text={spokenResult} />
            <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-2">
              <h3 className="text-lg font-extrabold text-[#183B2B]">Why this colour</h3>
              <p className="text-sm text-[#183B2B]/85">Situation: {theC?.title}. A fixed point table adds up your answers. {NO_CONFIDENCE_NOTE}</p>
              <ul className="space-y-1 text-base text-[#183B2B]">{result.reasons.map((r) => <li key={r.questionId}>{r.question} <strong>{r.answer}</strong></li>)}</ul>
              <p className="text-sm text-[#183B2B]/85">County: {a.county}. Reference of this check on this phone: {a.id.slice(0, 8)}.</p>
              {a.photo && <img src={a.photo.dataUrl} alt="Your photo, kept on this phone and not analysed" className="max-h-40 rounded-xl border border-[#183B2B]/15" data-testid="result-photo" />}
            </div>
            <AdviceCardView card={card} source={source} showHistory={false} />
            <p className="text-sm text-[#183B2B]/85" data-testid="sync-text">{syncText(a)}</p>
            {a.share && a.sync.status === 'failed' && <button type="button" onClick={() => void retry()} className="inline-flex items-center gap-2 min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 px-4 font-bold"><RefreshCw className="w-4 h-4" aria-hidden /> Try again</button>}

            <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-3">
              <h3 className="text-lg font-extrabold text-[#183B2B]">Ask an extension officer</h3>
              {a.escalated && <p className="text-base font-bold text-[#0F5C2A]" data-testid="escalated-note">A question was prepared from this check. <Link to="/experts?tab=dashboard" className="underline">See it on the Ask an Expert page</Link>.</p>}
              {!askOpen && <button type="button" onClick={() => setAskOpen(true)} data-testid="ask-open" className="w-full min-h-[52px] rounded-xl bg-[#183B2B] text-white font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#183B2B]">{a.escalated ? 'Ask again' : 'Ask an extension officer about this'}</button>}
              {askOpen && (
                <div className="space-y-3" data-testid="ask-panel">
                  <p className="text-sm text-[#183B2B]/85">This question will contain: the situation, your answers, the colour, your county and the advice card reference. <strong>It will not contain your phone number.</strong> Replies in this demonstration are simulated.</p>
                  <div><label htmlFor="ask-name" className="text-base font-bold text-[#183B2B]">Your name (optional)</label>
                    <input id="ask-name" value={askName} onChange={(e) => setAskName(e.target.value)} maxLength={80} className="w-full min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 px-3 text-base" /></div>
                  {a.photo ? (
                    <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={sendPhoto} onChange={(e) => setSendPhoto(e.target.checked)} className="w-6 h-6 mt-0.5 accent-[#16803C]" data-testid="send-photo-box" />
                      <span className="text-base text-[#183B2B]">Also send my photo to the extension officer. (Leave empty to keep it on this phone.)</span></label>
                  ) : <p className="text-sm text-[#183B2B]/75">No photo will be sent.</p>}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => void sendQuestion()} data-testid="ask-send" className="flex-1 min-h-[52px] rounded-xl bg-[#16803C] text-white font-bold">Save and send question</button>
                    <button type="button" onClick={() => setAskOpen(false)} className="min-h-[52px] rounded-xl border-2 border-[#183B2B]/25 px-4 font-bold">Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={reset} data-testid="new-check" className="min-h-[52px] rounded-xl bg-[#16803C] text-white font-bold px-5">Start a new check</button>
              <Link to="/advice-cards" className="inline-flex items-center min-h-[52px] rounded-xl border-2 border-[#183B2B]/25 px-5 font-bold text-[#183B2B]">All advice cards</Link>
            </div>
          </section>
        );
      })()}

      <section aria-labelledby="s-saved" className="space-y-3" data-testid="saved-checks">
        <h2 id="s-saved" className="text-xl font-extrabold text-[#183B2B]">Your saved checks (on this phone)</h2>
        {saved.length === 0 && <p className="text-base text-[#183B2B]/80">Nothing saved yet. Every check you make is saved here and opens without internet.</p>}
        <ul className="space-y-3">
          {saved.map((a) => { const {cls} = BAND_STYLE[a.band]; return (
            <li key={a.id} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-2" data-testid="saved-item">
              <p className="text-base font-bold text-[#183B2B]">{caseById(a.caseId)?.title ?? a.caseId}</p>
              <p className="text-sm text-[#183B2B]/80">{new Date(a.createdAt).toLocaleString()} · {a.county}</p>
              <p className={`inline-block rounded-lg border-2 px-2 py-1 text-sm font-bold ${cls}`}>{BAND_INFO[a.band].label}</p>
              <p className="text-sm text-[#183B2B]/85" data-testid="saved-sync">{syncText(a)}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void openSaved(a)} className="min-h-[44px] rounded-xl bg-[#183B2B] text-white font-bold px-4" data-testid="open-saved">Open</button>
                {a.share && a.sync.status === 'failed' && <button type="button" onClick={() => void retry()} className="min-h-[44px] rounded-xl border-2 border-[#183B2B]/25 px-4 font-bold">Try again</button>}
                <button type="button" onClick={() => void removeSaved(a)} className="min-h-[44px] inline-flex items-center gap-1 rounded-xl border-2 border-[#B42318]/50 px-4 font-bold text-[#7A1010]" data-testid="delete-saved"><Trash2 className="w-4 h-4" aria-hidden /> Delete</button>
              </div>
            </li>); })}
        </ul>
        <p className="text-sm"><Link to="/advice-cards" className="font-bold text-[#0F5C2A] underline min-h-[44px] inline-flex items-center">Advice cards and codes</Link></p>
        <p className="text-sm text-[#183B2B]/70">{TRIAGE_CASES.length} situations (cassava, rice, poultry). Simulated demonstration. Not a diagnosis.</p>
      </section>
    </div>
  );
};
