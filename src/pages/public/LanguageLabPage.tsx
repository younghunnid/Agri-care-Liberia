import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Languages,
  Mic,
  Play,
  Square,
  Upload,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SpeakButton} from '../../components/SpeakButton';
import {detectVoiceCapabilities} from '../../lib/voice';

interface RecordingItem {
  id: number;
  language_code: 'en' | 'bas' | 'man' | 'kpe' | 'lre';
  topic_slug: string;
  topic_label: string;
  question_text: string;
  answer_text: string;
  local_phrase_gloss: string;
  audio_data_url: string;
  speaker_name: string;
  consent_confirmed: number;
  review_status: 'reviewed' | 'pending_review' | 'needs_rerecording';
  is_sample_demo: number;
  created_at: string;
}

const LAB_LANGUAGES = [
  {code: '', label: 'All Languages'},
  {code: 'bas', label: 'Bassa (Priority)'},
  {code: 'man', label: 'Mano (Priority)'},
  {code: 'en', label: 'English'},
  {code: 'kpe', label: 'Kpelle'},
];

const TOPIC_OPTIONS = [
  {slug: 'rice-cassava', label: 'Rice & Cassava Care'},
  {slug: 'poultry', label: 'Poultry & Chick Health'},
  {slug: 'fish-farming', label: 'Fish Pond Management'},
  {slug: 'pests-soil', label: 'Pests, Diseases & Soil'},
  {slug: 'harvest-storage', label: 'Harvest Drying & Storage'},
  {slug: 'weather-rain', label: 'Rainfall & Planting Windows'},
];

const EXPERIMENTAL_MATCHES: Array<{keywords: string[]; matchedTopic: string; note: string}> = [
  {
    keywords: ['cassava', 'leaf', 'yellow', 'kpokpo', 'woko', 'rice', 'su'],
    matchedTopic: 'rice-cassava',
    note: 'Keyword match on English/demo phrase list -> Rice & Cassava Care clips.',
  },
  {
    keywords: ['chicken', 'chick', 'poultry', 'coop', 'bird', 'feather'],
    matchedTopic: 'poultry',
    note: 'Keyword match on English/demo phrase list -> Poultry & Chick Health clips.',
  },
  {
    keywords: ['fish', 'pond', 'tilapia', 'catfish', 'water', 'nyo'],
    matchedTopic: 'fish-farming',
    note: 'Keyword match on English/demo phrase list -> Fish Pond Management clips.',
  },
  {
    keywords: ['dry', 'store', 'mold', 'rain', 'harvest', 'bag'],
    matchedTopic: 'harvest-storage',
    note: 'Keyword match on English/demo phrase list -> Harvest Drying & Storage clips.',
  },
];

export const LanguageLabPage: React.FC = () => {
  const {isOnline} = useApp();
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [langFilter, setLangFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Team recording upload state
  const [languageCode, setLanguageCode] = useState<'bas' | 'man' | 'kpe' | 'en'>('bas');
  const [topicSlug, setTopicSlug] = useState('rice-cassava');
  const [speakerName, setSpeakerName] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [localPhraseGloss, setLocalPhraseGloss] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [audioDataUrl, setAudioDataUrl] = useState('');
  const [recordingMic, setRecordingMic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  // Experimental spoken question tester state
  const [testPhrase, setTestPhrase] = useState('');
  const [testResult, setTestResult] = useState<{
    matchedTopic: string;
    note: string;
    clips: RecordingItem[];
  } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const voiceCaps = detectVoiceCapabilities();

  const loadRecordings = useCallback(async () => {
    if (!isOnline) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = langFilter ? `?lang=${langFilter}` : '';
      const res = await apiFetch<{recordings: RecordingItem[]}>(`/language-lab/recordings${qs}`);
      setRecordings(res.recordings);
    } catch {
      // ignore offline
    } finally {
      setLoading(false);
    }
  }, [isOnline, langFilter]);

  useEffect(() => {
    void loadRecordings();
  }, [loadRecordings]);

  const handleStartRecording = async () => {
    setFormErr(null);
    if (!voiceCaps.mediaRecorderSupported) {
      setFormErr('Browser microphone recording is unsupported on this device. You can upload an audio file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {type: 'audio/webm'});
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setAudioDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecordingMic(true);
    } catch {
      setFormErr('Microphone access denied. Upload a pre-recorded clip or allow microphone access.');
    }
  };

  const handleStopRecording = () => {
    recorderRef.current?.stop();
    setRecordingMic(false);
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormErr(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setFormErr('Please upload a valid audio file (MP3, WAV, M4A, WebM, OGG).');
      return;
    }
    if (file.size > 1_800_000) {
      setFormErr('Audio clip must be under 1.8 MB for prototype storage.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') setAudioDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitRecording = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setFormMsg(null);
    if (!consentConfirmed) {
      setFormErr('You must confirm speaker recording consent before saving.');
      return;
    }
    setSaving(true);
    const topicObj = TOPIC_OPTIONS.find((t) => t.slug === topicSlug) || TOPIC_OPTIONS[0];
    try {
      await apiFetch('/language-lab/recordings', {
        method: 'POST',
        body: JSON.stringify({
          languageCode,
          topicSlug,
          topicLabel: topicObj.label,
          speakerName,
          questionText,
          localPhraseGloss,
          answerText,
          audioDataUrl: audioDataUrl || undefined,
          consentConfirmed,
        }),
      });
      setSpeakerName('');
      setQuestionText('');
      setLocalPhraseGloss('');
      setAnswerText('');
      setAudioDataUrl('');
      setConsentConfirmed(false);
      setFormMsg('Voice entry saved to the Local Language AI Lab with status: pending_review.');
      await loadRecordings();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Unable to save recording.');
    } finally {
      setSaving(false);
    }
  };

  const handleReviewStatus = async (id: number, reviewStatus: RecordingItem['review_status']) => {
    try {
      await apiFetch(`/language-lab/recordings/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({reviewStatus}),
      });
      await loadRecordings();
    } catch {
      // ignore
    }
  };

  const handleRunExperimentalTest = (e: React.FormEvent) => {
    e.preventDefault();
    const q = testPhrase.toLowerCase().trim();
    const match = EXPERIMENTAL_MATCHES.find((m) => m.keywords.some((k) => q.includes(k)));
    const topicSlugMatched = match?.matchedTopic || 'rice-cassava';
    const matchingClips = recordings.filter((r) => r.topic_slug === topicSlugMatched);
    setTestResult({
      matchedTopic: topicSlugMatched,
      note:
        match?.note ||
        'Fallback to Rice & Cassava sample clips. Automated Bassa/Mano speech recognition is NOT active yet.',
      clips: matchingClips.length ? matchingClips : recordings.slice(0, 2),
    });
  };

  const langLabel = (code: string) => {
    if (code === 'bas') return 'Bassa';
    if (code === 'man') return 'Mano';
    if (code === 'kpe') return 'Kpelle';
    if (code === 'lre') return 'Liberian English';
    return 'English';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="rounded-3xl bg-[#183B2B] text-white p-6 sm:p-8 space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B942]">
          <Languages className="w-4 h-4" aria-hidden="true" />
          <span>Local Language AI Lab · Prioritizing Bassa &amp; Mano</span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold">
          Liberian Local Language Voice &amp; Dataset Lab
        </h1>
        <p className="text-sm sm:text-base text-white/85 max-w-3xl leading-relaxed">
          Listen to native-speaker farming guidance clips, collect consented Team 8 Bassa and Mano voice recordings, and inspect how community-verified voice libraries can power future local-language AI.
        </p>
      </div>

      {/* Honest Scientific Transparency Callout */}
      <div className="rounded-2xl bg-[#F5B942]/25 border border-[#F5B942] p-4 flex items-start gap-3 text-sm text-[#183B2B]">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-bold">Transparent Lab Notice — No Fake Bassa or Mano Translation</p>
          <p className="text-xs sm:text-sm text-[#183B2B]/85">
            This lab plays recorded native-speaker clips (or English browser speech glosses for sample scripts). It does <strong>not</strong> claim automatic speech-to-text or neural translation for Bassa, Mano, or Kpelle yet.
          </p>
        </div>
      </div>

      {/* Language Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {LAB_LANGUAGES.map((l) => (
            <button
              key={l.code || 'all'}
              type="button"
              onClick={() => setLangFilter(l.code)}
              className={`min-h-[44px] px-4 py-2 rounded-2xl text-sm font-semibold border transition-colors ${
                langFilter === l.code
                  ? 'bg-[#16803C] border-[#16803C] text-white'
                  : 'bg-white border-[#183B2B]/15 text-[#183B2B] hover:bg-[#DDEFE0]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#183B2B]/70 font-medium">
          Showing {recordings.length} voice recording entries
        </p>
      </div>

      {/* RECORDINGS LIST */}
      {loading ? (
        <div className="py-10 text-center text-sm text-[#183B2B]/70">Loading voice clips...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {recordings.map((rec) => (
            <article
              key={rec.id}
              className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 sm:p-6 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-[#16803C]">
                    {langLabel(rec.language_code)} · {rec.topic_label} ·{' '}
                    {rec.review_status === 'reviewed'
                      ? 'Reviewed'
                      : rec.review_status === 'pending_review'
                      ? 'Pending Review'
                      : 'Needs Re-recording'}
                    {rec.is_sample_demo ? ' · Sample Script' : ' · Team Recording'}
                  </p>
                  <SpeakButton
                    compact
                    id={`lab-rec-${rec.id}`}
                    label={`${langLabel(rec.language_code)} gloss`}
                    text={`${rec.question_text}. ${rec.answer_text}`}
                  />
                </div>

                <h2 className="font-display text-lg font-bold text-[#183B2B]">{rec.question_text}</h2>
                {rec.local_phrase_gloss && (
                  <p className="text-xs italic text-[#183B2B]/75 bg-[#F3F8F0] rounded-xl px-3 py-2">
                    Community phrase note: {rec.local_phrase_gloss}
                  </p>
                )}
                <p className="text-sm text-[#183B2B]/85 leading-relaxed">{rec.answer_text}</p>
                <p className="text-xs text-[#183B2B]/65">
                  Speaker: {rec.speaker_name} · Consent recorded: {rec.consent_confirmed ? 'Yes' : 'No'}
                </p>

                {rec.audio_data_url ? (
                  <div className="pt-1">
                    <audio controls src={rec.audio_data_url} className="w-full h-10" />
                  </div>
                ) : (
                  <div className="text-xs text-[#183B2B]/75 bg-[#F3F8F0] rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>Recording Coming Soon</strong> (English audio preview available via Listen icon above).
                    </span>
                    <a
                      href={
                        rec.topic_slug.includes('poultry')
                          ? '/livestock/poultry'
                          : rec.topic_slug.includes('fish')
                          ? '/livestock/fish-farming'
                          : rec.topic_slug.includes('soil')
                          ? '/soil'
                          : '/crops/cassava'
                      }
                      className="font-bold text-[#16803C] hover:underline"
                    >
                      Open Topic Guide
                    </a>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#183B2B]/10 flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`rev-${rec.id}`} className="text-xs font-semibold text-[#183B2B]/70">
                  Review Status:
                </label>
                <select
                  id={`rev-${rec.id}`}
                  value={rec.review_status}
                  onChange={(e) =>
                    void handleReviewStatus(rec.id, e.target.value as RecordingItem['review_status'])
                  }
                  className="min-h-[44px] rounded-xl border border-[#183B2B]/15 bg-[#F3F8F0] px-3 text-xs font-semibold text-[#183B2B]"
                >
                  <option value="reviewed">Reviewed</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="needs_rerecording">Needs Re-recording</option>
                </select>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* TEAM AUDIO RECORDER & UPLOAD FORM + EXPERIMENTAL LAB */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={(e) => void handleSubmitRecording(e)}
          className="lg:col-span-7 rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4"
        >
          <div className="border-b border-[#183B2B]/10 pb-3">
            <h2 className="font-display text-xl font-bold text-[#183B2B]">
              Record or Upload Team Voice Clip (Bassa / Mano / Kpelle)
            </h2>
            <p className="text-xs text-[#183B2B]/75 mt-1">
              For hackathon team members to capture real spoken farming clips with explicit speaker consent.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="lab-lang" className="block text-sm font-semibold mb-1.5">
                Language
              </label>
              <select
                id="lab-lang"
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value as 'bas' | 'man' | 'kpe' | 'en')}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              >
                <option value="bas">Bassa</option>
                <option value="man">Mano</option>
                <option value="kpe">Kpelle</option>
                <option value="en">English / Liberian English</option>
              </select>
            </div>
            <div>
              <label htmlFor="lab-topic" className="block text-sm font-semibold mb-1.5">
                Farming Topic
              </label>
              <select
                id="lab-topic"
                value={topicSlug}
                onChange={(e) => setTopicSlug(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
              >
                {TOPIC_OPTIONS.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="lab-speaker" className="block text-sm font-semibold mb-1.5">
              Native Speaker Name &amp; County
            </label>
            <input
              id="lab-speaker"
              type="text"
              required
              value={speakerName}
              onChange={(e) => setSpeakerName(e.target.value)}
              placeholder="Example: Mary Johnson (Grand Bassa County)"
              className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="lab-q" className="block text-sm font-semibold mb-1.5">
              Question or Topic Summary (English)
            </label>
            <input
              id="lab-q"
              type="text"
              required
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Example: How to dry rice safely off bare ground"
              className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="lab-gloss" className="block text-sm font-semibold mb-1.5">
              Spoken Phrase / Cultural Note (Optional)
            </label>
            <input
              id="lab-gloss"
              type="text"
              value={localPhraseGloss}
              onChange={(e) => setLocalPhraseGloss(e.target.value)}
              placeholder="Note key Bassa/Mano farm words used in the recording"
              className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="lab-ans" className="block text-sm font-semibold mb-1.5">
              Verified English Transcript of Advice
            </label>
            <textarea
              id="lab-ans"
              rows={3}
              required
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder="Write the exact farming steps spoken in the clip..."
              className="w-full rounded-2xl border border-[#183B2B]/20 p-3 text-sm"
            />
          </div>

          {/* Mic + File Upload Controls */}
          <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-3">
            <p className="text-xs font-semibold text-[#183B2B]">Attach Audio Clip (Microphone or File)</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={recordingMic ? handleStopRecording : () => void handleStartRecording()}
                className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold ${
                  recordingMic ? 'bg-red-600 text-white' : 'bg-[#16803C] text-white'
                }`}
              >
                {recordingMic ? <Square className="w-4 h-4" aria-hidden="true" /> : <Mic className="w-4 h-4" aria-hidden="true" />}
                <span>{recordingMic ? 'Stop Mic Recording' : 'Record from Microphone'}</span>
              </button>

              <label className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-semibold cursor-pointer hover:bg-[#DDEFE0]">
                <Upload className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                <span>Upload Audio File</span>
                <input type="file" accept="audio/*" onChange={handleAudioFileUpload} className="sr-only" />
              </label>
            </div>
            {audioDataUrl && <audio controls src={audioDataUrl} className="w-full h-10" />}
          </div>

          <label className="flex items-start gap-3 p-3 rounded-xl bg-[#F3F8F0] cursor-pointer">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(e) => setConsentConfirmed(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#16803C]"
            />
            <span className="text-xs text-[#183B2B]/85 leading-relaxed">
              <strong>Speaker Consent Confirmed:</strong> The speaker voluntarily consents for Team 8 to store and replay this agricultural voice clip inside the Agri-Advisory Liberia prototype and language dataset review.
            </span>
          </label>

          {formErr && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {formErr}
            </div>
          )}
          {formMsg && (
            <div role="status" className="rounded-xl bg-[#DDEFE0] p-3 text-xs font-semibold text-[#183B2B] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
              <span>{formMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !isOnline}
            className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630] disabled:opacity-50"
          >
            {saving ? 'Saving Entry...' : 'Save Recording to Language Lab'}
          </button>
        </form>

        {/* Experimental Spoken Question Lab */}
        <div className="lg:col-span-5 rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4 h-fit">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
            <FlaskConical className="w-4 h-4" aria-hidden="true" />
            <span>EXPERIMENTAL LAB · KEYWORD DEMO MATCHING</span>
          </div>
          <h2 className="font-display text-xl font-bold text-[#183B2B]">
            Experimental Spoken Question Lab
          </h2>
          <p className="text-xs sm:text-sm text-[#183B2B]/80 leading-relaxed">
            Demonstrates how recorded Bassa and Mano advice clips can be matched to farmer questions in the future. Currently uses simple keyword lookup on English transcripts—it does <strong>not</strong> perform automatic Bassa/Mano speech recognition.
          </p>

          <form onSubmit={handleRunExperimentalTest} className="space-y-3">
            <label htmlFor="exp-test-phrase" className="block text-xs font-semibold text-[#183B2B]">
              Enter a test phrase (try: cassava, poultry, tilapia, mold):
            </label>
            <input
              id="exp-test-phrase"
              type="text"
              value={testPhrase}
              onChange={(e) => setTestPhrase(e.target.value)}
              placeholder="e.g., My tilapia pond water looks muddy"
              className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
            />
            <button
              type="submit"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F5B942] text-[#183B2B] text-xs sm:text-sm font-bold hover:bg-[#f7c55f]"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              <span>Run Experimental Clip Match</span>
            </button>
          </form>

          {testResult && (
            <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-2.5 border border-[#183B2B]/10">
              <p className="text-xs font-semibold text-[#16803C]">
                Matched Topic: {testResult.matchedTopic} (Experimental Demo)
              </p>
              <p className="text-xs text-[#183B2B]/75">{testResult.note}</p>
              {testResult.clips.map((clip) => (
                <div key={clip.id} className="rounded-xl bg-white p-3 space-y-1 border border-[#183B2B]/10">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-[#183B2B]">
                      {langLabel(clip.language_code)} · {clip.question_text}
                    </p>
                    <SpeakButton
                      compact
                      id={`exp-match-${clip.id}`}
                      label={clip.question_text}
                      text={clip.answer_text}
                    />
                  </div>
                  <p className="text-xs text-[#183B2B]/80">{clip.answer_text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
