import React, {useEffect, useRef, useState} from 'react';
import {Link, useNavigate, useSearchParams} from 'react-router-dom';
import {
  AlertTriangle,
  Bookmark,
  BookOpen,
  Camera,
  Check,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {apiFetch, ApiRequestError} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SpeakButton} from '../../components/SpeakButton';
import {OfflineGuideAssistant} from '../../components/OfflineGuideAssistant';
import {detectVoiceCapabilities, startSpeechRecognition} from '../../lib/voice';
import {compressImageFileToBase64, saveDemoAdvice} from '../../lib/demoStorage';

interface RecommendedGuide {
  id: number;
  slug: string;
  title: string;
  cropName: string;
  categoryName: string;
  isSampleDemo: boolean;
}

interface AdvisorResult {
  providerMode: 'live_gemini' | 'unavailable_demo';
  modelUsed: string | null;
  disclaimer: string;
  summary: string;
  possibleCauses: string[];
  clarifyingQuestions: string[];
  practicalLowRiskSteps: string[];
  whenToSeekExpertHelp: string[];
  uncertaintyNote: string;
  recommendedGuides: RecommendedGuide[];
  errorMessage?: string;
}

interface ConversationTurn {
  id: string;
  question: string;
  topic: string;
  cropSlug: string;
  imagePreview?: string;
  answer: AdvisorResult;
  createdAt: string;
}

interface HistoryItem {
  id: number;
  cropSlug: string | null;
  questionText: string;
  answer: AdvisorResult;
  providerMode: string;
  createdAt: string;
}

const TOPICS = [
  {id: 'crops', label: 'Crops & Vegetables', cropDefault: 'cassava'},
  {id: 'poultry', label: 'Poultry Farming', cropDefault: ''},
  {id: 'livestock', label: 'Livestock (Goats, Pigs, Cattle)', cropDefault: ''},
  {id: 'fish', label: 'Fish Farming / Aquaculture', cropDefault: ''},
  {id: 'soil', label: 'Soil, Rain & Seasons', cropDefault: ''},
  {id: 'agribusiness', label: 'Harvest, Storage & Markets', cropDefault: ''},
];

const SUGGESTED_QUESTIONS: Record<string, Array<{label: string; text: string; crop: string}>> = {
  crops: [
    {label: 'Cassava yellow leaves', text: 'My cassava leaves are turning yellow. What possible causes should I check?', crop: 'cassava'},
    {label: 'Upland rice leaf spots', text: 'I see small brown spots on my upland rice leaves after heavy rain.', crop: 'rice'},
  ],
  poultry: [
    {label: 'Wet season chick warmth', text: 'How do I keep young broiler chicks warm and dry during heavy rainy season nights?', crop: ''},
    {label: 'Chicken clean water & feed', text: 'Some birds look sluggish during rain—what clean bedding and biosecurity steps should I take?', crop: ''},
  ],
  livestock: [
    {label: 'Goat hoof care in mud', text: 'How can I prevent hoof problems for goats during muddy rainy months?', crop: ''},
    {label: 'New pig quarantine', text: 'I bought two new pigs from another town. How long should I keep them separate?', crop: ''},
  ],
  fish: [
    {label: 'Tilapia gasping at dawn', text: 'My tilapia are swimming at the pond surface at early morning. What low-risk steps help right away?', crop: ''},
    {label: 'Muddy runoff protection', text: 'Heavy rain washes red mud into my earthen fish pond. How should I protect the water?', crop: ''},
  ],
  soil: [
    {label: 'Delayed rainfall planting', text: 'Rainfall started late this year. How should I stagger maize and cassava planting safely?', crop: 'maize'},
    {label: 'Compost from farm waste', text: 'How do I turn cassava peels, dry grass, and chicken droppings into safe compost?', crop: ''},
  ],
  agribusiness: [
    {label: 'Stopping rice mold', text: 'How do I dry and store harvested rice bags off concrete floors so mold stays away?', crop: 'rice'},
    {label: 'Preparing produce for buyers', text: 'How should we sort and pack pepper and okra before posting to town buyers?', crop: 'pepper'},
  ],
};

export const AdvisorPage: React.FC = () => {
  const {user, language, isOnline} = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [topic, setTopic] = useState(searchParams.get('topic') || 'crops');
  const [cropSlug, setCropSlug] = useState(searchParams.get('crop') || '');
  const [question, setQuestion] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoBase64, setPhotoBase64] = useState<string>('');
  const [photoMimeType, setPhotoMimeType] = useState<string>('');
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [quotaInfo, setQuotaInfo] = useState<{authenticated: boolean; remaining: number; limit: number} | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const voiceCaps = detectVoiceCapabilities();
  const [listening, setListening] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const stopRecRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const prefill = searchParams.get('q');
    if (prefill) setQuestion(prefill);
  }, [searchParams]);

  useEffect(() => {
    if (user && isOnline) {
      apiFetch<{history: HistoryItem[]}>('/advisor/history')
        .then((res) => setHistory(res.history))
        .catch(() => undefined);
    }
  }, [user, isOnline]);

  useEffect(() => {
    return () => {
      stopRecRef.current?.();
    };
  }, []);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose a JPG, PNG, or WebP image file.');
      return;
    }
    try {
      const compressed = await compressImageFileToBase64(file, 960);
      setPhotoPreview(compressed.dataUrl);
      setPhotoBase64(compressed.base64);
      setPhotoMimeType(compressed.mimeType);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const clearPhoto = () => {
    setPhotoPreview('');
    setPhotoBase64('');
    setPhotoMimeType('');
    setPhotoError(null);
  };

  const handleStartVoice = () => {
    setVoiceError(null);
    setVoiceDraft('');
    const stopFn = startSpeechRecognition({
      onTranscript: (text) => setVoiceDraft(text),
      onError: (msg) => {
        setVoiceError(msg);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    if (stopFn) {
      stopRecRef.current = stopFn;
      setListening(true);
    }
  };

  const handleStopVoice = () => {
    stopRecRef.current?.();
    setListening(false);
  };

  const handleConfirmVoiceDraft = () => {
    if (!voiceDraft.trim()) return;
    setQuestion((prev) => (prev ? `${prev.trim()} ${voiceDraft.trim()}` : voiceDraft.trim()));
    setVoiceDraft('');
  };

  const submitQuestion = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setSavedNotice(null);

    if (!isOnline) {
      setError('You are offline. Live AI advice needs internet connectivity, or open your Offline Library.');
      return;
    }

    if (question.trim().length < 5) {
      setError('Please write at least 5 characters describing your farming question.');
      return;
    }

    setLoading(true);
    try {
      const asked = question.trim();
      const conversationHistory = turns.slice(-4).map((t) => ({
        question: t.question,
        summary: t.answer.summary,
      }));

      const res = await apiFetch<{
        advisor: AdvisorResult;
        quota: {authenticated: boolean; remaining: number; limit: number};
      }>('/advisor/ask', {
        method: 'POST',
        body: JSON.stringify({
          question: asked,
          topic,
          cropSlug: cropSlug || undefined,
          languageCode: language,
          conversationHistory,
          imageBase64: photoBase64 || undefined,
          imageMimeType: photoMimeType || undefined,
        }),
      });

      const newTurn: ConversationTurn = {
        id: `turn-${Date.now()}`,
        question: asked,
        topic,
        cropSlug,
        imagePreview: photoPreview || undefined,
        answer: res.advisor,
        createdAt: new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
      };

      setTurns((prev) => [...prev, newTurn]);
      setQuotaInfo(res.quota);
      setQuestion('');
      clearPhoto();

      if (user) {
        apiFetch<{history: HistoryItem[]}>('/advisor/history')
          .then((h) => setHistory(h.history))
          .catch(() => undefined);
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Unable to reach the AI Agricultural Advisor right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTurn = async (turn: ConversationTurn) => {
    const formatted = [
      `Summary: ${turn.answer.summary}`,
      turn.answer.possibleCauses.length ? `Possible Causes:\n- ${turn.answer.possibleCauses.join('\n- ')}` : '',
      turn.answer.practicalLowRiskSteps.length ? `Safe Steps:\n- ${turn.answer.practicalLowRiskSteps.join('\n- ')}` : '',
      `Uncertainty Note: ${turn.answer.uncertaintyNote}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    saveDemoAdvice({
      id: turn.id,
      title: turn.question.slice(0, 100),
      category: turn.topic,
      summary: turn.answer.summary,
      url: '/advisor',
    });

    if (!user) {
      setSavedNotice('Saved to your Demo Farmer Dashboard on this device.');
      return;
    }

    try {
      await apiFetch('/advisor/save', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: 'ai_advisor',
          title: turn.question.slice(0, 120),
          cropName: turn.cropSlug || turn.topic,
          contentText: formatted,
          metadata: {providerMode: turn.answer.providerMode},
        }),
      });
      setSavedNotice('Saved to your cross-device Farmer Dashboard.');
    } catch (err) {
      setSavedNotice(err instanceof Error ? err.message : 'Saved locally, could not sync to server.');
    }
  };

  const handleEscalateToExpert = (turn: ConversationTurn) => {
    const params = new URLSearchParams();
    params.set('title', turn.question.slice(0, 120));
    params.set('desc', `${turn.question}\n\nAI Summary Checked: ${turn.answer.summary}`);
    navigate(`/experts?${params.toString()}`);
  };

  const activeSuggestions = SUGGESTED_QUESTIONS[topic] || SUGGESTED_QUESTIONS.crops;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#16803C]">
            Conversational AI Agricultural Advisor · Online Feature
          </p>
          <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">
            Ask Agricultural Advisor
          </h1>
          <p className="text-sm sm:text-base text-[#183B2B]/80 max-w-2xl">
            Ask multi-turn questions about crops, poultry, livestock, fish ponds, soil, or markets. Upload an optional photo for visual discussion—never a confirmed diagnosis.
          </p>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => setTurns([])}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#183B2B]/15 bg-white text-xs font-semibold text-[#183B2B] hover:bg-[#F3F8F0] shrink-0"
          >
            <RotateCcw className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
            <span>New Conversation</span>
          </button>
        )}
      </div>

      {!isOnline && (
        <div className="rounded-2xl bg-[#F5B942]/30 border border-[#F5B942] p-4 flex items-start gap-3">
          <WifiOff className="w-5 h-5 text-[#183B2B] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm space-y-1">
            <p className="font-bold text-[#183B2B]">Live AI Advisor is unavailable offline</p>
            <p className="text-[#183B2B]/85">
              Reconnect to ask the AI Advisor. Meanwhile, use the <strong>Offline Guide Assistant</strong> below, or open your{' '}
              <Link to="/offline" className="underline font-semibold">
                Offline Library
              </Link>{' '}
              to read downloaded crop guides.
            </p>
          </div>
        </div>
      )}

      {/* Offline: the live AI composer cannot work, so offer the local guide search instead. */}
      {!isOnline && <OfflineGuideAssistant />}

      {/* CONVERSATION THREAD */}
      {turns.length > 0 && (
        <section aria-live="polite" className="space-y-5">
          {turns.map((turn, idx) => {
            const speechContent = [
              turn.answer.summary,
              turn.answer.possibleCauses.length
                ? `Possible causes to check: ${turn.answer.possibleCauses.join('. ')}`
                : '',
              turn.answer.practicalLowRiskSteps.length
                ? `Practical low-risk steps: ${turn.answer.practicalLowRiskSteps.join('. ')}`
                : '',
              turn.answer.uncertaintyNote,
            ].join('. ');

            return (
              <div key={turn.id} className="space-y-3">
                {/* User Message Bubble */}
                <div className="ml-auto max-w-2xl rounded-3xl rounded-tr-md bg-[#16803C] text-white p-4 sm:p-5 space-y-2">
                  <p className="text-xs text-white/75">
                    Question {idx + 1} · {turn.topic}
                    {turn.cropSlug ? ` · ${turn.cropSlug}` : ''} · {turn.createdAt}
                  </p>
                  <p className="text-sm sm:text-base font-medium leading-relaxed">{turn.question}</p>
                  {turn.imagePreview && (
                    <img
                      src={turn.imagePreview}
                      alt="Uploaded farm photo"
                      className="max-h-40 rounded-2xl border border-white/20 object-cover"
                    />
                  )}
                </div>

                {/* Assistant Structured Bubble */}
                <div className="rounded-3xl rounded-tl-md bg-white border border-[#183B2B]/15 p-5 sm:p-7 space-y-5 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#183B2B]/10 pb-3">
                    <p className="text-xs font-semibold text-[#16803C]">
                      {turn.answer.providerMode === 'live_gemini'
                        ? `Live Gemini AI (${turn.answer.modelUsed})`
                        : 'AI Unavailable Fallback — Verified Static Guidance'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <SpeakButton
                        id={`adv-reply-${turn.id}`}
                        label={`Advisor reply ${idx + 1}`}
                        text={speechContent}
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveTurn(turn)}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#DDEFE0] text-[#183B2B] text-xs sm:text-sm font-semibold hover:bg-[#16803C] hover:text-white transition-colors"
                      >
                        <Bookmark className="w-4 h-4" aria-hidden="true" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEscalateToExpert(turn)}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#F5B942] text-[#183B2B] text-xs sm:text-sm font-bold hover:bg-[#f7c55f]"
                      >
                        <Users className="w-4 h-4" aria-hidden="true" />
                        <span>Ask Expert</span>
                      </button>
                    </div>
                  </div>

                  {/* Safety Disclaimer */}
                  <div className="rounded-2xl bg-[#F3F8F0] border border-[#183B2B]/10 p-3.5 flex items-start gap-2.5 text-xs sm:text-sm text-[#183B2B]/90">
                    <AlertTriangle className="w-5 h-5 text-[#F5B942] shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">{turn.answer.disclaimer}</p>
                      {turn.answer.errorMessage && (
                        <p className="text-xs text-[#183B2B]/70 mt-1">Detail: {turn.answer.errorMessage}</p>
                      )}
                    </div>
                  </div>

                  <p className="text-base text-[#183B2B] leading-relaxed">{turn.answer.summary}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <h3 className="font-display font-bold text-sm sm:text-base text-[#183B2B]">Possible Causes</h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-[#183B2B]/85">
                        {turn.answer.possibleCauses.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-display font-bold text-sm sm:text-base text-[#183B2B]">Clarifying Checks</h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-[#183B2B]/85">
                        {turn.answer.clarifyingQuestions.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-display font-bold text-sm sm:text-base text-[#183B2B]">Practical Low-Risk Steps</h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-[#183B2B]/85">
                        {turn.answer.practicalLowRiskSteps.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-display font-bold text-sm sm:text-base text-[#183B2B]">When to Seek Expert Help</h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-[#183B2B]/85">
                        {turn.answer.whenToSeekExpertHelp.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="text-xs text-[#183B2B]/75 border-t border-[#183B2B]/10 pt-3">
                    <strong>Uncertainty Note:</strong> {turn.answer.uncertaintyNote}
                  </p>

                  {turn.answer.recommendedGuides.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {turn.answer.recommendedGuides.map((g) => (
                        <Link
                          key={g.id}
                          to={`/guides/${g.slug}`}
                          className="rounded-2xl border border-[#183B2B]/15 p-3.5 hover:border-[#16803C] flex items-start gap-2.5"
                        >
                          <BookOpen className="w-4 h-4 text-[#16803C] shrink-0 mt-0.5" aria-hidden="true" />
                          <div>
                            <p className="text-xs text-[#183B2B]/65">
                              {g.cropName} · {g.categoryName}
                            </p>
                            <p className="font-semibold text-sm text-[#183B2B]">{g.title}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {savedNotice && (
        <div role="status" className="rounded-2xl bg-[#DDEFE0] px-4 py-3 text-sm font-semibold text-[#183B2B]">
          {savedNotice}
        </div>
      )}

      {/* QUESTION COMPOSER (live AI; online only) */}
      {isOnline && (
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 sm:p-7 space-y-5 shadow-xs">
        {/* Topic Selector */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#183B2B]/70">
            1. Choose Your Farming Topic
          </p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTopic(item.id);
                  if (item.cropDefault && !cropSlug) setCropSlug(item.cropDefault);
                }}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-colors ${
                  topic === item.id
                    ? 'bg-[#16803C] border-[#16803C] text-white'
                    : 'bg-[#F3F8F0] border-[#183B2B]/15 text-[#183B2B] hover:bg-[#DDEFE0]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice Input */}
        <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="font-display font-bold text-sm sm:text-base text-[#183B2B]">
                Voice Dictation (Standard English Browser Speech)
              </h2>
              <p className="text-xs text-[#183B2B]/75">
                {voiceCaps.speechInputSupported
                  ? 'Tap to speak, review the transcription preview, then confirm. Note: Local languages Bassa/Mano are not recognized automatically here.'
                  : 'Voice dictation is unsupported on this browser—type your question below.'}
              </p>
            </div>
            {voiceCaps.speechInputSupported && (
              <button
                type="button"
                onClick={listening ? handleStopVoice : handleStartVoice}
                className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl font-semibold text-sm whitespace-nowrap shrink-0 transition-colors ${
                  listening
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-[#16803C] text-white hover:bg-[#116630]'
                }`}
              >
                {listening ? <MicOff className="w-4 h-4" aria-hidden="true" /> : <Mic className="w-4 h-4" aria-hidden="true" />}
                <span>{listening ? 'Stop Listening' : 'Tap to Speak'}</span>
              </button>
            )}
          </div>

          {voiceError && (
            <p role="alert" className="text-xs font-medium text-red-700">
              {voiceError}
            </p>
          )}

          {voiceDraft && (
            <div className="rounded-xl bg-white border border-[#16803C]/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-[#16803C]">Transcription Preview — Confirm before adding:</p>
              <p className="text-sm text-[#183B2B]">{voiceDraft}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConfirmVoiceDraft}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-1.5 rounded-xl bg-[#16803C] text-white text-xs font-semibold"
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>Confirm &amp; Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceDraft('')}
                  className="min-h-[44px] px-4 py-1.5 rounded-xl border border-[#183B2B]/15 text-xs font-semibold"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={(e) => void submitQuestion(e)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="advisor-crop" className="block text-sm font-semibold text-[#183B2B] mb-1.5">
                Specific Crop (Optional)
              </label>
              <select
                id="advisor-crop"
                value={cropSlug}
                onChange={(e) => setCropSlug(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 bg-white px-3 text-sm text-[#183B2B]"
              >
                <option value="">General / Livestock / Fish</option>
                <option value="cassava">Cassava</option>
                <option value="rice">Rice</option>
                <option value="maize">Maize</option>
                <option value="pepper">Pepper</option>
                <option value="okra">Okra</option>
                <option value="plantain">Plantain</option>
              </select>
            </div>
            <div className="sm:col-span-2 flex flex-col justify-end">
              <p className="text-xs text-[#183B2B]/70 mb-1.5">Suggested questions for this topic:</p>
              <div className="flex flex-wrap gap-2">
                {activeSuggestions.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => {
                      setQuestion(sample.text);
                      if (sample.crop) setCropSlug(sample.crop);
                    }}
                    className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#DDEFE0] text-xs font-semibold text-[#183B2B] hover:bg-[#16803C] hover:text-white transition-colors"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="advisor-question" className="block text-sm font-semibold text-[#183B2B] mb-1.5">
              {turns.length > 0 ? 'Ask a Follow-Up Question' : 'Your Farming Question'}
            </label>
            <textarea
              id="advisor-question"
              rows={4}
              maxLength={1200}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Example: What causes yellow leaves on cassava, or how do I protect baby chicks in rain?"
              className="w-full rounded-2xl border border-[#183B2B]/20 bg-white p-4 text-base text-[#183B2B] placeholder:text-[#183B2B]/45"
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-[#183B2B]/65">
              <span>
                {user
                  ? `Signed in as ${user.displayName}${quotaInfo ? ` · ${quotaInfo.remaining} hourly left` : ''}`
                  : quotaInfo
                  ? `Guest mode · ${quotaInfo.remaining} of ${quotaInfo.limit} free daily questions left`
                  : 'Guest demo allows free questions without signing in'}
              </span>
              <span className="tabular-nums">{question.length}/1200</span>
            </div>
          </div>

          {/* Optional Photo Upload with Clear Safety Notice */}
          <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#183B2B]">
                  Optional Farm Photo (Visual Discussion Only)
                </p>
                <p className="text-xs text-[#183B2B]/75">
                  AI photo review only suggests possibilities to inspect—it is never a confirmed plant or animal disease diagnosis.
                </p>
              </div>
              <label className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-semibold text-[#183B2B] hover:bg-[#DDEFE0] cursor-pointer">
                <Camera className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                <span>{photoPreview ? 'Replace Photo' : 'Add Leaf / Farm Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handlePhotoChange(e)}
                  className="sr-only"
                />
              </label>
            </div>
            {photoError && <p className="text-xs text-red-700 font-medium">{photoError}</p>}
            {photoPreview && (
              <div className="flex items-center gap-3 pt-1">
                <img
                  src={photoPreview}
                  alt="Selected farm photo preview"
                  className="w-20 h-20 rounded-xl object-cover border border-[#183B2B]/15"
                />
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="min-h-[44px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-50 text-red-700 text-xs font-semibold"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  <span>Remove Photo</span>
                </button>
              </div>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              disabled={loading || !isOnline}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-2xl bg-[#16803C] text-white font-semibold text-sm hover:bg-[#116630] disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Thinking...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" aria-hidden="true" />
                  <span>{turns.length > 0 ? 'Send Follow-Up' : 'Get Farming Guidance'}</span>
                </>
              )}
            </button>

            <Link to="/experts" className="text-sm font-semibold text-[#16803C] hover:underline">
              Need a human extension expert?
            </Link>
          </div>
        </form>
      </div>
      )}

      {/* Signed-in Farmer Chat History */}
      {user && history.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl font-bold text-[#183B2B]">Saved Account History</h2>
          <div className="space-y-3">
            {history.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <p className="text-xs text-[#183B2B]/65">
                    {item.cropSlug ? `${item.cropSlug} · ` : ''}
                    {item.providerMode === 'live_gemini' ? 'Live AI' : 'Static Fallback'} · {item.createdAt}
                  </p>
                  <p className="font-semibold text-sm text-[#183B2B]">{item.questionText}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setTurns([
                      {
                        id: `hist-${item.id}`,
                        question: item.questionText,
                        topic: item.cropSlug || 'crops',
                        cropSlug: item.cropSlug || '',
                        answer: item.answer,
                        createdAt: item.createdAt,
                      },
                    ])
                  }
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#F3F8F0] text-xs font-semibold text-[#16803C] hover:bg-[#DDEFE0] shrink-0"
                >
                  Open Thread
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
