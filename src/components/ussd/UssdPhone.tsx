import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft, ArrowRight, Delete, Home, PhoneCall, PhoneOff, RotateCcw, Wifi, WifiOff} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {harvestClient} from '../../lib/triageApp';
import {DEFAULT_TIMEOUT_S, DEMO_CALLER, DEMO_LABEL, newSession, press, tick, view, type Key, type MarketEnv, type Session, type UssdEnv} from '../../lib/ussd/engine';

const DIGITS: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const SPOKEN: Record<string, string> = {'*': 'Star', '#': 'Hash'};
const FOCUS = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F5B942] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1B2430]';
const caller = DEMO_CALLER.replace(/^(\+231)(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3 $4');

/** The simulated basic phone: a monochrome screen, a 12-key keypad and Send / Back / Home / Cancel keys. Everything runs in the browser; nothing is sent anywhere. */
export const UssdPhone: React.FC<{timeoutSeconds?: number}> = ({timeoutSeconds = DEFAULT_TIMEOUT_S}) => {
  const {isOnline} = useApp();
  const [session, setSession] = useState<Session>(() => newSession());
  const [now, setNow] = useState<number>(() => Date.now());
  const [market, setMarket] = useState<MarketEnv>({source: 'none', asOf: null, listings: []});
  const root = useRef<HTMLDivElement>(null);

  // The only thing that may need the internet: the list of harvest for sale. The existing client falls back to the copy saved on this device.
  useEffect(() => {
    let alive = true;
    void harvestClient.load().then((r) => { if (alive) setMarket({source: r.source, asOf: r.asOf ?? null, listings: r.listings.map((l) => ({code: l.code, cropSlug: l.cropSlug, quantityKg: l.quantityKg, pricePerKgLrd: l.pricePerKgLrd, county: l.county, status: l.status}))}); }).catch(() => undefined);
    return () => { alive = false; };
  }, [isOnline]);
  // Persist expiry as well as rendering it, so the input, session status and restart control agree with the screen.
  useEffect(() => {
    const t = setInterval(() => { const at = Date.now(); setSession((s) => tick(s, at, timeoutSeconds)); setNow(at); }, 1000);
    return () => clearInterval(t);
  }, [timeoutSeconds]);

  const env: UssdEnv = useMemo(() => ({online: isOnline, market, now: new Date(now), timeoutSeconds}), [isOnline, market, now, timeoutSeconds]);
  const envRef = useRef(env); envRef.current = env;
  const send = useCallback((k: Key) => setSession((s) => press(s, k, envRef.current, Date.now())), []);
  const screen = view(session, env, now);
  const active = session.status === 'active';

  // Keyboard: digits, * and #, Enter = Send, Backspace = Delete, Escape = Cancel. Buttons keep their own Enter/Space behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null; const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (/^[0-9*#]$/.test(e.key)) { e.preventDefault(); send(e.key as Key); }
      else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); send('send'); }
      else if (e.key === 'Backspace') { e.preventDefault(); send('del'); }
      else if (e.key === 'Escape') { e.preventDefault(); send('cancel'); }
    };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [send]);

  const net = screen.internet;
  const netText = !net.needed ? 'Built into the app: works without internet.' : net.state === 'live' ? 'Needs internet: live list from the server.' : net.state === 'saved' ? 'Needs internet: showing the list saved on this device.' : 'Needs internet: no saved list on this device.';
  const key = `min-h-[56px] rounded-2xl text-2xl font-extrabold bg-[#E8EDF3] text-[#10161D] active:bg-white shadow-[0_3px_0_#7C8794] ${FOCUS}`;
  const fn = `min-h-[52px] rounded-xl text-base font-extrabold px-2 inline-flex items-center justify-center gap-1.5 ${FOCUS}`;

  return (
    <div ref={root} className="mx-auto w-full max-w-[340px]" data-testid="ussd-phone">
      <div className="rounded-[2rem] bg-[#1B2430] p-4 space-y-3 shadow-xl border-4 border-[#10161D]">
        <div className="flex items-center justify-between text-sm font-bold text-[#E8EDF3]">
          <span data-testid="ussd-caller" title="A made-up number">Demo farmer {caller}</span>
          <span className="inline-flex items-center gap-1" data-testid="ussd-net" data-online={isOnline ? 'yes' : 'no'}>{isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}{isOnline ? 'Internet' : 'Offline'}</span>
        </div>
        <div className="rounded-xl bg-[#CFEAA8] border-4 border-[#0A1A0E] p-3 min-h-[190px] flex flex-col justify-between" data-testid="ussd-screen" data-frame={screen.frameId ?? 'idle'} data-kind={screen.kind}>
          <div role="region" aria-label="Phone screen" aria-live="polite" aria-atomic="true">
            <pre className="font-mono text-[15px] leading-snug text-[#0A1A0E] whitespace-pre-wrap break-words m-0" data-testid="ussd-text">{screen.text}</pre>
          </div>
          <div className="mt-2 border-t-2 border-[#0A1A0E]/40 pt-1.5 flex items-center justify-between font-mono text-[15px] text-[#0A1A0E]">
            <span data-testid="ussd-input" aria-label={`You typed ${session.input || 'nothing'}`}>{active || session.input ? `> ${session.input}` : '>'}<span className="animate-pulse" aria-hidden>_</span></span>
            <span aria-hidden className="text-xs" data-testid="ussd-timer">{active && screen.secondsLeft !== null ? `${screen.secondsLeft}s` : ''}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Phone function keys">
          <button type="button" onClick={() => send('send')} aria-label="Send" data-testid="key-send" className={`${fn} bg-[#16A34A] text-white col-span-2`}><PhoneCall className="w-5 h-5" aria-hidden /> Send</button>
          <button type="button" onClick={() => send('cancel')} aria-label="Cancel and end the session" data-testid="key-cancel" className={`${fn} bg-[#DC2626] text-white col-span-2`}><PhoneOff className="w-5 h-5" aria-hidden /> Cancel</button>
          <button type="button" onClick={() => send('back')} aria-label="Back one screen" data-testid="key-back" className={`${fn} bg-[#E8EDF3] text-[#10161D]`}><ArrowLeft className="w-5 h-5" aria-hidden /> Back</button>
          <button type="button" onClick={() => send('home')} aria-label="Home, the main menu" data-testid="key-home" className={`${fn} bg-[#E8EDF3] text-[#10161D]`}><Home className="w-5 h-5" aria-hidden /> Home</button>
          <button type="button" onClick={() => send('del')} aria-label="Delete the last digit" data-testid="key-del" className={`${fn} bg-[#E8EDF3] text-[#10161D] col-span-2`}><Delete className="w-5 h-5" aria-hidden /> Delete</button>
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Number keypad">
          {DIGITS.map((d) => <button key={d} type="button" onClick={() => send(d)} aria-label={`Digit ${SPOKEN[d] ?? d}`} data-testid={`key-${d === '*' ? 'star' : d === '#' ? 'hash' : d}`} className={key}>{d}</button>)}
        </div>
      </div>
      <div className="mt-3 space-y-2 text-[#183B2B]" data-testid="ussd-info">
        <p className="text-sm font-bold" data-testid="ussd-net-note"><span className={`inline-block rounded-full border px-2.5 py-0.5 ${net.needed ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-[#16803C]/40 bg-[#DDEFE0] text-[#0F5C2A]'}`}>{netText}</span></p>
        <p className="text-sm" data-testid="ussd-session">{active ? `Session ${session.no} is open.` : session.status === 'ended' ? `Session ${session.no} ended.` : 'No session yet.'} {!active && <button type="button" onClick={() => send('send')} className="inline-flex items-center gap-1 min-h-[44px] font-bold underline text-[#0F5C2A]"><RotateCcw className="w-4 h-4" aria-hidden /> Start a session</button>}</p>
        {screen.appLink && <Link to={screen.appLink.to} className="inline-flex items-center gap-2 min-h-[48px] rounded-2xl border-2 border-[#16803C] px-4 font-bold text-[#0F5C2A]" data-testid="ussd-applink">{screen.appLink.label} <ArrowRight className="w-4 h-4" aria-hidden /></Link>}
        <p className="sr-only">{DEMO_LABEL}</p>
      </div>
    </div>
  );
};
