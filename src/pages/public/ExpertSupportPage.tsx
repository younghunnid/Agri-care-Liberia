import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Mic,
  Send,
  Square,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {SpeakButton} from '../../components/SpeakButton';
import {getRequesterKey, requesterHeaders} from '../../lib/listingKeys';
import {compressPhoto} from '../../lib/imageCompress';
import {DraftError, queueRecord, saveQuestionDraft, validateQuestion} from '../../lib/offlineDrafts';
import {syncSoon} from '../../lib/syncEngine';
import {LocalQuestionsPanel} from '../../components/LocalRecordsPanels';
import {KNOWLEDGE_CATEGORIES} from '../../data/knowledgeCenter';
import {detectVoiceCapabilities} from '../../lib/voice';

const MAX_VOICE_SECONDS = 60;
const MAX_VOICE_DATA_URL = 2_000_000;

const COUNTIES = [
  'Bomi', 'Bong', 'Gbarpolu', 'Grand Bassa', 'Grand Cape Mount',
  'Grand Gedeh', 'Grand Kru', 'Lofa', 'Margibi', 'Maryland',
  'Montserrado', 'Nimba', 'River Cess', 'River Gee', 'Sinoe',
];

interface DemoExpertRequest {
  id: number;
  farmer_name: string;
  category: string;
  county: string;
  title: string;
  description: string;
  photo_data_url: string;
  voice_note_data_url: string;
  voice_note_summary: string;
  status: 'Submitted' | 'Assigned' | 'Answered';
  expert_reply: string;
  assigned_expert_name: string;
  created_at: string;
}

export const ExpertSupportPage: React.FC = () => {
  const {user, isOnline, lowBandwidth} = useApp();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'submit' | 'dashboard'>(
    searchParams.get('tab') === 'dashboard' ? 'dashboard' : 'submit'
  );

  const [farmerName, setFarmerName] = useState(user?.displayName || 'Demo Farmer');
  const [category, setCategory] = useState(() => {
    const c = searchParams.get('category');
    return KNOWLEDGE_CATEGORIES.some((k) => k.name === c) ? (c as string) : KNOWLEDGE_CATEGORIES[0].name;
  });
  const [county, setCounty] = useState(() => {
    const c = searchParams.get('county');
    return c && (COUNTIES as readonly string[]).includes(c) ? c : user?.county || 'Bong';
  });
  const [title, setTitle] = useState(searchParams.get('title') || '');
  const [description, setDescription] = useState(searchParams.get('desc') || '');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [voiceNoteDataUrl, setVoiceNoteDataUrl] = useState('');
  const [voiceNoteSummary, setVoiceNoteSummary] = useState('');
  const [recordingVoice, setRecordingVoice] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [requests, setRequests] = useState<DemoExpertRequest[]>([]);

  // Simulated Expert Dashboard reply states
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [expertNames, setExpertNames] = useState<Record<number, string>>({});
  const [savingReplyId, setSavingReplyId] = useState<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceCaps = detectVoiceCapabilities();
  // Only verified expert or administrator accounts can answer; everyone else just reads.
  const canRespond = Boolean(user?.roles.some((r) => r === 'expert' || r === 'admin'));

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);

  /**
   * Loads the request list. The server answer is checked before it is used: a reply that is not the expected list (for example an HTML
   * page from a proxy, or an empty body) used to leave `requests` undefined and crash the whole page on `requests.length` (H1.1 root cause).
   */
  const loadRequests = useCallback(async () => {
    if (!isOnline) { setLoadError(null); return; }
    setLoadingRequests(true);
    try {
      const res = await apiFetch<{requests?: unknown}>('/expert-requests/demo', {headers: requesterHeaders()});
      if (!Array.isArray(res?.requests)) throw new Error('unexpected-response');
      setRequests(res.requests as DemoExpertRequest[]);
      setLoadError(null);
    } catch (err) {
      const unexpected = err instanceof Error && err.message === 'unexpected-response';
      setLoadError(unexpected
        ? 'The server sent an answer this page could not read.'
        : 'The expert request list could not be loaded. The server may be offline or busy.');
    } finally {
      setLoadingRequests(false);
    }
  }, [isOnline, user]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (user?.displayName) setFarmerName(user.displayName);
    if (user?.county && !searchParams.get('county')) setCounty(user.county);
  }, [user]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressPhoto(file);
      setPhotoDataUrl(compressed.dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load selected photo.');
    }
  };

  const handleStartVoiceNote = async () => {
    setError(null);
    if (!voiceCaps.mediaRecorderSupported) {
      setError('Audio recording is not supported on this browser. Type your summary instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      // Low bitrate keeps a one-minute note near 200 KB, small enough to store and send on mobile data.
      const recorder = new MediaRecorder(stream, {audioBitsPerSecond: 24000});
      voiceChunksRef.current = [];
      const autoStop = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, MAX_VOICE_SECONDS * 1000);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        clearTimeout(autoStop);
        stream.getTracks().forEach((t) => t.stop());
        setRecordingVoice(false);
        const blob = new Blob(voiceChunksRef.current, {type: recorder.mimeType || 'audio/webm'});
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            if (reader.result.length > MAX_VOICE_DATA_URL) {
              setError('That recording is too long to send. Please keep it under one minute.');
              return;
            }
            setVoiceNoteDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingVoice(true);
    } catch {
      setError('Microphone permission was denied. You can still attach a photo or describe your issue in writing.');
    }
  };

  const handleStopVoiceNote = () => {
    mediaRecorderRef.current?.stop();
    setRecordingVoice(false);
  };

  const handleSubmitDemoRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!isOnline) {
      // Offline: keep the question on this phone and queue it. Nothing is sent yet.
      const data = {farmerName, category, county, title, description, photoDataUrl, voiceNoteDataUrl, voiceNoteSummary};
      const problem = validateQuestion(data);
      if (problem) {
        setError(problem);
        return;
      }
      try {
        const rec = await saveQuestionDraft(data);
        await queueRecord('question', rec.localId);
        syncSoon();
        setTitle('');
        setDescription('');
        setPhotoDataUrl('');
        setVoiceNoteDataUrl('');
        setVoiceNoteSummary('');
        setSuccessMsg('Saved on this phone. It will be sent to the expert when you are online. Expert answers need internet.');
      } catch (err) {
        setError(err instanceof DraftError ? err.message : 'Could not save on this phone. Free some storage and try again.');
      }
      return;
    }

    setSubmitting(true);

    try {
      await apiFetch('/expert-requests/demo', {
        method: 'POST',
        body: JSON.stringify({
          requesterKey: getRequesterKey(),
          farmerName,
          category,
          county,
          title,
          description,
          photoDataUrl: photoDataUrl || undefined,
          voiceNoteDataUrl: voiceNoteDataUrl || undefined,
          voiceNoteSummary: voiceNoteSummary || undefined,
        }),
      });
      setTitle('');
      setDescription('');
      setPhotoDataUrl('');
      setVoiceNoteDataUrl('');
      setVoiceNoteSummary('');
      setSuccessMsg('Submitted! Your request now appears below and inside the Simulated Expert Dashboard.');
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit expert request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpertReply = async (id: number) => {
    const reply = (replyDrafts[id] || '').trim();
    if (reply.length < 5) {
      setError('Expert reply must be at least 5 characters.');
      return;
    }
    setSavingReplyId(id);
    setError(null);
    try {
      await apiFetch(`/expert-requests/demo/${id}/reply`, {
        method: 'PATCH',
        body: JSON.stringify({
          expertReply: reply,
          status: 'Answered',
        }),
      });
      setReplyDrafts((prev) => ({...prev, [id]: ''}));
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post simulated expert reply.');
    } finally {
      setSavingReplyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-7">
      <div className="rounded-3xl bg-[#183B2B] text-white p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6">
        {!lowBandwidth && (
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shrink-0 border border-white/15">
            <SafeImage
              src="/src/assets/images/expert_agronomist_1794924193763.jpg"
              alt="Liberian agricultural extension specialist"
              className="w-full h-full object-cover"
              fallbackTitle="Expert"
            />
          </div>
        )}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B942]">
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>Human Agricultural Support · Hackathon Prototype Queue</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold">
            Ask an Agricultural Expert
          </h1>
          <p className="text-sm sm:text-base text-white/85 max-w-2xl leading-relaxed">
            Send a crop, poultry, livestock, or aquaculture problem with an optional photo or voice note, track live status, or preview how extension officers answer inside the Simulated Expert Dashboard.
          </p>
        </div>
      </div>

      {loadError && (
        <div role="alert" data-testid="experts-load-error" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 space-y-3">
          <p className="text-sm font-bold">{loadError}</p>
          <p className="text-sm">You can still write a request below. It is saved on this phone and sent when the connection works.</p>
          <button type="button" onClick={() => void loadRequests()} disabled={loadingRequests} data-testid="experts-retry"
            className="min-h-[48px] rounded-xl bg-[#183B2B] disabled:opacity-60 text-white text-sm font-bold px-5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#183B2B]">
            {loadingRequests ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('submit')}
            className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-colors ${
              activeTab === 'submit'
                ? 'bg-[#16803C] text-white'
                : 'bg-white border border-[#183B2B]/15 text-[#183B2B]'
            }`}
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>Submit Farmer Request</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-[#183B2B] text-white'
                : 'bg-white border border-[#183B2B]/15 text-[#183B2B]'
            }`}
          >
            <UserCheck className="w-4 h-4" aria-hidden="true" />
            <span>Simulated Expert Dashboard ({requests.length})</span>
          </button>
        </div>

        {user && (
          <Link to="/farmer/questions" className="text-sm font-semibold text-[#16803C] hover:underline">
            Open Signed-In Formal Queue
          </Link>
        )}
      </div>

      {activeTab === 'submit' ? (
        <div className="space-y-6">
          <LocalQuestionsPanel />
          <form
            onSubmit={(e) => void handleSubmitDemoRequest(e)}
            className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-5"
          >
            <div className="border-b border-[#183B2B]/10 pb-3">
              <h2 className="font-display text-xl font-bold text-[#183B2B]">
                Describe Your Farm Problem
              </h2>
              <p className="text-xs text-[#183B2B]/70 mt-1">
                No login required for hackathon judging. Signed-in farmers can also use their account queue.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="demo-exp-name" className="block text-sm font-semibold mb-1.5">
                  Farmer Name (Demo)
                </label>
                <input
                  id="demo-exp-name"
                  type="text"
                  required
                  value={farmerName}
                  onChange={(e) => setFarmerName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
                />
              </div>

              <div>
                <label htmlFor="demo-exp-cat" className="block text-sm font-semibold mb-1.5">
                  Farming Category
                </label>
                <select
                  id="demo-exp-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
                >
                  {KNOWLEDGE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.shortName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="demo-exp-county" className="block text-sm font-semibold mb-1.5">
                  County
                </label>
                <select
                  id="demo-exp-county"
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3 text-sm"
                >
                  {COUNTIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="demo-exp-title" className="block text-sm font-semibold mb-1.5">
                Problem Summary
              </label>
              <input
                id="demo-exp-title"
                type="text"
                required
                minLength={4}
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Example: Chicks sneezing during wet rainy night in Bong County"
                className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/20 px-3.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="demo-exp-desc" className="block text-sm font-semibold mb-1.5">
                Details of What Happened
              </label>
              <textarea
                id="demo-exp-desc"
                rows={4}
                required
                minLength={10}
                maxLength={2500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Include age of crop/animals, housing or soil drainage, and how many are affected..."
                className="w-full rounded-2xl border border-[#183B2B]/20 p-3.5 text-sm"
              />
            </div>

            {/* Optional Photo & Optional Voice Note */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-2.5">
                <p className="text-sm font-semibold text-[#183B2B]">Optional Photo Attachment</p>
                <label className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-semibold cursor-pointer hover:bg-[#DDEFE0]">
                  <Camera className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                  <span>{photoDataUrl ? 'Change Photo' : 'Attach Crop or Coop Photo'}</span>
                  <input type="file" accept="image/*" onChange={(e) => void handlePhotoSelect(e)} className="sr-only" />
                </label>
                {photoDataUrl && (
                  <div className="flex items-center gap-3">
                    <img src={photoDataUrl} alt="Attached farm issue" className="w-16 h-16 rounded-xl object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoDataUrl('')}
                      className="text-xs font-semibold text-red-700 inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-2.5">
                <p className="text-sm font-semibold text-[#183B2B]">Optional Voice Note</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={recordingVoice ? handleStopVoiceNote : () => void handleStartVoiceNote()}
                    className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold ${
                      recordingVoice ? 'bg-red-600 text-white' : 'bg-white border border-[#183B2B]/15 text-[#183B2B]'
                    }`}
                  >
                    {recordingVoice ? <Square className="w-4 h-4" aria-hidden="true" /> : <Mic className="w-4 h-4 text-[#16803C]" aria-hidden="true" />}
                    <span>{recordingVoice ? 'Stop Recording' : 'Record Voice Note'}</span>
                  </button>
                  {voiceNoteDataUrl && (
                    <button
                      type="button"
                      onClick={() => setVoiceNoteDataUrl('')}
                      className="text-xs font-semibold text-red-700"
                    >
                      Delete Clip
                    </button>
                  )}
                </div>
                {voiceNoteDataUrl && (
                  <audio controls src={voiceNoteDataUrl} className="w-full h-10" />
                )}
                <input
                  type="text"
                  value={voiceNoteSummary}
                  onChange={(e) => setVoiceNoteSummary(e.target.value)}
                  placeholder="Optional note: e.g., Spoken in Bassa or Liberian English"
                  className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/15 bg-white px-3 text-xs"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
            {successMsg && (
              <div role="status" className="rounded-xl bg-[#DDEFE0] border border-[#16803C]/30 p-3 text-sm font-semibold text-[#183B2B] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#16803C] shrink-0" aria-hidden="true" />
                <span>{successMsg}</span>
              </div>
            )}

            {!isOnline && (
              <p className="rounded-xl bg-[#F5B942]/25 border border-[#F5B942] px-3 py-2 text-xs sm:text-sm font-medium text-[#183B2B]">
                You are offline. Your question will be saved <strong>on this phone</strong> and sent when the internet returns. AI answers and expert
                replies need an internet connection; this app cannot answer questions offline. For quick help now, search your saved guides in the
                Offline Library.
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 rounded-2xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630] disabled:opacity-50"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>{submitting ? 'Sending Request...' : isOnline ? 'Send to Agricultural Expert' : 'Save & Send When Online'}</span>
            </button>
          </form>

          {/* Request Status Tracker */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-[#183B2B] flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
                <span>Recent Requests &amp; Status</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className="inline-flex items-center min-h-[44px] text-xs font-semibold text-[#16803C] hover:underline"
              >
                Open Simulated Expert Reply View
              </button>
            </div>

            <div className="space-y-3">
              {requests.map((req) => (
                <article
                  key={req.id}
                  className="rounded-2xl bg-white border border-[#183B2B]/10 p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-[#183B2B]/65">
                        {req.farmer_name} · {req.county} County · {req.category} · Status: <strong>{req.status}</strong>
                      </p>
                      <h3 className="font-display text-lg font-bold text-[#183B2B] mt-0.5">{req.title}</h3>
                    </div>
                    {req.expert_reply && (
                      <SpeakButton
                        compact
                        id={`exp-reply-${req.id}`}
                        label={req.title}
                        text={`Expert reply for ${req.title}. ${req.expert_reply}`}
                      />
                    )}
                  </div>
                  <p className="text-sm text-[#183B2B]/80">{req.description}</p>
                  {req.photo_data_url && (
                    <img src={req.photo_data_url} alt="Farmer uploaded photo" className="max-h-36 rounded-xl object-cover" />
                  )}
                  {req.voice_note_data_url && (
                    <audio controls src={req.voice_note_data_url} className="w-full max-w-sm h-10" />
                  )}
                  {req.expert_reply ? (
                    <div className="rounded-2xl bg-[#DDEFE0] p-4 space-y-1">
                      <p className="text-xs font-bold text-[#16803C]">
                        Reply from {req.assigned_expert_name || 'Agricultural Expert (Simulated Demo)'}
                      </p>
                      <p className="text-sm text-[#183B2B] leading-relaxed">{req.expert_reply}</p>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-amber-800">
                      Awaiting expert review — switch to Simulated Expert Dashboard to demonstrate an officer reply live.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* SIMULATED EXPERT DASHBOARD TAB */
        <section className="space-y-4">
          <div className="rounded-2xl bg-[#F5B942]/25 border border-[#F5B942] p-4 text-sm text-[#183B2B]">
            <strong>Expert Dashboard (Hackathon Demo):</strong> This view demonstrates how a Liberian extension officer reviews farmer submissions (including photos and voice notes) and sends practical advice back to the farmer. Visitors see only sample requests and their own; approved experts and administrators see the full queue after signing in.
          </div>

          <div className="space-y-4">
            {requests.map((req) => (
              <div key={req.id} className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#16803C]">
                      Request #{req.id} · {req.status} · {req.county} County · {req.category}
                    </p>
                    <h2 className="font-display text-lg font-bold text-[#183B2B] mt-0.5">{req.title}</h2>
                    <p className="text-xs text-[#183B2B]/65">From: {req.farmer_name} · {req.created_at}</p>
                  </div>
                </div>

                <p className="text-sm text-[#183B2B]/85 leading-relaxed">{req.description}</p>

                {req.voice_note_summary && (
                  <p className="text-xs text-[#183B2B]/70">Voice note summary: {req.voice_note_summary}</p>
                )}
                {req.voice_note_data_url && (
                  <audio controls src={req.voice_note_data_url} className="w-full max-w-sm h-10" />
                )}
                {req.photo_data_url && (
                  <img src={req.photo_data_url} alt="Attached farm image" className="max-h-40 rounded-xl object-cover" />
                )}

                {req.expert_reply && (
                  <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-1">
                    <p className="text-xs font-bold text-[#16803C]">
                      Current Reply ({req.assigned_expert_name || 'Extension Officer'}):
                    </p>
                    <p className="text-sm text-[#183B2B]">{req.expert_reply}</p>
                  </div>
                )}

                {canRespond ? (
                  <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-3">
                    <p className="text-xs font-semibold text-[#183B2B]">
                      Reply as {user?.displayName} (your account name is shown to the farmer)
                    </p>
                    <textarea
                      rows={3}
                      value={replyDrafts[req.id] || ''}
                      onChange={(e) => setReplyDrafts((prev) => ({...prev, [req.id]: e.target.value}))}
                      placeholder="Write clear, low-risk guidance for the farmer..."
                      className="w-full rounded-xl border border-[#183B2B]/15 bg-white p-3 text-sm"
                    />
                    <button
                      type="button"
                      disabled={savingReplyId === req.id}
                      onClick={() => void handleExpertReply(req.id)}
                      className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16803C] text-white text-xs sm:text-sm font-semibold hover:bg-[#116630] disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" aria-hidden="true" />
                      <span>{savingReplyId === req.id ? 'Saving Reply...' : 'Send Expert Reply'}</span>
                    </button>
                  </div>
                ) : (
                  <p className="rounded-2xl bg-[#F3F8F0] p-4 text-sm text-[#183B2B]/85">
                    Only signed-in, approved experts and administrators can reply. Your own requests and any reply to them appear here.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
