import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle, Bug, MessageSquare, Users} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {SpeakButton} from '../../components/SpeakButton';
import {getOfflineGuides} from '../../lib/offlineStorage';

interface PestGuide {
  id: number;
  slug: string;
  title: string;
  summary: string;
  imageUrl: string;
  isSampleDemo: boolean;
  crop: {name: string; slug: string};
  category: {name: string};
}

interface SymptomCard {
  id: string;
  species: 'Rice' | 'Cassava' | 'Vegetables' | 'Poultry' | 'Livestock';
  title: string;
  signs: string;
  prevention: string[];
  imageUrl: string;
}

const SYMPTOM_LIBRARY: SymptomCard[] = [
  {
    id: 'sym-rice-spots',
    species: 'Rice',
    title: 'Rice Leaf Brown Spots & Stem Borer Checks',
    signs: 'Small oval brown spots on rice leaves or single drying central shoots ("deadheart").',
    prevention: [
      'Avoid crowding rice seedlings; clean grass weeds along field borders.',
      'Check swamp water flow so young stems are not stressed by stagnant mud.',
    ],
    imageUrl: '/src/assets/images/crop_rice_1794924195882.jpg',
  },
  {
    id: 'sym-cassava-mosaic',
    species: 'Cassava',
    title: 'Cassava Yellow-Patchy & Curled Leaves',
    signs: 'Light-green or yellow blotches twisting young cassava tips, often with tiny whiteflies underneath.',
    prevention: [
      'Cut planting stakes only from healthy, straight-leafed mother plants.',
      'Uproot badly twisted volunteer plants early and open mound drainage trenches.',
    ],
    imageUrl: '/src/assets/images/crop_cassava_1794924193991.jpg',
  },
  {
    id: 'sym-veg-wilt',
    species: 'Vegetables',
    title: 'Pepper, Okra & Tomato Leaf Curl or Blight',
    signs: 'Blackish spots spreading after rain splash, aphids under leaves, or sudden midday plant droop.',
    prevention: [
      'Build raised beds 25–30 cm high and mulch soil so mud does not splash onto lower leaves.',
      'Rotate pepper/tomato away from the exact same spot next planting.',
    ],
    imageUrl: '/src/assets/images/crop_pepper_okra_1794924192995.jpg',
  },
  {
    id: 'sym-poultry-chills',
    species: 'Poultry',
    title: 'Poultry Sneezing, Huddling & Wet Bedding Signs',
    signs: 'Chicks crowding together noisily or hens showing ruffled feathers during cool rainy spells.',
    prevention: [
      'Replace damp wood shavings immediately and block cold rain drafts while keeping roof vents open.',
      'Isolate sluggish birds right away and sanitize drinkers daily.',
    ],
    imageUrl: '/src/assets/images/liberia_poultry_farm_1794996421585.jpg',
  },
  {
    id: 'sym-livestock-hoof',
    species: 'Livestock',
    title: 'Goat & Pig Limping or Coughing Awareness',
    signs: 'Sore mud-caked hooves in goats or coughing/fever in newly brought-in animals.',
    prevention: [
      'House goats on dry raised slatted floors and quarantine newly bought animals for 14 days.',
      'Contact a licensed veterinary officer immediately—never guess antibiotic doses.',
    ],
    imageUrl: '/src/assets/images/liberia_livestock_goats_1794996422377.jpg',
  },
];

const FILTERS = ['All', 'Rice', 'Cassava', 'Vegetables', 'Poultry', 'Livestock'] as const;

export const PestsDiseasesPage: React.FC = () => {
  const {language, isOnline, lowBandwidth} = useApp();
  const [guides, setGuides] = useState<PestGuide[]>([]);
  const [speciesFilter, setSpeciesFilter] = useState<(typeof FILTERS)[number]>('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOnline) {
      const offline = getOfflineGuides()
        .filter((g) => g.isPestDisease)
        .map((g) => ({
          id: g.id,
          slug: g.slug,
          title: g.title,
          summary: g.summary,
          imageUrl: g.imageUrl,
          isSampleDemo: g.isSampleDemo,
          crop: {name: g.cropName, slug: g.cropSlug},
          category: {name: g.categoryName},
        }));
      setGuides(offline);
      setLoading(false);
      return;
    }

    apiFetch<{guides: PestGuide[]}>(`/guides?pest=1&lang=${language}`)
      .then((res) => setGuides(res.guides))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [language, isOnline]);

  const filteredSymptoms = SYMPTOM_LIBRARY.filter(
    (s) => speciesFilter === 'All' || s.species === speciesFilter
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#16803C]">
            <Bug className="w-4 h-4" aria-hidden="true" />
            <span>Module 3 · Pest &amp; Disease Knowledge Library · Preliminary Guidance Only</span>
          </div>
          <h1 className="font-display text-3xl font-extrabold text-[#183B2B]">
            Pests, Diseases &amp; Animal Health Awareness
          </h1>
          <p className="text-sm sm:text-base text-[#183B2B]/80 leading-relaxed">
            Explore symptom categories for rice, cassava, vegetables, poultry, and livestock—with read-aloud prevention steps, optional AI photo discussion, and expert referral.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <Link
            to="/advisor?topic=crops"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630]"
          >
            <MessageSquare className="w-4 h-4" aria-hidden="true" />
            <span>Ask AI (Optional Photo)</span>
          </Link>
          <Link
            to="/experts"
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F5B942] text-[#183B2B] text-sm font-bold hover:bg-[#f7c55f]"
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>Ask Expert</span>
          </Link>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3 text-sm text-amber-950">
        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-bold">Preliminary Educational Guidance — Not a Confirmed Diagnosis</p>
          <p className="text-xs sm:text-sm mt-0.5">
            Neither symptom guides nor AI photo previews provide a confirmed plant or animal disease diagnosis. Team 8 does not prescribe pesticide dosages or veterinary medications.
          </p>
        </div>
      </div>

      {/* Symptom Category Filter */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setSpeciesFilter(f)}
            className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold border transition-colors ${
              speciesFilter === f
                ? 'bg-[#16803C] border-[#16803C] text-white'
                : 'bg-white border-[#183B2B]/15 text-[#183B2B]'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Symptom Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredSymptoms.map((card) => (
          <article
            key={card.id}
            className="rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden flex flex-col justify-between"
          >
            <div>
              {!lowBandwidth && (
                <div className="h-40 bg-[#DDEFE0] overflow-hidden">
                  <SafeImage
                    src={card.imageUrl}
                    alt={card.title}
                    className="w-full h-full object-cover"
                    fallbackTitle={card.species}
                  />
                </div>
              )}
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-[#16803C]">
                    {card.species} · Preliminary Awareness
                  </p>
                  <SpeakButton
                    compact
                    id={card.id}
                    label={card.title}
                    text={`${card.title}. Signs to watch: ${card.signs}. Prevention steps: ${card.prevention.join('. ')}`}
                  />
                </div>
                <h2 className="font-display text-lg font-bold text-[#183B2B]">{card.title}</h2>
                <p className="text-xs sm:text-sm font-medium text-[#183B2B]/85">{card.signs}</p>
                <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-[#183B2B]/80">
                  {card.prevention.map((p, idx) => (
                    <li key={idx}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 border-t border-[#183B2B]/10 flex items-center justify-between gap-2">
              <Link
                to={`/advisor?q=${encodeURIComponent(`I see signs of: ${card.title}. What should I check carefully?`)}`}
                className="text-xs font-bold text-[#16803C] hover:underline min-h-[44px] inline-flex items-center"
              >
                Ask AI Advisor
              </Link>
              <Link
                to={`/experts?title=${encodeURIComponent(card.title)}`}
                className="text-xs font-bold text-[#183B2B] hover:underline min-h-[44px] inline-flex items-center"
              >
                Request Expert Review
              </Link>
            </div>
          </article>
        ))}
      </div>

      {/* Existing Approved SQLite Pest Guides */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-[#183B2B]">
          Detailed Approved Pest &amp; Disease Guides
        </h2>
        {loading ? (
          <p className="text-center text-sm text-[#183B2B]/70 py-6">Loading detailed pest guides...</p>
        ) : guides.length === 0 ? (
          <div className="rounded-3xl bg-white p-6 text-center text-sm text-[#183B2B]/75">
            No offline pest guides downloaded yet. Reconnect or save guides from the Crop Guide Library.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {guides.map((g) => (
              <Link
                key={g.id}
                to={`/guides/${g.slug}`}
                className="group rounded-3xl bg-white border border-[#183B2B]/10 overflow-hidden hover:border-[#16803C] transition-colors flex flex-col"
              >
                {!lowBandwidth && (
                  <div className="h-44 bg-[#DDEFE0] overflow-hidden">
                    <SafeImage
                      src={g.imageUrl}
                      alt={g.title}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                      fallbackTitle={g.crop.name}
                    />
                  </div>
                )}
                <div className="p-5 space-y-2">
                  <p className="text-xs text-[#183B2B]/65">
                    {g.crop.name} · {g.category.name}
                    {g.isSampleDemo ? ' · Sample Guide' : ''}
                  </p>
                  <h3 className="font-display text-lg font-bold text-[#183B2B] group-hover:text-[#16803C]">
                    {g.title}
                  </h3>
                  <p className="text-sm text-[#183B2B]/80 leading-relaxed">{g.summary}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
