import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Check, Copy, MessageSquareText, RefreshCw} from 'lucide-react';
import {apiFetch} from '../lib/api';

interface Msg { id: string; to: string; message: string; purpose: string; createdAt: string }

export const NO_REAL_SMS = 'Demo mode — no real SMS was sent.';
const codeOf = (m: Msg): string | null => /code is (\d{6})/.exec(m.message)?.[1] ?? null;

/**
 * "Demo SMS Inbox": a phone-style card inside the website that shows the SIMULATED message caused by this browser's own pending verification, the way
 * a real phone would. Nothing is sent anywhere. The server returns the message only to the browser that holds the HttpOnly challenge cookie, and only
 * on a development server or an explicitly protected demo server. The message is kept in component state only: never in localStorage, sessionStorage,
 * IndexedDB, the URL or the console. Copy and "Use this code" are explicit user actions.
 */
export const DemoSmsInbox: React.FC<{enabled: boolean; online: boolean; refreshKey?: unknown; onUseCode?: (code: string) => void}> = ({enabled, online, refreshKey, onUseCode}) => {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const stop = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || !online) return;
    try {
      const r = await apiFetch<{messages: Msg[]}>('/auth/demo-inbox');
      setMsgs(r.messages); setProblem(null);
    } catch { setProblem('The demo inbox could not be opened. Start again from the sign-in screen.'); }
  }, [enabled, online]);

  useEffect(() => {
    stop.current = false;
    void load();
    if (!enabled) return;
    const t = setInterval(() => { if (!stop.current && !document.hidden) void load(); }, 3000);
    return () => { stop.current = true; clearInterval(t); };
  }, [enabled, load, refreshKey]);

  if (!enabled) return null;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea'); ta.value = code; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* the code is on screen; the farmer can type it */ } ta.remove();
    }
    setCopied(code); setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
  };

  return (
    <section aria-labelledby="demo-inbox-h" data-testid="demo-inbox" className="rounded-3xl bg-[#183B2B] p-3 space-y-2 border-4 border-[#0e241a]">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 id="demo-inbox-h" className="font-display text-lg font-extrabold text-white flex items-center gap-2"><MessageSquareText className="w-5 h-5" aria-hidden /> Demo SMS Inbox</h2>
        <span className="rounded-full bg-[#F5B942] text-[#183B2B] text-xs font-extrabold px-2.5 py-0.5">DEMO</span>
      </div>
      <p data-testid="no-real-sms" className="px-1 text-sm font-bold text-[#F5B942]">{NO_REAL_SMS}</p>
      <div className="rounded-2xl bg-[#DDEFE0] p-3 space-y-3 min-h-[110px]" aria-live="polite">
        {problem && <p role="alert" className="text-sm font-semibold text-red-800">{problem}</p>}
        {!problem && msgs && msgs.length === 0 && <p data-testid="inbox-empty" className="text-sm text-[#183B2B]">No message yet. A real phone would show it here within a few seconds. This inbox refreshes by itself.</p>}
        {!problem && msgs === null && <p className="text-sm text-[#183B2B]">Opening the demo inbox…</p>}
        {(msgs ?? []).map((m) => {
          const code = codeOf(m);
          return (
            <div key={m.id} data-testid="demo-message" className="rounded-2xl rounded-tl-sm bg-white border border-[#183B2B]/15 p-3 space-y-2">
              <p className="text-xs font-semibold text-[#183B2B]/75">From Agricare · to {m.to} · {new Date(m.createdAt).toLocaleTimeString()}</p>
              <p className="text-base text-[#183B2B]">{m.message}</p>
              {code && (
                <>
                  <p className="text-center text-3xl font-extrabold tracking-[0.4em] text-[#0F5C2A]" data-testid="demo-code" aria-label={`Code ${code.split('').join(' ')}`}>{code}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void copy(code)} data-testid="copy-code" className="min-h-[48px] rounded-xl border-2 border-[#16803C] bg-white text-[#0F5C2A] text-sm font-bold inline-flex items-center justify-center gap-1.5">
                      {copied === code ? <><Check className="w-4 h-4" aria-hidden /> Copied</> : <><Copy className="w-4 h-4" aria-hidden /> Copy code</>}
                    </button>
                    {onUseCode && <button type="button" onClick={() => onUseCode(code)} data-testid="use-code" className="min-h-[48px] rounded-xl bg-[#16803C] text-white text-sm font-bold">Use this code</button>}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => void load()} className="min-h-[44px] rounded-xl text-sm font-bold text-[#183B2B] underline inline-flex items-center gap-1"><RefreshCw className="w-4 h-4" aria-hidden /> Check for new messages</button>
      </div>
    </section>
  );
};
