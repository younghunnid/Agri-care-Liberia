import React, {useMemo, useState, useSyncExternalStore} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle, BookOpen, Clock, Download, Search, ShieldAlert, Smartphone} from 'lucide-react';
import {useApp} from '../context/AppContext';
import {SpeakButton} from './SpeakButton';
import {LIBERIA_COUNTIES} from '../../server/constants';
import {askOffline, type AdvisorAnswer} from '../lib/offlineAdvisor';
import {formatDate, getLibraryEntries, subscribeLibrary} from '../lib/offlineLibrary';
import {getOfflineGuides, subscribeOfflineGuides} from '../lib/offlineStorage';
import {DraftError, saveQuestionDraft} from '../lib/offlineDrafts';

const EXAMPLES = ['How do I plant rice?', 'My goat looks sick', 'Fish gasping in my pond', 'How do I improve poor soil?'];

function useGuideCount(): number {
  const lib = useSyncExternalStore(subscribeLibrary, () => getLibraryEntries().length, () => 0);
  const guides = useSyncExternalStore(subscribeOfflineGuides, () => getOfflineGuides().length, () => 0);
  return lib + guides;
}

/**
 * Shown instead of the live AI composer while offline. It only searches guides saved on this
 * phone (see lib/offlineAdvisor.ts). It makes no network requests and never queues a question.
 */
export const OfflineGuideAssistant: React.FC = () => {
  const {user, language} = useApp();
  const guideCount = useGuideCount();
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<AdvisorAnswer | null>(null);
  const [county, setCounty] = useState<string>(user?.county || 'Bong');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const ask = (q: string) => {
    setSaveMsg(null);
    setSaveErr(null);
    if (q.trim().length < 3) {
      setAnswer(null);
      return;
    }
    setAnswer(askOffline(q));
  };

  const speech = useMemo(() => {
    if (!answer || answer.sources.length === 0) return '';
    const top = answer.sources[0];
    return [`From your saved guide ${top.title}.`, ...top.excerpts.map((e) => e.text), top.safetyNotice ? `Safety notice. ${top.safetyNotice}` : ''].join(' ');
  }, [answer]);

  const saveForExpert = async () => {
    setSaveMsg(null);
    setSaveErr(null);
    try {
      await saveQuestionDraft({
        farmerName: user?.displayName || 'Farmer',
        category: 'General Farming',
        county,
        title: text.trim().slice(0, 80) || 'Farming question',
        description: text.trim() || 'Farming question saved while offline.',
        photoDataUrl: '',
        voiceNoteDataUrl: '',
        voiceNoteSummary: '',
      });
      setSaveMsg('Saved on this phone as a Draft. It is NOT sent. To send it, open Expert Support when you are online and tap Send.');
    } catch (err) {
      setSaveErr(err instanceof DraftError ? err.message : 'Could not save on this phone. Make some space and try again.');
    }
  };

  return (
    <section aria-labelledby="offline-assistant-title" className="rounded-3xl bg-white border-2 border-[#16803C]/40 p-5 sm:p-7 space-y-5">
      <div className="space-y-2">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[#DDEFE0] text-[#16803C] text-xs font-bold px-3 py-1">
          <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
          Offline Guide Assistant · works without internet
        </p>
        <h2 id="offline-assistant-title" className="font-display text-2xl font-extrabold text-[#183B2B]">
          Ask your saved guides
        </h2>
        <p className="text-sm text-[#183B2B]/85">
          This is <strong>not the AI advisor</strong>. It looks for words from your question in the guides saved on this phone and shows the
          matching text. It cannot think, give new advice, or check your farm. Nothing you type here leaves your phone.
        </p>
        {language !== 'en' && (
          <p className="text-xs text-[#183B2B]/75">Saved guides are in English only. This assistant does not translate.</p>
        )}
      </div>

      {guideCount === 0 ? (
        <div role="status" className="rounded-2xl bg-[#F5B942]/25 border border-[#F5B942] p-4 space-y-3">
          <p className="text-sm font-semibold text-[#183B2B]">No guides are saved on this phone yet.</p>
          <p className="text-sm text-[#183B2B]/85">
            The assistant can only use guides you downloaded. Connect to the internet, then download the Starter Pack.
          </p>
          <Link
            to="/offline#starter-pack"
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-2xl bg-[#16803C] text-white text-sm font-bold"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Download Starter Pack
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
          className="space-y-3"
        >
          <label htmlFor="offline-q" className="block text-sm font-bold text-[#183B2B]">
            Type your farming question
          </label>
          <textarea
            id="offline-q"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Example: How do I plant rice in the swamp?"
            className="w-full rounded-2xl border border-[#183B2B]/25 p-3 text-base"
          />
          <div className="flex flex-wrap gap-2" aria-label="Example questions">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setText(ex);
                  ask(ex);
                }}
                className="min-h-[44px] px-3.5 rounded-full border border-[#183B2B]/20 bg-[#F3F8F0] text-xs sm:text-sm font-semibold text-[#183B2B]"
              >
                {ex}
              </button>
            ))}
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 min-h-[52px] px-7 rounded-2xl bg-[#16803C] text-white text-base font-bold"
          >
            <Search className="w-5 h-5" aria-hidden="true" />
            Find in My Guides
          </button>
          <p className="text-xs text-[#183B2B]/70">Searching {guideCount} saved guide{guideCount === 1 ? '' : 's'}.</p>
        </form>
      )}

      {answer && answer.notes.length > 0 && (
        <div className="space-y-2">
          {answer.notes.map((n) => (
            <p key={n} role="note" className="rounded-xl bg-[#F5B942]/25 border border-[#F5B942] px-3 py-2 text-sm font-medium text-[#183B2B] flex gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              {n}
            </p>
          ))}
        </div>
      )}

      {answer && answer.confidence === 'none' && (
        <div role="status" className="rounded-2xl bg-gray-50 border border-gray-300 p-4 space-y-2">
          <p className="font-bold text-[#183B2B]">No reliable guidance found in your saved guides.</p>
          <p className="text-sm text-[#183B2B]/85">
            We will not guess. Try different words (for example the crop or animal name), or download more guides. When you are connected, contact
            your <strong>county agricultural extension officer</strong>, or ask the Expert Support team.
          </p>
        </div>
      )}

      {answer && answer.sources.length > 0 && (
        <div className="space-y-4" aria-live="polite">
          <div className="rounded-xl bg-[#DDEFE0] px-4 py-3 text-sm text-[#183B2B]">
            <p className="font-bold">Offline Guide Information</p>
            <p>
              Taken word-for-word from guides saved on this phone. It is <strong>not</strong> an AI answer and not advice for your exact farm.
              {answer.confidence === 'weak' && ' These guides match only part of your question, so they may not answer it.'}
            </p>
          </div>

          {answer.sources.map((src, i) => (
            <article key={src.id} className="rounded-2xl border border-[#183B2B]/15 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[#16803C]">
                  {i === 0 ? 'Best match' : 'Also helpful'} · {src.moduleLabel}
                </p>
                <h3 className="font-display text-lg font-bold text-[#183B2B]">
                  <Link to={src.to} className="underline decoration-[#16803C]/40 hover:text-[#16803C] inline-flex items-start gap-1.5">
                    <BookOpen className="w-4 h-4 mt-1.5 shrink-0" aria-hidden="true" />
                    {src.title}
                  </Link>
                </h3>
                <p className="text-xs text-[#183B2B]/70 flex flex-wrap items-center gap-x-3">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    {src.lastUpdated ? `Updated ${formatDate(src.lastUpdated)}` : 'Update date unknown'}
                  </span>
                  <span>Saved guide on this phone</span>
                  {src.isSample && <span className="font-semibold text-amber-800">Sample demonstration content</span>}
                </p>
                {src.outdated && (
                  <p role="status" className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900">
                    This guide is over a year old and may be outdated. Check with an extension officer, and update your downloads when online.
                  </p>
                )}
              </div>

              <ul className="space-y-2">
                {src.excerpts.map((ex) => (
                  <li key={ex.text} className="text-sm text-[#183B2B] leading-relaxed">
                    <span className="block text-xs font-bold text-[#183B2B]/60">{ex.heading}</span>
                    {ex.text}
                  </li>
                ))}
              </ul>

              {src.safetyNotice && (
                <aside aria-label="Safety notice" className="rounded-xl bg-[#F5B942]/25 border border-[#F5B942] p-3 flex gap-2 text-sm text-[#183B2B]">
                  <ShieldAlert className="w-5 h-5 shrink-0 text-[#8A5A00]" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Safety notice from this guide</p>
                    <p>{src.safetyNotice}</p>
                  </div>
                </aside>
              )}
              <Link to={src.to} className="inline-flex items-center min-h-[44px] text-sm font-bold text-[#16803C] underline">
                Open the full guide
              </Link>
            </article>
          ))}

          {speech && <SpeakButton id="offline-assistant-answer" label="Offline guide answer" text={speech} />}
          <p className="text-xs text-[#183B2B]/65">
            Read aloud uses your phone's voice. It may not work without internet on some phones; the text above always works.
          </p>
        </div>
      )}

      {answer && (
        <div className="rounded-2xl bg-[#F3F8F0] border border-[#16803C]/20 p-4 space-y-3">
          <p className="text-sm font-bold text-[#183B2B]">Want a person to answer?</p>
          <p className="text-xs text-[#183B2B]/80">
            You can keep this question on your phone as a draft. It is <strong>never sent unless you choose to send it</strong> from Expert Support.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-[#183B2B]">
              County
              <select
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="block mt-1 min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm bg-white"
              >
                {LIBERIA_COUNTIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void saveForExpert()}
              className="min-h-[48px] px-5 rounded-2xl border-2 border-[#16803C] text-[#16803C] text-sm font-bold bg-white"
            >
              Save question for an expert (not sent)
            </button>
          </div>
          {saveMsg && (
            <p role="status" className="text-sm font-semibold text-[#16803C]">
              {saveMsg}{' '}
              <Link to="/experts" className="underline">
                Open Expert Support
              </Link>
            </p>
          )}
          {saveErr && (
            <p role="alert" className="text-sm font-semibold text-red-700">
              {saveErr}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
