import React, {useCallback, useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {CheckCircle2, Download, Trash2, Wifi, WifiOff} from 'lucide-react';
import {LIBERIA_COUNTIES} from '../../../server/constants';
import {CASSAVA_REVIEW, CASSAVA_SYMPTOMS, NONE_OF_THESE_ADVICE, NOT_A_DIAGNOSIS_NOTICE} from '../../data/cassavaProblems';
import {buildSavedGuidance, deleteSavedGuidance, listSavedGuidance, saveGuidance, type SavedGuidance} from '../../lib/cropProblem';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';
import {GuidanceView} from '../../components/GuidanceView';

const OTHER_CROPS = ['Rice', 'Pepper', 'Plantain', 'Vegetables'];

/** H1: guided cassava crop-problem demonstration. Everything here is bundled or stored on the device: no network is needed. */
export const CropProblemsPage: React.FC = () => {
  const {isOnline, user} = useApp();
  const [params] = useSearchParams();
  const demo = params.get('demo') === '1';
  const [cropChosen, setCropChosen] = useState(demo);
  const [county, setCounty] = useState<string>(demo ? 'Bong' : user?.county && (LIBERIA_COUNTIES as readonly string[]).includes(user.county) ? user.county : 'Bong');
  const [picked, setPicked] = useState<string[]>(demo ? ['yellow-patchy-curled'] : []);
  const [none, setNone] = useState(false);
  const [result, setResult] = useState<SavedGuidance | null>(null);
  const [saved, setSaved] = useState<SavedGuidance[]>([]);
  const [openSaved, setOpenSaved] = useState<SavedGuidance | null>(null);
  const [msg, setMsg] = useState<{kind: 'ok' | 'err'; text: string} | null>(null);

  const refresh = useCallback(async () => {
    try { setSaved(await listSavedGuidance()); } catch { setSaved([]); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const toggle = (id: string) => { setNone(false); setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); };

  const showResult = () => {
    setMsg(null); setOpenSaved(null);
    if (none || picked.length === 0) {
      setResult({id: 'none', crop: 'cassava', county, symptomIds: [], symptomLabels: ['None of the listed signs match, or I am not sure'], causes: [], generalGuidance: [NONE_OF_THESE_ADVICE],
        notice: NOT_A_DIAGNOSIS_NOTICE, review: CASSAVA_REVIEW, savedAt: new Date().toISOString()});
      return;
    }
    setResult(buildSavedGuidance(county, picked));
  };

  const save = async (g: SavedGuidance) => {
    try {
      const list = await saveGuidance(g);
      setSaved(list);
      setMsg({kind: 'ok', text: `Saved on this device at ${new Date().toLocaleTimeString()}. You can read it with no internet.`});
    } catch {
      setMsg({kind: 'err', text: 'This device could not save it (storage full or blocked). The advice is still on screen.'});
    }
  };

  const remove = async (id: string) => {
    setSaved(await deleteSavedGuidance(id));
    if (openSaved?.id === id) setOpenSaved(null);
  };

  const restart = () => { setResult(null); setPicked([]); setNone(false); setMsg(null); setOpenSaved(null); setCropChosen(false); };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="crop-problems-page">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel kind="working" /><StatusLabel kind="draft" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Crop problems: cassava</h1>
        <p className="text-base text-[#183B2B]/80">Choose what you see on your cassava. We list possible causes and safe first steps.</p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${isOnline ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-amber-100 text-amber-900'}`} data-testid="online-indicator">
          {isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}
          {isOnline ? 'Online' : 'Offline: this page still works'}
        </p>
      </header>

      {!result && !openSaved && (
        <>
          <section aria-labelledby="step1" className="space-y-3">
            <h2 id="step1" className="text-xl font-extrabold text-[#183B2B]">Step 1. Choose your crop</h2>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setCropChosen(true)} aria-pressed={cropChosen} data-testid="crop-cassava"
                className={`min-h-[64px] rounded-2xl border-2 px-3 text-lg font-extrabold focus:outline-none focus:ring-2 focus:ring-[#16803C] ${cropChosen ? 'border-[#16803C] bg-[#DDEFE0] text-[#0F5C2A]' : 'border-[#183B2B]/25 bg-white text-[#183B2B]'}`}>
                Cassava {cropChosen && <CheckCircle2 className="inline w-5 h-5 ml-1" aria-hidden />}
              </button>
              {OTHER_CROPS.map((c) => (
                <div key={c} aria-disabled="true" className="min-h-[64px] rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-slate-600 flex flex-col justify-center">
                  <span className="font-bold">{c}</span><StatusLabel kind="future" className="self-start mt-1" />
                </div>
              ))}
            </div>
          </section>

          {cropChosen && (
            <section aria-labelledby="step2" className="space-y-3">
              <h2 id="step2" className="text-xl font-extrabold text-[#183B2B]">Step 2. What do you see?</h2>
              <label className="block text-sm font-semibold text-[#183B2B]">Your county
                <select value={county} onChange={(e) => setCounty(e.target.value)} className="mt-1 block w-full min-h-[48px] rounded-xl border border-[#183B2B]/30 bg-white px-3 text-base" data-testid="county-select">
                  {LIBERIA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm text-[#183B2B]/75 mb-1">Tick every sign you can see.</legend>
                {CASSAVA_SYMPTOMS.map((s) => (
                  <label key={s.id} className={`flex items-start gap-3 min-h-[56px] rounded-2xl border-2 p-3 cursor-pointer ${picked.includes(s.id) ? 'border-[#16803C] bg-[#DDEFE0]' : 'border-[#183B2B]/15 bg-white'}`}>
                    <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} className="mt-1 w-6 h-6 accent-[#16803C]" data-testid={`symptom-${s.id}`} />
                    <span><span className="block text-base font-bold text-[#183B2B]">{s.label}</span><span className="block text-xs text-[#183B2B]/70">{s.hint}</span></span>
                  </label>
                ))}
                <label className={`flex items-start gap-3 min-h-[56px] rounded-2xl border-2 p-3 cursor-pointer ${none ? 'border-[#16803C] bg-[#DDEFE0]' : 'border-[#183B2B]/15 bg-white'}`}>
                  <input type="checkbox" checked={none} onChange={(e) => { setNone(e.target.checked); if (e.target.checked) setPicked([]); }} className="mt-1 w-6 h-6 accent-[#16803C]" data-testid="symptom-none" />
                  <span className="text-base font-bold text-[#183B2B]">None of these, or I am not sure</span>
                </label>
              </fieldset>
              <button type="button" onClick={showResult} disabled={picked.length === 0 && !none} data-testid="see-causes"
                className="w-full min-h-[56px] rounded-2xl bg-[#16803C] disabled:bg-slate-300 disabled:text-slate-600 text-white text-lg font-extrabold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]">
                See possible causes
              </button>
            </section>
          )}
        </>
      )}

      {result && (
        <GuidanceView g={result}>
          <div className="space-y-2">
            {result.id !== 'none' && (
              <button type="button" onClick={() => void save(result)} data-testid="save-offline"
                className="w-full min-h-[52px] rounded-2xl border-2 border-[#16803C] bg-white text-[#0F5C2A] text-base font-extrabold flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#16803C]">
                <Download className="w-5 h-5" aria-hidden /> Save this advice for offline reading
              </button>
            )}
            {msg && <p role="status" data-testid="save-message" className={`text-sm font-semibold rounded-xl p-3 ${msg.kind === 'ok' ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
            <button type="button" onClick={restart} className="w-full min-h-[48px] rounded-2xl text-sm font-bold text-[#183B2B] underline">Start again</button>
          </div>
        </GuidanceView>
      )}

      {openSaved && (
        <>
          <button type="button" onClick={() => setOpenSaved(null)} className="min-h-[44px] text-sm font-bold underline text-[#183B2B]">Back</button>
          <p className="text-xs font-semibold text-[#0F5C2A]">Saved copy from {new Date(openSaved.savedAt).toLocaleString()}. Read from this device.</p>
          <GuidanceView g={openSaved} />
        </>
      )}

      <section aria-labelledby="saved-heading" className="space-y-3 border-t border-[#183B2B]/15 pt-5">
        <h2 id="saved-heading" className="text-xl font-extrabold text-[#183B2B]">Saved on this device</h2>
        {saved.length === 0 ? <p className="text-sm text-[#183B2B]/70" data-testid="saved-empty">Nothing saved yet.</p> : (
          <ul className="space-y-2" data-testid="saved-list">
            {saved.map((s) => (
              <li key={s.id} className="rounded-2xl bg-white border border-[#183B2B]/12 p-3 flex items-center justify-between gap-3">
                <button type="button" onClick={() => { setResult(null); setOpenSaved(s); }} className="text-left min-h-[48px] flex-1" data-testid="open-saved">
                  <span className="block text-sm font-bold text-[#183B2B]">Cassava in {s.county}: {s.symptomLabels[0]}</span>
                  <span className="block text-xs text-[#183B2B]/65">{new Date(s.savedAt).toLocaleString()}</span>
                </button>
                <button type="button" onClick={() => void remove(s.id)} aria-label="Delete this saved advice" className="min-w-[48px] min-h-[48px] rounded-xl text-red-700 flex items-center justify-center"><Trash2 className="w-5 h-5" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-[#183B2B]/60">Saved advice stays on this phone only. <Link to="/offline" className="underline">More offline advice</Link></p>
      </section>
    </div>
  );
};
