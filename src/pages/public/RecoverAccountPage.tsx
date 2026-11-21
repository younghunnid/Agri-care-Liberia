import React, {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {CheckCircle2, Eye, EyeOff} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {errorText} from '../../components/SecurityBits';

/** The person uses the one-time recovery code an administrator gave them (after checking who they are another way) and chooses a NEW password. Never signs anyone in. */
export const RecoverAccountPage: React.FC = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (pw !== pw2) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try { await apiFetch('/auth/recovery/redeem', {method: 'POST', body: JSON.stringify({identifier: phone, code, newPassword: pw})}); setPw(''); setPw2(''); setCode(''); setDone(true); }
    catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const field = 'mt-1 w-full min-h-[52px] rounded-xl border-2 border-[#183B2B]/25 px-3 text-base';
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-10" data-testid="recover-page">
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-4 shadow-xs">
        <h1 className="font-display text-2xl font-extrabold text-[#183B2B]">{done ? 'Password changed' : 'Use a recovery code'}</h1>
        {done ? (
          <div className="space-y-4" role="status">
            <p className="flex items-start gap-2 text-base text-[#183B2B]"><CheckCircle2 className="w-5 h-5 text-[#16803C] shrink-0 mt-0.5" aria-hidden /> Your password was changed. Every other device was signed out. Sign in with your new password.</p>
            <button type="button" onClick={() => navigate('/login')} className="w-full min-h-[52px] rounded-2xl bg-[#16803C] text-white text-lg font-extrabold">Go to sign in</button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <p className="text-base text-[#183B2B]">You can only use this after the Agricare Liberia team has checked who you are and given you a one-time code. The code works once and expires after 30 minutes.</p>
            <div><label htmlFor="rec-phone" className="block text-base font-bold text-[#183B2B]">Your phone number</label>
              <input id="rec-phone" data-testid="rec-phone" inputMode="tel" autoComplete="username" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="077 012 3456" className={field} /></div>
            <div><label htmlFor="rec-code" className="block text-base font-bold text-[#183B2B]">Recovery code from the team</label>
              <input id="rec-code" data-testid="rec-code" autoComplete="off" autoCapitalize="characters" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH-JKMN" className={`${field} font-mono tracking-wider`} /></div>
            <div><label htmlFor="rec-pw" className="block text-base font-bold text-[#183B2B]">New password (at least 10 characters)</label>
              <div className="flex gap-2"><input id="rec-pw" data-testid="rec-pw" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={10} value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="mt-1 min-h-[52px] min-w-[52px] rounded-xl border-2 border-[#183B2B]/25 inline-flex items-center justify-center">{show ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}</button></div></div>
            <div><label htmlFor="rec-pw2" className="block text-base font-bold text-[#183B2B]">Repeat the new password</label>
              <input id="rec-pw2" data-testid="rec-pw2" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={10} value={pw2} onChange={(e) => setPw2(e.target.value)} className={field} /></div>
            {error && <p role="alert" className="text-base font-bold text-[#7A1010]" data-testid="rec-error">{error}</p>}
            <button type="submit" disabled={busy} aria-busy={busy} className="w-full min-h-[52px] rounded-2xl bg-[#16803C] text-white text-lg font-extrabold disabled:opacity-60">{busy ? 'Checking…' : 'Set my new password'}</button>
            <p className="text-sm text-[#183B2B]/80">No code? Contact the team through the <Link to="/contact" className="font-semibold text-[#16803C] underline">Contact page</Link>. They will check who you are first.</p>
          </form>
        )}
      </div>
    </div>
  );
};
