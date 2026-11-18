import React from 'react';
import {AlertTriangle, Clock, Loader2, RefreshCw, WifiOff, Wifi} from 'lucide-react';
import {formatAge, formatExact} from '../lib/dataCache';

interface Props {
  /** What the information is, e.g. "Marketplace counts". */
  label: string;
  /** Exact time the data was last successfully retrieved; null if nothing is saved. */
  fetchedAt: string | null;
  /** True when what is shown comes from the saved copy rather than a request just made. */
  fromSaved: boolean;
  online: boolean;
  refreshing?: boolean;
  /** Why the last refresh failed (saved information was kept). */
  refreshError?: string | null;
  onRefresh?: () => void;
  /** Extra line(s) such as "Valid until ...". */
  children?: React.ReactNode;
}

/** Says plainly whether information is live or saved, and exactly when it was retrieved. */
export const SavedInfoBar: React.FC<Props> = ({label, fetchedAt, fromSaved, online, refreshing, refreshError, onRefresh, children}) => {
  const saved = fromSaved || !online;
  return (
    <div
      className={`rounded-2xl border p-4 space-y-2 ${saved ? 'bg-amber-50 border-amber-300' : 'bg-[#DDEFE0] border-[#16803C]/30'}`}
      data-testid="saved-info-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className={`inline-flex items-center gap-2 text-sm font-extrabold ${saved ? 'text-amber-900' : 'text-[#16803C]'}`}>
            {saved ? <WifiOff className="w-4 h-4" aria-hidden="true" /> : <Wifi className="w-4 h-4" aria-hidden="true" />}
            {saved ? 'Saved Information — Not Live' : 'Retrieved from the server just now'}
          </p>
          <p className="text-xs text-[#183B2B]/85">{label}</p>
          <p className="text-xs text-[#183B2B] flex flex-wrap items-center gap-x-2">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            {fetchedAt ? (
              <>
                <span>
                  Last successfully updated: <strong>{formatExact(fetchedAt)}</strong>
                </span>
                <span>({formatAge(fetchedAt)})</span>
              </>
            ) : (
              <span>Never updated on this phone</span>
            )}
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={!online || refreshing}
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-2xl bg-[#16803C] text-white text-sm font-bold disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>
      {!online && onRefresh && <p className="text-xs text-amber-900">Connect to the internet to refresh.</p>}
      {refreshError && (
        <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {refreshError}
            {fetchedAt ? ` Your saved information from ${formatExact(fetchedAt)} was kept.` : ''}
          </span>
        </p>
      )}
      {children}
    </div>
  );
};
