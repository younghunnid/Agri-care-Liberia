import React, {useState} from 'react';
import {Link} from 'react-router-dom';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {normalizeLiberianPhone} from '../../lib/phone';
import {PRIVACY_VERSION} from '../../lib/privacy';
import type {ClientUser} from '../../context/AppContext';
import {errorText} from '../SecurityBits';

/**
 * The account step of the handset registration in a real-user deployment. The browser cannot detect a caller's phone number, so it is asked for here, typed on the
 * device keyboard together with a password (never on the numeric keypad). Entering a number does NOT verify it: it is stored as "not verified". It uses the
 * ordinary website sign-in and registration endpoints, so no duplicate account or second identity is ever created.
 */
export const UssdAccountForm: React.FC<{mode: 'signin' | 'create'; county: string; onBack: () => void}> = ({mode, county, onBack}) => {
  const {setUser} = useApp();
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [password, setPassword] = useState(''); const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const field = 'mt-1 w-full min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 px-3 text-base';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    const p = normalizeLiberianPhone(phone);
    if (!p.valid) { setError(p.error || 'Enter a valid Liberian phone number, for example 077 012 3456.'); return; }
    if (mode === 'create' && !privacy) { setError('Please read and accept the privacy notice to create an account.'); return; }
    setBusy(true);
    try {
      const res = mode === 'create'
        ? await apiFetch<{user: ClientUser}>('/auth/register', {method: 'POST', body: JSON.stringify({displayName: name.trim(), phone: p.normalized, password, county, preferredLanguage: 'en', cropsOfInterest: [], privacyConsent: true, privacyVersion: PRIVACY_VERSION})})
        : await apiFetch<{user: ClientUser}>('/auth/login', {method: 'POST', body: JSON.stringify({identifier: p.normalized, password})});
      setPassword(''); setUser(res.user); // the handset continues by itself when the account changes
    } catch (err) {
      const code = (err as {body?: {error?: {code?: string}}}).body?.error?.code;
      setError(code === 'PHONE_EXISTS' ? 'That phone number already has an account. Go back and choose 1 Sign in. A phone number alone never opens an account: the password is needed.' : errorText(err));
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 rounded-2xl border-2 border-[#183B2B]/20 bg-white p-4 space-y-3 text-[#183B2B]" data-testid="ussd-account-form" aria-label={mode === 'create' ? 'Create your account' : 'Sign in'}>
      <h3 className="text-lg font-extrabold">{mode === 'create' ? 'Create your account' : 'Sign in'}</h3>
      <p className="text-sm">Your phone number is <strong>not detected</strong> by this browser, so it is asked here. Entering it does <strong>not</strong> verify it: it stays marked “not verified”. No text message is sent.</p>
      {mode === 'create' && <div><label htmlFor="uf-name" className="block text-base font-bold">Your name</label><input id="uf-name" data-testid="uf-name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} /></div>}
      <div><label htmlFor="uf-phone" className="block text-base font-bold">Phone number</label><input id="uf-phone" data-testid="uf-phone" inputMode="tel" autoComplete="username" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="077 012 3456" className={field} /></div>
      <div><label htmlFor="uf-pw" className="block text-base font-bold">{mode === 'create' ? 'Password (at least 10 characters)' : 'Password'}</label><input id="uf-pw" data-testid="uf-pw" type="password" required minLength={mode === 'create' ? 10 : 1} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={field} /></div>
      {mode === 'create' && <div className="flex items-start gap-3"><input id="uf-privacy" data-testid="uf-privacy" type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-1 w-6 h-6 accent-[#16803C] shrink-0" /><label htmlFor="uf-privacy" className="text-sm">I have read the <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#16803C] underline">privacy notice</Link> and agree that Agricare Liberia keeps the information I enter, as described there.</label></div>}
      {error && <p role="alert" className="text-base font-bold text-[#7A1010]" data-testid="uf-error">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="flex-1 min-h-[48px] rounded-2xl border-2 border-[#183B2B]/25 font-bold">Back</button>
        <button type="submit" disabled={busy} aria-busy={busy} className="flex-1 min-h-[48px] rounded-2xl bg-[#16803C] text-white font-extrabold disabled:opacity-60" data-testid="uf-submit">{busy ? 'Please wait…' : mode === 'create' ? 'Create account' : 'Sign in'}</button>
      </div>
      <p className="text-sm">Forgot your password? A phone number alone cannot reset it. <Link to="/forgot-password" className="font-semibold text-[#16803C] underline">Ask for assisted recovery</Link>.</p>
    </form>
  );
};
