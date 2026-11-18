import React from 'react';
import {Pause, Play, RotateCcw, Square, Volume2} from 'lucide-react';
import {useApp} from '../context/AppContext';

export const ListenModeBar: React.FC = () => {
  const {
    listenMode,
    playbackState,
    activeSpeechLabel,
    speechRate,
    speechNotice,
    speechSupported,
    pauseSpeech,
    resumeSpeech,
    replaySpeech,
    stopSpeech,
    setSpeechRate,
  } = useApp();

  const showBar = playbackState !== 'idle' || Boolean(speechNotice);
  if (!showBar) return null;

  return (
    <div
      role="region"
      aria-label="Smart Listen Mode audio player"
      className="rounded-2xl bg-[#183B2B] text-white px-4 py-3 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-xl bg-[#F5B942] text-[#183B2B] flex items-center justify-center shrink-0">
          <Volume2 className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-[#F5B942] font-semibold">
            {playbackState === 'playing'
              ? 'Speaking aloud'
              : playbackState === 'paused'
              ? 'Audio paused'
              : listenMode
              ? 'Smart Listen Mode'
              : 'Audio Notice'}
          </p>
          <p className="text-sm font-semibold truncate">
            {speechNotice || activeSpeechLabel || 'Tap any speaker icon to listen'}
          </p>
        </div>
      </div>

      {speechSupported && playbackState !== 'idle' && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {playbackState === 'playing' ? (
            <button
              type="button"
              onClick={pauseSpeech}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold whitespace-nowrap"
            >
              <Pause className="w-4 h-4" aria-hidden="true" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={resumeSpeech}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#16803C] hover:bg-[#116630] text-xs font-semibold whitespace-nowrap"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              <span>Resume</span>
            </button>
          )}

          <button
            type="button"
            onClick={replaySpeech}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Replay</span>
          </button>

          <button
            type="button"
            onClick={stopSpeech}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600/85 hover:bg-red-600 text-xs font-semibold whitespace-nowrap"
          >
            <Square className="w-4 h-4" aria-hidden="true" />
            <span>Stop</span>
          </button>

          <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1" aria-label="Playback speed">
            {[
              {val: 0.8, label: '0.8x'},
              {val: 0.95, label: '1x'},
              {val: 1.2, label: '1.2x'},
            ].map((spd) => (
              <button
                key={spd.label}
                type="button"
                onClick={() => setSpeechRate(spd.val)}
                className={`min-h-[44px] px-2.5 rounded-lg text-xs font-bold transition-colors ${
                  Math.abs(speechRate - spd.val) < 0.05
                    ? 'bg-[#F5B942] text-[#183B2B]'
                    : 'text-white/85 hover:bg-white/15'
                }`}
              >
                {spd.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
