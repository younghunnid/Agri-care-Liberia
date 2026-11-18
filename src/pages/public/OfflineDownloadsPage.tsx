import React, {useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle, CheckCircle2, CloudUpload, HardDrive, Pause, Play, RefreshCw, Smartphone, Trash2} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {apiFetch} from '../../lib/api';
import {ConfirmDialog} from '../../components/ConfirmDialog';
import {StarterPackCard} from '../../components/StarterPackCard';
import {OfflineAudioManager} from '../../components/AudioLessonCard';
import {SyncBar} from '../../components/SyncStatus';
import {SavedInfoBar} from '../../components/SavedInfoBar';
import {StatusBadge} from '../../components/LocalRecordsPanels';
import {deleteAllAudio, formatAudioSize, useAudioStore} from '../../lib/audioStore';
import {
  cacheDelete,
  cacheSet,
  formatExact,
  MINISTRY_SUMMARY_KEY,
  summaryFreshness,
  weatherKey,
} from '../../lib/dataCache';
import {
  cancelSync,
  deleteLocalRecord,
  getSyncVersion,
  STATUS_LABEL,
  subscribeSync,
  type ListingRecord,
  type QuestionRecord,
} from '../../lib/offlineDrafts';
import {takeInventory, unsentCount, type Inventory} from '../../lib/offlineInventory';
import {clearLibrary, formatDate, pruneUnusedImages, subscribeLibrary} from '../../lib/offlineLibrary';
import {clearAllOfflineGuides, formatBytes, subscribeOfflineGuides} from '../../lib/offlineStorage';
import {isAutoSyncPaused, setAutoSyncPaused} from '../../lib/syncEngine';

type Pending =
  | {kind: 'guides'}
  | {kind: 'audio'}
  | {kind: 'record'; type: 'listing' | 'question'; id: string; title: string; status: string}
  | {kind: 'all-unsent'}
  | null;

const KIND = {
  saved: {label: 'Saved information', cls: 'bg-blue-50 text-blue-900 border-blue-200'},
  sample: {label: 'Sample / demonstration', cls: 'bg-amber-100 text-amber-900 border-amber-300'},
  synthetic: {label: 'Synthetic demo data', cls: 'bg-purple-50 text-purple-900 border-purple-200'},
  mine: {label: 'Your own data (private)', cls: 'bg-[#DDEFE0] text-[#16803C] border-[#16803C]/30'},
  real: {label: 'Real (from server)', cls: 'bg-white text-[#183B2B] border-[#183B2B]/25'},
} as const;

const KindBadge: React.FC<{kind: keyof typeof KIND}> = ({kind}) => (
  <span className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-bold ${KIND[kind].cls}`}>{KIND[kind].label}</span>
);

const Section: React.FC<{id: string; title: string; icon?: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode}> = ({id, title, icon, badge, children}) => (
  <section aria-labelledby={id} className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="flex flex-wrap gap-1.5">{badge}</div>
    </div>
    {children}
  </section>
);

const btn = 'inline-flex items-center gap-2 min-h-[48px] px-4 rounded-xl border text-sm font-bold';

export const OfflineDownloadsPage: React.FC = () => {
  const {isOnline} = useApp();
  const [inv, setInv] = useState<Inventory | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshingMinistry, setRefreshingMinistry] = useState(false);
  const [ministryError, setMinistryError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const syncVersion = useSyncExternalStore(subscribeSync, getSyncVersion, getSyncVersion);
  const {totalBytes: audioBytes} = useAudioStore();
  const paused = useSyncExternalStore(subscribeSync, isAutoSyncPaused, isAutoSyncPaused);

  const reload = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void takeInventory().then(setInv), 150);
  }, []);

  useEffect(() => {
    reload();
    const offs = [subscribeLibrary(reload), subscribeOfflineGuides(reload)];
    return () => {
      offs.forEach((o) => o());
      window.clearTimeout(timer.current);
    };
  }, [reload]);
  useEffect(reload, [syncVersion, audioBytes, reload]);

  const run = async (okMessage: string, fn: () => Promise<unknown>) => {
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(okMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Nothing else was changed.');
    } finally {
      setPending(null);
      reload();
    }
  };

  const confirmAction = () => {
    const p = pending;
    if (!p) return;
    if (p.kind === 'guides') {
      void run('Saved guides and pictures removed. Download the Starter Pack again when you are online.', async () => {
        await clearLibrary();
        await clearAllOfflineGuides();
        await pruneUnusedImages();
        if (typeof caches !== 'undefined') await caches.delete('agri-local-images');
      });
    } else if (p.kind === 'audio') {
      void run('Audio lessons removed.', async () => {
        const freed = await deleteAllAudio();
        setMessage(`Audio lessons removed. ${formatAudioSize(freed)} freed.`);
      });
    } else if (p.kind === 'record') {
      void run('Removed from this phone.', () => deleteLocalRecord(p.type, p.id));
    } else if (p.kind === 'all-unsent' && inv) {
      void run('Unsent items deleted from this phone.', async () => {
        for (const r of inv.listings.records.filter((x) => x.status !== 'published')) await deleteLocalRecord('listing', r.localId);
        for (const r of inv.questions.records.filter((x) => x.status !== 'published')) await deleteLocalRecord('question', r.localId);
      });
    }
  };

  const refreshMinistry = async () => {
    setRefreshingMinistry(true);
    setMinistryError(null);
    try {
      const res = await apiFetch<{demoAndExperimentalData: Record<string, number>}>('/prototype/management-summary');
      await cacheSet(MINISTRY_SUMMARY_KEY, res.demoAndExperimentalData);
    } catch {
      setMinistryError('Could not refresh the counts.');
    } finally {
      setRefreshingMinistry(false);
      reload();
    }
  };

  const unsent = inv ? unsentCount(inv) : 0;
  const mb = (n: number) => formatBytes(n);

  const recordRow = (type: 'listing' | 'question', r: ListingRecord | QuestionRecord) => {
    const title = type === 'listing' ? (r as ListingRecord).data.productName : (r as QuestionRecord).data.title;
    return (
      <li key={r.localId} className="rounded-2xl border border-[#183B2B]/10 p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-[#183B2B] truncate">{title}</p>
          <p className="text-xs text-[#183B2B]/65">
            Saved {formatDate(r.createdAt)}
            {r.syncedAt ? ` · Confirmed ${formatDate(r.syncedAt)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} sent={type === 'question'} />
          {r.status === 'pending' && (
            <button type="button" onClick={() => void run('Sync cancelled. The item is now a draft on this phone.', () => cancelSync(type, r.localId))} className={`${btn} border-[#183B2B]/20 bg-white text-[#183B2B]`}>
              Cancel sync
            </button>
          )}
          {r.status !== 'pending' &&
            (r.status === 'published' ? (
              <button type="button" onClick={() => void run('Removed from this phone.', () => deleteLocalRecord(type, r.localId))} className={`${btn} border-[#183B2B]/20 bg-white text-[#183B2B]`}>
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPending({kind: 'record', type, id: r.localId, title, status: STATUS_LABEL[r.status]})}
                aria-label={`Delete unsent ${type === 'listing' ? 'listing' : 'question'}: ${title}`}
                className={`${btn} border-red-200 bg-white text-red-700`}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete…
              </button>
            ))}
        </div>
      </li>
    );
  };

  const browserUsed = inv?.storage.usageBytes ?? null;
  const quota = inv?.storage.quotaBytes ?? null;
  const pct = browserUsed !== null && quota ? Math.min(100, (browserUsed / quota) * 100) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-semibold text-[#16803C]">Offline-first · Field access</p>
        <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">My Offline Downloads</h1>
        <p className="text-sm text-[#183B2B]/85 max-w-2xl">
          See everything this phone keeps for offline use, how much space it takes, and remove what you do not need. Your unsent drafts are never
          deleted unless you confirm.
        </p>
        <p className="text-xs text-[#183B2B]/75 flex flex-wrap gap-1.5 items-center">
          <span className="font-semibold">What the labels mean:</span> <KindBadge kind="real" /> <KindBadge kind="saved" /> <KindBadge kind="sample" />{' '}
          <KindBadge kind="synthetic" /> <KindBadge kind="mine" />
        </p>
        <Link to="/offline" className="inline-block text-sm font-semibold text-[#16803C] underline min-h-[44px] py-2">
          Offline Library: read and search saved guides
        </Link>
      </header>

      {message && (
        <p role="status" className="rounded-xl bg-[#DDEFE0] border border-[#16803C]/30 px-4 py-3 text-sm font-semibold text-[#183B2B] flex gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-[#16803C]" aria-hidden="true" /> {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-800 flex gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      {!isOnline && (
        <p role="status" className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-900">
          You are offline. You can read, search, listen and manage saved items. Downloading and refreshing need the internet.
        </p>
      )}

      {!inv ? (
        <p className="text-sm text-[#183B2B]/75" role="status">
          Checking what is saved on this phone…
        </p>
      ) : (
        <>
          {/* STORAGE */}
          <Section id="dl-storage" title="Storage on this phone" icon={<HardDrive className="w-5 h-5 text-[#16803C]" aria-hidden="true" />}>
            {pct !== null ? (
              <div className="space-y-1">
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Browser storage used" className="h-3 rounded-full bg-[#183B2B]/10 overflow-hidden">
                  <div className="h-full bg-[#16803C]" style={{width: `${Math.max(1, pct)}%`}} />
                </div>
                <p className="text-xs text-[#183B2B]/80">
                  This app uses about <strong>{mb(browserUsed!)}</strong> of roughly {mb(quota!)} your browser allows
                  {inv.storage.persisted === true ? ' · protected from automatic clean-up' : inv.storage.persisted === false ? ' · the browser may clear it if the phone runs low on space' : ''}. These numbers are the browser's estimate.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#183B2B]/75">This browser does not report storage use.</p>
            )}
            <table className="w-full text-sm">
              <caption className="sr-only">Measured size of saved items</caption>
              <tbody className="divide-y divide-[#183B2B]/10">
                {[
                  ['Guides (text)', inv.guides.bundledBytes + inv.guides.serverBytes],
                  ['Pictures', inv.images.bytes],
                  ['Audio lessons', inv.audio.bytes],
                  ['Marketplace drafts', inv.listings.bytes],
                  ['Question drafts', inv.questions.bytes],
                ].map(([label, bytes]) => (
                  <tr key={label as string}>
                    <th scope="row" className="py-2 text-left font-medium text-[#183B2B]/85">{label}</th>
                    <td className="py-2 text-right tabular-nums font-bold">{mb(bytes as number)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="py-2 text-left font-extrabold">Measured total</th>
                  <td className="py-2 text-right tabular-nums font-extrabold">{mb(inv.measuredBytes)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-[#183B2B]/65">The rest of the app's space is the app itself (its pages and fonts, kept so it opens offline).</p>
          </Section>

          {/* GUIDES */}
          <Section id="dl-guides" title="Starter Pack and guides" icon={<Smartphone className="w-5 h-5 text-[#16803C]" aria-hidden="true" />} badge={<><KindBadge kind="saved" />{inv.guides.sampleServerGuides > 0 && <KindBadge kind="sample" />}</>}>
            <ul className="text-sm text-[#183B2B]/90 space-y-1">
              <li>
                Starter Pack guides: <strong>{inv.guides.bundledSaved}</strong> of {inv.guides.bundledTotal}
                {inv.guides.needUpdate > 0 ? ` · ${inv.guides.needUpdate} have a newer version` : ''}
              </li>
              <li>
                Server guides: <strong>{inv.guides.serverSaved}</strong>
                {inv.guides.sampleServerGuides > 0 ? ` (${inv.guides.sampleServerGuides} are sample guides)` : ''}
              </li>
              <li>Pictures: <strong>{inv.images.count}</strong> · {mb(inv.images.bytes)}</li>
              <li>Last saved: <strong>{inv.guides.newestSavedAt ? formatExact(inv.guides.newestSavedAt) : 'nothing saved yet'}</strong></li>
            </ul>
            {inv.guides.bundledSaved === 0 && inv.guides.serverSaved === 0 && (
              <p role="status" className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-900">
                No guides are saved yet. Connect to the internet and download the Starter Pack below.
              </p>
            )}
            <StarterPackCard />
            {(inv.guides.bundledSaved > 0 || inv.guides.serverSaved > 0 || inv.images.count > 0) && (
              <button type="button" onClick={() => setPending({kind: 'guides'})} className={`${btn} border-red-200 bg-white text-red-700`}>
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove saved guides and pictures…
              </button>
            )}
          </Section>

          {/* AUDIO */}
          <Section id="dl-audio" title="Audio lessons" badge={<KindBadge kind="sample" />}>
            <OfflineAudioManager />
            {inv.audio.items.length > 0 && (
              <button type="button" onClick={() => setPending({kind: 'audio'})} className={`${btn} border-red-200 bg-white text-red-700`}>
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove all audio…
              </button>
            )}
          </Section>

          {/* DRAFTS */}
          <Section id="dl-listings" title="Marketplace listing drafts" badge={<KindBadge kind="mine" />}>
            <p className="text-sm text-[#183B2B]/85">
              Draft {inv.listings.counts.draft} · Pending Sync {inv.listings.counts.pending} · Sync Failed {inv.listings.counts.failed} · Published {inv.listings.counts.published}
            </p>
            {inv.listings.records.length === 0 ? (
              <p className="text-sm text-[#183B2B]/70">No listings saved on this phone. Make one in the <Link className="inline-flex items-center min-h-[44px] underline font-semibold text-[#16803C]" to="/marketplace">Marketplace</Link>.</p>
            ) : (
              <ul className="space-y-2">{inv.listings.records.map((r) => recordRow('listing', r))}</ul>
            )}
          </Section>

          <Section id="dl-questions" title="Expert question drafts" badge={<KindBadge kind="mine" />}>
            <p className="text-sm text-[#183B2B]/85">
              Draft {inv.questions.counts.draft} · Pending Sync {inv.questions.counts.pending} · Sync Failed {inv.questions.counts.failed} · Sent {inv.questions.counts.published}
            </p>
            {inv.questions.records.length === 0 ? (
              <p className="text-sm text-[#183B2B]/70">No questions saved on this phone. Write one in <Link className="inline-flex items-center min-h-[44px] underline font-semibold text-[#16803C]" to="/experts">Expert Support</Link>.</p>
            ) : (
              <ul className="space-y-2">{inv.questions.records.map((r) => recordRow('question', r))}</ul>
            )}
          </Section>

          {/* SYNC */}
          <Section id="dl-sync" title="Waiting to sync" icon={<CloudUpload className="w-5 h-5 text-[#16803C]" aria-hidden="true" />} badge={<KindBadge kind="mine" />}>
            <p className="text-sm text-[#183B2B]/85">
              Only items you marked <strong>Save &amp; Sync When Online</strong> or <strong>Send When Online</strong> wait here. Plain drafts are{' '}
              <strong>never sent automatically</strong>.
            </p>
            {inv.queue.length === 0 ? (
              <p className="text-sm text-[#183B2B]/70">Nothing is waiting to sync.</p>
            ) : (
              <ul className="space-y-2">
                {inv.queue.map((o) => (
                  <li key={o.opId} className="rounded-2xl border border-[#183B2B]/10 p-3 text-sm">
                    <p className="font-bold text-[#183B2B]">{o.kind === 'question.create' ? 'Send expert question' : o.kind === 'listing.update' ? 'Send listing changes' : 'Publish listing'}</p>
                    <p className="text-xs text-[#183B2B]/70">
                      {o.status === 'failed' ? 'Needs attention' : 'Waiting'} · {o.attempts} attempt{o.attempts === 1 ? '' : 's'}
                      {o.lastError ? ` · ${o.lastError}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => void setAutoSyncPaused(!paused)}
              aria-pressed={paused}
              className={`${btn} ${paused ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-[#183B2B]/20 bg-white text-[#183B2B]'}`}
            >
              {paused ? <Play className="w-4 h-4" aria-hidden="true" /> : <Pause className="w-4 h-4" aria-hidden="true" />}
              {paused ? 'Automatic sync is paused. Turn it on' : 'Pause automatic sync'}
            </button>
            <p className="text-xs text-[#183B2B]/70">
              {paused ? 'Nothing is sent until you tap Sync Now.' : 'Items you marked to send are sent when the internet returns.'}
            </p>
            <SyncBar />
          </Section>

          {/* WEATHER */}
          <Section id="dl-weather" title="Weather" badge={<KindBadge kind="sample" />}>
            {inv.weather.length === 0 ? (
              <p className="text-sm text-[#183B2B]/85">
                No live weather is saved, because no live weather service is connected in this prototype. The{' '}
                <Link to="/weather" className="inline-flex items-center min-h-[44px] underline font-semibold text-[#16803C]">Weather page</Link> shows bundled <strong>sample</strong> profiles, which are
                not forecasts.
              </p>
            ) : (
              <ul className="space-y-2">
                {inv.weather.map((w) => (
                  <li key={w.key} className="rounded-2xl border border-[#183B2B]/10 p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <strong>{w.key.replace('weather:', '')}</strong> · saved {formatExact(w.fetchedAt)}
                    </span>
                    <button type="button" onClick={() => void run('Saved weather removed.', () => cacheDelete(weatherKey(w.key.replace('weather:', ''))))} className={`${btn} border-[#183B2B]/20 bg-white text-[#183B2B]`}>
                      <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* MINISTRY */}
          <Section id="dl-ministry" title="Ministry dashboard information" badge={<><KindBadge kind="saved" /><KindBadge kind="synthetic" /></>}>
            <p className="text-xs text-[#183B2B]/75">
              Only four prototype counts are saved here. The rest of the Ministry page is synthetic demonstration data bundled with the app. This is not official
              Ministry information.
            </p>
            <SavedInfoBar
              label="Prototype counts from this server."
              fetchedAt={inv.ministry?.fetchedAt ?? null}
              fromSaved
              online={isOnline}
              refreshing={refreshingMinistry}
              refreshError={ministryError}
              onRefresh={() => void refreshMinistry()}
            >
              {inv.ministry && summaryFreshness(inv.ministry) === 'stale' && (
                <p role="status" className="text-xs font-bold text-amber-900">These counts are more than 24 hours old.</p>
              )}
              {!inv.ministry && <p className="text-sm font-semibold">Nothing saved yet. Tap Refresh while connected.</p>}
            </SavedInfoBar>
            {inv.ministry && (
              <button type="button" onClick={() => void run('Saved Ministry counts removed.', () => cacheDelete(MINISTRY_SUMMARY_KEY))} className={`${btn} border-[#183B2B]/20 bg-white text-[#183B2B]`}>
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Remove saved counts
              </button>
            )}
          </Section>

          {/* DANGER ZONE */}
          {unsent > 0 && (
            <Section id="dl-danger" title="Unsent items">
              <p className="text-sm text-[#183B2B]/85">
                You have <strong>{unsent}</strong> item{unsent === 1 ? '' : 's'} that the server does not have yet. Deleting them cannot be undone.
              </p>
              <button type="button" onClick={() => setPending({kind: 'all-unsent'})} className={`${btn} border-red-300 bg-red-50 text-red-800`}>
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete all unsent items…
              </button>
            </Section>
          )}
          <p className="text-[11px] text-[#183B2B]/55 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Checked {formatExact(inv.takenAt)}
          </p>
        </>
      )}

      {pending?.kind === 'guides' && (
        <ConfirmDialog title="Remove saved guides and pictures?" confirmLabel="Yes, remove them" onConfirm={confirmAction} onCancel={() => setPending(null)}>
          <p>This removes the Starter Pack, saved server guides and their pictures from this phone. You will need the internet to download them again.</p>
          <p>Your drafts, questions and audio are <strong>not</strong> affected.</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'audio' && (
        <ConfirmDialog title="Remove all audio lessons?" confirmLabel="Yes, remove audio" onConfirm={confirmAction} onCancel={() => setPending(null)}>
          <p>You will need the internet to download the audio again. Your drafts and guides are not affected.</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'record' && (
        <ConfirmDialog title={`Delete "${pending.title}"?`} confirmLabel="Yes, delete it" onConfirm={confirmAction} onCancel={() => setPending(null)}>
          <p>
            This item is <strong>{pending.status}</strong>. The server has <strong>not</strong> received it, so it exists only on this phone.
          </p>
          <p>If you delete it, it is gone for good and cannot be recovered.</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'all-unsent' && (
        <ConfirmDialog title={`Delete ${unsent} unsent item${unsent === 1 ? '' : 's'}?`} confirmLabel="Yes, delete all unsent" onConfirm={confirmAction} onCancel={() => setPending(null)}>
          <p>
            These listings and questions exist <strong>only on this phone</strong>. The server never received them, and they cannot be recovered.
          </p>
          <p>Items already published or sent are not affected, and nothing online is removed.</p>
        </ConfirmDialog>
      )}
    </div>
  );
};
