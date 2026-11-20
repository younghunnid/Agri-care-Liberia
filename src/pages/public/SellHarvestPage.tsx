import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {Wifi, WifiOff} from 'lucide-react';
import {LIBERIA_COUNTIES} from '../../../server/constants';
import {HARVEST_CROPS, HARVEST_STATUSES, SELL_CODE_NOTE, cropBySlug, type HarvestStatus} from '../../data/harvestCrops';
import {validateHarvestFields} from '../../lib/harvestRules';
import {STATUS_LABEL, deleteLocalRecord, initDrafts, isLocked, queueRecord, saveListingDraft, validateListing, type ListingData, type ListingRecord} from '../../lib/offlineDrafts';
import {syncNow, syncSoon, useSyncState} from '../../lib/syncEngine';
import {apiFetch} from '../../lib/api';
import {getListingRecords} from '../../lib/offlineDrafts';
import {useApp} from '../../context/AppContext';
import {StatusLabel} from '../../components/StatusLabel';

const today = () => new Date().toISOString().slice(0, 10);
const card = 'rounded-2xl bg-white border border-[#183B2B]/10 p-4 sm:p-5';
const field = 'w-full min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 px-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#16803C]';
interface Convo {id: number; buyerName: string; buyerCounty: string; buyerPhone: string; message: string; status: string; farmerReply: string; createdAt: string}

/** Farmer: list a harvest (crop, kilograms, price per kg, county, harvest date). Saved on the phone first and sent when online; the SELL reference is issued by the server after the first successful send. */
export const SellHarvestPage: React.FC = () => {
  const {isOnline, user} = useApp();
  useSyncState(); // re-render when records or the queue change
  const [crop, setCrop] = useState('cassava');
  const [kg, setKg] = useState('');
  const [price, setPrice] = useState('');
  const [county, setCounty] = useState<string>(user?.county && (LIBERIA_COUNTIES as readonly string[]).includes(user.county) ? user.county : 'Bong');
  const [town, setTown] = useState('');
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState<HarvestStatus>('Available');
  const [desc, setDesc] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<{kind: 'ok' | 'err'; text: string} | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [invalidField, setInvalidField] = useState<string | null>(null);
  const invalid = (id: string) => ({'aria-invalid': invalidField === id || undefined, 'aria-describedby': invalidField === id ? 'sell-message' : undefined});
  const reject = (text: string, id: string) => { setMsg({kind: 'err', text}); setInvalidField(id); requestAnimationFrame(() => document.getElementById(id)?.focus()); };
  const [convos, setConvos] = useState<Record<number, Convo[]>>({});
  const [replies, setReplies] = useState<Record<number, string>>({});

  useEffect(() => { void initDrafts(); }, []);
  const mine = getListingRecords().filter((l) => l.data.cropSlug !== undefined).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const loadConvos = useCallback(async () => {
    const out: Record<number, Convo[]> = {};
    for (const l of getListingRecords().filter((r) => r.data.cropSlug !== undefined && r.serverId && r.ownerKey)) {
      try { out[l.serverId!] = (await apiFetch<{inquiries: Convo[]}>(`/harvest/inquiries?listingId=${l.serverId}`, {headers: {'X-Listing-Key': l.ownerKey!}})).inquiries; } catch { /* offline: keep what is shown */ }
    }
    setConvos(out);
  }, []);
  useEffect(() => { if (isOnline) void loadConvos(); }, [isOnline, mine.length, loadConvos]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (savingRef.current) return; setMsg(null); setInvalidField(null);
    const h = validateHarvestFields({cropSlug: crop, quantityKg: kg, harvestDate: date});
    if (!h.ok) { reject(h.error, h.error.startsWith('Quantity') ? 'h-kg' : h.error.includes('crop') ? 'h-crop' : 'h-date'); return; }
    const data: ListingData = {
      sellerType: 'farmer', sellerName: name.trim() || 'Farmer', farmName: '', category: h.crop.category, productName: h.crop.label, quantity: String(h.quantityKg), unit: 'kg',
      priceLrd: price, county, town, availabilityStatus: status, description: desc.trim(), photoDataUrl: '', sellerPhone: consent ? phone : '', phoneConsent: consent,
      cropSlug: crop, quantityKg: h.quantityKg, harvestDate: h.harvestDate,
    };
    const problem = validateListing(data);
    if (problem) { reject(problem, !Number.isFinite(Number(price)) || Number(price) <= 0 ? 'h-price' : !county ? 'h-county' : town.trim().length < 2 ? 'h-town' : 'h-phone'); return; }
    savingRef.current = true; setSaving(true);
    try {
      const rec = await saveListingDraft(data);
      await queueRecord('listing', rec.localId);
      setKg(''); setPrice(''); setDesc('');
      setMsg({kind: 'ok', text: isOnline ? 'Saved on this phone. Sending now...' : 'Saved on this phone. It will be sent when you are online. You can close the app.'});
      syncSoon();
    } catch (err) { setMsg({kind: 'err', text: (err as Error).message}); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const changeStatus = async (rec: ListingRecord, next: HarvestStatus) => {
    try { const r = await saveListingDraft({...rec.data, availabilityStatus: next}, rec.localId); await queueRecord('listing', r.localId); syncSoon(); setMsg({kind: 'ok', text: `Status change to "${next}" saved on this phone.`}); }
    catch (err) { setMsg({kind: 'err', text: (err as Error).message}); }
  };
  const sendReply = async (l: ListingRecord, c: Convo) => {
    const text = (replies[c.id] ?? '').trim();
    if (text.length < 2) return;
    try { await apiFetch(`/marketplace/inquiries/${c.id}`, {method: 'PATCH', headers: {'X-Listing-Key': l.ownerKey!}, body: JSON.stringify({farmerReply: text, status: 'Farmer Replied'})}); setReplies((r) => ({...r, [c.id]: ''})); void loadConvos(); setMsg({kind: 'ok', text: 'Your reply was sent to the buyer.'}); }
    catch (err) { setMsg({kind: 'err', text: (err as Error).message}); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" data-testid="sell-harvest-page">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2"><StatusLabel kind="working" /><StatusLabel kind="simulated" text="Demonstration market" /></div>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Sell my harvest</h1>
        <p className="text-base text-[#183B2B]/85">List what you harvested so buyers can find it. There are <strong>no payments</strong> here: buyers ask you a question, and you answer. Your listing is saved on this phone first.</p>
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${isOnline ? 'bg-[#DDEFE0] text-[#0F5C2A]' : 'bg-amber-100 text-amber-900'}`}>
          {isOnline ? <Wifi className="w-4 h-4" aria-hidden /> : <WifiOff className="w-4 h-4" aria-hidden />}{isOnline ? 'Online' : 'Offline: you can still save listings'}
        </p>
      </header>

      <div id="sell-message" aria-live={msg?.kind === 'err' ? 'assertive' : 'polite'} role={msg?.kind === 'err' ? 'alert' : 'status'} className={`min-h-[1.5rem] text-base font-bold ${msg?.kind === 'err' ? 'text-[#7A1010]' : 'text-[#0F5C2A]'}`} data-testid="sell-message">{msg?.text}</div>

      <form onSubmit={submit} className={`${card} space-y-4`} data-testid="sell-form" noValidate>
        <h2 className="text-xl font-extrabold text-[#183B2B]">New harvest listing</h2>
        <p className="text-sm text-[#183B2B]/80">Crop, quantity, price, county, town and harvest date are required. Contact details are optional. Use invented demonstration data only.</p>
        <div><label htmlFor="h-crop" className="block text-base font-bold text-[#183B2B] mb-1">Crop</label>
          <select id="h-crop" {...invalid('h-crop')} required value={crop} onChange={(e) => setCrop(e.target.value)} className={field} data-testid="h-crop">{HARVEST_CROPS.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="h-kg" className="block text-base font-bold text-[#183B2B] mb-1">Quantity (kilograms)</label>
            <input id="h-kg" {...invalid('h-kg')} required inputMode="numeric" value={kg} onChange={(e) => setKg(e.target.value.replace(/[^0-9]/g, ''))} placeholder="for example 500" className={field} data-testid="h-kg" /></div>
          <div><label htmlFor="h-price" className="block text-base font-bold text-[#183B2B] mb-1">Price per kilogram (LRD)</label>
            <input id="h-price" {...invalid('h-price')} required inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="for example 60" className={field} data-testid="h-price" /></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="h-county" className="block text-base font-bold text-[#183B2B] mb-1">County</label>
            <select id="h-county" {...invalid('h-county')} required value={county} onChange={(e) => setCounty(e.target.value)} className={field} data-testid="h-county">{LIBERIA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label htmlFor="h-town" className="block text-base font-bold text-[#183B2B] mb-1">Town or community</label>
            <input id="h-town" {...invalid('h-town')} required value={town} onChange={(e) => setTown(e.target.value)} maxLength={80} className={field} data-testid="h-town" /></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label htmlFor="h-date" className="block text-base font-bold text-[#183B2B] mb-1">Harvest date</label>
            <input id="h-date" {...invalid('h-date')} required type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className={field} data-testid="h-date" /></div>
          <div><label htmlFor="h-status" className="block text-base font-bold text-[#183B2B] mb-1">Status</label>
            <select id="h-status" value={status} onChange={(e) => setStatus(e.target.value as HarvestStatus)} className={field} data-testid="h-status">{HARVEST_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div><label htmlFor="h-desc" className="block text-base font-bold text-[#183B2B] mb-1">Description (optional)</label>
          <textarea id="h-desc" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1200} rows={3} className={`${field} py-2`} data-testid="h-desc" /></div>
        <div><label htmlFor="h-name" className="block text-base font-bold text-[#183B2B] mb-1">Your name (optional)</label>
          <input id="h-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} /></div>
        <fieldset className="rounded-xl border-2 border-[#183B2B]/15 p-3 space-y-2">
          <legend className="px-1 font-bold text-[#183B2B]">Phone number (optional)</legend>
          <label className="flex items-start gap-3 cursor-pointer"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="w-6 h-6 mt-0.5 accent-[#16803C]" data-testid="h-consent" />
            <span className="text-base text-[#183B2B]">Show my phone number to buyers. If this is empty, buyers can only send you a question and your number stays private.</span></label>
          {consent && <div><label htmlFor="h-phone" className="block text-base font-bold text-[#183B2B] mb-1">Phone number</label><input id="h-phone" {...invalid('h-phone')} required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} data-testid="h-phone" />
            <p className="text-sm text-[#183B2B]/75 mt-1">On the demonstration site only synthetic test numbers beginning +23177000 are allowed.</p></div>}
        </fieldset>
        <button type="submit" disabled={saving} aria-busy={saving} className="w-full disabled:opacity-60 min-h-[56px] rounded-2xl bg-[#16803C] text-white text-lg font-extrabold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16803C]" data-testid="h-submit">{saving ? 'Saving on this phone…' : 'Save my listing'}</button>
      </form>

      <section aria-labelledby="mine-h" className="space-y-3" data-testid="my-listings">
        <h2 id="mine-h" className="text-xl font-extrabold text-[#183B2B]">My harvest listings (on this phone)</h2>
        {mine.length === 0 && <p className="text-base text-[#183B2B]/80">Nothing yet. Listings you save appear here, even before they reach the server.</p>}
        <ul className="space-y-3">
          {mine.map((l) => {
            const locked = isLocked(l); const crop = cropBySlug(l.data.cropSlug ?? '');
            return (
              <li key={l.localId} className={`${card} space-y-2`} data-testid="my-listing" data-state={l.status}>
                <p className="text-lg font-extrabold text-[#183B2B]">{crop?.label ?? l.data.productName}: {l.data.quantityKg} kg at L$ {l.data.priceLrd} per kg</p>
                <p className="text-sm text-[#183B2B]/85">{l.data.county}{l.data.town ? `, ${l.data.town}` : ''} · harvested {l.data.harvestDate} · status <strong>{l.data.availabilityStatus}</strong></p>
                <p className="text-base" data-testid="my-listing-state"><strong>{STATUS_LABEL[l.status]}.</strong> {l.status === 'pending' ? 'Waiting to reach the server.' : l.status === 'published' ? 'The server has it.' : l.status === 'failed' ? (l.lastError ?? 'It was not accepted.') : 'Saved on this phone.'}</p>
                <p className="text-base" data-testid="my-listing-code">{l.listingCode ? <>Reference: <strong className="font-mono text-lg bg-[#F3F8F0] rounded-lg px-2 py-0.5">{l.listingCode}</strong></> : 'Reference: the server will issue it after this reaches it.'}</p>
                {l.listingCode && <p className="text-sm text-[#183B2B]/75">{SELL_CODE_NOTE}</p>}
                <div className="flex flex-wrap gap-2">
                  {l.status === 'failed' && <button type="button" onClick={() => void syncNow({manual: true})} className="min-h-[44px] rounded-xl border-2 border-[#183B2B]/25 px-4 font-bold">Try again</button>}
                  {l.serverId && HARVEST_STATUSES.filter((s) => s !== l.data.availabilityStatus).map((s) => (
                    <button key={s} type="button" disabled={locked} onClick={() => void changeStatus(l, s)} className="min-h-[44px] rounded-xl bg-[#183B2B] text-white font-bold px-4 disabled:opacity-50" data-testid={`status-${s}`}>Mark {s}</button>))}
                  {!l.serverId && l.status !== 'pending' && <button type="button" onClick={() => void deleteLocalRecord('listing', l.localId)} className="min-h-[44px] rounded-xl border-2 border-[#B42318]/50 px-4 font-bold text-[#7A1010]">Delete from this phone</button>}
                </div>
                {l.serverId && (convos[l.serverId] ?? []).length > 0 && (
                  <div className="border-t border-[#183B2B]/10 pt-3 space-y-3" data-testid="my-convos">
                    <h3 className="text-base font-extrabold text-[#183B2B]">Questions from buyers</h3>
                    {(convos[l.serverId] ?? []).map((c) => (
                      <div key={c.id} className="rounded-xl bg-[#F3F8F0] p-3 space-y-1" data-testid="convo">
                        <p className="text-base text-[#183B2B]"><strong>{c.buyerName}</strong> ({c.buyerCounty}): {c.message}</p>
                        {c.buyerPhone && <p className="text-sm text-[#183B2B]/85">Buyer phone (shared with consent): {c.buyerPhone}</p>}
                        {c.farmerReply ? <p className="text-base font-bold text-[#0F5C2A]">Your reply: {c.farmerReply}</p> : (
                          <div className="flex flex-col sm:flex-row gap-2"><label htmlFor={`rp-${c.id}`} className="sr-only">Reply to {c.buyerName}</label>
                            <input id={`rp-${c.id}`} value={replies[c.id] ?? ''} onChange={(e) => setReplies((r) => ({...r, [c.id]: e.target.value}))} className={field} placeholder="Type your reply" data-testid="reply-input" />
                            <button type="button" onClick={() => void sendReply(l, c)} className="min-h-[48px] rounded-xl bg-[#16803C] text-white font-bold px-4" data-testid="reply-send">Reply</button></div>)}
                      </div>))}
                  </div>)}
              </li>);
          })}
        </ul>
        <p className="text-sm"><Link to="/harvest" className="font-bold text-[#0F5C2A] underline min-h-[44px] inline-flex items-center">See what buyers see</Link></p>
      </section>
    </div>
  );
};
