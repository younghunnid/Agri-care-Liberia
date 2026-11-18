import React, {useEffect, useState} from 'react';
import {Link, useNavigate, useParams, useSearchParams} from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Bug,
  CloudRain,
  Layers,
  MapPin,
  Search,
  Sprout,
  Store,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {SpeakButton} from '../../components/SpeakButton';
import {ListenOfflineSection} from '../../components/AudioLessonCard';
import {CROPS_LIBRARY, type CropGuideEntry} from '../../data/cropsLibrary';
import {recordRecentlyViewedGuide, saveDemoAdvice} from '../../lib/demoStorage';

interface RelatedListing {
  id: number;
  product_name: string;
  price_lrd: number;
  unit: string;
  quantity: string;
  county: string;
  town: string;
}

const CATEGORIES = [
  'All Crops',
  'Staple Grains',
  'Root & Tuber Crops',
  'Garden Vegetables',
  'Perennial & Legumes',
];

export const CropsLibraryPage: React.FC = () => {
  const {slug} = useParams<{slug?: string}>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {isOnline, lowBandwidth, setListenMode} = useApp();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Crops');
  const [relatedListings, setRelatedListings] = useState<RelatedListing[]>([]);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const selectedCrop: CropGuideEntry | null = slug
    ? CROPS_LIBRARY.find((c) => c.slug === slug) || null
    : null;

  useEffect(() => {
    if (searchParams.get('listen') === '1') {
      setListenMode(true);
    }
  }, [searchParams, setListenMode]);

  useEffect(() => {
    if (!selectedCrop) return;
    recordRecentlyViewedGuide({
      slug: `crop-${selectedCrop.slug}`,
      title: `${selectedCrop.name} Production Guide`,
      category: selectedCrop.category,
    });

    if (!isOnline) return;
    apiFetch<{listings: RelatedListing[]}>(
      `/marketplace/listings?category=${encodeURIComponent(selectedCrop.marketplaceCategory)}`
    )
      .then((res) => setRelatedListings(res.listings.slice(0, 3)))
      .catch(() => setRelatedListings([]));
  }, [selectedCrop, isOnline]);

  const handleSaveCrop = (crop: CropGuideEntry) => {
    saveDemoAdvice({
      id: `crop-lib-${crop.slug}`,
      title: `${crop.name} Complete Farming Guide`,
      category: crop.category,
      summary: crop.summary,
      url: `/crops/${crop.slug}`,
    });
    setSavedToast(`Saved "${crop.name}" guide to your Farmer Dashboard.`);
    setTimeout(() => setSavedToast(null), 3500);
  };

  if (selectedCrop) {
    const fullSpeech = [
      `${selectedCrop.name}. ${selectedCrop.summary}`,
      `Overview: ${selectedCrop.overview}`,
      `Planting: ${selectedCrop.plantingInfo.join('. ')}`,
      `Soil: ${selectedCrop.soilRequirements.join('. ')}`,
      `Water management: ${selectedCrop.waterManagement.join('. ')}`,
      `Common pests and diseases: ${selectedCrop.commonPestsDiseases.join('. ')}`,
      `Harvesting: ${selectedCrop.harvestingInfo.join('. ')}`,
      `Storage: ${selectedCrop.storageGuidance.join('. ')}`,
    ].join(' ');

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/crops')}
            className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-[#16803C] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>All Liberian Crops</span>
          </button>
          <div className="flex flex-wrap gap-2">
            <SpeakButton
              id={`crop-full-${selectedCrop.slug}`}
              label={`Listen to ${selectedCrop.name} Guide`}
              text={fullSpeech}
            />
            <button
              type="button"
              onClick={() => handleSaveCrop(selectedCrop)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#DDEFE0] text-xs sm:text-sm font-semibold text-[#183B2B] hover:bg-[#16803C] hover:text-white transition-colors"
            >
              <Bookmark className="w-4 h-4" aria-hidden="true" />
              <span>Save Advice</span>
            </button>
          </div>
        </div>

        {savedToast && (
          <div role="status" className="rounded-2xl bg-[#DDEFE0] border border-[#16803C]/30 p-3 text-sm font-semibold text-[#183B2B]">
            {savedToast}
          </div>
        )}

        <ListenOfflineSection guideId={`crop:${selectedCrop.slug}`} />

        <article className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden">
          {!lowBandwidth && (
            <div className="h-56 sm:h-72 bg-[#DDEFE0]">
              <SafeImage
                src={selectedCrop.imageUrl}
                alt={`${selectedCrop.name} cultivation in Liberia`}
                className="w-full h-full object-cover"
                fallbackTitle={selectedCrop.name}
              />
            </div>
          )}

          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-2 border-b border-[#183B2B]/10 pb-5">
              <p className="text-xs font-semibold text-[#16803C]">
                Module 7 · Crops Library · {selectedCrop.category} · {selectedCrop.localNames}
              </p>
              <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">
                {selectedCrop.name} Production Guide
              </h1>
              <p className="text-base text-[#183B2B]/85 leading-relaxed">{selectedCrop.overview}</p>
              <p className="text-xs font-bold text-[#16803C]">
                Typical Planting Window: {selectedCrop.plantingWindow}
              </p>
            </div>

            {/* Structured Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                {title: '1. Planting Information', items: selectedCrop.plantingInfo, id: 'plant'},
                {title: '2. General Soil Requirements', items: selectedCrop.soilRequirements, id: 'soil'},
                {title: '3. Water Management', items: selectedCrop.waterManagement, id: 'water'},
                {title: '4. Common Pests & Diseases', items: selectedCrop.commonPestsDiseases, id: 'pest'},
                {title: '5. Crop Maintenance', items: selectedCrop.cropMaintenance, id: 'maint'},
                {title: '6. Harvesting & Storage Guidance', items: [...selectedCrop.harvestingInfo, ...selectedCrop.storageGuidance], id: 'harv'},
              ].map((sec) => (
                <section key={sec.id} className="rounded-2xl bg-[#F3F8F0] p-4 sm:p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-base text-[#183B2B]">{sec.title}</h2>
                    <SpeakButton
                      compact
                      id={`crop-${selectedCrop.slug}-${sec.id}`}
                      label={sec.title}
                      text={`${sec.title}. ${sec.items.join('. ')}`}
                    />
                  </div>
                  <ul className="list-disc pl-5 space-y-1.5 text-sm text-[#183B2B]/85">
                    {sec.items.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* Connected Modules Bar */}
            <div className="rounded-2xl bg-[#DDEFE0]/70 p-4 sm:p-5 space-y-3">
              <p className="text-xs font-bold text-[#183B2B]">Connected Support for {selectedCrop.name}:</p>
              <div className="flex flex-wrap gap-2.5">
                <Link
                  to="/pests"
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-bold text-[#183B2B] hover:bg-[#16803C] hover:text-white"
                >
                  <Bug className="w-4 h-4" aria-hidden="true" />
                  <span>Check {selectedCrop.name} Pests</span>
                </Link>
                <Link
                  to="/soil"
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-bold text-[#183B2B] hover:bg-[#16803C] hover:text-white"
                >
                  <Layers className="w-4 h-4" aria-hidden="true" />
                  <span>Soil &amp; Compost Tool</span>
                </Link>
                <Link
                  to="/weather"
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-bold text-[#183B2B] hover:bg-[#16803C] hover:text-white"
                >
                  <CloudRain className="w-4 h-4" aria-hidden="true" />
                  <span>County Weather Check</span>
                </Link>
                <Link
                  to={`/advisor?topic=crops&crop=${selectedCrop.slug}`}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#16803C] text-white text-xs font-bold hover:bg-[#116630]"
                >
                  <span>Ask AI About {selectedCrop.name}</span>
                </Link>
              </div>
            </div>

            {/* Related Marketplace Listings */}
            <section className="space-y-3 pt-2 border-t border-[#183B2B]/10">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
                  <Store className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
                  <span>Related Demo Marketplace Listings</span>
                </h2>
                <Link
                  to="/marketplace"
                  className="text-xs font-bold text-[#16803C] hover:underline inline-flex items-center gap-1"
                >
                  <span>Browse or Sell {selectedCrop.name}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
              {relatedListings.length === 0 ? (
                <p className="text-sm text-[#183B2B]/70">
                  Open the Agricultural Marketplace to post or inquire on {selectedCrop.marketplaceCategory}.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {relatedListings.map((item) => (
                    <Link
                      key={item.id}
                      to="/marketplace"
                      className="rounded-2xl border border-[#183B2B]/15 p-4 hover:border-[#16803C] space-y-1"
                    >
                      <p className="text-xs font-semibold text-[#16803C]">Demo Listing</p>
                      <p className="font-bold text-sm text-[#183B2B]">{item.product_name}</p>
                      <p className="text-sm font-extrabold text-[#16803C] tabular-nums">
                        LRD {item.price_lrd.toLocaleString()} / {item.unit}
                      </p>
                      <p className="text-xs text-[#183B2B]/70 flex items-center gap-1">
                        <MapPin className="w-3 h-3" aria-hidden="true" />
                        {item.town}, {item.county}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <p className="text-xs text-[#183B2B]/65">{selectedCrop.safetyDisclaimer}</p>
          </div>
        </article>
      </div>
    );
  }

  const filteredCrops = CROPS_LIBRARY.filter((c) => {
    if (categoryFilter !== 'All Crops' && c.category !== categoryFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.localNames.toLowerCase().includes(q) ||
      c.summary.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#16803C]">
            Module 7 · Crops Knowledge Library · Working Prototype
          </p>
          <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">
            Liberian Crops Library
          </h1>
          <p className="text-sm sm:text-base text-[#183B2B]/80 max-w-2xl">
            Step-by-step planting, soil, water, pest, harvest, and storage guides for 9 essential Liberian crops—connected directly to Listen Mode and Marketplace listings.
          </p>
        </div>

        <Link
          to="/guides"
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-sm font-semibold text-[#183B2B] hover:bg-[#DDEFE0]"
        >
          <Sprout className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
          <span>16-Category General Center</span>
        </Link>
      </div>

      {/* Search & Categories */}
      <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <label htmlFor="crops-search" className="sr-only">
            Search crops
          </label>
          <Search className="w-4 h-4 text-[#183B2B]/50 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="crops-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rice, cassava, maize, pepper, okra, tomatoes, plantain, sweet potatoes..."
            className="w-full min-h-[44px] rounded-xl border border-[#183B2B]/15 pl-10 pr-4 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                categoryFilter === cat
                  ? 'bg-[#16803C] border-[#16803C] text-white'
                  : 'bg-[#F3F8F0] border-[#183B2B]/15 text-[#183B2B]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Crop Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCrops.map((crop) => (
          <article
            key={crop.slug}
            className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden flex flex-col justify-between hover:border-[#16803C] transition-colors"
          >
            <div>
              {!lowBandwidth && (
                <Link to={`/crops/${crop.slug}`} className="block h-44 bg-[#DDEFE0] overflow-hidden">
                  <SafeImage
                    src={crop.imageUrl}
                    alt={`${crop.name} crop card`}
                    className="w-full h-full object-cover hover:scale-[1.02] transition-transform"
                    fallbackTitle={crop.name}
                  />
                </Link>
              )}
              <div className="p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-[#16803C]">
                    {crop.category} · {crop.localNames}
                  </p>
                  <SpeakButton
                    compact
                    id={`crop-card-${crop.slug}`}
                    label={crop.name}
                    text={`${crop.name}. ${crop.summary}. Planting window: ${crop.plantingWindow}`}
                  />
                </div>
                <h2 className="font-display text-xl font-bold text-[#183B2B]">
                  <Link to={`/crops/${crop.slug}`} className="hover:text-[#16803C]">
                    {crop.name}
                  </Link>
                </h2>
                <p className="text-sm text-[#183B2B]/80 leading-relaxed">{crop.summary}</p>
                <p className="text-xs font-medium text-[#183B2B]/70 pt-1">
                  Window: {crop.plantingWindow}
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 border-t border-[#183B2B]/10 flex items-center justify-between gap-2">
              <Link
                to={`/crops/${crop.slug}`}
                className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-bold text-[#16803C] hover:underline"
              >
                <span>Open Full Crop Guide</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/marketplace"
                className="min-h-[40px] inline-flex items-center px-3 py-1.5 rounded-xl bg-[#F3F8F0] text-xs font-semibold text-[#183B2B] hover:bg-[#DDEFE0]"
              >
                Market
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
