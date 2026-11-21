/** Strict voice boundary: read only the visible screen, never input values or metadata. */
export function safeScreenSpeech(text: string): string {
  return text.split('\n').map((line) => {
    // Private conversations and any credential-bearing line are never spoken.
    if (/\b(pin|password|passcode|token|secret|otp|verification code|private demo inquiry|seller reply|received:|sent:|device key)\b/i.test(line)) return 'Private information omitted.';
    return line.replace(/(?:\+|0|231)[\d ()-]{7,}\d/g, '[private number omitted]').replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[private value omitted]');
  }).join('\n');
}
export interface ScreenSpeaker {read(text: string): void; stop(): void}
export function createScreenSpeaker(onNotice: (message: string) => void): ScreenSpeaker {
  let generation = 0; let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { generation++; clearTimeout(timer); try { window.speechSynthesis?.cancel(); } catch { /* text remains available */ } };
  return {stop, read(text) {
    stop(); const turn = generation;
    if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) { onNotice('Screen reading is unavailable. All instructions remain visible; use the numbered keys.'); return; }
    try {
      const speech = window.speechSynthesis; const u = new SpeechSynthesisUtterance(safeScreenSpeech(text));
      u.lang = 'en-US'; u.rate = 0.9;
      const voices = speech.getVoices(); u.voice = voices.find((v) => v.localService && /^en\b/i.test(v.lang)) ?? voices.find((v) => /^en\b/i.test(v.lang)) ?? null;
      u.onstart = () => { if (generation === turn) { clearTimeout(timer); onNotice(''); } };
      u.onend = () => { if (generation === turn) clearTimeout(timer); };
      u.onerror = () => { if (generation === turn) { clearTimeout(timer); onNotice('Screen reading could not play. Tap Repeat or read the visible instructions. Offline speech needs a voice installed on this device.'); } };
      timer = setTimeout(() => { if (generation === turn) { stop(); onNotice('Screen reading did not start. Tap Repeat; the numbered menus still work.'); } }, 4000);
      speech.speak(u);
    } catch { onNotice('Screen reading is unavailable. Use the visible numbered menus.'); }
  }};
}
