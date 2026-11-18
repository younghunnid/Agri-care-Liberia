import React, {useState, useSyncExternalStore} from 'react';
import {AlertTriangle, CheckCircle2, Clock, Pencil, RefreshCw, Smartphone, Trash2, X} from 'lucide-react';
import {useApp} from '../context/AppContext';
import {
  cancelSync,
  deleteLocalRecord,
  getListingRecords,
  getQuestionRecords,
  getSyncOps,
  getSyncVersion,
  putOp,
  queueRecord,
  STATUS_LABEL,
  subscribeSync,
  type ListingRecord,
  type QuestionRecord,
  type RecordStatus,
} from '../lib/offlineDrafts';
import {syncNow, syncSoon} from '../lib/syncEngine';
import {SyncBar} from './SyncStatus';

function useSyncVersion(): number {
  return useSyncExternalStore(subscribeSync, getSyncVersion, getSyncVersion);
}

const BADGE: Record<RecordStatus, string> = {
  draft: 'bg-gray-100 text-gray-800 border-gray-300',
  pending: 'bg-amber-100 text-amber-900 border-amber-300',
  failed: 'bg-red-100 text-red-800 border-red-300',
  published: 'bg-[#DDEFE0] text-[#16803C] border-[#16803C]/30',
};

export const StatusBadge: React.FC<{status: RecordStatus; sent?: boolean; edited?: boolean}> = ({status, sent, edited}) => {
  const label = sent && status === 'published' ? 'Sent to Expert' : edited && status === 'draft' ? 'Draft changes' : STATUS_LABEL[status];
  const Icon = status === 'published' ? CheckCircle2 : status === 'failed' ? AlertTriangle : status === 'pending' ? Clock : Smartphone;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${BADGE[status]}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {label}
    </span>
  );
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
}

const btn = 'inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border text-xs font-bold';

function useActionRunner() {
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Your item is still on this phone.');
    }
  };
  return {error, run};
}

// ---------------------------------------------------------------- listings

export const LocalListingsPanel: React.FC<{onEdit: (rec: ListingRecord) => void}> = ({onEdit}) => {
  useSyncVersion();
  const {isOnline, lowBandwidth} = useApp();
  const {error, run} = useActionRunner();
  const records = getListingRecords();
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const send = (rec: ListingRecord) =>
    run(async () => {
      await queueRecord('listing', rec.localId);
      syncSoon();
    });

  return (
    <section aria-labelledby="local-listings-title" className="rounded-3xl bg-[#F3F8F0] border border-[#16803C]/25 p-4 sm:p-6 space-y-3">
      <div>
        <h2 id="local-listings-title" className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
          <span>Saved on This Phone</span>
        </h2>
        <p className="text-xs text-[#183B2B]/75">
          Only you can see these. A listing is <strong>not on the marketplace</strong> until the server confirms it and it says{' '}
          <strong>Published</strong>.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {sorted.map((rec) => {
        const d = rec.data;
        const op = getSyncOps().find((o) => o.localId === rec.localId);
        const published = rec.status === 'published';
        return (
          <article key={rec.localId} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                {!lowBandwidth && d.photoDataUrl && (
                  <img src={d.photoDataUrl} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                )}
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-[#183B2B] truncate">{d.productName}</h3>
                  <p className="text-xs text-[#183B2B]/75">
                    {d.quantity} {d.unit} · LRD {Number(d.priceLrd).toLocaleString()} · {d.town}, {d.county}
                  </p>
                  <p className="text-xs text-[#183B2B]/60">
                    Saved {when(rec.updatedAt)}
                    {rec.syncedAt && published ? ` · Confirmed ${when(rec.syncedAt)}` : ''}
                  </p>
                </div>
              </div>
              <StatusBadge status={rec.status} edited={Boolean(rec.serverId)} />
            </div>

            <p className="text-xs font-semibold text-[#183B2B]/80">
              {published ? 'Published Online — buyers can see this listing.' : rec.serverId ? 'Online listing is unchanged until your edits sync.' : 'Saved on this phone only — not online yet.'}
              {d.phoneConsent ? ' · Phone number will be shown (you agreed).' : ' · No phone number will be sent.'}
            </p>

            {rec.status === 'failed' && (
              <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                {rec.lastError || 'Sync failed.'} Your listing is still saved here.
              </p>
            )}
            {rec.status === 'pending' && op?.lastError && (
              <p className="text-xs text-amber-900">
                {op.lastError} Retrying automatically (attempt {op.attempts}).
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {(rec.status === 'draft' || rec.status === 'failed' || published) && (
                <button type="button" onClick={() => onEdit(rec)} className={`${btn} border-[#183B2B]/20 text-[#183B2B] bg-white`}>
                  <Pencil className="w-4 h-4" aria-hidden="true" /> Edit
                </button>
              )}
              {rec.status === 'draft' && (!published) && (
                <button
                  type="button"
                  onClick={() => void send(rec)}
                  className={`${btn} border-[#16803C] bg-[#16803C] text-white`}
                >
                  {isOnline ? (rec.serverId ? 'Send My Changes' : 'Publish Now') : rec.serverId ? 'Send Changes When Online' : 'Publish When Online'}
                </button>
              )}
              {rec.status === 'failed' && rec.conflict && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await queueRecord('listing', rec.localId);
                        const o = getSyncOps().find((x) => x.localId === rec.localId);
                        if (o) await putOp({...o, force: true});
                        syncSoon();
                      })
                    }
                    className={`${btn} border-amber-600 bg-amber-50 text-amber-900`}
                  >
                    Keep My Changes
                  </button>
                  <button type="button" onClick={() => void run(() => deleteLocalRecord('listing', rec.localId))} className={`${btn} border-[#183B2B]/20 bg-white`}>
                    Discard My Changes
                  </button>
                </>
              )}
              {rec.status === 'failed' && !rec.conflict && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await queueRecord('listing', rec.localId);
                      void syncNow({manual: true});
                    })
                  }
                  className={`${btn} border-[#16803C] bg-[#16803C] text-white`}
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try Again
                </button>
              )}
              {rec.status === 'pending' && (
                <button type="button" onClick={() => void run(() => cancelSync('listing', rec.localId))} className={`${btn} border-[#183B2B]/20 bg-white`}>
                  <X className="w-4 h-4" aria-hidden="true" /> Cancel Sync
                </button>
              )}
              {rec.status !== 'pending' && !(rec.status === 'failed' && rec.conflict) && (
                <button
                  type="button"
                  onClick={() => void run(() => deleteLocalRecord('listing', rec.localId))}
                  aria-label={published ? `Remove ${d.productName} from this phone` : `Delete draft ${d.productName}`}
                  className={`${btn} border-red-200 text-red-700 bg-white`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" /> {published ? 'Remove From Phone' : 'Delete'}
                </button>
              )}
            </div>
            {published && <p className="text-[11px] text-[#183B2B]/60">Removing it from the phone does not remove the online listing.</p>}
          </article>
        );
      })}
      <SyncBar />
    </section>
  );
};

// ---------------------------------------------------------------- questions

export const LocalQuestionsPanel: React.FC = () => {
  useSyncVersion();
  const {isOnline} = useApp();
  const {error, run} = useActionRunner();
  const records = getQuestionRecords();
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const send = (rec: QuestionRecord) =>
    run(async () => {
      await queueRecord('question', rec.localId);
      syncSoon();
    });

  return (
    <section aria-labelledby="local-questions-title" className="rounded-3xl bg-[#F3F8F0] border border-[#16803C]/25 p-4 sm:p-6 space-y-3">
      <div>
        <h2 id="local-questions-title" className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
          <span>Questions Saved on This Phone</span>
        </h2>
        <p className="text-xs text-[#183B2B]/75">
          An expert can only see a question after it says <strong>Sent to Expert</strong>. Answers need internet; you will find them under
          Recent Requests once you are online.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {sorted.map((rec) => {
        const d = rec.data;
        const op = getSyncOps().find((o) => o.localId === rec.localId);
        return (
          <article key={rec.localId} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display font-bold text-[#183B2B]">{d.title}</h3>
                <p className="text-xs text-[#183B2B]/60">
                  Written {when(rec.createdAt)} · {d.county}
                  {d.photoDataUrl ? ' · Photo' : ''}
                  {d.voiceNoteDataUrl ? ' · Voice note' : ''}
                </p>
              </div>
              <StatusBadge status={rec.status} sent />
            </div>
            <p className="text-sm text-[#183B2B]/85 line-clamp-3">{d.description}</p>
            {rec.status === 'failed' && (
              <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                {rec.lastError || 'Sync failed.'} Your question is still saved here.
              </p>
            )}
            {rec.status === 'pending' && op?.lastError && <p className="text-xs text-amber-900">{op.lastError}</p>}
            <div className="flex flex-wrap gap-2">
              {rec.status === 'draft' && (
                <button type="button" onClick={() => void send(rec)} className={`${btn} border-[#16803C] bg-[#16803C] text-white`}>
                  {isOnline ? 'Send to Expert' : 'Send When Online'}
                </button>
              )}
              {rec.status === 'failed' && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      await queueRecord('question', rec.localId);
                      void syncNow({manual: true});
                    })
                  }
                  className={`${btn} border-[#16803C] bg-[#16803C] text-white`}
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try Again
                </button>
              )}
              {rec.status === 'pending' && (
                <button type="button" onClick={() => void run(() => cancelSync('question', rec.localId))} className={`${btn} border-[#183B2B]/20 bg-white`}>
                  <X className="w-4 h-4" aria-hidden="true" /> Cancel Sync
                </button>
              )}
              {rec.status !== 'pending' && (
                <button type="button" onClick={() => void run(() => deleteLocalRecord('question', rec.localId))} className={`${btn} border-red-200 text-red-700 bg-white`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" /> {rec.status === 'published' ? 'Remove From Phone' : 'Delete'}
                </button>
              )}
            </div>
          </article>
        );
      })}
      <SyncBar />
    </section>
  );
};
