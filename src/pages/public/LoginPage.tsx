import {BrandLogo} from '../../components/BrandLogo';
import React, {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {LogIn} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {type ClientUser, useApp} from '../../context/AppContext';
import {DemoSmsBanner, NeedsConnection, errorText, goHomeFor} from '../../components/SecurityBits';

interface LoginReply {
  user?: ClientUser;
  status?: 'VERIFICATION_REQUIRED';
  demo?: boolean;
}

/**
 * Sign in. The server decides: a trusted device gets a session at once; any other device gets "verification required" and NO session until
 * the six-digit code is verified on the server (/verify). Nothing here can grant access by itself.
 */
export const LoginPage: React.FC = () => {
  const {setUser, isOnline} = useApp();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<boolean | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginReply>('/auth/login', {method: 'POST', body: JSON.stringify({identifier, password})});
      setPassword('');
      if (res.status === 'VERIFICATION_REQUIRED') {
        setDemo(res.demo ?? null);
        navigate('/verify');
        return;
      }
      if (!res.user) throw new Error('Unexpected answer from the server.');
      setUser(res.user);
      navigate(goHomeFor(res.user.roles));
    } catch (err) {
      setError(errorText(err, 'Unable to sign in.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="space-y-1.5">
          <BrandLogo className="mx-auto mb-2 h-20" />
          <p className="text-xs font-semibold text-[#0F5C2A]">Account Access</p>
          <h1 className="font-display text-2xl font-extrabold text-[#183B2B]">Sign In</h1>
          <p className="text-sm text-[#183B2B]/75">Access your saved farming advice, question history, and expert consultations.</p>
        </div>

        <DemoSmsBanner demo={demo} />
        <NeedsConnection online={isOnline} what="Signing in" />
        {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</div>}

        <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
          <div>
            <label htmlFor="login-ident" className="block text-sm font-semibold mb-1.5">Phone Number or Email</label>
            <input id="login-ident" type="text" required autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="+231770000101" className="w-full min-h-[48px] rounded-xl border border-[#183B2B]/20 px-3.5 text-base" />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-semibold mb-1.5">Password</label>
            <input id="login-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full min-h-[48px] rounded-xl border border-[#183B2B]/20 px-3.5 text-base" />
          </div>
          <button type="submit" disabled={loading || !isOnline} className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[#16803C] disabled:bg-slate-300 disabled:text-slate-700 text-white font-bold text-base">
            <LogIn className="w-5 h-5" aria-hidden="true" />
            <span>{loading ? 'Signing in...' : 'Sign In'}</span>
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link to="/forgot-password" className="font-semibold text-[#0F5C2A] underline inline-flex items-center min-h-[44px]">Forgot password?</Link>
            <Link to="/register" className="font-semibold text-[#183B2B] underline inline-flex items-center min-h-[44px]">Create an account</Link>
          </div>
        </form>
        <p className="text-xs text-[#183B2B]/70">On a new phone or browser we send a six-digit code to the phone number on your account before you are signed in.</p>
      </div>
    </div>
  );
};
