import React, {useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {Bookmark, Check, Download, HelpCircle, Layers, Search, Sprout, WifiOff} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {SpeakButton} from '../../components/SpeakButton';
import {getOfflineGuides, isGuideDownloaded} from '../../lib/offlineStorage';
import {downloadServerGuide, friendlyDownloadError} from '../../lib/offlinePacks';
import {saveDemoAdvice} from '../../lib/demoStorage';
import {
  COMMON_AGRICULTURAL_PROBLEMS,
  KNOWLEDGE_CATEGORIES,
} from '../../data/knowledgeCenter';

interface GuideListItem {
  id: number;
  slug: string;
  title: string;
  summary: string;
  imageUrl: string;
  languageCode: string;
  fallbackApplied: boolean;
  isSampleDemo: boolean;
  isPestDisease: boolean;
  reviewedByName: string | null;
  version: number;
  crop: {id: number; slug: string; name: string};
  category: {id: number; slug: string; name: string};
}

interface CropOption {
  slug: string;
  name: string;
}

interface CategoryOption {
  slug: string;
  name: string;
}

export const GuidesLibraryPage: React.FC = () => {
  const {language, isOnline, lowBandwidth, setListenMode} = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab =
    searchParams.get('tab') === 'problems'
      ? 'problems'
      : searchParams.get('tab') === 'guides' || searchParams.get('crop')
      ? 'guides'
      : 'categories';

  const [activeTab, setActiveTab] = useState<'categories' | 'problems' | 'guides'>(initialTab);
  const [selectedTopicId, setSelectedTopicId] = useState(searchParams.get('topic') || '');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [cropFilter, setCropFilter] = useState(searchParams.get('crop') || '');
  const [catFilter, setCatFilter] = useState(searchParams.get('category') || '');
  const [guides, setGuides] = useState<GuideListItem[]>([]);
  const [crops, setCrops] = useState<CropOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadedIds, setDownloadedIds] = useState<number[]>(() =>
    getOfflineGuides().map((g) => g.id)
  );
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<{guideId: number; message: string} | null>(null);

  useEffect(() => {
    if (searchParams.get('listen') === '1') {
      setListenMode(true);
    }
    const topicParam = searchParams.get('topic');
    if (topicParam) {
      setSelectedTopicId(topicParam);
      setActiveTab('categories');
    }
  }, [searchParams, setListenMode]);

  useEffect(() => {
    if (!isOnline) {
      const offline = getOfflineGuides().map((g) => ({
        id: g.id,
        slug: g.slug,
        title: g.title,
        summary: g.summary,
        imageUrl: g.imageUrl,
        languageCode: g.languageCode,
        fallbackApplied: false,
        isSampleDemo: g.isSampleDemo,
        isPestDisease: g.isPestDisease,
        reviewedByName: g.reviewedByName,
        version: g.version,
        crop: {id: 0, slug: g.cropSlug, name: g.cropName},
        category: {id: 0, slug: '', name: g.categoryName},
      }));
      setGuides(offline);
      setLoading(false);
      return;
    }

    Promise.all([
      apiFetch<{crops: CropOption[]}>('/crops'),
      apiFetch<{categories: CategoryOption[]}>('/categories'),
    ])
      .then(([cRes, catRes]) => {
        setCrops(cRes.crops);
        setCategories(catRes.categories);
      })
      .catch(() => undefined);
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (cropFilter) params.set('crop', cropFilter);
    if (catFilter) params.set('category', catFilter);
    if (search.trim()) params.set('q', search.trim());
    params.set('lang', language);

    apiFetch<{guides: GuideListItem[]}>(`/guides?${params.toString()}`)
      .then((res) => setGuides(res.guides))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [cropFilter, catFilter, search, language, isOnline]);

  const handleDownloadGuide = async (guideId: number) => {
    setDownloadingId(guideId);
    setDownloadError(null);
    try {
      await downloadServerGuide(guideId, language);
      setDownloadedIds(getOfflineGuides().map((g) => g.id));
      setSavedToast('Guide saved. You can read it without internet.');
      setTimeout(() => setSavedToast(null), 3500);
    } catch (err) {
      // Nothing is half-saved: the guide is stored only after the download fully succeeds.
      setDownloadError({guideId, message: friendlyDownloadError(err)});
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSaveTopicCard = (id: string, title: string, category: string, summary: string) => {
    saveDemoAdvice({id, title, category, summary, url: '/guides'});
    setSavedToast(`Saved "${title}" to your Farmer Dashboard.`);
    setTimeout(() => setSavedToast(null), 3500);
  };

  const filteredTopics = KNOWLEDGE_CATEGORIES.filter((cat) => {
    if (selectedTopicId && cat.id !== selectedTopicId) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      cat.name.toLowerCase().includes(q) ||
      cat.description.toLowerCase().includes(q) ||
      cat.articles.some((a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q))
    );
  });

  const filteredProblems = COMMON_AGRICULTURAL_PROBLEMS.filter((prob) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      prob.question.toLowerCase().includes(q) ||
      prob.quickSummary.toLowerCase().includes(q) ||
      prob.categoryName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#16803C]">
            Agricultural Knowledge Center · 16 Categories &amp; 11 Common Problems
          </p>
          <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">
            Farming Knowledge &amp; Guides
          </h1>
          <p className="text-sm sm:text-base text-[#183B2B]/80 max-w-2xl">
            Read or listen to practical farming advice across crops, livestock, poultry, aquaculture, storage, and land care.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
        <Link
          to="/offline"
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-sm font-semibold text-[#183B2B] hover:bg-[#DDEFE0] shrink-0"
        >
          <Download className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
          <span>Offline Library ({downloadedIds.length})</span>
        </Link>
        <Link
          to="/offline#starter-pack"
          className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630] shrink-0"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Download Starter Pack</span>
        </Link>
        </div>
      </div>

      {savedToast && (
        <div role="status" className="rounded-2xl bg-[#DDEFE0] border border-[#16803C]/30 px-4 py-3 text-sm font-semibold text-[#183B2B]">
          {savedToast}
        </div>
      )}

      {downloadError && (
        <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-800 flex flex-wrap items-center justify-between gap-3">
          <span>{downloadError.message}</span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadGuide(downloadError.guideId)}
              className="min-h-[40px] px-4 rounded-xl bg-red-700 text-white text-xs font-bold"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setDownloadError(null)}
              className="min-h-[40px] px-3 rounded-xl border border-red-300 text-xs font-semibold"
            >
              Dismiss
            </button>
          </span>
        </div>
      )}

      {!isOnline && (
        <div className="rounded-2xl bg-[#F5B942]/30 border border-[#F5B942] p-4 flex items-center gap-3 text-sm font-medium">
          <WifiOff className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>Offline mode: 16 local knowledge summaries and your downloaded guides remain readable.</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          {id: 'categories', label: '16 Agricultural Categories', icon: Layers},
          {id: 'problems', label: '11 Common Problems', icon: HelpCircle},
          {id: 'guides', label: `Crop Guides (${guides.length})`, icon: Sprout},
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id as 'categories' | 'problems' | 'guides');
                if (tab.id !== 'categories') setSelectedTopicId('');
              }}
              className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-colors ${
                active
                  ? 'bg-[#16803C] text-white'
                  : 'bg-white border border-[#183B2B]/15 text-[#183B2B] hover:bg-[#DDEFE0]'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Unified Search Bar */}
      <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <label htmlFor="kc-search" className="sr-only">
            Search farming topics
          </label>
          <Search className="w-4 h-4 text-[#183B2B]/50 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="kc-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tilapia ponds, poultry, cassava, soil, storage, buyers..."
            className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/15 pl-10 pr-4 text-sm text-[#183B2B]"
          />
        </div>

        {activeTab === 'categories' && selectedTopicId && (
          <button
            type="button"
            onClick={() => {
              setSelectedTopicId('');
              setSearchParams({});
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#DDEFE0] text-xs font-bold text-[#183B2B] whitespace-nowrap"
          >
            Show All 16 Categories
          </button>
        )}

        {activeTab === 'guides' && isOnline && (
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter by crop"
              value={cropFilter}
              onChange={(e) => setCropFilter(e.target.value)}
              className="min-h-[44px] rounded-xl border border-[#183B2B]/15 px-3 text-sm text-[#183B2B]"
            >
              <option value="">All Crops</option>
              {crops.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by topic"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="min-h-[44px] rounded-xl border border-[#183B2B]/15 px-3 text-sm text-[#183B2B]"
            >
              <option value="">All Topics</option>
              {categories.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: 16 AGRICULTURAL CATEGORIES */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTopics.map((cat) => (
            <section
              key={cat.id}
              className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden flex flex-col justify-between"
            >
              {!lowBandwidth && (
                <div className="h-40 bg-[#DDEFE0] overflow-hidden">
                  <SafeImage
                    src={cat.imageUrl}
                    alt={cat.name}
                    className="w-full h-full object-cover"
                    fallbackTitle={cat.shortName}
                  />
                </div>
              )}
              <div className="p-5 sm:p-6 space-y-4 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[#16803C]">
                      Category {cat.number} of 16 · Sample Educational Advice
                    </p>
                    <h2 className="font-display text-xl font-bold text-[#183B2B] leading-snug">
                      {cat.name}
                    </h2>
                  </div>
                  <SpeakButton
                    id={`kc-cat-${cat.id}`}
                    label={cat.shortName}
                    text={`${cat.name}. ${cat.description}. ${cat.articles
                      .map((a) => `${a.title}. ${a.summary}. ${a.steps.join('. ')}. ${a.cautionNote}`)
                      .join(' ')}`}
                  />
                </div>
                <p className="text-sm text-[#183B2B]/80">{cat.description}</p>

                <div className="space-y-3 pt-1">
                  {cat.articles.map((art) => (
                    <div key={art.id} className="rounded-2xl bg-[#F3F8F0] p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-bold text-sm sm:text-base text-[#183B2B]">
                          {art.title}
                        </h3>
                        <SpeakButton
                          compact
                          id={`kc-art-${art.id}`}
                          label={art.title}
                          text={`${art.title}. ${art.summary}. ${art.steps.join('. ')}. ${art.cautionNote}`}
                        />
                      </div>
                      <p className="text-xs sm:text-sm text-[#183B2B]/85">{art.summary}</p>
                      <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-[#183B2B]/80">
                        {art.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#183B2B]/10">
                        <p className="text-xs text-[#183B2B]/65">{art.cautionNote}</p>
                        <button
                          type="button"
                          onClick={() => handleSaveTopicCard(art.id, art.title, cat.shortName, art.summary)}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-semibold text-[#183B2B] hover:bg-[#DDEFE0]"
                        >
                          <Bookmark className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" />
                          <span>Save Advice</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* TAB 2: 11 COMMON AGRICULTURAL PROBLEMS */}
      {activeTab === 'problems' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProblems.map((prob, index) => (
            <article
              key={prob.id}
              className="rounded-3xl bg-white border border-[#183B2B]/10 p-5 sm:p-6 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#16803C]">
                      Problem {index + 1} of 11 · {prob.categoryName}
                    </p>
                    <h2 className="font-display text-lg sm:text-xl font-bold text-[#183B2B] mt-1">
                      {prob.question}
                    </h2>
                  </div>
                  <SpeakButton
                    id={`kc-prob-${prob.id}`}
                    label={prob.question}
                    text={`${prob.question} ${prob.quickSummary}. Steps: ${prob.steps.join('. ')}. ${prob.safetyDisclaimer}`}
                  />
                </div>
                <p className="text-sm font-medium text-[#183B2B]/90 leading-relaxed">{prob.quickSummary}</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-[#183B2B]/80">
                  {prob.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="pt-3 border-t border-[#183B2B]/10 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[#183B2B]/65">{prob.safetyDisclaimer}</p>
                <button
                  type="button"
                  onClick={() => handleSaveTopicCard(prob.id, prob.question, prob.categoryName, prob.quickSummary)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#F3F8F0] text-xs font-semibold text-[#183B2B] hover:bg-[#DDEFE0]"
                >
                  <Bookmark className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" />
                  <span>Save</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* TAB 3: EXISTING SQLITE APPROVED CROP GUIDES */}
      {activeTab === 'guides' && (
        <>
          {loading ? (
            <div className="py-12 text-center text-sm text-[#183B2B]/70">Loading approved crop guides...</div>
          ) : guides.length === 0 ? (
            <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-8 text-center space-y-3">
              <p className="font-display font-bold text-lg text-[#183B2B]">No matching guides found</p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCropFilter('');
                  setCatFilter('');
                }}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#16803C] text-white text-sm font-semibold"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {guides.map((guide) => {
                const savedOffline = downloadedIds.includes(guide.id) || isGuideDownloaded(guide.id);
                return (
                  <article
                    key={guide.id}
                    className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      {!lowBandwidth && (
                        <Link to={`/guides/${guide.slug}`} className="block h-44 bg-[#DDEFE0] overflow-hidden">
                          <SafeImage
                            src={guide.imageUrl}
                            alt={guide.title}
                            className="w-full h-full object-cover hover:scale-[1.02] transition-transform"
                            fallbackTitle={guide.crop.name}
                          />
                        </Link>
                      )}
                      <div className="p-5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-[#183B2B]/65">
                            {guide.crop.name} · {guide.category.name} · v{guide.version}
                            {guide.isSampleDemo ? ' · Sample Demo' : ''}
                          </p>
                          <SpeakButton
                            compact
                            id={`guide-card-${guide.id}`}
                            label={guide.title}
                            text={`${guide.title}. ${guide.summary}`}
                          />
                        </div>
                        <h2 className="font-display text-lg font-bold text-[#183B2B] leading-snug">
                          <Link to={`/guides/${guide.slug}`} className="hover:text-[#16803C]">
                            {guide.title}
                          </Link>
                        </h2>
                        <p className="text-sm text-[#183B2B]/80 leading-relaxed">{guide.summary}</p>
                        {guide.fallbackApplied && (
                          <p className="text-xs text-[#16803C] font-medium">
                            Displayed in English (local translation pending review)
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-2 border-t border-[#183B2B]/5">
                      <Link
                        to={`/guides/${guide.slug}`}
                        className="min-h-[44px] inline-flex items-center text-sm font-semibold text-[#16803C] hover:underline"
                      >
                        Read Guide
                      </Link>

                      {savedOffline ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16803C]">
                          <Check className="w-4 h-4" aria-hidden="true" />
                          Saved Offline
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={downloadingId === guide.id || !isOnline}
                          onClick={() => void handleDownloadGuide(guide.id)}
                          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#F3F8F0] text-xs font-semibold text-[#183B2B] hover:bg-[#DDEFE0] disabled:opacity-50"
                        >
                          <Download className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                          <span>{downloadingId === guide.id ? 'Saving...' : 'Save Offline'}</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
