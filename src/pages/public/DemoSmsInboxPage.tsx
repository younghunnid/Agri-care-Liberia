import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Inbox, RefreshCw, Trash2} from 'lucide-react';
import {DemoSmsBanner} from '../../components/SecurityBits';

interface Msg { id: string; to: string; message: string; purpose: string; createdAt: string }

/**
 * Presenter's simulated phone inbox (development and test servers only). Protected by a separate operator token that is typed here, kept only in
 * this page's memory (never stored, never in the URL) and sent in a header. On a production server the route does not exist.
 */
export const DemoSmsInboxPage: React.FC = () => {
  const tokenRef = useRef('');
  const [token, setToken] = useState('');
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);

  const load = useCallback(async () => {
    if (!tokenRef.current) return;
    try {
      const r = await fetch('/api/v1/dev/simulated-sms', {headers: {'X-Demo-Operator-Token': tokenRef.current}, cache: 'no-store', credentials: 'omit'});
      const ct = r.headers.get('content-type') ?? '';
      if (r.status === 401) { setMsgs(null); setStatus('That operator token is not accepted.'); return; }
      if (r.status === 429) { setStatus('Too many requests. Wait a moment.'); return; }
      if (!r.ok || !ct.includes('json')) { setMsgs(null); setStatus('The simulated inbox is not enabled on this server (it exists only in development and test).'); return; }
      const j = (await r.json()) as {messages: Msg[]};
      setMsgs(j.messages); setStatus(null);
    } catch { setStatus('Could not reach the server. The inbox needs a connection.'); }
  }, []);
  useEffect(() => { if (!auto) return; const t = setInterval(() => void load(), 4000); return () => clearInterval(t); }, [auto, load]);

  const clear = async () => {
    await fetch('/api/v1/dev/simulated-sms', {method: 'DELETE', headers: {'X-Demo-Operator-Token': tokenRef.current}, cache: 'no-store', credentials: 'omit'}).catch(() => undefined);
    void load();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-5" data-testid="sms-inbox-page">
      <h1 className="font-display text-2xl font-extrabold text-[#183B2B] flex items-center gap-2"><Inbox className="w-6 h-6" aria-hidden /> Simulated phone inbox</h1>
      <DemoSmsBanner />
      <p className="text-sm text-[#183B2B]/80">For the presenter only. Enter the operator token set on the server (<code>DEMO_OPERATOR_TOKEN</code>). Messages exist only in the server's memory for 10 minutes and only for synthetic test numbers.</p>
      <form onSubmit={(e) => { e.preventDefault(); tokenRef.current = token; setToken(''); void load(); }} className="flex gap-2">
        <label htmlFor="op-token" className="sr-only">Operator token</label>
        <input id="op-token" data-testid="op-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Operator token" className="w-full min-h-[52px] rounded-xl border border-[#183B2B]/30 px-3.5 text-base" />
        <button type="submit" disabled={token.length < 8} data-testid="op-load" className="min-h-[52px] px-5 rounded-xl bg-[#16803C] disabled:bg-slate-300 disabled:text-slate-700 text-white font-bold">Open</button>
      </form>
      {status && <p role="alert" data-testid="inbox-status" className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-sm font-semibold text-amber-950">{status}</p>}
      {msgs && (
        <div className="space-y-3" data-testid="inbox-list">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void load()} className="min-h-[48px] px-4 rounded-xl border-2 border-[#16803C] text-[#0F5C2A] font-bold inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" aria-hidden /> Refresh</button>
            <label className="min-h-[48px] inline-flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="w-5 h-5 accent-[#16803C]" /> Refresh every 4 seconds</label>
            <button type="button" onClick={() => void clear()} className="min-h-[48px] px-4 rounded-xl border border-red-200 text-red-700 font-bold inline-flex items-center gap-2"><Trash2 className="w-4 h-4" aria-hidden /> Clear</button>
          </div>
          {msgs.length === 0 && <p className="text-sm text-[#183B2B]/75">No messages yet.</p>}
          <ul className="space-y-2">
            {msgs.map((m) => (
              <li key={m.id} className="rounded-2xl bg-white border border-[#183B2B]/15 p-3 space-y-1" data-testid="inbox-message">
                <p className="text-xs text-[#183B2B]/70">To {m.to} · {m.purpose} · {new Date(m.createdAt).toLocaleTimeString()}</p>
                <p className="text-base text-[#183B2B]">{m.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
