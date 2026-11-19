import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {CheckCircle2, KeyRound, ShieldCheck, Smartphone, TriangleAlert} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {CodeEntry, DemoSmsBanner, NeedsConnection, errorText} from '../../components/SecurityBits';

interface Security {
  phone: {masked: string; onFile: boolean; verified: boolean; verifiedAt: string | null; claimExpiresAt: string | null};
  devices: {count: number; currentTrusted: boolean};
  passwordPolicy: {minLength: number};
  recovery: {viaVerifiedPhone: boolean; operatorRecovery: boolean};
  demoMode: boolean;
}
interface Started { expiresInSeconds: number; resendAfterSeconds: number; maskedPhone?: string; step?: string; demo?: boolean }

const input = 'mt-1 w-full min-h-[52px] rounded-xl border border-[#183B2B]/30 bg-white px-3.5 text-base';
const btn = 'min-h-[52px] rounded-2xl px-5 text-base font-extrabold disabled:bg-slate-300 disabled:text-slate-700';

/** Account Security: phone status, confirmation, change of password and (with reauthentication and two codes) phone number, link to trusted devices. */
export const AccountSecurityPage: React.FC = () => {
  const {isOnline} = useApp();
  const [sec, setSec] = useState<Security | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const reload = useCallback(async () => { try { setSec(await apiFetch<Security>('/account/security')); setLoadError(null); } catch (e) { setLoadError(errorText(e)); } }, []);
  useEffect(() => { if (isOnline) void reload(); }, [isOnline, reload]);

  // ---- phone confirmation
  const [conf, setConf] = useState<Started | null>(null);
  const [confSent, setConfSent] = useState(0);
  const [confMsg, setConfMsg] = useState<{kind: 'ok' | 'err'; text: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, onErr: (m: string) => void) => { setBusy(true); try { await fn(); } catch (e) { onErr(errorText(e)); } finally { setBusy(false); } };
  const startConfirm = () => void run(async () => { const r = await apiFetch<Started>('/account/phone/confirm/start', {method: 'POST', body: '{}'}); setConf(r); setConfSent((n) => n + 1); setConfMsg(null); }, (t) => setConfMsg({kind: 'err', text: t}));
  const verifyConfirm = (code: string) => void run(async () => { await apiFetch('/account/phone/confirm/verify', {method: 'POST', body: JSON.stringify({code})}); setConf(null); setConfMsg({kind: 'ok', text: 'Your phone number is now verified.'}); await reload(); }, (t) => setConfMsg({kind: 'err', text: t}));

  // ---- password
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{kind: 'ok' | 'err'; text: string} | null>(null);
  const changePw = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    if (pw !== pw2) throw new Error('The two new passwords do not match.');
    await apiFetch('/account/password', {method: 'POST', body: JSON.stringify({currentPassword: cur, newPassword: pw})});
    setCur(''); setPw(''); setPw2(''); setPwMsg({kind: 'ok', text: 'Password changed. Your other phones and browsers were signed out.'});
  }, (t) => setPwMsg({kind: 'err', text: t})); };

  // ---- phone change (password + code to the current number + code to the new number)
  const [stage, setStage] = useState<'idle' | 'current' | 'new'>('idle');
  const [chPw, setChPw] = useState(''); const [newPhone, setNewPhone] = useState('');
  const [ch, setCh] = useState<Started | null>(null); const [chSent, setChSent] = useState(0);
  const [chMsg, setChMsg] = useState<{kind: 'ok' | 'err'; text: string} | null>(null);
  const startChange = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    const r = await apiFetch<Started>('/account/phone/change/start', {method: 'POST', body: JSON.stringify({currentPassword: chPw, newPhone})});
    setChPw(''); setCh(r); setChSent((n) => n + 1); setStage(r.step === 'verify-current' ? 'current' : 'new'); setChMsg(null);
  }, (t) => setChMsg({kind: 'err', text: t})); };
  const verifyChange = (code: string) => void run(async () => {
    if (stage === 'current') {
      const r = await apiFetch<Started>('/account/phone/change/verify-current', {method: 'POST', body: JSON.stringify({code})});
      setCh(r); setChSent((n) => n + 1); setStage('new'); setChMsg(null);
    } else {
      await apiFetch('/account/phone/change/verify-new', {method: 'POST', body: JSON.stringify({code})});
      setStage('idle'); setCh(null); setNewPhone(''); setChMsg({kind: 'ok', text: 'Your phone number was changed and verified. Your other devices must verify again.'}); await reload();
    }
  }, (t) => setChMsg({kind: 'err', text: t}));
  const resendChange = () => void run(async () => { const r = await apiFetch<Started>('/auth/resend-code', {method: 'POST', body: '{}'}); setCh((c) => (c ? {...c, ...r} : c)); setChSent((n) => n + 1); }, (t) => setChMsg({kind: 'err', text: t}));

  const msg = (m: {kind: 'ok' | 'err'; text: string} | null, id: string) => m && <p role={m.kind === 'err' ? 'alert' : 'status'} data-testid={id} className={`rounded-xl p-3 text-sm font-semibold ${m.kind === 'ok' ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-red-50 border border-red-200 text-red-800'}`}>{m.text}</p>;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6" data-testid="security-page">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B] flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-[#16803C]" aria-hidden /> Account security</h1>
        <p className="text-base text-[#183B2B]/80">Protect your account and your saved farming work.</p>
      </header>
      <DemoSmsBanner demo={sec?.demoMode} />
      <NeedsConnection online={isOnline} what="Changing security settings" />
      {loadError && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-semibold text-red-800">{loadError}</p>}

      {sec && (
        <>
          <section aria-labelledby="phone-h" className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-3">
            <h2 id="phone-h" className="text-xl font-extrabold text-[#183B2B] flex items-center gap-2"><Smartphone className="w-5 h-5" aria-hidden /> Your phone number</h2>
            <p className="text-lg font-bold text-[#183B2B]" data-testid="masked-phone">{sec.phone.masked}</p>
            {sec.phone.verified
              ? <p className="inline-flex items-center gap-1 text-sm font-bold text-[#0F5C2A]" data-testid="phone-status"><CheckCircle2 className="w-4 h-4" aria-hidden /> Verified: this number can receive codes and recover your account</p>
              : <p className="inline-flex items-start gap-1 text-sm font-bold text-amber-900" data-testid="phone-status"><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden /> Not verified yet. Until you verify it you cannot recover your account by SMS{sec.phone.claimExpiresAt ? '.' : '.'} Unverified numbers can be claimed by their real owner.</p>}
            {!sec.phone.verified && sec.phone.onFile && !conf && <button type="button" onClick={startConfirm} disabled={busy || !isOnline} data-testid="confirm-start" className={`${btn} bg-[#16803C] text-white w-full`}>Send me a code to verify</button>}
            {conf && <CodeEntry online={isOnline} busy={busy} expiresIn={conf.expiresInSeconds} resendAfter={conf.resendAfterSeconds} sentToken={confSent} error={confMsg?.kind === 'err' ? confMsg.text : null} submitLabel="Verify my number" onSubmit={verifyConfirm} onResend={startConfirm} />}
            {msg(confMsg?.kind === 'ok' ? confMsg : null, 'confirm-msg')}
          </section>

          <section aria-labelledby="dev-h" className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-2">
            <h2 id="dev-h" className="text-xl font-extrabold text-[#183B2B]">Trusted phones and browsers</h2>
            <p className="text-base text-[#183B2B]/85">{sec.devices.count} trusted {sec.devices.count === 1 ? 'device' : 'devices'}. A new phone or browser always needs a code.</p>
            <Link to="/account/devices" data-testid="devices-link" className="inline-flex items-center min-h-[52px] rounded-2xl border-2 border-[#16803C] px-5 text-base font-bold text-[#0F5C2A]">Review and remove devices</Link>
          </section>

          <section aria-labelledby="pw-h" className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-3">
            <h2 id="pw-h" className="text-xl font-extrabold text-[#183B2B] flex items-center gap-2"><KeyRound className="w-5 h-5" aria-hidden /> Change password</h2>
            <form onSubmit={changePw} className="space-y-3">
              <div><label htmlFor="cur-pw" className="block text-base font-bold">Current password</label><input id="cur-pw" data-testid="cur-pw" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} className={input} /></div>
              <div><label htmlFor="pw-new" className="block text-base font-bold">New password (at least {sec.passwordPolicy.minLength} characters)</label><input id="pw-new" data-testid="pw-new" type="password" autoComplete="new-password" minLength={sec.passwordPolicy.minLength} required value={pw} onChange={(e) => setPw(e.target.value)} className={input} /></div>
              <div><label htmlFor="pw-new2" className="block text-base font-bold">Type the new password again</label><input id="pw-new2" data-testid="pw-new2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} /></div>
              {msg(pwMsg, 'pw-msg')}
              <button type="submit" disabled={busy || !isOnline || pw.length < sec.passwordPolicy.minLength} data-testid="pw-submit" className={`${btn} bg-[#16803C] text-white w-full`}>Change password</button>
            </form>
          </section>

          <section aria-labelledby="chg-h" className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-3">
            <h2 id="chg-h" className="text-xl font-extrabold text-[#183B2B]">Change phone number</h2>
            <p className="text-sm text-[#183B2B]/80">For safety this needs your password, a code sent to your current number, and a code sent to the new number. Nothing changes until both are correct.</p>
            {stage === 'idle' && (
              <form onSubmit={startChange} className="space-y-3">
                <div><label htmlFor="ch-pw" className="block text-base font-bold">Your password</label><input id="ch-pw" data-testid="ch-pw" type="password" autoComplete="current-password" required value={chPw} onChange={(e) => setChPw(e.target.value)} className={input} /></div>
                <div><label htmlFor="ch-phone" className="block text-base font-bold">New phone number</label><input id="ch-phone" data-testid="ch-phone" inputMode="tel" autoComplete="off" required value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+231770000123" className={input} /></div>
                <button type="submit" disabled={busy || !isOnline} data-testid="ch-start" className={`${btn} bg-[#183B2B] text-white w-full`}>Start the change</button>
              </form>
            )}
            {stage !== 'idle' && ch && (
              <>
                <p className="text-base font-bold text-[#183B2B]" data-testid="ch-step">{stage === 'current' ? `Step 1 of 2: enter the code sent to your current number ${ch.maskedPhone ?? ''}` : `Step 2 of 2: enter the code sent to the NEW number ${ch.maskedPhone ?? ''}`}</p>
                <CodeEntry online={isOnline} busy={busy} expiresIn={ch.expiresInSeconds} resendAfter={ch.resendAfterSeconds} sentToken={chSent} error={chMsg?.kind === 'err' ? chMsg.text : null} submitLabel={stage === 'current' ? 'Continue' : 'Change my number'} onSubmit={verifyChange} onResend={resendChange} />
                <button type="button" onClick={() => { setStage('idle'); setCh(null); }} className="min-h-[48px] text-sm font-semibold underline text-[#183B2B]">Cancel</button>
              </>
            )}
            {msg(chMsg?.kind === 'ok' ? chMsg : null, 'ch-msg')}
            {stage === 'idle' && chMsg?.kind === 'err' && msg(chMsg, 'ch-err')}
          </section>

          <section aria-labelledby="rec-h" className="rounded-2xl bg-[#F3F8F0] border border-[#16803C]/25 p-4 space-y-2">
            <h2 id="rec-h" className="text-xl font-extrabold text-[#183B2B]">Recovery options</h2>
            <ul className="list-disc pl-5 text-base text-[#183B2B]/90 space-y-1">
              <li>{sec.recovery.viaVerifiedPhone ? 'Forgot your password? A code is sent to your verified phone.' : 'Verify your phone number above to be able to recover your password by SMS.'}</li>
              <li>Lost your SIM or number? Contact the project team or your extension office. They can move your account to a new number after checking who you are. All your phones are signed out when they do.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
};
