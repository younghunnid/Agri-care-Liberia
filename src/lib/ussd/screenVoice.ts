import {PROPOSED_USSD_CODE} from './enrollment';
/** Strict voice boundary: read only the visible screen, never input values or metadata. */
export function safeScreenSpeech(text: string): string {
  return text.split('\n').map((line) => {
    // Private conversations and any credential-bearing line are never spoken.
    if (/\b(pin|password|passcode|token|secret|otp|verification code|private demo inquiry|seller reply|received:|sent:|device key)\b/i.test(line)) return 'Private information omitted.';
    return line.replace(/(?:\+|0|231)[\d ()-]{7,}\d/g, '[private number omitted]').replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[private value omitted]');
  }).join('\n');
}
/** Speaking speeds. Normal (0.75) is the default: farmers who cannot read need time to understand each instruction. */
export const VOICE_SPEEDS = {slow: 0.6, normal: 0.75, fast: 1.0} as const;
export type VoiceSpeed = keyof typeof VOICE_SPEEDS;
export const DEFAULT_VOICE_SPEED: VoiceSpeed = 'normal';
export const VOICE_RATE = VOICE_SPEEDS[DEFAULT_VOICE_SPEED];
export const VOICE_PITCH = 1.0;
export const VOICE_VOLUME = 1.0;
/** Pauses (milliseconds): after a heading, after each numbered option, and after any other instruction line. */
export const HEADING_PAUSE_MS = 1500;
export const OPTION_PAUSE_MS = 1000;
export const LINE_PAUSE_MS = 700;
const SPEED_KEY = 'agri_ussd_voice_speed_v1';
/** The person's chosen speed is remembered on this device only (a harmless preference, never sent anywhere). */
export function loadVoiceSpeed(): VoiceSpeed {
  try { const v = localStorage.getItem(SPEED_KEY); if (v === 'slow' || v === 'normal' || v === 'fast') return v; } catch { /* storage unavailable: use the default */ }
  return DEFAULT_VOICE_SPEED;
}
export function saveVoiceSpeed(speed: VoiceSpeed): void { try { localStorage.setItem(SPEED_KEY, speed); } catch { /* preference only */ } }

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const sayDigits = (n: string): string => n.split('').map((d) => DIGIT_WORDS[Number(d)]).join(' ');
const KEYPAD_CODE = new RegExp(PROPOSED_USSD_CODE.replace(/[*#]/g, '\\$&'), 'g');
/** Said aloud as letters and digits, never as the symbols. */
const spokenCodes = (t: string): string => t.replace(KEYPAD_CODE, 'Star, four four zero, hash');
export interface SpeechSegment {text: string; pauseMs: number}
/**
 * The screen as spoken pieces. Each piece is one utterance followed by a pause:
 *  - the heading (first line): 1.5 seconds;
 *  - each numbered option, spoken as an instruction ("1 Crops & planting" becomes "Press one for crops and planting."): 1 second;
 *  - any other line: 0.7 seconds.
 * Built on safeScreenSpeech, so typed input, credentials and phone numbers are never part of it.
 */
export function speechSegments(text: string): SpeechSegment[] {
  const lines = safeScreenSpeech(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const out: SpeechSegment[] = [];
  lines.forEach((line, index) => {
    const clean = (t: string) => spokenCodes(t.replace(/[\s.…:;,]+$/, '') || t);
    if (/^\d{1,2}\s+\S/.test(line)) {
      // One line may hold several options ("0 Back 00 Home").
      const re = /(\d{1,2})\s+(.+?)(?=\s+\d{1,2}\s+[A-Za-z]|$)/g; let m: RegExpExecArray | null; let any = false;
      while ((m = re.exec(line)) !== null) {
        any = true; const keys = sayDigits(m[1]); const label = clean(m[2]);
        const body = /^back$/i.test(label) ? `Press ${keys} to go back` : /^home$/i.test(label) ? `Press ${keys} to go to the main menu` : /^next$/i.test(label) ? `Press ${keys} for the next page` : `Press ${keys} for ${label.charAt(0).toLowerCase() + label.slice(1)}`;
        out.push({text: `${body}.`, pauseMs: OPTION_PAUSE_MS});
      }
      if (any) return;
    }
    out.push({text: `${clean(line)}.`, pauseMs: index === 0 ? HEADING_PAUSE_MS : LINE_PAUSE_MS});
  });
  if (out.length) out[out.length - 1] = {...out[out.length - 1], pauseMs: 0};
  return out;
}
/** The whole screen as one sentence string (used for logs and tests). */
export const speechText = (text: string): string => speechSegments(text).map((s) => s.text).join(' ');

export interface ScreenSpeaker {read(text: string): void; stop(): void; setSpeed(speed: VoiceSpeed): void; speed(): VoiceSpeed}
/** Test-only hook: multiplies every pause (set before the page loads). Production never sets it. */
const pauseScale = (): number => { const v = Number((globalThis as {__agriVoicePauseScale?: number}).__agriVoicePauseScale); return Number.isFinite(v) && v >= 0 ? v : 1; };
export function createScreenSpeaker(onNotice: (message: string) => void, initialSpeed: VoiceSpeed = loadVoiceSpeed()): ScreenSpeaker {
  let generation = 0; let timer: ReturnType<typeof setTimeout> | undefined; let speed = initialSpeed;
  /** Stops EVERYTHING at once: the current utterance, the queue of pieces still to come and any pause in progress. Late callbacks of the old reading are ignored. */
  const stop = () => { generation++; clearTimeout(timer); timer = undefined; try { window.speechSynthesis?.cancel(); } catch { /* text remains available */ } };
  return {
    stop, speed: () => speed, setSpeed: (next) => { speed = next; },
    read(text) {
      stop(); const turn = generation; // one reading at a time: a new screen replaces the old one, never overlaps it
      if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) { onNotice('Screen reading is unavailable. All instructions remain visible; use the numbered keys.'); return; }
      const segments = speechSegments(text); if (!segments.length) return;
      const speech = window.speechSynthesis;
      const speakPiece = (i: number) => {
        if (generation !== turn) return;
        try {
          const seg = segments[i]; const u = new SpeechSynthesisUtterance(seg.text);
          u.lang = 'en-US'; u.rate = VOICE_SPEEDS[speed]; u.pitch = VOICE_PITCH; u.volume = VOICE_VOLUME;
          const voices = speech.getVoices(); u.voice = voices.find((v) => v.localService && /^en\b/i.test(v.lang)) ?? voices.find((v) => /^en\b/i.test(v.lang)) ?? null;
          let watchdog: ReturnType<typeof setTimeout> | undefined;
          const next = () => {
            if (generation !== turn) return;
            clearTimeout(watchdog);
            if (i + 1 < segments.length) timer = setTimeout(() => speakPiece(i + 1), Math.round(seg.pauseMs * pauseScale()));
          };
          u.onstart = () => { if (generation === turn) { clearTimeout(watchdog); onNotice(''); } };
          u.onend = next;
          u.onerror = () => { if (generation === turn) { clearTimeout(watchdog); stop(); onNotice('Screen reading could not play. Tap Repeat or read the visible instructions. Offline speech needs a voice installed on the device.'); } };
          watchdog = setTimeout(() => { if (generation === turn) { stop(); onNotice('Screen reading did not start. Tap Repeat; the numbered menus still work.'); } }, 4000);
          speech.speak(u);
        } catch { if (generation === turn) onNotice('Screen reading is unavailable. Use the visible numbered menus.'); }
      };
      speakPiece(0); // the first piece starts inside the tap that asked for it (iPhone Safari needs that)
    },
  };
}
