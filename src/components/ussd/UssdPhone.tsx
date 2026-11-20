import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {Delete, Loader2, PhoneCall, PhoneOff, RefreshCw, RotateCcw, Wifi, WifiOff} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {useSyncState} from '../../lib/syncEngine';
import {createBrowserUssdMarket} from '../../lib/ussd/marketApp';
import {EMPTY_MARKETPLACE, type MarketplaceEnv} from '../../lib/ussd/marketTypes';
import {DEFAULT_TIMEOUT_S, DEMO_LABEL, finishMarket, newSession, press, tick, view, type Key, type Session, type UssdEnv} from '../../lib/ussd/engine';

const DIGITS: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const SPOKEN: Record<string, string> = {'*': 'Star', '#': 'Hash'};
const LETTERS: Record<string, string> = {'1': ' ', '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL', '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ', '0': '+'};
const FOCUS = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F5B942] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1B2430]';

/** Browser phone; marketplace writes happen only after the final numbered confirmation. No telecom or phone-number identity. */
export const UssdPhone: React.FC<{timeoutSeconds?: number}> = ({timeoutSeconds = DEFAULT_TIMEOUT_S}) => {
  const {isOnline} = useApp();
  const onlineRef = useRef(isOnline); onlineRef.current = isOnline;
  const service = useRef<ReturnType<typeof createBrowserUssdMarket> | null>(null);
  if (!service.current) service.current = createBrowserUssdMarket(() => onlineRef.current);
  const sync = useSyncState();
  const [session, setSession] = useState<Session>(() => newSession());
  const sessionRef = useRef(session);
  const [now, setNow] = useState(() => Date.now());
  const [marketplace, setMarketplace] = useState<MarketplaceEnv>({...EMPTY_MARKETPLACE, loading: true});
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState(false);
  const mounted = useRef(true);
  const started = useRef(new Set<string>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    const data = await service.current!.load();
    if (mounted.current) { setMarketplace(data); setRefreshing(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, isOnline]);
  // Shared queue notifications update pending/synced/failed status and the real server reference.
  useEffect(() => { setMarketplace(service.current!.snapshot()); }, [sync.queued, sync.failed, sync.lastSyncAt, sync.syncing]);
  useEffect(() => {
    const t = setInterval(() => { const at = Date.now(); const next = tick(sessionRef.current, at, timeoutSeconds); sessionRef.current = next; setSession(next); setNow(at); }, 1000);
    return () => clearInterval(t);
  }, [timeoutSeconds]);
  const env: UssdEnv = useMemo(() => ({online: isOnline, marketplace, market: marketplace.legacy ?? {source: marketplace.source, asOf: marketplace.asOf, listings: marketplace.listings}, now: new Date(now), timeoutSeconds}), [isOnline, marketplace, now, timeoutSeconds]);
  const envRef = useRef(env); envRef.current = env;
  const send = useCallback((key: Key) => {
    const next = press(sessionRef.current, key, envRef.current, Date.now());
    sessionRef.current = next; setSession(next);
    const command = next.pending;
    if (!command || started.current.has(command.token)) return;
    started.current.add(command.token);
    setWorking(true);
    // The adapter deduplicates dispatch; a repeated Send cannot execute a confirmation twice.
    void service.current!.run(command).then(async (result) => {
      started.current.delete(command.token);
      if (!mounted.current) return;
      const finished = finishMarket(sessionRef.current, command.token, result, Date.now(), envRef.current.timeoutSeconds);
      sessionRef.current = finished; setSession(finished); setWorking(false);
      await refresh();
    });
  }, [refresh]);
  const screen = view(session, env, now);
  const active = session.status === 'active';
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
  const netText = screen.frameId === 'market.list' ? (env.market.source === 'saved' ? 'Read-only public harvest list: saved copy, may be old.' : env.market.source === 'server' ? 'Read-only public harvest list from the existing server.' : 'No saved public harvest list. Connect once to download it.') : !net.needed && !screen.frameId?.startsWith('trade.') ? 'Built into the app: works without internet.' : marketplace.source === 'saved' ? 'Saved demo market: may be out of date. Inquiries need internet.' : isOnline ? 'Browser marketplace uses the existing server. No telecom connection.' : 'Offline: confirmed harvest drafts wait to sync. Inquiries cannot be sent.';
  const key = `min-h-[56px] rounded-[0.85rem] border border-white/35 text-2xl font-extrabold bg-[#E8EDF3] text-[#10161D] active:bg-white shadow-[0_4px_0_#74808D] ${FOCUS}`;
  const fn = `min-h-[52px] rounded-xl text-base font-extrabold px-2 inline-flex items-center justify-center gap-1.5 ${FOCUS}`;
  return (
    <div className="mx-auto w-full max-w-[440px]" data-testid="ussd-phone">
      <div className="ussd-handset rounded-[2.5rem] bg-gradient-to-b from-[#354150] via-[#1B2430] to-[#10161D] p-3 sm:p-5 space-y-3 shadow-xl border-4 border-[#10161D]">
        <div className="flex items-center justify-center gap-2 py-1" aria-hidden><span className="w-2 h-2 rounded-full bg-[#10161D] border border-slate-500" /><span className="h-2 w-20 rounded-full bg-[#10161D] border border-slate-500" /></div>
        <div className="flex flex-wrap items-center justify-between gap-1 text-sm font-bold text-[#E8EDF3]">
          <span data-testid="ussd-caller">AGRI-ADVISORY · DEMO</span>
          <span className="inline-flex items-center gap-1" data-testid="ussd-net" data-online={isOnline ? 'yes' : 'no'}>{isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}{isOnline ? 'Internet' : 'Offline'}</span>
        </div>
        <div className="rounded-xl bg-[#CFEAA8] border-4 border-[#0A1A0E] p-3 min-h-[250px] flex flex-col justify-between shadow-inner" data-testid="ussd-screen" data-frame={screen.frameId ?? 'idle'} data-kind={screen.kind} aria-busy={working}>
          <div role="region" aria-label="Phone screen" aria-live="polite" aria-atomic="true">
            <pre className="font-mono text-[16px] leading-snug text-[#0A1A0E] whitespace-pre-wrap break-words m-0" data-testid="ussd-text">{screen.text}</pre>
          </div>
          <div className="mt-2 border-t-2 border-[#0A1A0E]/40 pt-1.5 flex items-center gap-2 font-mono text-[16px] text-[#0A1A0E]">
            <span className="flex-1 min-w-0 break-all" data-testid="ussd-input" aria-label={`You typed ${session.input || 'nothing'}`}>{active || session.input ? `> ${session.input}` : '>'}<span aria-hidden>_</span></span>
            <span aria-hidden className="text-xs" data-testid="ussd-timer">{active && screen.secondsLeft !== null ? `${screen.secondsLeft}s` : ''}</span>
            <button type="button" onClick={() => send('del')} aria-label="Delete the last digit" data-testid="key-del" className={`min-h-[44px] min-w-[44px] rounded-lg border-2 border-[#0A1A0E]/50 inline-flex items-center justify-center ${FOCUS}`}><Delete className="w-5 h-5" aria-hidden /></button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Call and end keys">
          <button type="button" onClick={() => send('send')} aria-label="Send" data-testid="key-send" className={`${fn} bg-[#16803C] text-white`}><PhoneCall className="w-5 h-5 shrink-0" aria-hidden />{working ? <Loader2 className="w-5 h-5 animate-spin" aria-label="Working" /> : 'Call / Send'}</button>
          <button type="button" onClick={() => send('end')} aria-label="End the session" data-testid="key-end" className={`${fn} bg-[#B91C1C] text-white`}><PhoneOff className="w-5 h-5" aria-hidden /> End</button>
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Phone function keys">
          <button type="button" onClick={() => send('back')} aria-label="Back one screen" data-testid="key-back" className={`${fn} bg-[#E8EDF3] text-[#10161D]`}>Back</button>
          <button type="button" onClick={() => send('home')} aria-label="Home, the main menu" data-testid="key-home" className={`${fn} bg-[#E8EDF3] text-[#10161D]`}>Home</button>
          <button type="button" onClick={() => send('cancel')} aria-label="Cancel and end the session" data-testid="key-cancel" className={`${fn} bg-[#E8EDF3] text-[#10161D]`}>Cancel</button>
        </div>
        <div className="grid grid-cols-3 gap-3 pb-1" role="group" aria-label="Number keypad">
          {DIGITS.map((d) => <button key={d} type="button" onClick={() => send(d)} aria-label={`Digit ${SPOKEN[d] ?? d}`} data-testid={`key-${d === '*' ? 'star' : d === '#' ? 'hash' : d}`} className={key}><span className="block leading-tight">{d}</span>{LETTERS[d]?.trim() && <span aria-hidden className="block text-[11px] leading-tight tracking-widest">{LETTERS[d]}</span>}</button>)}
        </div>
        <p className="text-sm text-center text-[#E8EDF3]" data-testid="ussd-session">{active ? `Session ${session.no} is open.` : session.status === 'ended' ? `Session ${session.no} ended.` : 'No session yet.'} {!active && <button type="button" onClick={() => send('send')} className={`inline-flex items-center gap-1 min-h-[44px] font-bold underline ${FOCUS}`}><RotateCcw className="w-4 h-4" aria-hidden /> Start a session</button>}</p>
      </div>
      <div className="mt-4 space-y-3 text-[#183B2B]" data-testid="ussd-info">
        <p className="text-sm font-bold" data-testid="ussd-net-note">{netText}</p>
        <p className={`text-sm rounded-xl border p-3 ${marketplace.allowed ? 'bg-[#DDEFE0] border-[#16803C]/40' : 'bg-amber-50 border-amber-300'}`} data-testid="ussd-write-status">{marketplace.allowed ? 'Interactive synthetic demo enabled. Nothing is saved or sent until you read the details and confirm. Uses this browser’s existing device keys/account; no phone number identity.' : marketplace.reason || 'Checking whether this is a protected synthetic demo server. Submissions stay disabled until confirmed.'}</p>
        <button type="button" onClick={() => void refresh()} disabled={refreshing || working} className="agri-button-secondary" data-testid="market-refresh"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />{refreshing ? 'Refreshing demo market…' : 'Refresh market & inquiries'}</button>
        {marketplace.error && <p role="alert" className="text-base font-bold text-[#7A1010]" data-testid="market-error">{marketplace.error}</p>}
        {screen.appLink && <Link to={screen.appLink.to} className="agri-button-secondary" data-testid="ussd-applink">{screen.appLink.label}</Link>}
        <p className="sr-only">{DEMO_LABEL}</p>
      </div>
    </div>
  );
};
