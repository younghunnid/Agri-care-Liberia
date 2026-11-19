import React, {useCallback, useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {CheckCircle2, Eye, EyeOff} from 'lucide-react';
import {apiFetch, ApiRequestError} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {CodeEntry, DemoSmsBanner, NeedsConnection, errorText} from '../../components/SecurityBits';

type Step = 'identify' | 'code' | 'password' | 'done';
interface Started { message: string; expiresInSeconds: number; resendAfterSeconds: number; demo: boolean }

/**
 * Password recovery in four screens: phone, six-digit code, new password, confirmation. Same answer for existing and unknown accounts; all
 * checks happen on the server. Recovery never signs anyone in, and ends every existing session and trusted device.
 */
export const ForgotPasswordPage: React.FC = () => {
  const {isOnline, setUser} = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [started, setStarted] = useState<Started | null>(null);
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);

  // Come back to the right screen after a reload (the challenge lives in an HttpOnly cookie, not in this page).
  const restore = useCallback(async () => {
    try {
      const c = await apiFetch<{purpose: string; status: string; expiresInSeconds: number; resendAfterSeconds: number; demo: boolean}>('/auth/challenge');
      if (c.purpose !== 'password_reset') return;
      setStarted({message: '', expiresInSeconds: c.expiresInSeconds, resendAfterSeconds: c.resendAfterSeconds, demo: c.demo});
      setSent((n) => n + 1);
      setStep(c.status === 'verified' ? 'password' : 'code');
    } catch { /* nothing in progress */ }
  }, []);
  useEffect(() => { if (isOnline) void restore(); }, [isOnline, restore]);

  const guard = async (fn: () => Promise<void>) => { setBusy(true); setError(null); setNotice(null); try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };

  const start = (e: React.FormEvent) => { e.preventDefault(); void guard(async () => {
    const r = await apiFetch<Started>('/auth/forgot-password', {method: 'POST', body: JSON.stringify({identifier})});
    setStarted(r); setSent((n) => n + 1); setStep('code'); setNotice(r.message);
  }); };
  const verify = (code: string) => void guard(async () => {
    try { await apiFetch('/auth/forgot-password/verify', {method: 'POST', body: JSON.stringify({code})}); setStep('password'); }
    catch (e) {
      const left = e instanceof ApiRequestError && e.body && typeof e.body === 'object' ? (e.body as {error?: {attemptsLeft?: number}}).error?.attemptsLeft : undefined;
      throw new Error(errorText(e) + (typeof left === 'number' ? ` You have ${left} ${left === 1 ? 'try' : 'tries'} left.` : ''));
    }
  });
  const resend = () => void guard(async () => {
    const r = await apiFetch<{expiresInSeconds: number; resendAfterSeconds: number}>('/auth/resend-code', {method: 'POST', body: JSON.stringify({})});
    setStarted((s) => (s ? {...s, ...r} : s)); setSent((n) => n + 1); setNotice('If a code can be sent, a new one is on its way. Older codes no longer work.');
  });
  const reset = (e: React.FormEvent) => { e.preventDefault(); void guard(async () => {
    if (pw !== pw2) throw new Error('The two passwords do not match.');
    await apiFetch('/auth/reset-password', {method: 'POST', body: JSON.stringify({newPassword: pw})});
    setPw(''); setPw2(''); setUser(null); setStep('done');
  }); };

  const step1 = step === 'identify' ? 1 : step === 'code' ? 2 : step === 'password' ? 3 : 4;
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-10 space-y-5" data-testid="forgot-page" data-step={step}>
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-5 shadow-xs">
        <p className="text-sm font-bold text-[#0F5C2A]" aria-live="polite">Step {step1} of 4</p>
        <h1 className="font-display text-2xl font-extrabold text-[#183B2B]">
          {step === 'identify' ? 'Forgot your password?' : step === 'code' ? 'Enter the six-digit code' : step === 'password' ? 'Choose a new password' : 'Password changed'}
        </h1>
        <DemoSmsBanner demo={started?.demo} />
        <NeedsConnection online={isOnline} what="Password recovery" />

        {step === 'identify' && (
          <form onSubmit={start} className="space-y-4">
            <p className="text-base text-[#183B2B]">Enter the phone number of your account. If it has a verified phone, we send a six-digit code to it.</p>
            <div>
              <label htmlFor="forgot-ident" className="block text-base font-bold text-[#183B2B]">Phone number</label>
              <input id="forgot-ident" data-testid="forgot-ident" inputMode="tel" autoComplete="tel" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="+231770000101" className="mt-1 w-full min-h-[52px] rounded-xl border border-[#183B2B]/30 px-3.5 text-base" />
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-semibold text-red-800">{error}</p>}
            <button type="submit" disabled={busy || !isOnline || identifier.trim().length < 6} data-testid="forgot-submit" className="w-full min-h-[56px] rounded-2xl bg-[#16803C] disabled:bg-slate-300 disabled:text-slate-700 text-white text-lg font-extrabold">Send the code</button>
            <p className="text-sm text-[#183B2B]/75">Accounts without a verified phone cannot use this. Please contact the project team for account recovery.</p>
          </form>
        )}

        {step === 'code' && started && (
          <>
            <p className="text-base text-[#183B2B]" data-testid="generic-sent">{started.message || 'If an account with a verified phone number matches, a code was sent to it.'}</p>
            <CodeEntry online={isOnline} busy={busy} expiresIn={started.expiresInSeconds} resendAfter={started.resendAfterSeconds} sentToken={sent} error={error} notice={notice} submitLabel="Check the code" onSubmit={verify} onResend={resend} />
          </>
        )}

        {step === 'password' && (
          <form onSubmit={reset} className="space-y-4">
            <p className="text-base text-[#183B2B]">Your code is correct. Choose a new password: at least 10 characters, not your phone number or name.</p>
            <div>
              <label htmlFor="new-pw" className="block text-base font-bold text-[#183B2B]">New password</label>
              <div className="mt-1 flex gap-2">
                <input id="new-pw" data-testid="new-pw" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={10} required value={pw} onChange={(e) => setPw(e.target.value)} className="w-full min-h-[52px] rounded-xl border border-[#183B2B]/30 px-3.5 text-base" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide passwords' : 'Show passwords'} aria-pressed={show} className="min-w-[52px] min-h-[52px] rounded-xl border border-[#183B2B]/30 flex items-center justify-center">{show ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}</button>
              </div>
              <p className="mt-1 text-sm text-[#183B2B]/75" aria-live="polite">{pw.length >= 10 ? 'Length is fine.' : `${Math.max(0, 10 - pw.length)} more characters needed.`}</p>
            </div>
            <div>
              <label htmlFor="new-pw2" className="block text-base font-bold text-[#183B2B]">Type it again</label>
              <input id="new-pw2" data-testid="new-pw2" type={show ? 'text' : 'password'} autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} className="mt-1 w-full min-h-[52px] rounded-xl border border-[#183B2B]/30 px-3.5 text-base" />
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-semibold text-red-800">{error}</p>}
            <button type="submit" disabled={busy || !isOnline || pw.length < 10} data-testid="reset-submit" className="w-full min-h-[56px] rounded-2xl bg-[#16803C] disabled:bg-slate-300 disabled:text-slate-700 text-white text-lg font-extrabold">Change password</button>
          </form>
        )}

        {step === 'done' && (
          <div className="space-y-4" data-testid="reset-done">
            <p className="flex items-start gap-2 text-base text-[#0F5C2A] font-bold"><CheckCircle2 className="w-6 h-6 shrink-0" aria-hidden /> Your password was changed.</p>
            <p className="text-base text-[#183B2B]">For your safety you were signed out everywhere, and every phone or browser you used before must verify again. Please sign in with your new password.</p>
            <button type="button" onClick={() => navigate('/login')} className="w-full min-h-[56px] rounded-2xl bg-[#16803C] text-white text-lg font-extrabold">Go to sign in</button>
          </div>
        )}
        {step !== 'done' && <Link to="/login" className="inline-flex items-center min-h-[44px] text-sm font-semibold underline text-[#183B2B]">Back to sign in</Link>}
      </div>
    </div>
  );
};
