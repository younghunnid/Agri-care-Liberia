import React, {useState} from 'react';
import {AlertTriangle, CheckCircle2, CloudUpload, Loader2} from 'lucide-react';
import {useApp} from '../context/AppContext';
import {useSyncState, syncNow} from '../lib/syncEngine';

function formatWhen(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Never' : d.toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'});
}

/** Last sync time, how many items wait, and a large Sync Now button. */
export const SyncBar: React.FC<{className?: string}> = ({className = ''}) => {
  const {isOnline} = useApp();
  const s = useSyncState();
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setMessage(null);
    const r = await syncNow({manual: true});
    setMessage(r.message);
  };

  return (
    <div className={`rounded-2xl bg-white border border-[#183B2B]/10 p-4 space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-[#183B2B] flex items-center gap-2">
            <CloudUpload className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
            <span>
              {s.queued + s.failed === 0
                ? 'Nothing waiting to sync'
                : `${s.queued} waiting · ${s.failed} need attention`}
            </span>
          </p>
          <p className="text-xs text-[#183B2B]/70">Last successful sync: {formatWhen(s.lastSyncAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={s.syncing || !isOnline}
          className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-2xl bg-[#16803C] text-white text-sm font-bold disabled:opacity-50"
        >
          {s.syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CloudUpload className="w-4 h-4" aria-hidden="true" />}
          <span>{s.syncing ? 'Syncing…' : 'Sync Now'}</span>
        </button>
      </div>
      {!isOnline && <p className="text-xs text-amber-800">You are offline. Items stay safe on this phone and send when you are back online.</p>}
      {(message || s.lastRunMessage) && !s.syncing && (
        <p role="status" className="text-xs font-medium text-[#183B2B]">
          {message ?? s.lastRunMessage}
        </p>
      )}
    </div>
  );
};

/** Slim global notice; only visible while something is waiting, failing, or sending. */
export const SyncBanner: React.FC = () => {
  const s = useSyncState();
  const {isOnline} = useApp();
  if (s.queued + s.failed === 0 && !s.syncing) return null;
  return (
    <div
      role="status"
      className={`px-4 py-2 text-xs sm:text-sm font-semibold flex flex-wrap items-center justify-center gap-x-3 gap-y-1 ${
        s.failed > 0 ? 'bg-red-50 text-red-900' : 'bg-[#DDEFE0] text-[#183B2B]'
      }`}
    >
      {s.syncing ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : s.failed > 0 ? (
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
      )}
      <span>
        {s.syncing
          ? 'Syncing your saved items…'
          : `${s.queued} item${s.queued === 1 ? '' : 's'} saved on this phone waiting to sync${s.failed ? ` · ${s.failed} need attention` : ''}`}
      </span>
      {!s.syncing && isOnline && (
        <button type="button" onClick={() => void syncNow({manual: true})} className="min-h-[44px] px-3 rounded-lg bg-white/80 border border-current/20 font-bold">
          Sync Now
        </button>
      )}
    </div>
  );
};
