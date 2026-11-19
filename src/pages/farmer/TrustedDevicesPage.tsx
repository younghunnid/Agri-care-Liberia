import React, {useCallback, useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ArrowLeft, Smartphone, Trash2} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {ConfirmDialog} from '../../components/ConfirmDialog';
import {DemoSmsBanner, NeedsConnection, errorText} from '../../components/SecurityBits';

interface Device { id: number; label: string; createdAt: string; lastUsedAt: string; expiresAt: string; current: boolean }

/** Trusted devices: each one skips the SMS code until it expires (30 days) or you remove it. */
export const TrustedDevicesPage: React.FC = () => {
  const {isOnline, setUser} = useApp();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{kind: 'one'; d: Device} | {kind: 'all'} | null>(null);

  const load = useCallback(async () => { try { const r = await apiFetch<{devices: Device[]; trustDays: number}>('/account/devices'); setDevices(r.devices); setDays(r.trustDays); setError(null); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { if (isOnline) void load(); }, [isOnline, load]);

  const remove = async (d: Device) => {
    setConfirm(null); setError(null);
    try {
      const r = await apiFetch<{currentDeviceRevoked: boolean}>(`/account/devices/${d.id}`, {method: 'DELETE'});
      if (r.currentDeviceRevoked) { setNote('This device was removed. You stay signed in until your session ends, but next time you will need a code.'); }
      else setNote('Device removed. It needs a code to sign in again.');
      await load();
    } catch (e) { setError(errorText(e)); }
  };
  const removeAll = async () => {
    setConfirm(null); setError(null);
    try { await apiFetch('/account/devices/revoke-all', {method: 'POST', body: '{}'}); setUser(null); navigate('/login'); }
    catch (e) { setError(errorText(e)); }
  };
  const date = (s: string) => new Date(s).toLocaleDateString();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-5" data-testid="devices-page">
      <Link to="/account/security" className="inline-flex items-center gap-1 min-h-[44px] text-sm font-bold underline text-[#183B2B]"><ArrowLeft className="w-4 h-4" aria-hidden /> Account security</Link>
      <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Trusted phones and browsers</h1>
      <DemoSmsBanner />
      <NeedsConnection online={isOnline} what="Managing trusted devices" />
      <p className="text-base text-[#183B2B]/85">A trusted device does not need an SMS code when you sign in. Trust ends after {days} days or when you remove it. Remove any device you do not recognise or no longer use.</p>
      {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-semibold text-red-800">{error}</p>}
      {note && <p role="status" data-testid="device-note" className="rounded-xl bg-[#DDEFE0] p-3 text-sm font-semibold text-[#0F5C2A]">{note}</p>}
      {devices && devices.length === 0 && <p data-testid="no-devices" className="rounded-2xl border border-dashed border-[#183B2B]/25 bg-white p-4 text-base">No trusted devices. Your next sign-in will need a code.</p>}
      <ul className="space-y-3" data-testid="device-list">
        {(devices ?? []).map((d) => (
          <li key={d.id} className="rounded-2xl bg-white border border-[#183B2B]/12 p-4 space-y-2" data-device-id={d.id}>
            <p className="flex flex-wrap items-center gap-2 text-lg font-extrabold text-[#183B2B]"><Smartphone className="w-5 h-5" aria-hidden /> {d.label}{d.current && <span className="rounded-full bg-[#DDEFE0] border border-[#16803C]/40 px-2.5 py-0.5 text-xs font-bold text-[#0F5C2A]">This device</span>}</p>
            <p className="text-sm text-[#183B2B]/80">Added {date(d.createdAt)} · last used {date(d.lastUsedAt)} · trusted until {date(d.expiresAt)}</p>
            <button type="button" onClick={() => setConfirm({kind: 'one', d})} data-testid="revoke-device" aria-label={`Remove trusted device: ${d.label}`} className="min-h-[48px] px-4 rounded-xl border border-red-200 bg-white text-red-700 text-sm font-bold inline-flex items-center gap-2"><Trash2 className="w-4 h-4" aria-hidden /> Remove</button>
          </li>
        ))}
      </ul>
      {devices && devices.length > 0 && <button type="button" onClick={() => setConfirm({kind: 'all'})} data-testid="revoke-all" className="min-h-[52px] px-5 rounded-2xl border-2 border-red-300 bg-white text-red-700 text-base font-bold">Remove all and sign out everywhere</button>}
      {confirm?.kind === 'one' && <ConfirmDialog title="Remove this device?" confirmLabel="Yes, remove it" onConfirm={() => void remove(confirm.d)} onCancel={() => setConfirm(null)}><p>{confirm.d.label} will need a six-digit code the next time it signs in.</p></ConfirmDialog>}
      {confirm?.kind === 'all' && <ConfirmDialog title="Sign out everywhere?" confirmLabel="Yes, sign out everywhere" onConfirm={() => void removeAll()} onCancel={() => setConfirm(null)}><p>Every trusted device is removed and every signed-in phone or browser, including this one, is signed out. Each will need a code to sign in again.</p></ConfirmDialog>}
    </div>
  );
};
