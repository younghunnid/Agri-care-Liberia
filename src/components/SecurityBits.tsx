import React, {useEffect, useState} from 'react';
import {Loader2, ShieldAlert, WifiOff} from 'lucide-react';
import {ApiRequestError} from '../lib/api';

/** Exact wording required on every verification screen. */
export const DEMO_NOTICE = 'Demo mode — verification messages are simulated. No SMS will be sent.';

export const DemoSmsBanner: React.FC<{demo?: boolean | null}> = ({demo}) => {
  if (demo === false) return null;
  return (
    <div role="note" data-testid="demo-sms-banner" className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-3 text-sm font-semibold text-sky-950 flex gap-2">
      <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden />
      <p>{DEMO_NOTICE}</p>
    </div>
  );
};

/** Shown when a security step needs the server. Nothing is stored for later: reconnect and start again. */
export const NeedsConnection: React.FC<{online: boolean; what?: string}> = ({online, what = 'This security step'}) => {
  if (online) return null;
  return (
    <div role="alert" data-testid="needs-connection" className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 flex gap-3">
      <WifiOff className="w-6 h-6 shrink-0" aria-hidden />
      <div className="space-y-1 text-sm">
        <p className="font-bold">You are offline.</p>
        <p>{what} needs an internet connection. Please connect, then try again. Your saved lessons, advice and calculator still work.</p>
      </div>
    </div>
  );
};

export function errorText(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** Seconds remaining that count down once per second from `start`. Restarts when `start` or `token` changes. */
export function useCountdown(start: number, token: unknown): number {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    setLeft(start);
    const t = setInterval(() => setLeft((x) => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [start, token]);
  return left;
}

export const fmtSeconds = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

interface CodeEntryProps {
  online: boolean;
  busy: boolean;
  expiresIn: number;
  resendAfter: number;
  /** Changes whenever a new code was sent, to restart the timers. */
  sentToken: unknown;
  error: string | null;
  notice?: string | null;
  submitLabel?: string;
  onSubmit: (code: string) => void;
  onResend?: () => void;
}

/** Six-digit code field for low-cost phones: numeric keypad, one-time-code autofill, large buttons, timers, resend. The code is kept only in component state. */
export const CodeEntry: React.FC<CodeEntryProps> = ({online, busy, expiresIn, resendAfter, sentToken, error, notice, submitLabel = 'Verify', onSubmit, onResend}) => {
  const [code, setCode] = useState('');
  const left = useCountdown(expiresIn, sentToken);
  const wait = useCountdown(resendAfter, sentToken);
  useEffect(() => { setCode(''); }, [sentToken]);
  const ready = /^\d{6}$/.test(code) && online && !busy;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit(code); }} className="space-y-4" noValidate>
      <div>
        <label htmlFor="otp-code" className="block text-base font-bold text-[#183B2B]">Six-digit code</label>
        <input id="otp-code" data-testid="otp-input" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-describedby="otp-help otp-error"
          className="mt-1 w-full min-h-[64px] rounded-2xl border-2 border-[#183B2B]/30 bg-white px-4 text-center text-3xl font-extrabold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[#16803C]" />
        <p id="otp-help" className="mt-1 text-sm text-[#183B2B]/75" aria-live="polite">
          {left > 0 ? <>The code works for <strong data-testid="otp-expires">{fmtSeconds(left)}</strong> more minutes.</> : 'This code has expired. Ask for a new one.'}
        </p>
      </div>
      <p id="otp-error" role="alert" data-testid="otp-error" className={error ? 'rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-semibold text-red-800' : 'sr-only'}>{error ?? ''}</p>
      {notice && <p role="status" className="rounded-xl bg-[#DDEFE0] p-3 text-sm font-semibold text-[#0F5C2A]">{notice}</p>}
      <button type="submit" disabled={!ready} data-testid="otp-submit"
        className="w-full min-h-[56px] rounded-2xl bg-[#16803C] disabled:bg-slate-300 disabled:text-slate-700 text-white text-lg font-extrabold inline-flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]">
        {busy && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}{submitLabel}
      </button>
      {onResend && (
        <button type="button" onClick={onResend} disabled={wait > 0 || !online || busy} data-testid="otp-resend"
          className="w-full min-h-[52px] rounded-2xl border-2 border-[#16803C] bg-white text-[#0F5C2A] disabled:border-slate-300 disabled:text-slate-600 text-base font-bold focus:outline-none focus:ring-2 focus:ring-[#16803C]">
          {wait > 0 ? `Send a new code in ${wait} seconds` : 'Send a new code'}
        </button>
      )}
    </form>
  );
};

export const goHomeFor = (roles: string[]): string => (roles.includes('admin') ? '/admin' : roles.includes('expert') ? '/expert' : '/farmer');
