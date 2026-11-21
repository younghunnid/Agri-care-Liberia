import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, Loader2, Pause, Play, RotateCcw} from 'lucide-react';
import {useApp} from '../context/AppContext';

/**
 * Plays a RECORDED file exactly as recorded (no generated speech). Built for iPhone Safari as well as Chrome/Android:
 *  - nothing plays by itself: playback starts only from a tap on Play;
 *  - the file is fetched first (from the app's offline copy when there is no internet) and played from a Blob URL, because Safari cannot play media that a
 *    service worker answers without byte-range support. Play is then called straight from the tap, which iOS requires;
 *  - low-data mode waits for a first tap on "Load the recording" before downloading about 1 MB.
 */
export interface RecordedAdviceSource {id: string; url: string; mimeType: string; bytes: number; durationSec: number}
type State = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';
let activePlayer: HTMLAudioElement | null = null;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const btn = 'inline-flex min-h-[56px] min-w-[56px] items-center justify-center gap-2 rounded-2xl border-2 px-5 text-lg font-extrabold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#16803C]/40 disabled:opacity-50';

export const RecordedAdvicePlayer: React.FC<{source: RecordedAdviceSource; title: string; note?: string; playLabel?: string}> = ({source, title, note, playLabel = 'Play'}) => {
  const {isOnline, lowBandwidth, stopSpeech} = useApp();
  const audio = useRef<HTMLAudioElement | null>(null);
  const blobUrl = useRef<string | null>(null);
  const [state, setState] = useState<State>('idle');
  const [pos, setPos] = useState(0);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState<'checking' | 'yes' | 'no'>('checking');

  useEffect(() => { let live = true; (async () => { try { const hit = typeof caches !== 'undefined' ? await caches.match(source.url) : undefined; if (live) setSaved(hit ? 'yes' : 'no'); } catch { if (live) setSaved('no'); } })(); return () => { live = false; }; }, [source.url, state]);

  const load = useCallback(async () => {
    if (blobUrl.current) return;
    setState('loading'); setMessage('');
    try {
      const res = await fetch(source.url, {cache: 'force-cache'});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== source.bytes) throw new Error('size mismatch');
      blobUrl.current = URL.createObjectURL(new Blob([buf], {type: source.mimeType}));
      if (audio.current) audio.current.src = blobUrl.current;
      setState('ready');
    } catch { setState('error'); setMessage(isOnline ? 'The recording could not be loaded. Try again.' : 'You are offline and the recording is not saved on this phone yet. Open this page once with internet.'); }
  }, [isOnline, source.bytes, source.mimeType, source.url]);

  // Start downloading when the player appears (unless low-data mode), so Play can run straight from the tap.
  useEffect(() => { if (!lowBandwidth) void load(); }, [lowBandwidth, load]);
  useEffect(() => () => { audio.current?.pause(); if (activePlayer === audio.current) activePlayer = null; if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); blobUrl.current = null; }, []);

  const start = (fromStart: boolean) => {
    const a = audio.current; if (!a || !blobUrl.current) return;
    if (activePlayer && activePlayer !== a) activePlayer.pause();
    stopSpeech(); activePlayer = a; if (fromStart) a.currentTime = 0;
    const p = a.play(); if (p) p.catch(() => { setState('error'); setMessage('This browser could not play the recording.'); });
  };
  const onTap = () => { if (state === 'playing') audio.current?.pause(); else if (state === 'ready' || state === 'paused') start(false); else if (state === 'ended') start(true); else if (state === 'idle' || state === 'error') void load(); };

  const playing = state === 'playing'; const canPlay = state === 'ready' || state === 'paused' || state === 'ended' || playing;
  return (
    <div className="rounded-2xl border-2 border-[#183B2B]/20 bg-[#F3F8F0] p-4 space-y-3 text-[#183B2B]" data-testid="recorded-advice" data-state={state}>
      <p className="text-lg font-extrabold">{title}</p>
      {note && <p className="text-base font-semibold text-amber-950" data-testid="recording-note">{note}</p>}
      <audio ref={audio} preload="none" playsInline className="hidden" data-testid="recording-audio"
        onPlay={() => setState('playing')} onPause={() => setState((s) => (s === 'playing' ? 'paused' : s))} onEnded={() => { setState('ended'); setPos(source.durationSec); }}
        onTimeUpdate={(e) => setPos((e.target as HTMLAudioElement).currentTime)} onError={() => { setState('error'); setMessage('This browser could not play the recording.'); }} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onTap} disabled={state === 'loading'} className={`${btn} bg-[#16803C] border-[#16803C] text-white`} data-testid="recording-play"
          aria-label={playing ? 'Pause the recorded advice' : state === 'ended' ? 'Play the recorded advice again' : state === 'idle' || state === 'error' ? 'Load the recorded advice' : playLabel === 'Play' ? 'Play the recorded advice' : playLabel}>
          {state === 'loading' ? <Loader2 className="w-6 h-6 animate-spin" aria-hidden /> : playing ? <Pause className="w-6 h-6" aria-hidden /> : <Play className="w-6 h-6" aria-hidden />}
          {state === 'loading' ? 'Loading…' : playing ? 'Pause' : state === 'ended' ? 'Play again' : state === 'idle' ? `Load the recording (${(source.bytes / 1048576).toFixed(1)} MB)` : state === 'error' ? 'Try again' : state === 'paused' ? 'Continue' : playLabel}
        </button>
        <button type="button" onClick={() => start(true)} disabled={!canPlay} className={`${btn} border-[#183B2B]/30 bg-white`} data-testid="recording-replay" aria-label="Replay the recorded advice from the start"><RotateCcw className="w-6 h-6" aria-hidden /> Replay</button>
      </div>
      <div className="space-y-1">
        <progress value={Math.min(pos, source.durationSec)} max={source.durationSec} className="w-full h-3" aria-label="Playback position" data-testid="recording-progress" />
        <p className="text-base font-semibold" data-testid="recording-time">{mmss(pos)} / {mmss(source.durationSec)} · {(source.bytes / 1048576).toFixed(1)} MB</p>
      </div>
      <p role="status" aria-live="polite" className="text-base font-semibold" data-testid="recording-status">
        {state === 'error' ? <span className="inline-flex items-start gap-2 text-[#7A1010]"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden /> {message}</span> : playing ? 'Playing the recording.' : state === 'paused' ? 'Paused.' : state === 'ended' ? 'The recording has finished.' : ''}
      </p>
      <p className="flex items-start gap-2 text-base" data-testid="recording-offline">{saved === 'yes' ? <><CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[#16803C]" aria-hidden /> Saved on this phone: it plays without internet.</> : saved === 'no' ? <>Not saved on this phone yet. It is saved with the app after you open the app online and the update finishes.</> : <>Checking whether it is saved on this phone…</>}</p>
      {state === 'error' && <a href={source.url} className="inline-flex min-h-[48px] items-center text-base font-bold underline" data-testid="recording-open-file">Open the recording file</a>}
    </div>
  );
};
