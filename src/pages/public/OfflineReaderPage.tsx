import React, {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {AlertTriangle, ArrowLeft, Clock, ShieldAlert, WifiOff} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {
  formatDate,
  getCatalogEntry,
  getLibraryEntry,
  hasNewerVersion,
  isEntryDownloaded,
  isOutdated,
  moduleLabel,
  subscribeLibrary,
  type LibraryEntry,
} from '../../lib/offlineLibrary';
import {downloadBundledEntry, friendlyDownloadError} from '../../lib/offlinePacks';

/** Reads a guide from the offline library. Works with no network and no backend. */
export const OfflineReaderPage: React.FC = () => {
  const {id: rawId} = useParams<{id: string}>();
  const id = decodeURIComponent(rawId ?? '');
  const {isOnline, lowBandwidth} = useApp();
  const [entry, setEntry] = useState<LibraryEntry | null>(() => getLibraryEntry(id));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEntry(getLibraryEntry(id));
    return subscribeLibrary(() => setEntry(getLibraryEntry(id)));
  }, [id]);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadBundledEntry(id);
    } catch (err) {
      setError(friendlyDownloadError(err));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link to="/offline" className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-[#16803C] hover:underline">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      <span>Back to Offline Library</span>
    </Link>
  );

  if (!entry) {
    const known = getCatalogEntry(id);
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {back}
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-8 text-center space-y-3">
          <h1 className="font-display text-xl font-bold text-[#183B2B]">
            {known ? known.title : 'Guide not found'}
          </h1>
          <p className="text-sm text-[#183B2B]/75">
            {known
              ? 'This guide is not saved on this device yet.'
              : 'This guide is not in your offline library.'}
          </p>
          {known && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void download()}
              className="min-h-[44px] px-5 rounded-xl bg-[#16803C] text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save for offline use'}
            </button>
          )}
          {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        </div>
      </div>
    );
  }

  const outdated = isOutdated(entry.lastUpdated);
  const newer = hasNewerVersion(entry);
  const related = entry.relatedIds
    .map((rid) => ({id: rid, cat: getCatalogEntry(rid), saved: isEntryDownloaded(rid)}))
    .filter((r) => r.cat);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      {back}

      {!isOnline && (
        <div className="rounded-2xl bg-[#F5B942]/30 border border-[#F5B942] p-3 flex items-center gap-2 text-sm font-medium">
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Offline: reading the copy saved on this device.</span>
        </div>
      )}

      <article className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden">
        {!lowBandwidth && entry.imageUrl && (
          <div className="h-48 sm:h-64 bg-[#DDEFE0]">
            <SafeImage src={entry.imageUrl} alt={entry.title} className="w-full h-full object-cover" fallbackTitle={entry.title} />
          </div>
        )}
        <div className="p-5 sm:p-8 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#16803C]">
              {moduleLabel(entry.module)} · {entry.subtitle}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#183B2B] leading-tight">{entry.title}</h1>
            <p className="text-base text-[#183B2B]/85">{entry.summary}</p>
            <p className="text-xs text-[#183B2B]/70 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                Last updated {formatDate(entry.lastUpdated)}
              </span>
              <span>Saved {formatDate(entry.downloadedAt)}</span>
              <span>Language: English</span>
            </p>
            {outdated && (
              <p role="status" className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-sm text-amber-900 flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  This guide was last updated over a year ago and may be outdated. Check with your local extension officer before
                  relying on it, and refresh it when you are online.
                </span>
              </p>
            )}
            {newer && (
              <p role="status" className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900">
                A newer version of this guide is available. Open the Offline Library while online and tap Update.
              </p>
            )}
          </div>

          {entry.sections.map((s) => (
            <section key={s.heading} className="space-y-2">
              <h2 className="font-display text-lg font-bold text-[#183B2B]">{s.heading}</h2>
              {s.items.length === 1 ? (
                <p className="text-sm sm:text-base text-[#183B2B]/90 leading-relaxed">{s.items[0]}</p>
              ) : (
                <ul className="list-disc pl-5 space-y-1.5 text-sm sm:text-base text-[#183B2B]/90 leading-relaxed">
                  {s.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {entry.safetyNotice && (
            <aside
              aria-label="Safety notice"
              className="rounded-2xl bg-[#F5B942]/25 border border-[#F5B942] p-4 flex gap-3 text-sm text-[#183B2B]"
            >
              <ShieldAlert className="w-5 h-5 shrink-0 text-[#8A5A00]" aria-hidden="true" />
              <div>
                <p className="font-bold">Safety notice</p>
                <p>{entry.safetyNotice}</p>
              </div>
            </aside>
          )}

          {related.length > 0 && (
            <section className="space-y-2 border-t border-[#183B2B]/10 pt-4">
              <h2 className="font-display text-base font-bold text-[#183B2B]">Related guides</h2>
              <ul className="space-y-1.5 text-sm">
                {related.map((r) => (
                  <li key={r.id}>
                    {r.saved ? (
                      <Link to={`/offline/read/${encodeURIComponent(r.id)}`} className="text-[#16803C] font-semibold hover:underline">
                        {r.cat!.title}
                      </Link>
                    ) : (
                      <span className="text-[#183B2B]/65">{r.cat!.title} (not saved offline)</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </article>
    </div>
  );
};
