import React, {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  Check,
  Download,
  Trash2,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {MarkdownText} from '../../components/MarkdownText';
import {SpeakButton} from '../../components/SpeakButton';
import {
  getOfflineGuideByIdOrSlug,
  removeOfflineGuide,
  optimizedImageUrl,
  saveGuideOffline,
} from '../../lib/offlineStorage';
import {friendlyDownloadError} from '../../lib/offlinePacks';
import {recordRecentlyViewedGuide, saveDemoAdvice} from '../../lib/demoStorage';

interface GuideDetail {
  id: number;
  slug: string;
  title: string;
  summary: string;
  contentMarkdown: string;
  imageUrl: string;
  languageCode: string;
  fallbackApplied?: boolean;
  translationReviewedBy?: string | null;
  sourceAttribution: string;
  isSampleDemo: boolean;
  isPestDisease: boolean;
  reviewStatus: string;
  reviewedByName: string | null;
  lastReviewedAt: string | null;
  version: number;
  crop: {slug: string; name: string};
  category: {name: string};
}

export const GuideDetailPage: React.FC = () => {
  const {id} = useParams<{id: string}>();
  const {user, language, isOnline, lowBandwidth} = useApp();
  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [readingOfflineCopy, setReadingOfflineCopy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const localCopy = getOfflineGuideByIdOrSlug(id);
    if (localCopy) {
      setOfflineSaved(true);
    }

    if (!isOnline) {
      if (localCopy) {
        const mapped = {
          ...localCopy,
          crop: {slug: localCopy.cropSlug, name: localCopy.cropName},
          category: {name: localCopy.categoryName},
        };
        setGuide(mapped);
        setReadingOfflineCopy(true);
        recordRecentlyViewedGuide({
          slug: mapped.slug,
          title: mapped.title,
          category: mapped.category.name,
        });
      } else {
        setError('You are offline and this guide has not been downloaded to your Offline Library yet.');
      }
      setLoading(false);
      return;
    }

    apiFetch<{guide: GuideDetail}>(`/guides/${id}?lang=${language}`)
      .then((res) => {
        setGuide(res.guide);
        setReadingOfflineCopy(false);
        setOfflineSaved(Boolean(getOfflineGuideByIdOrSlug(res.guide.id)));
        recordRecentlyViewedGuide({
          slug: res.guide.slug,
          title: res.guide.title,
          category: res.guide.category.name,
        });
      })
      .catch(() => {
        if (localCopy) {
          const mapped = {
            ...localCopy,
            crop: {slug: localCopy.cropSlug, name: localCopy.cropName},
            category: {name: localCopy.categoryName},
          };
          setGuide(mapped);
          setReadingOfflineCopy(true);
        } else {
          setError('Guide not found or unavailable.');
        }
      })
      .finally(() => setLoading(false));
  }, [id, language, isOnline]);

  const handleToggleOffline = async () => {
    if (!guide) return;
    setSaveError(null);
    try {
      if (offlineSaved) {
        await removeOfflineGuide(guide.id);
        setOfflineSaved(false);
      } else {
        await saveGuideOffline({
          id: guide.id,
          slug: guide.slug,
          title: guide.title,
          summary: guide.summary,
          contentMarkdown: guide.contentMarkdown,
          imageUrl: guide.imageUrl,
          languageCode: guide.languageCode,
          sourceAttribution: guide.sourceAttribution,
          isSampleDemo: guide.isSampleDemo,
          isPestDisease: guide.isPestDisease,
          reviewStatus: guide.reviewStatus,
          reviewedByName: guide.reviewedByName,
          lastReviewedAt: guide.lastReviewedAt,
          version: guide.version,
          cropName: guide.crop.name,
          cropSlug: guide.crop.slug,
          categoryName: guide.category.name,
        });
        setOfflineSaved(true);
      }
    } catch (err) {
      setSaveError(friendlyDownloadError(err));
    }
  };

  const handleSaveToAccount = async () => {
    if (!guide) return;
    saveDemoAdvice({
      id: `guide-${guide.id}`,
      title: guide.title,
      category: guide.category.name,
      summary: guide.summary,
      url: `/guides/${guide.slug}`,
    });

    if (!user) {
      setSaveNotice('Saved to your Demo Farmer Dashboard on this device.');
      return;
    }
    try {
      await apiFetch('/advisor/save', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: 'guide',
          title: guide.title,
          cropName: guide.crop.name,
          contentText: `${guide.summary}\n\n${guide.contentMarkdown}`,
          metadata: {guideId: guide.id, version: guide.version},
        }),
      });
      setSaveNotice('Guide saved to your Farmer Dashboard.');
    } catch (err) {
      setSaveNotice(err instanceof Error ? err.message : 'Unable to save guide.');
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-sm">Loading farming guide...</div>;
  }

  if (error || !guide) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">
        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-8 text-center space-y-4">
          <h1 className="font-display text-2xl font-bold text-[#183B2B]">Guide Unavailable</h1>
          <p className="text-sm text-[#183B2B]/80">{error}</p>
          <div className="flex justify-center gap-3">
            <Link to="/guides" className="min-h-[44px] inline-flex items-center px-5 py-2 rounded-xl bg-[#16803C] text-white text-sm font-semibold">
              Back to Knowledge Center
            </Link>
            <Link to="/offline" className="min-h-[44px] inline-flex items-center px-5 py-2 rounded-xl border border-[#183B2B]/20 text-sm font-semibold">
              Open Offline Library
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const speechBody = `${guide.title}. ${guide.summary}. ${guide.contentMarkdown.replace(/[#*`]/g, '')}`;

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link
        to="/guides"
        className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-[#16803C] hover:underline"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Back to Knowledge Center</span>
      </Link>

      <div className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden shadow-xs">
        {!lowBandwidth && (
          <div className="h-56 sm:h-72 bg-[#DDEFE0]">
            <SafeImage
              src={(readingOfflineCopy && optimizedImageUrl(guide.imageUrl)) || guide.imageUrl}
              alt={guide.title}
              className="w-full h-full object-cover"
              fallbackTitle={guide.crop.name}
            />
          </div>
        )}

        <div className="p-6 sm:p-8 space-y-6">
          <div className="space-y-2">
            <p className="text-xs sm:text-sm text-[#183B2B]/70">
              {guide.crop.name} · {guide.category.name} · Version {guide.version}
              {readingOfflineCopy ? ' · Reading Saved Offline Copy' : ''}
              {guide.isSampleDemo ? ' · Sample Demonstration Content' : ''}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#183B2B] leading-tight">
              {guide.title}
            </h1>
            <p className="text-base text-[#183B2B]/85 leading-relaxed">{guide.summary}</p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap gap-3 border-y border-[#183B2B]/10 py-4 items-center">
            <SpeakButton id={`guide-detail-${guide.id}`} label={guide.title} text={speechBody} />

            <button
              type="button"
              onClick={() => void handleToggleOffline()}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                offlineSaved
                  ? 'bg-[#DDEFE0] text-[#183B2B] hover:bg-red-50 hover:text-red-700'
                  : 'bg-[#16803C] text-white hover:bg-[#116630]'
              }`}
            >
              {offlineSaved ? (
                <>
                  <Check className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                  <span>Saved Offline</span>
                  <Trash2 className="w-3.5 h-3.5 ml-1 opacity-70" aria-hidden="true" />
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Download Offline</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleSaveToAccount()}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-[#183B2B]/15 text-sm font-semibold text-[#183B2B] hover:bg-[#F3F8F0]"
            >
              <Bookmark className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
              <span>Save Advice</span>
            </button>
          </div>
          {saveError && (
            <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-800">
              {saveError}
            </p>
          )}

          {saveNotice && (
            <div className="rounded-xl bg-[#DDEFE0] px-4 py-2.5 text-sm font-medium text-[#183B2B]">
              {saveNotice}
            </div>
          )}

          {guide.fallbackApplied && (
            <div className="rounded-xl bg-[#F3F8F0] px-4 py-3 text-xs text-[#183B2B]/80">
              A reviewed translation for your selected language is not yet published for this guide, so it is safely displayed in Standard English.
            </div>
          )}

          <div className="pt-1">
            <MarkdownText content={guide.contentMarkdown} />
          </div>

          <footer className="rounded-2xl bg-[#F3F8F0] p-4 sm:p-5 text-xs text-[#183B2B]/80 space-y-1.5">
            <p>
              <strong>Source Attribution:</strong> {guide.sourceAttribution}
            </p>
            <p>
              <strong>Review Status:</strong> {guide.reviewStatus}
              {guide.reviewedByName ? ` · Reviewer: ${guide.reviewedByName}` : ''}
              {guide.lastReviewedAt ? ` · Last reviewed: ${guide.lastReviewedAt}` : ''}
            </p>
            {guide.translationReviewedBy && (
              <p>
                <strong>Translation Review:</strong> {guide.translationReviewedBy}
              </p>
            )}
          </footer>
        </div>
      </div>
    </article>
  );
};
