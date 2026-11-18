import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, Download, Loader2, PackageCheck, RefreshCw, X} from 'lucide-react';
import {useApp} from '../context/AppContext';
import {formatBytes} from '../lib/offlineStorage';
import {MODULES, subscribeLibrary} from '../lib/offlineLibrary';
import {
  checkStorageFor,
  downloadStarterPack,
  getStarterManifest,
  getStarterPackStatus,
  type PackProgress,
  type PackResult,
  type PackStatus,
  type StorageCheck,
} from '../lib/offlinePacks';

/** Estimated size of the server-side crop guides, shown separately because it needs the backend. */
const SERVER_GUIDES_NOTE = 'plus the crop and pest guides from the server (a few KB each)';

export const StarterPackCard: React.FC = () => {
  const {isOnline, language} = useApp();
  const manifest = React.useMemo(() => getStarterManifest(), []);
  const [status, setStatus] = useState<PackStatus | null>(null);
  const [storage, setStorage] = useState<StorageCheck | null>(null);
  const [progress, setProgress] = useState<PackProgress | null>(null);
  const [result, setResult] = useState<PackResult | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const totalBytes = manifest.textBytes + manifest.imageBytes;

  const refresh = useCallback(async () => {
    setStatus(await getStarterPackStatus());
    setStorage(await checkStorageFor(totalBytes));
  }, [totalBytes]);

  useEffect(() => {
    void refresh();
    // Re-measure free space whenever something that could change it happens, so a "not enough space"
    // warning clears itself once the farmer frees storage.
    const recheck = () => void refresh();
    const off = subscribeLibrary(recheck);
    window.addEventListener('focus', recheck);
    window.addEventListener('online', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      off();
      window.removeEventListener('focus', recheck);
      window.removeEventListener('online', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [refresh]);

  // Leaving the page must not leave a download running invisibly.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    if (running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResult(null);
    setProgress({phase: 'checking', done: 0, total: 1, bytes: 0, message: 'Starting…'});
    try {
      const r = await downloadStarterPack({language, signal: controller.signal, onProgress: setProgress});
      setResult(r);
    } catch (err) {
      setResult({
        status: 'failed',
        savedEntries: 0,
        savedImages: 0,
        savedGuides: 0,
        failures: [],
        quotaExceeded: false,
        message: err instanceof Error ? err.message : 'The download failed. Please try again.',
        finishedAt: new Date().toISOString(),
      });
    } finally {
      setRunning(false);
      abortRef.current = null;
      void refresh();
    }
  };

  const complete = Boolean(
    status &&
      status.entriesDone === status.entriesTotal &&
      status.imagesDone === status.imagesTotal &&
      status.needsUpdate === 0 &&
      status.lastRun?.status === 'complete'
  );
  const partiallySaved = Boolean(status && (status.entriesDone > 0 || status.imagesDone > 0) && !complete);
  const pct = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  const label = running
    ? 'Downloading…'
    : complete
    ? 'Check for updates'
    : partiallySaved
    ? result?.status === 'partial' || result?.status === 'failed'
      ? 'Retry'
      : 'Resume download'
    : 'Download Starter Pack';

  return (
    <section
      id="starter-pack"
      aria-labelledby="starter-pack-title"
      className="rounded-3xl bg-[#183B2B] text-white p-5 sm:p-7 space-y-5 scroll-mt-24"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#F5B942] text-[#183B2B] flex items-center justify-center shrink-0">
          <PackageCheck className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 id="starter-pack-title" className="font-display text-xl sm:text-2xl font-extrabold">
            Starter Pack for Offline Farming
          </h2>
          <p className="text-sm text-white/85">
            Save the essential advice from all six modules to this phone <strong>before</strong> you go to the field. It works
            without internet afterwards.
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        {MODULES.map((m) => (
          <li key={m.key} className="rounded-xl bg-white/10 px-3 py-2 flex items-center justify-between gap-2">
            <span>{m.label}</span>
            <span className="font-bold tabular-nums">{manifest.byModule[m.key]}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-white/75">
        Pests &amp; Diseases and Crops also include guides from the server when you are online ({SERVER_GUIDES_NOTE}).
      </p>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <dt className="text-white/65 text-xs">Guides</dt>
          <dd className="font-bold tabular-nums">{manifest.entries.length}</dd>
        </div>
        <div>
          <dt className="text-white/65 text-xs">Pictures</dt>
          <dd className="font-bold tabular-nums">{manifest.imageUrls.length} (small WebP)</dd>
        </div>
        <div>
          <dt className="text-white/65 text-xs">Download size</dt>
          <dd className="font-bold tabular-nums">about {formatBytes(totalBytes)}</dd>
        </div>
        <div>
          <dt className="text-white/65 text-xs">Free space</dt>
          <dd className="font-bold tabular-nums">{storage?.freeBytes != null ? formatBytes(storage.freeBytes) : 'Unknown'}</dd>
        </div>
      </dl>

      {storage && !storage.ok && (
        <p role="alert" className="rounded-xl bg-[#F5B942]/20 border border-[#F5B942]/60 px-4 py-3 text-sm flex gap-2">
          <AlertTriangle className="w-5 h-5 text-[#F5B942] shrink-0" aria-hidden="true" />
          <span>
            Not enough free space (needs about {formatBytes(totalBytes)}). Remove some downloads below, then try again.{' '}
            <button type="button" onClick={() => void refresh()} className="underline font-bold min-h-[44px] px-1">
              Check storage again
            </button>
          </span>
        </p>
      )}

      {status && !running && (
        <p className="text-sm text-white/85">
          Saved on this device: <strong>{status.entriesDone}</strong> of {status.entriesTotal} guides and{' '}
          <strong>{status.imagesDone}</strong> of {status.imagesTotal} pictures
          {status.needsUpdate > 0 ? ` · ${status.needsUpdate} have a newer version` : ''}.
        </p>
      )}

      {running && progress && (
        <div className="space-y-2" aria-live="polite">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Starter Pack download progress"
            className="h-3 rounded-full bg-white/20 overflow-hidden"
          >
            <div className="h-full bg-[#F5B942] transition-all" style={{width: `${pct}%`}} />
          </div>
          <p className="text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>
              {progress.message} · {pct}% · {formatBytes(progress.bytes)} saved
            </span>
          </p>
        </div>
      )}

      {result && !running && (
        <div
          role={result.status === 'complete' ? 'status' : 'alert'}
          className={`rounded-xl px-4 py-3 text-sm flex gap-2 ${
            result.status === 'complete' ? 'bg-[#16803C]/40 border border-[#9BE3B0]/60' : 'bg-[#F5B942]/20 border border-[#F5B942]/60'
          }`}
        >
          {result.status === 'complete' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-[#9BE3B0]" aria-hidden="true" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-[#F5B942]" aria-hidden="true" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">{result.message}</p>
            <p className="text-white/80 text-xs">
              This run saved {result.savedEntries} guides, {result.savedImages} pictures and {result.savedGuides} server guides.
            </p>
            {result.failures.length > 0 && (
              <ul className="text-xs text-white/80 list-disc pl-4">
                {Array.from(new Set(result.failures.map((f) => f.reason))).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={running || !isOnline || (storage ? !storage.ok : false)}
          className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-2xl bg-[#F5B942] text-[#183B2B] font-bold text-sm disabled:opacity-50"
        >
          {complete ? <RefreshCw className="w-4 h-4" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
          <span>{label}</span>
        </button>
        {running && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-2xl border border-white/40 text-sm font-semibold"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Cancel</span>
          </button>
        )}
      </div>
      {typeof window !== 'undefined' && !window.isSecureContext && (
        <p role="note" className="text-sm text-[#F5B942]">
          This address is not secure (http://). Guides and pictures are saved to the phone, but the app cannot be installed or opened without
          internet until you use the https:// address. See "Can this phone use the app offline?" above.
        </p>
      )}
      {!isOnline && (
        <p className="text-xs text-[#F5B942]">You are offline. Connect to the internet to download the Starter Pack.</p>
      )}
    </section>
  );
};
