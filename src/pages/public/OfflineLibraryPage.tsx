import React, {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {apiFetch} from '../../lib/api';
import {
  clearAllOfflineGuides,
  estimateOfflineStorageBytes,
  formatBytes,
  getOfflineGuides,
  type OfflineGuideRecord,
  removeOfflineGuide,
  saveGuideOffline,
} from '../../lib/offlineStorage';
import {PWAInstallButton} from '../../components/PWAInstallButton';
import {StarterPackCard} from '../../components/StarterPackCard';
import {OfflineAudioManager} from '../../components/AudioLessonCard';
import {useAudioStore, formatAudioSize} from '../../lib/audioStore';
import {SyncBar} from '../../components/SyncStatus';
import {
  formatDate,
  getCachedImageBytes,
  getCatalog,
  getLibraryEntries,
  hasNewerVersion,
  isEntryDownloaded,
  isOutdated,
  MODULES,
  moduleLabel,
  pruneUnusedImages,
  removeLibraryEntry,
  searchOffline,
  subscribeLibrary,
  type ModuleKey,
} from '../../lib/offlineLibrary';
import {downloadBundledEntry, friendlyDownloadError} from '../../lib/offlinePacks';

export const OfflineLibraryPage: React.FC = () => {
  const {isOnline, language} = useApp();
  const [guides, setGuides] = useState<OfflineGuideRecord[]>(() => getOfflineGuides());
  const [bytesUsed, setBytesUsed] = useState(() => estimateOfflineStorageBytes());
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<ModuleKey | 'all'>('all');
  const [libVersion, setLibVersion] = useState(0);
  const [imageBytes, setImageBytes] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  useEffect(() => subscribeLibrary(() => setLibVersion((v) => v + 1)), []);

  const libEntries = useMemo(() => getLibraryEntries(), [libVersion]);

  useEffect(() => {
    void getCachedImageBytes().then((m) => setImageBytes(Object.values(m).reduce((a, b) => a + b, 0)));
  }, [libVersion, guides.length]);

  const {totalBytes: audioBytes} = useAudioStore();
  const libraryBytes = libEntries.reduce((n, e) => n + e.sizeBytes, 0);
  const totalBytes = bytesUsed + libraryBytes + imageBytes + audioBytes;

  // Scroll to the Starter Pack when arriving from /offline#starter-pack.
  useEffect(() => {
    if (window.location.hash === '#starter-pack') {
      document.getElementById('starter-pack')?.scrollIntoView({block: 'start'});
    }
  }, []);

  const refreshState = () => {
    setGuides(getOfflineGuides());
    setBytesUsed(estimateOfflineStorageBytes());
  };

  const handleRemove = async (id: number) => {
    setErrorMessage(null);
    try {
      await removeOfflineGuide(id);
      refreshState();
      setStatusMessage('Removed guide from offline storage.');
    } catch (err) {
      setErrorMessage(friendlyDownloadError(err));
    }
  };

  const handleClearAll = async () => {
    setErrorMessage(null);
    try {
      await clearAllOfflineGuides();
      refreshState();
      setStatusMessage('Cleared all downloaded server guides.');
    } catch (err) {
      setErrorMessage(friendlyDownloadError(err));
    }
  };

  const handleSaveEntry = async (id: string) => {
    setBusyId(id);
    setErrorMessage(null);
    try {
      await downloadBundledEntry(id);
      setStatusMessage('Guide saved for offline use.');
    } catch (err) {
      setErrorMessage(friendlyDownloadError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveEntry = async (id: string) => {
    setErrorMessage(null);
    try {
      await removeLibraryEntry(id);
      await pruneUnusedImages();
      setStatusMessage('Removed guide from offline storage.');
    } catch (err) {
      setErrorMessage(friendlyDownloadError(err));
    }
  };

  const handleRemoveAllLibrary = async () => {
    setErrorMessage(null);
    try {
      for (const e of getLibraryEntries()) await removeLibraryEntry(e.id);
      await pruneUnusedImages();
      setStatusMessage('Removed all Starter Pack guides from this device.');
    } catch (err) {
      setErrorMessage(friendlyDownloadError(err));
    }
  };

  const results = useMemo(
    () => (query.trim() || moduleFilter !== 'all' ? searchOffline(query, moduleFilter) : []),
    [query, moduleFilter, libVersion, guides.length]
  );
  const searching = Boolean(query.trim()) || moduleFilter !== 'all';

  const handleCheckUpdates = async () => {
    if (!isOnline || guides.length === 0) return;
    setCheckingUpdates(true);
    setStatusMessage(null);
    let updatedCount = 0;

    try {
      for (const local of guides) {
        try {
          const res = await apiFetch<{
            guide: {
              id: number;
              slug: string;
              title: string;
              summary: string;
              contentMarkdown: string;
              imageUrl: string;
              languageCode: string;
              sourceAttribution: string;
              isSampleDemo: boolean;
              isPestDisease: boolean;
              reviewStatus: string;
              reviewedByName: string | null;
              lastReviewedAt: string | null;
              version: number;
              crop: {slug: string; name: string};
              category: {name: string};
            };
          }>(`/guides/${local.id}?lang=${language}`);

          if (res.guide.version > local.version || res.guide.languageCode !== local.languageCode) {
            await saveGuideOffline({
              id: res.guide.id,
              slug: res.guide.slug,
              title: res.guide.title,
              summary: res.guide.summary,
              contentMarkdown: res.guide.contentMarkdown,
              imageUrl: res.guide.imageUrl,
              languageCode: res.guide.languageCode,
              sourceAttribution: res.guide.sourceAttribution,
              isSampleDemo: res.guide.isSampleDemo,
              isPestDisease: res.guide.isPestDisease,
              reviewStatus: res.guide.reviewStatus,
              reviewedByName: res.guide.reviewedByName,
              lastReviewedAt: res.guide.lastReviewedAt,
              version: res.guide.version,
              cropName: res.guide.crop.name,
              cropSlug: res.guide.crop.slug,
              categoryName: res.guide.category.name,
            });
            updatedCount++;
          }
        } catch {
          // Skip guide if unavailable
        }
      }
      refreshState();
      setStatusMessage(
        updatedCount > 0
          ? `Updated ${updatedCount} offline guide(s) to the latest version.`
          : 'All downloaded guides are already up to date.'
      );
    } finally {
      setCheckingUpdates(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#16803C]">PWA &amp; Field Access</p>
          <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">Offline Library</h1>
          <p className="text-sm sm:text-base text-[#183B2B]/80 max-w-2xl">
            Read approved guides without internet connectivity. Only public agricultural guides are cached—never passwords, private expert chats, or sensitive account details.
          </p>
        </div>
        <PWAInstallButton />
      </div>

      {/* Status & Storage Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-5 space-y-1">
          <p className="text-xs text-[#183B2B]/65">Connectivity</p>
          <p className="font-display text-lg font-bold flex items-center gap-2">
            {isOnline ? (
              <>
                <Wifi className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-5 h-5 text-amber-700" aria-hidden="true" />
                <span>Offline</span>
              </>
            )}
          </p>
        </div>
        <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-5 space-y-1">
          <p className="text-xs text-[#183B2B]/65">Downloaded Guides</p>
          <p className="font-display text-lg font-bold tabular-nums">{guides.length + libEntries.length} guides</p>
        </div>
        <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-5 space-y-1">
          <p className="text-xs text-[#183B2B]/65">Storage Used</p>
          <p className="font-display text-lg font-bold tabular-nums">{formatBytes(totalBytes)}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-[#DDEFE0]/70 border border-[#16803C]/20 p-4 text-xs sm:text-sm text-[#183B2B]">
        <strong>Honest Offline Scope:</strong> Saved crop guides open anytime without mobile data. Live AI Advisor questions and Expert Support messaging require an active internet connection.
      </div>

      {statusMessage && (
        <div role="status" className="rounded-xl bg-white border border-[#16803C]/30 px-4 py-3 text-sm font-medium text-[#183B2B]">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-800">
          {errorMessage}
        </div>
      )}

      <Link
        to="/downloads"
        className="inline-flex items-center min-h-[48px] px-5 rounded-2xl border-2 border-[#16803C] text-[#16803C] text-sm font-bold bg-white"
      >
        Manage everything saved on this phone
      </Link>

      <section aria-labelledby="sync-title" className="space-y-2">
        <h2 id="sync-title" className="font-display text-xl font-bold text-[#183B2B]">
          Synchronization
        </h2>
        <p className="text-xs text-[#183B2B]/75">
          Listings and questions you save while offline are kept on this phone and sent when you reconnect. See them under{' '}
          <Link to="/marketplace" className="inline-flex items-center min-h-[44px] font-semibold text-[#16803C] underline">Marketplace</Link> and{' '}
          <Link to="/experts" className="inline-flex items-center min-h-[44px] font-semibold text-[#16803C] underline">Expert Support</Link>.
        </p>
        <SyncBar />
      </section>

      <StarterPackCard />

      <OfflineAudioManager />

      {/* Search saved guides (works offline) */}
      <section aria-labelledby="offline-search-title" className="space-y-3">
        <h2 id="offline-search-title" className="font-display text-xl font-bold text-[#183B2B]">
          Search saved guides
        </h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#183B2B]/50" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved guides, e.g. rice, goat, pond"
            aria-label="Search saved guides"
            className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-[#183B2B]/20 bg-white text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by module">
          {[{key: 'all' as const, label: 'All'}, ...MODULES].map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={moduleFilter === m.key}
              onClick={() => setModuleFilter(m.key)}
              className={`min-h-[44px] px-3.5 rounded-full text-xs font-semibold border ${
                moduleFilter === m.key ? 'bg-[#183B2B] text-white border-[#183B2B]' : 'bg-white text-[#183B2B] border-[#183B2B]/20'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {searching && (
          <div className="space-y-2" aria-live="polite">
            <p className="text-xs text-[#183B2B]/70">
              {results.length} saved guide{results.length === 1 ? '' : 's'} found
            </p>
            {results.length === 0 && (
              <p className="rounded-xl bg-white border border-[#183B2B]/10 p-4 text-sm text-[#183B2B]/75">
                Nothing saved matches. Download the Starter Pack or more guides, then search again.
              </p>
            )}
            {results.map((r) => (
              <Link
                key={`${r.kind}-${r.id}`}
                to={r.to}
                className="block rounded-2xl bg-white border border-[#183B2B]/10 p-4 hover:border-[#16803C]"
              >
                <p className="text-xs font-semibold text-[#16803C]">
                  {moduleLabel(r.module)}
                  {r.lastUpdated ? ` · Updated ${formatDate(r.lastUpdated)}` : ''}
                  {r.outdated ? ' · May be outdated' : ''}
                </p>
                <p className="font-display font-bold text-[#183B2B]">{r.title}</p>
                <p className="text-xs text-[#183B2B]/75 mt-0.5">{r.snippet}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Saved bundled guides */}
      {libEntries.length > 0 && !searching && (
        <section className="space-y-3" aria-labelledby="saved-bundled-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="saved-bundled-title" className="font-display text-xl font-bold text-[#183B2B]">
              Saved on this device ({libEntries.length})
            </h2>
            <button
              type="button"
              onClick={() => void handleRemoveAllLibrary()}
              className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Remove all Starter Pack guides
            </button>
          </div>
          {MODULES.map((m) => {
            const items = libEntries.filter((e) => e.module === m.key);
            if (items.length === 0) return null;
            return (
              <div key={m.key} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#183B2B]/60">{m.label}</h3>
                {items.map((e) => (
                  <div key={e.id} className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/offline/read/${encodeURIComponent(e.id)}`} className="font-display font-bold text-[#183B2B] hover:text-[#16803C]">
                        {e.title}
                      </Link>
                      <p className="text-xs text-[#183B2B]/70">
                        Updated {formatDate(e.lastUpdated)} · {formatBytes(e.sizeBytes)}
                        {isOutdated(e.lastUpdated) && <strong className="text-amber-800"> · May be outdated</strong>}
                        {hasNewerVersion(e) && <strong className="text-blue-800"> · Update available</strong>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemoveEntry(e.id)}
                      aria-label={`Remove ${e.title} from offline library`}
                      className="min-h-[44px] min-w-[44px] shrink-0 inline-flex items-center justify-center rounded-xl border border-[#183B2B]/15 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {/* Individual downloads */}
      <section className="space-y-3" aria-labelledby="individual-title">
        <button
          type="button"
          aria-expanded={showCatalog}
          onClick={() => setShowCatalog((v) => !v)}
          className="min-h-[44px] px-4 rounded-xl bg-white border border-[#183B2B]/15 text-sm font-semibold text-[#183B2B]"
        >
          <span id="individual-title">{showCatalog ? 'Hide' : 'Show'} individual guides to download ({getCatalog().length})</span>
        </button>
        {showCatalog && (
          <ul className="space-y-2">
            {getCatalog().map((e) => {
              const saved = isEntryDownloaded(e.id);
              return (
                <li key={e.id} className="rounded-2xl bg-white border border-[#183B2B]/10 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[#16803C] font-semibold">{moduleLabel(e.module)}</p>
                    <p className="text-sm font-bold text-[#183B2B]">{e.title}</p>
                  </div>
                  {saved ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16803C] shrink-0">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Saved
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === e.id || !isOnline}
                      onClick={() => void handleSaveEntry(e.id)}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl bg-[#F3F8F0] text-xs font-semibold text-[#183B2B] disabled:opacity-50 shrink-0"
                    >
                      <Download className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                      {busyId === e.id ? 'Saving…' : 'Save'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Link
            to="/guides"
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630]"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Browse Guides to Download</span>
          </Link>
          {guides.length > 0 && isOnline && (
            <button
              type="button"
              disabled={checkingUpdates}
              onClick={() => void handleCheckUpdates()}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-sm font-semibold text-[#183B2B] hover:bg-[#F3F8F0]"
            >
              <RefreshCw className={`w-4 h-4 ${checkingUpdates ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{checkingUpdates ? 'Checking...' : 'Check Updates'}</span>
            </button>
          )}
        </div>
        {guides.length > 0 && (
          <button
            type="button"
            onClick={() => void handleClearAll()}
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Remove All Downloads
          </button>
        )}
      </div>

      {/* Downloaded List */}
      {guides.length === 0 ? (
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-10 text-center space-y-3">
          <BookOpen className="w-10 h-10 text-[#16803C] mx-auto" aria-hidden="true" />
          <h2 className="font-display text-xl font-bold text-[#183B2B]">No Server Guides Saved Yet</h2>
          <p className="text-sm text-[#183B2B]/75 max-w-md mx-auto">
            Open any guide in the Crop Guide Library and tap <strong>Save Offline</strong> so you can read it on your farm without network access.
          </p>
          <Link
            to="/guides"
            className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-[#16803C] text-white text-sm font-semibold"
          >
            Explore Farming Guides
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {guides.map((g) => (
            <div
              key={g.id}
              className="rounded-2xl bg-white border border-[#183B2B]/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <p className="text-xs text-[#183B2B]/65 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" />
                  <span>
                    Available Offline · {g.cropName} · {g.categoryName} · v{g.version} ({g.languageCode.toUpperCase()})
                  </span>
                </p>
                <h2 className="font-display text-lg font-bold text-[#183B2B]">
                  <Link to={`/guides/${g.slug}`} className="hover:text-[#16803C]">
                    {g.title}
                  </Link>
                </h2>
                <p className="text-xs text-[#183B2B]/70">
                  Saved {new Date(g.downloadedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/guides/${g.slug}`}
                  className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl bg-[#DDEFE0] text-[#183B2B] text-sm font-semibold hover:bg-[#16803C] hover:text-white transition-colors"
                >
                  Read Offline
                </Link>
                <button
                  type="button"
                  onClick={() => void handleRemove(g.id)}
                  aria-label={`Remove ${g.title} from offline library`}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-[#183B2B]/15 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
