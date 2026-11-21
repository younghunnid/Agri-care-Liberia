import React, {useCallback, useEffect, useState} from 'react';
import {useApp} from '../../context/AppContext';
import {apiFetch} from '../../lib/api';
import type {RegistryAggregates, RegistryBlock} from '../../lib/participantRegistry';
export function ParticipantRegistryPanel() {
  const {user, isOnline} = useApp();
  const [data, setData] = useState<RegistryAggregates | null>(null);
  const [notice, setNotice] = useState('');
  const admin = user?.roles.includes('admin') ?? false;
  const reload = useCallback(async (signal?: AbortSignal) => {
    setData(null);
    if (!admin || !isOnline) return;
    setNotice('Loading consented participant totals…');
    try { const r = await apiFetch<RegistryAggregates>('/ministry/participants', {signal}); if (!signal?.aborted) { setData(r); setNotice(''); } }
    catch { if (!signal?.aborted) setNotice('Participant totals could not be loaded. No private records are shown.'); }
  }, [admin, isOnline, user?.id]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000); void reload(controller.signal); return () => { clearTimeout(timer); controller.abort(); }; }, [reload]);
  if (!admin) return <section className="rounded-2xl border bg-white p-4" data-testid="registry-locked"><h2 className="text-xl font-bold">Agricare participant registry</h2><p>Sign in as an authorized administrator to view suppressed participant totals. No participant directory is public.</p></section>;
  const block = (title: string, b: RegistryBlock) => <section className="space-y-3" aria-label={title}><h3 className="text-lg font-bold">{title}</h3><p>Total: {b.total === null ? 'Suppressed (small group)' : `${b.total} (rounded down)`}</p>{(['categories', 'counties'] as const).map((dimension) => <div key={dimension}><h4 className="font-bold">By {dimension === 'categories' ? 'participation category' : 'county'}</h4>{b[dimension].insufficient ? <p>Suppressed: fewer than {data!.minGroup} participants.</p> : <table className="w-full text-left text-sm"><thead><tr><th scope="col">Group</th><th scope="col">Participants (rounded)</th></tr></thead><tbody>{b[dimension].rows.map((r) => <tr key={r.label}><th scope="row" className="py-2 font-normal">{r.label}</th><td>{r.participants}</td></tr>)}</tbody></table>}</div>)}</section>;
  return <section className="space-y-4 rounded-2xl border bg-white p-4 sm:p-6" data-testid="participant-registry"><h2 className="text-xl font-bold">Agricare participant registry</h2>{!isOnline ? <p>Reconnect to view authorized registry totals. Private registry responses are not cached offline.</p> : <><button type="button" className="agri-button-secondary" onClick={() => void reload(AbortSignal.timeout(12000))}>Refresh participant totals</button>{notice && <p role="status">{notice}</p>}{data && <><p>{data.label}</p><p className="text-sm">{data.note}</p><div className="grid gap-6 md:grid-cols-3">{block('Synthetic demo participants', data.synthetic)}{block('Real participants: genuine accounts (separate dataset)', data.real)}{block('Anonymous browser participants (not counted as people)', data.anonymous)}</div><section aria-label="Phone status of genuine participants" data-testid="registry-phone-status" className="rounded-xl border p-3 text-sm"><h3 className="text-lg font-bold">Phone status of genuine participants</h3><p>Not verified: {data.real.phone?.unverified == null ? 'Suppressed (small group)' : `${data.real.phone.unverified} (rounded down)`}. Verified: {data.real.phone?.verified == null ? 'none or suppressed' : `${data.real.phone.verified} (rounded down)`}.</p><p>A phone number counts as verified only after proof of ownership. This site sends no text messages, so numbers stay not verified.</p></section></>}</>}</section>;
}
