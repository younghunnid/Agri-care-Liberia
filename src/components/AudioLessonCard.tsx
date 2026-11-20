import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AlertTriangle, Download, Headphones, Loader2, Pause, Play, RotateCcw, Trash2, X} from 'lucide-react';
import {useApp} from '../context/AppContext';
import {
  AUDIO_LESSONS,
  languageLabel,
  languagesAwaitingRecordings,
  lessonsForGuide,
  type AudioLesson,
} from '../data/audioLessons';
import {
  AudioError,
  deleteAudio,
  deleteAllAudio,
  downloadAudio,
  formatAudioSize,
  formatDuration,
  getAudioBlob,
  useAudioStore,
} from '../lib/audioStore';

/** Only one lesson plays at a time. */
let activeAudio: HTMLAudioElement | null = null;

type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended';

const btn = 'inline-flex items-center gap-2 min-h-[48px] px-4 rounded-xl text-sm font-bold border';

export const AudioLessonCard: React.FC<{lesson: AudioLesson}> = ({lesson}) => {
  const {isOnline, stopSpeech, playbackState, activeSpeechId} = useApp();
  const {downloaded} = useAudioStore();
  const saved = downloaded.some((d) => d.id === lesson.id);

  const [dl, setDl] = useState<{receivedBytes: number} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [play, setPlay] = useState<PlayState>('idle');
  const [pos, setPos] = useState(0);
  const [showText, setShowText] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const release = useCallback(() => {
    audioRef.current?.pause();
    if (activeAudio === audioRef.current) activeAudio = null;
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    release();
  }, [release]);

  // Smart Listen (spoken text) started: pause this recording so the two never overlap.
  useEffect(() => {
    if (activeSpeechId && playbackState === 'playing' && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [activeSpeechId, playbackState]);

  const startDownload = async () => {
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    abortRef.current = controller;
    setDl({receivedBytes: 0});
    try {
      await downloadAudio(lesson.id, {signal: controller.signal, onProgress: (p) => setDl({receivedBytes: p.receivedBytes})});
      setNotice('Saved. You can listen without internet.');
    } catch (err) {
      if (err instanceof AudioError && err.kind === 'cancelled') setNotice('Download cancelled. Nothing was saved.');
      else setError(err instanceof Error ? err.message : 'The download failed. Please try again.');
    } finally {
      setDl(null);
      abortRef.current = null;
    }
  };

  const ensureAudio = async (): Promise<HTMLAudioElement | null> => {
    if (audioRef.current) return audioRef.current;
    const blob = await getAudioBlob(lesson.id);
    if (!blob) {
      setError('This audio is no longer saved on the phone. Download it again.');
      return null;
    }
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const el = new Audio(url);
    el.preload = 'auto';
    el.ontimeupdate = () => setPos(el.currentTime);
    el.onended = () => setPlay('ended');
    el.onpause = () => setPlay((s) => (s === 'ended' ? s : 'paused'));
    el.onplaying = () => setPlay('playing');
    el.onerror = () => {
      setPlay('idle');
      setError('This phone could not play the audio. Try deleting and downloading it again.');
    };
    audioRef.current = el;
    return el;
  };

  const startPlayback = async (fromStart = false) => {
    setError(null);
    setPlay('loading');
    try {
      const el = await ensureAudio();
      if (!el) {
        setPlay('idle');
        return;
      }
      if (activeAudio && activeAudio !== el) activeAudio.pause();
      activeAudio = el;
      stopSpeech(); // never talk over the Smart Listen voice
      if (fromStart) el.currentTime = 0;
      await el.play();
    } catch {
      setPlay('idle');
      setError('Could not start playback. Tap Play again.');
    }
  };

  const remove = async () => {
    setError(null);
    release();
    setPlay('idle');
    setPos(0);
    try {
      const freed = await deleteAudio(lesson.id);
      setNotice(`Deleted. ${formatAudioSize(freed)} freed.`);
    } catch {
      setError('Could not delete the audio. Please try again.');
    }
  };

  const pct = dl ? Math.min(100, Math.round((dl.receivedBytes / lesson.bytes) * 100)) : 0;

  return (
    <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#16803C]">
            {languageLabel(lesson.language)} · {lesson.kind === 'demonstration' ? 'Demonstration' : 'Lesson'} ·{' '}
            {formatDuration(lesson.durationSec)} · {formatAudioSize(lesson.bytes)}
          </p>
          <h3 className="font-display font-bold text-[#183B2B]">{lesson.title}</h3>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full border text-xs font-bold ${
            saved ? 'bg-[#DDEFE0] text-[#16803C] border-[#16803C]/30' : 'bg-gray-100 text-gray-700 border-gray-300'
          }`}
        >
          {saved ? 'Saved on this phone' : 'Not downloaded'}
        </span>
      </div>

      <p className="rounded-xl bg-[#F5B942]/25 border border-[#F5B942] px-3 py-2 text-xs font-medium text-[#183B2B]">{lesson.label}</p>

      {dl && (
        <div className="space-y-1" aria-live="polite">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Audio download progress"
            className="h-3 rounded-full bg-[#183B2B]/10 overflow-hidden"
          >
            <div className="h-full bg-[#16803C] transition-all" style={{width: `${pct}%`}} />
          </div>
          <p className="text-xs text-[#183B2B]/80">
            Downloading… {formatAudioSize(dl.receivedBytes)} of {formatAudioSize(lesson.bytes)} ({pct}%)
          </p>
        </div>
      )}

      {saved && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {play === 'playing' ? (
              <button type="button" onClick={() => audioRef.current?.pause()} className={`${btn} border-[#16803C] bg-[#16803C] text-white`}>
                <Pause className="w-4 h-4" aria-hidden="true" /> Pause
              </button>
            ) : play === 'ended' ? (
              <button type="button" onClick={() => void startPlayback(true)} className={`${btn} border-[#16803C] bg-[#16803C] text-white`}>
                <RotateCcw className="w-4 h-4" aria-hidden="true" /> Play Again
              </button>
            ) : (
              <button
                type="button"
                disabled={play === 'loading'}
                onClick={() => void startPlayback(false)}
                className={`${btn} border-[#16803C] bg-[#16803C] text-white disabled:opacity-60`}
              >
                {play === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
                {play === 'paused' ? 'Resume' : 'Play'}
              </button>
            )}
            {(play === 'playing' || play === 'paused') && (
              <button type="button" onClick={() => void startPlayback(true)} className={`${btn} border-[#183B2B]/20 bg-white text-[#183B2B]`}>
                <RotateCcw className="w-4 h-4" aria-hidden="true" /> Replay
              </button>
            )}
            <button
              type="button"
              onClick={() => void remove()}
              aria-label={`Delete downloaded audio: ${lesson.title}`}
              className={`${btn} border-red-200 bg-white text-red-700`}
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete
            </button>
          </div>
          <p className="text-xs text-[#183B2B]/70 tabular-nums" aria-live="off">
            {formatDuration(pos)} / {formatDuration(lesson.durationSec)}
          </p>
        </div>
      )}

      {!saved && !dl && (
        <button
          type="button"
          onClick={() => void startDownload()}
          disabled={!isOnline}
          className={`${btn} border-[#16803C] bg-[#16803C] text-white disabled:opacity-50`}
        >
          <Download className="w-4 h-4" aria-hidden="true" /> Download audio ({formatAudioSize(lesson.bytes)})
        </button>
      )}
      {dl && (
        <button type="button" onClick={() => abortRef.current?.abort()} className={`${btn} border-[#183B2B]/20 bg-white text-[#183B2B]`}>
          <X className="w-4 h-4" aria-hidden="true" /> Cancel
        </button>
      )}
      {!saved && !isOnline && <p className="text-xs text-amber-800">Connect to the internet to download this audio.</p>}

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </span>
          {!saved && isOnline && (
            <button type="button" onClick={() => void startDownload()} className="min-h-[44px] px-3 rounded-lg bg-red-700 text-white text-xs font-bold">
              Try again
            </button>
          )}
        </div>
      )}
      {notice && !error && (
        <p role="status" className="text-xs font-semibold text-[#16803C]">
          {notice}
        </p>
      )}

      <button
        type="button"
        aria-expanded={showText}
        onClick={() => setShowText((v) => !v)}
        className="text-xs font-semibold text-[#16803C] underline min-h-[44px]"
      >
        {showText ? 'Hide' : 'Read'} what is said
      </button>
      {showText && <p className="text-sm text-[#183B2B]/90 leading-relaxed">{lesson.transcript}</p>}
    </div>
  );
};

/** "Listen Offline" block for a guide; renders nothing if the guide has no audio lesson. */
export const ListenOfflineSection: React.FC<{guideId: string}> = ({guideId}) => {
  const lessons = lessonsForGuide(guideId);
  if (lessons.length === 0) return null;
  return (
    <section aria-labelledby={`listen-offline-${guideId}`} className="rounded-3xl bg-[#F3F8F0] border border-[#16803C]/25 p-4 sm:p-5 space-y-3">
      <h2 id={`listen-offline-${guideId}`} className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
        <Headphones className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
        <span>Listen Offline</span>
      </h2>
      <p className="text-xs text-[#183B2B]/75">
        Optional recording you can save on this phone. Smart Listen (the phone reading the text aloud) still works online, but it may not work
        without internet.
      </p>
      {lessons.map((l) => (
        <AudioLessonCard key={l.id} lesson={l} />
      ))}
      <LanguagesNote />
    </section>
  );
};

export const LanguagesNote: React.FC = () => (
  <p className="text-xs text-[#183B2B]/70">
    {languagesAwaitingRecordings()
      .map((l) => l.label)
      .join(', ')}{' '}
    audio is <strong>not available yet</strong>. These languages will be added only when real recordings from native speakers are ready.
  </p>
);

/** Full list + storage use, for the Offline Library page. */
export const OfflineAudioManager: React.FC = () => {
  const {downloaded, totalBytes} = useAudioStore();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section aria-labelledby="offline-audio-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="offline-audio-title" className="font-display text-xl font-bold text-[#183B2B] flex items-center gap-2">
          <Headphones className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
          <span>Offline Audio (optional)</span>
        </h2>
        <p className="text-xs font-semibold text-[#183B2B]/75">
          {downloaded.length} saved · {formatAudioSize(totalBytes || 0)} used
        </p>
      </div>
      <p className="text-xs text-[#183B2B]/75">
        Audio is not part of the Starter Pack. Download only the lessons you want; each shows its size first.
      </p>
      {AUDIO_LESSONS.map((l) => (
        <AudioLessonCard key={l.id} lesson={l} />
      ))}
      <LanguagesNote />
      {msg && <p role="status" className="text-xs font-semibold text-[#16803C]">{msg}</p>}
      {downloaded.length > 1 && (
        <button
          type="button"
          onClick={async () => {
            const freed = await deleteAllAudio();
            setMsg(`All audio deleted. ${formatAudioSize(freed)} freed.`);
          }}
          className="min-h-[44px] px-4 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Delete all downloaded audio
        </button>
      )}
    </section>
  );
};
