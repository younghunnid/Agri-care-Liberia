import React, {useCallback, useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {apiFetch, ApiRequestError} from '../../lib/api';
import {type ClientUser, useApp} from '../../context/AppContext';
import {CodeEntry, DemoSmsBanner, NeedsConnection, errorText, goHomeFor} from '../../components/SecurityBits';

interface ChallengeInfo {
  purpose: string; maskedPhone: string | null; expiresInSeconds: number; resendAfterSeconds: number; attemptsLeft: number; canResend: boolean; demo: boolean; demoInbox?: boolean;
}

/** Step 2 of a new-device (or first) sign-in. The server checks the code; the session exists only after it succeeds. */
export const VerifyCodePage: React.FC = () => {
  const {setUser, isOnline} = useApp();
  const navigate = useNavigate();
  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sent, setSent] = useState(0);

  const load = useCallback(async () => {
    try { setInfo(await apiFetch<ChallengeInfo>('/auth/challenge')); setMissing(false); setSent((n) => n + 1); }
    catch (e) { if (e instanceof ApiRequestError && e.status === 404) setMissing(true); else setError(errorText(e)); }
  }, []);
  useEffect(() => { if (isOnline) void load(); }, [isOnline, load]);

  const submit = async (code: string) => {
    setBusy(true); setError(null);
    try {
      const res = await apiFetch<{user: ClientUser}>('/auth/verify-device', {method: 'POST', body: JSON.stringify({code})});
      setUser(res.user);
      navigate(goHomeFor(res.user.roles));
    } catch (e) {
      const left = e instanceof ApiRequestError && e.body && typeof e.body === 'object' ? ((e.body as {error?: {attemptsLeft?: number}}).error?.attemptsLeft) : undefined;
      setError(errorText(e) + (typeof left === 'number' ? ` You have ${left} ${left === 1 ? 'try' : 'tries'} left.` : ''));
    } finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await apiFetch<{expiresInSeconds: number; resendAfterSeconds: number}>('/auth/resend-code', {method: 'POST', body: JSON.stringify({})});
      setInfo((i) => (i ? {...i, expiresInSeconds: r.expiresInSeconds, resendAfterSeconds: r.resendAfterSeconds} : i));
      setSent((n) => n + 1); setNotice('A new code was sent. The old code no longer works.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-10 space-y-5" data-testid="verify-page">
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-5 shadow-xs">
        <h1 className="font-display text-2xl font-extrabold text-[#183B2B]">Enter your code</h1>
        <DemoSmsBanner demo={info?.demo} />
        <NeedsConnection online={isOnline} what="Checking your code" />
        {missing && (
          <div className="space-y-3" data-testid="no-challenge">
            <p className="text-base text-[#183B2B]">There is no sign-in waiting for a code (it may have expired). Please sign in again.</p>
            <Link to="/login" className="inline-flex items-center min-h-[48px] rounded-xl bg-[#16803C] text-white font-bold px-5">Back to sign in</Link>
          </div>
        )}
        {info && !missing && (
          <>
            <p className="text-base text-[#183B2B]" data-testid="sent-to">
              {info.purpose === 'phone_confirm' ? 'We need to confirm your phone number. ' : 'This is a new phone or browser for your account. '}
              We sent a six-digit code to <strong>{info.maskedPhone}</strong>.
            </p>
            <CodeEntry online={isOnline} busy={busy} expiresIn={info.expiresInSeconds} resendAfter={info.resendAfterSeconds} sentToken={sent} error={error} notice={notice} demoInbox={info.demoInbox} submitLabel="Verify and sign in" onSubmit={(c) => void submit(c)} onResend={() => void resend()} />
            <Link to="/login" className="inline-flex items-center min-h-[44px] text-sm font-semibold underline text-[#183B2B]">Use a different account</Link>
          </>
        )}
        {!info && !missing && isOnline && !error && <p role="status" className="text-sm text-[#183B2B]/75">Loading…</p>}
        {!info && error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</p>}
      </div>
    </div>
  );
};
