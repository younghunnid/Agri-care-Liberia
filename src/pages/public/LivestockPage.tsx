import React, {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Feather,
  MapPin,
  MessageSquare,
  Store,
  Users,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {SpeakButton} from '../../components/SpeakButton';
import {LIVESTOCK_LIBRARY, type LivestockGuideEntry} from '../../data/livestockLibrary';

interface RelatedAnimalListing {
  id: number;
  product_name: string;
  price_lrd: number;
  unit: string;
  county: string;
  town: string;
}

export const LivestockPage: React.FC = () => {
  const {slug} = useParams<{slug?: string}>();
  const navigate = useNavigate();
  const {isOnline, lowBandwidth} = useApp();
  const [relatedListings, setRelatedListings] = useState<RelatedAnimalListing[]>([]);

  const selected: LivestockGuideEntry | null = slug
    ? LIVESTOCK_LIBRARY.find((l) => l.slug === slug) || null
    : null;

  useEffect(() => {
    if (!selected || !isOnline) return;
    apiFetch<{listings: RelatedAnimalListing[]}>(
      `/marketplace/listings?category=${encodeURIComponent(selected.marketplaceCategory)}`
    )
      .then((res) => setRelatedListings(res.listings.slice(0, 3)))
      .catch(() => setRelatedListings([]));
  }, [selected, isOnline]);

  if (selected) {
    const speechAll = [
      `${selected.name}. ${selected.summary}`,
      `Care guide: ${selected.careGuide.join('. ')}`,
      `Feeding education: ${selected.feedingEducation.join('. ')}`,
      `Housing and sanitation: ${selected.housingSanitation.join('. ')}`,
      `Welfare guidance: ${selected.welfareGuidance.join('. ')}`,
      `Disease prevention: ${selected.diseasePrevention.join('. ')}`,
      selected.vetReferralNote,
    ].join(' ');

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/livestock')}
            className="inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-[#16803C] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>All Livestock &amp; Aquaculture Guides</span>
          </button>

          <SpeakButton
            id={`live-full-${selected.slug}`}
            label={`Listen to ${selected.name}`}
            text={speechAll}
          />
        </div>

        <article className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden">
          {!lowBandwidth && (
            <div className="h-56 sm:h-72 bg-[#DDEFE0]">
              <SafeImage
                src={selected.imageUrl}
                alt={selected.name}
                className="w-full h-full object-cover"
                fallbackTitle={selected.name}
              />
            </div>
          )}

          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-2 border-b border-[#183B2B]/10 pb-5">
              <p className="text-xs font-semibold text-[#16803C]">
                Module 8 · Animal Husbandry &amp; Livestock Advisory · {selected.subtitle}
              </p>
              <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">
                {selected.name}
              </h1>
              <p className="text-base text-[#183B2B]/85 leading-relaxed">{selected.summary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                {title: '1. Daily Care Guide', items: selected.careGuide, id: 'care'},
                {title: '2. Feeding Education', items: selected.feedingEducation, id: 'feed'},
                {title: '3. Housing & Sanitation', items: selected.housingSanitation, id: 'house'},
                {title: '4. Animal Welfare Guidance', items: selected.welfareGuidance, id: 'welf'},
                {title: '5. Breeding Information', items: selected.breedingInfo, id: 'breed'},
                {title: '6. Disease Prevention Awareness', items: selected.diseasePrevention, id: 'prev'},
              ].map((sec) => (
                <section key={sec.id} className="rounded-2xl bg-[#F3F8F0] p-4 sm:p-5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display font-bold text-base text-[#183B2B]">{sec.title}</h2>
                    <SpeakButton
                      compact
                      id={`live-${selected.slug}-${sec.id}`}
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

            {/* Veterinary Safety & Referral */}
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 sm:p-5 flex items-start gap-3 text-sm text-amber-950">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-bold">Veterinary Safety Guardrail &amp; Expert Referral</p>
                <p>{selected.vetReferralNote}</p>
                <div className="flex flex-wrap gap-2.5 pt-2">
                  <Link
                    to="/experts"
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#183B2B] text-white text-xs font-bold"
                  >
                    <Users className="w-4 h-4 text-[#F5B942]" aria-hidden="true" />
                    <span>Request Veterinary / Expert Help</span>
                  </Link>
                  <Link
                    to={`/advisor?topic=${selected.slug === 'fish-farming' ? 'fish' : selected.slug === 'poultry' ? 'poultry' : 'livestock'}`}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#183B2B]/20 text-xs font-bold text-[#183B2B]"
                  >
                    <MessageSquare className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
                    <span>Ask AI Advisor</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Livestock Marketplace Integration */}
            <section className="space-y-3 pt-2 border-t border-[#183B2B]/10">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
                  <Store className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
                  <span>Related Livestock &amp; Aquaculture Demo Listings</span>
                </h2>
                <Link to="/marketplace" className="text-xs font-bold text-[#16803C] hover:underline">
                  Open Marketplace
                </Link>
              </div>
              {relatedListings.length === 0 ? (
                <p className="text-sm text-[#183B2B]/70">
                  Browse or list {selected.marketplaceCategory} inside the Agricultural Marketplace.
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
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="rounded-3xl bg-[#183B2B] text-white p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B942]">
            <Feather className="w-4 h-4" aria-hidden="true" />
            <span>Module 8 · Animal Husbandry &amp; Livestock Advisory</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold">
            Livestock, Poultry &amp; Fish Farming Guides
          </h1>
          <p className="text-sm sm:text-base text-white/85 leading-relaxed">
            Practical housing, clean feeding, breeding, and preventive health guidance for Poultry, Goats, Cattle, Pigs, Sheep, and Fish Farming in Liberia.
          </p>
        </div>

        <Link
          to="/experts"
          className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F5B942] text-[#183B2B] text-sm font-bold shrink-0"
        >
          <Users className="w-4 h-4" aria-hidden="true" />
          <span>Veterinary / Expert Help</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {LIVESTOCK_LIBRARY.map((item) => (
          <article
            key={item.slug}
            className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden flex flex-col justify-between hover:border-[#16803C] transition-colors"
          >
            <div>
              {!lowBandwidth && (
                <Link to={`/livestock/${item.slug}`} className="block h-44 bg-[#DDEFE0] overflow-hidden">
                  <SafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    fallbackTitle={item.name}
                  />
                </Link>
              )}
              <div className="p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-[#16803C]">{item.subtitle}</p>
                  <SpeakButton
                    compact
                    id={`live-card-${item.slug}`}
                    label={item.name}
                    text={`${item.name}. ${item.summary}`}
                  />
                </div>
                <h2 className="font-display text-xl font-bold text-[#183B2B]">
                  <Link to={`/livestock/${item.slug}`} className="hover:text-[#16803C]">
                    {item.name}
                  </Link>
                </h2>
                <p className="text-sm text-[#183B2B]/80 leading-relaxed">{item.summary}</p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 border-t border-[#183B2B]/10 flex items-center justify-between gap-2">
              <Link
                to={`/livestock/${item.slug}`}
                className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-bold text-[#16803C] hover:underline"
              >
                <span>Open Advisory Guide</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/marketplace"
                className="min-h-[44px] inline-flex items-center px-3 py-1.5 rounded-xl bg-[#F3F8F0] text-xs font-semibold text-[#183B2B]"
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
