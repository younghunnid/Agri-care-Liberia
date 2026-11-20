import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {RefreshCw, Wifi, WifiOff} from 'lucide-react';
import {LIBERIA_COUNTIES} from '../../../server/constants';
import {HARVEST_CROPS, HARVEST_STATUSES, SELL_CODE_NOTE} from '../../data/harvestCrops';
import {apiFetch, ApiRequestError} from '../../lib/api';
import {getRequesterKey} from '../../lib/listingKeys';
import {filterListings, findByCode, type HarvestFilters, type HarvestListing, type HarvestLoad} from '../../lib/harvestClient';
import {harvestClient} from '../../lib/triageApp';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';

const field = 'w-full min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 px-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#16803C]';
interface Convo {id: number; listingId: number; listingCode: string | null; cropLabel: string; message: string; status: string; farmerReply: string; createdAt: string; buyerPhone: string}
const when = (iso?: string): string => (iso ? new Date(iso).toLocaleString() : '');

/** Buyer: browse and filter harvest listings. Works offline from a clearly labelled saved list. Inquiries (questions to the seller) need a connection. */
export const HarvestMarketPage: React.FC = () => {
  const {isOnline} = useApp();
  const [data, setData] = useState<HarvestLoad>({listings: [], source: 'none'});
  const [loading, setLoading] = useState(true);
  const [crop, setCrop] = useState(''); const [county, setCounty] = useState(''); const [minKg, setMinKg] = useState(''); const [maxPrice, setMaxPrice] = useState(''); const [status, setStatus] = useState(''); const [sold, setSold] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [form, setForm] = useState({name: '', county: 'Montserrado', message: '', phone: '', consent: false});
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState<{kind: 'ok' | 'err'; text: string} | null>(null);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => { if (note) noteRef.current?.focus(); }, [note]);
  const [code, setCode] = useState(''); const [codeResult, setCodeResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try { setData(await harvestClient.load()); }
    catch { setLoadError('The list could not be opened. Your phone may have blocked storage. Try refreshing when connected.'); }
    finally { setLoading(false); }
  }, []);
  const loadConvos = useCallback(async () => { try { setConvos((await apiFetch<{inquiries: Convo[]}>('/harvest/inquiries', {headers: {'X-Requester-Key': getRequesterKey()}})).inquiries.filter((i) => (i as {role?: string}).role !== 'seller')); } catch { /* offline */ } }, []);
  useEffect(() => { void load(); void loadConvos(); }, [load, loadConvos]);
  useEffect(() => { if (isOnline) { void load(); void loadConvos(); } }, [isOnline, load, loadConvos]);

  const filters: HarvestFilters = useMemo(() => ({crop: crop || undefined, county: county || undefined, status: status || undefined, includeSoldOut: sold, minKg: minKg ? Number(minKg) : null, maxPrice: maxPrice ? Number(maxPrice) : null}), [crop, county, status, sold, minKg, maxPrice]);
  const shown = useMemo(() => filterListings(data.listings, filters), [data.listings, filters]);

  const ask = async (l: HarvestListing, e: React.FormEvent) => {
    e.preventDefault(); if (sendingRef.current) return; setNote(null);
    if (form.name.trim().length < 2 || form.message.trim().length < 5) { setNote({kind: 'err', text: 'Enter your name and a question of at least 5 letters.'}); return; }
    sendingRef.current = true; setSending(true);
    try {
      await apiFetch(`/marketplace/listings/${l.id}/inquiries`, {method: 'POST', headers: {'Idempotency-Key': idemKey}, body: JSON.stringify({buyerName: form.name.trim(), buyerCounty: form.county, message: form.message.trim(), requesterKey: getRequesterKey(), buyerToken: '', ...(form.consent && form.phone.trim() ? {buyerPhone: form.phone.trim(), buyerPhoneConsent: true} : {})})});
      setNote({kind: 'ok', text: 'Your question was sent to the seller. Their reply will appear under "My questions".'}); setForm({...form, message: '', phone: '', consent: false}); setIdemKey(crypto.randomUUID()); setOpen(null); void loadConvos();
    } catch (err) {
      setNote({kind: 'err', text: err instanceof ApiRequestError && err.status === 429 ? 'Too many questions just now. Please wait a little and try again.' : (err as Error).message || 'The question could not be sent.'});
    } finally { sendingRef.current = false; setSending(false); }
  };

  const check = async (e: React.FormEvent) => {
    e.preventDefault(); const c = code.trim().toUpperCase(); if (!c) return; setCodeResult(null);
    try { const r = await apiFetch<{code: string; cropLabel: string; quantityKg: number; county: string; status: string; note: string}>(`/harvest/verify/${encodeURIComponent(c)}`); setCodeResult(`${r.code}: ${r.quantityKg} kg of ${r.cropLabel} in ${r.county} (${r.status}). Confirmed with the server. ${r.note}`); }
    catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) { setCodeResult('No harvest listing has this reference. Check the letters and numbers.'); return; }
      const local = findByCode(data.listings, c);
      setCodeResult(local ? `${local.code}: ${local.quantityKg} kg of ${local.cropLabel} in ${local.county}. Found in the saved list on this phone only (you are offline): connect to confirm.` : 'You are offline and this reference is not in the saved list.');
    }
  };

  const banner = data.source === 'saved'
    ? `Saved list from ${when(data.asOf)}. It may be out of date: listings may have been sold or changed since. Connect to refresh.`
    : data.source === 'server' ? `Up to date as of ${when(data.asOf)}.` : loading ? 'Loading listings...' : 'No saved list on this phone yet. Connect to the internet once to download the listings.';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="harvest-market-page">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel kind="simulated" text="Demonstration market" /><StatusLabel kind="working" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Find harvest</h1>
        <p className="text-base text-[#183B2B]/85">Harvest listings from farmers. There are <strong>no payments</strong> here. Send the seller a question; the seller's phone number is shown only if the seller agreed.</p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${isOnline ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-amber-100 text-amber-900'}`}>{isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}{isOnline ? 'Online' : 'Offline: showing the saved list'}</p>
        <div className="flex items-center gap-3"><p className={`text-base font-bold ${data.source === 'saved' ? 'text-[#4A2F00] bg-[#FFF1C2] rounded-xl px-3 py-2' : 'text-[#183B2B]'}`} role="status" data-testid="snapshot-banner" data-source={data.source}>{banner}</p>
          <button type="button" onClick={() => void load()} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border-2 border-[#183B2B]/25 px-3" aria-label="Refresh the list" data-testid="refresh" disabled={loading}><RefreshCw className="w-5 h-5" aria-hidden /></button></div>
      </header>

      {loadError && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-base text-[#7A1010]">{loadError}</p>}

      <section aria-labelledby="f-h" className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-3" data-testid="filters">
        <h2 id="f-h" className="text-xl font-extrabold text-[#183B2B]">Filter</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label htmlFor="f-crop" className="block font-bold text-[#183B2B] mb-1">Crop</label><select id="f-crop" value={crop} onChange={(e) => setCrop(e.target.value)} className={field} data-testid="f-crop"><option value="">All crops</option>{HARVEST_CROPS.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select></div>
          <div><label htmlFor="f-county" className="block font-bold text-[#183B2B] mb-1">County</label><select id="f-county" value={county} onChange={(e) => setCounty(e.target.value)} className={field} data-testid="f-county"><option value="">All counties</option>{LIBERIA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label htmlFor="f-kg" className="block font-bold text-[#183B2B] mb-1">At least (kg)</label><input id="f-kg" inputMode="numeric" value={minKg} onChange={(e) => setMinKg(e.target.value.replace(/[^0-9]/g, ''))} className={field} data-testid="f-kg" /></div>
          <div><label htmlFor="f-price" className="block font-bold text-[#183B2B] mb-1">At most (L$ per kg)</label><input id="f-price" inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ''))} className={field} data-testid="f-price" /></div>
          <div><label htmlFor="f-status" className="block font-bold text-[#183B2B] mb-1">Status</label><select id="f-status" value={status} onChange={(e) => setStatus(e.target.value)} className={field} data-testid="f-status"><option value="">Available and limited stock</option>{HARVEST_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          <label className="flex items-center gap-3 min-h-[48px] cursor-pointer self-end"><input type="checkbox" checked={sold} onChange={(e) => setSold(e.target.checked)} className="w-6 h-6 accent-[#16803C]" data-testid="f-sold" /><span className="text-base text-[#183B2B]">Also show sold out</span></label>
        </div>
      </section>

      <section aria-labelledby="l-h" className="space-y-3">
        <h2 id="l-h" className="text-xl font-extrabold text-[#183B2B]" data-testid="result-count">{shown.length} listing{shown.length === 1 ? '' : 's'}</h2>
        {note && <p ref={noteRef} tabIndex={-1} id="ask-note" role={note.kind === 'err' ? 'alert' : 'status'} className={`text-base font-bold ${note.kind === 'err' ? 'text-[#7A1010]' : 'text-[#0F5C2A]'}`} data-testid="ask-note">{note.text}</p>}
        <ul className="space-y-3">
          {shown.map((l) => (
            <li key={l.id} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-2" data-testid="harvest-item" data-code={l.code ?? ''}>
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold text-base bg-[#F3F8F0] rounded-lg px-2 py-0.5" data-testid="item-code">{l.code}</span>
                <span className={`rounded-lg border-2 px-2 py-0.5 text-sm font-bold ${l.status === 'Available' ? 'border-[#16803C] text-[#0F5C2A]' : l.status === 'Sold Out' ? 'border-[#B42318] text-[#7A1010]' : 'border-[#B7791F] text-[#4A2F00]'}`}>{l.status}</span>
                {l.synthetic && <StatusLabel kind="simulated" text="Synthetic listing" />}</div>
              <p className="text-lg font-extrabold text-[#183B2B]">{l.cropLabel}: {l.quantityKg?.toLocaleString('en-US')} kg at L$ {l.pricePerKgLrd} per kg</p>
              <p className="text-base text-[#183B2B]/90">{l.county}{l.town ? `, ${l.town}` : ''} · harvested {l.harvestDate} · seller {l.sellerName}</p>
              {l.description && <p className="text-base text-[#183B2B]/85">{l.description}</p>}
              <p className="text-base" data-testid="item-contact">{l.phoneConsent && l.sellerPhone ? <>Seller phone (shared by the seller): <a className="font-bold underline" href={`tel:${l.sellerPhone}`}>{l.sellerPhone}</a></> : 'The seller has not shared a phone number. Send a question instead.'}</p>
              <button type="button" disabled={!isOnline} onClick={() => { setOpen(open === l.id ? null : l.id); setNote(null); }} className="min-h-[48px] rounded-xl bg-[#183B2B] text-white font-bold px-4 disabled:opacity-50" data-testid="ask-open" aria-expanded={open === l.id}>{isOnline ? 'Ask the seller a question' : 'Questions need a connection'}</button>
              {open === l.id && (
                <form onSubmit={(e) => void ask(l, e)} className="space-y-3 rounded-xl bg-[#F3F8F0] p-3" data-testid="ask-form" noValidate>
                  <div><label htmlFor={`bn-${l.id}`} className="block font-bold text-[#183B2B] mb-1">Your name</label><input id={`bn-${l.id}`} value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} maxLength={80} className={field} data-testid="ask-name" required aria-invalid={note?.kind === 'err' && form.name.trim().length < 2 || undefined} aria-describedby={note?.kind === 'err' ? 'ask-note' : undefined} /></div>
                  <div><label htmlFor={`bc-${l.id}`} className="block font-bold text-[#183B2B] mb-1">Your county</label><select id={`bc-${l.id}`} value={form.county} onChange={(e) => setForm({...form, county: e.target.value})} className={field}>{LIBERIA_COUNTIES.map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div><label htmlFor={`bm-${l.id}`} className="block font-bold text-[#183B2B] mb-1">Your question</label><textarea id={`bm-${l.id}`} value={form.message} onChange={(e) => setForm({...form, message: e.target.value})} rows={3} maxLength={600} className={`${field} py-2`} data-testid="ask-message" required aria-invalid={note?.kind === 'err' && form.message.trim().length < 5 || undefined} aria-describedby={note?.kind === 'err' ? 'ask-note' : undefined} /></div>
                  <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={form.consent} onChange={(e) => setForm({...form, consent: e.target.checked})} className="w-6 h-6 mt-0.5 accent-[#16803C]" data-testid="ask-consent" /><span className="text-base text-[#183B2B]">Let the seller see my phone number. If this is empty, the seller sees only my name, county and question.</span></label>
                  {form.consent && <div><label htmlFor={`bp-${l.id}`} className="block font-bold text-[#183B2B] mb-1">Your phone number</label><input id={`bp-${l.id}`} inputMode="tel" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className={field} /><p className="text-sm text-[#183B2B]/75 mt-1">On the demonstration site only synthetic numbers beginning +23177000 are allowed.</p></div>}
                  <button type="submit" className="w-full min-h-[52px] rounded-xl bg-[#16803C] text-white font-bold" data-testid="ask-send" disabled={sending || !isOnline} aria-busy={sending}>{sending ? 'Sending…' : 'Send question'}</button>
                </form>)}
            </li>))}
        </ul>
        {shown.length === 0 && !loading && <p className="text-base text-[#183B2B]/80" data-testid="empty">No listings match. Try fewer filters{data.source === 'none' ? ', or connect to the internet to download the list' : ''}.</p>}
      </section>

      <section aria-labelledby="c-h" className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-3">
        <h2 id="c-h" className="text-xl font-extrabold text-[#183B2B]">Check a reference</h2>
        <p className="text-sm text-[#183B2B]/80">{SELL_CODE_NOTE}</p>
        <form onSubmit={(e) => void check(e)} className="flex flex-col sm:flex-row gap-3"><label htmlFor="sell-code" className="sr-only">SELL reference</label><input id="sell-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SELL-2026-000001" className={`${field} font-mono`} data-testid="sell-code-input" /><button type="submit" className="min-h-[48px] rounded-xl bg-[#16803C] text-white font-bold px-5" data-testid="sell-code-check">Check</button></form>
        <p aria-live="polite" className="text-base text-[#183B2B]" data-testid="sell-code-result">{codeResult}</p>
      </section>

      <section aria-labelledby="q-h" className="space-y-3" data-testid="my-questions">
        <h2 id="q-h" className="text-xl font-extrabold text-[#183B2B]">My questions</h2>
        {convos.length === 0 && <p className="text-base text-[#183B2B]/80">Questions you send appear here with the seller's reply. Only this phone can read them.</p>}
        <ul className="space-y-3">{convos.map((c) => (
          <li key={c.id} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-1" data-testid="my-question">
            <p className="text-sm font-mono text-[#183B2B]/80">{c.listingCode} · {c.cropLabel} · {when(c.createdAt)}</p>
            <p className="text-base text-[#183B2B]">You: {c.message}</p>
            <p className={`text-base ${c.farmerReply ? 'font-bold text-[#0F5C2A]' : 'text-[#183B2B]/75'}`} data-testid="my-question-reply">{c.farmerReply ? `Seller: ${c.farmerReply}` : 'No reply yet.'}</p>
          </li>))}</ul>
        <p className="text-sm"><Link to="/harvest/sell" className="font-bold text-[#0F5C2A] underline min-h-[44px] inline-flex items-center">I am a farmer: sell my harvest</Link></p>
      </section>
    </div>
  );
};
