import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {CheckCircle2, TriangleAlert} from 'lucide-react';
import {apiFetch} from '../lib/api';

/** Shows whether the signed-in person's phone number is verified. In this build numbers are never verified (no SMS), and the note says so plainly. */
export const PhoneStatusNote: React.FC<{online: boolean}> = ({online}) => {
  const [s, setS] = useState<{verified: boolean; smsVerification: boolean} | null>(null);
  useEffect(() => {
    if (!online) return;
    let live = true;
    apiFetch<{phone: {verified: boolean}; smsVerification?: boolean}>('/account/security').then((r) => { if (live) setS({verified: r.phone.verified, smsVerification: r.smsVerification !== false}); }).catch(() => undefined);
    return () => { live = false; };
  }, [online]);
  if (!s) return null;
  return s.verified
    ? <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0F5C2A]" data-testid="phone-note"><CheckCircle2 className="w-4 h-4" aria-hidden /> Phone number verified</p>
    : <p className="flex items-start gap-1.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900" data-testid="phone-note"><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <span>Your phone number is not verified.{!s.smsVerification && ' This site does not send text messages, so it cannot check that the number is yours.'} Keep your password private.{' '}<Link to="/account/security" className="underline">Account security</Link></span></p>;
};
