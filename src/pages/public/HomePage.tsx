import React, {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bug,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Download,
  Feather,
  Fish,
  GraduationCap,
  HeartHandshake,
  Home,
  Languages,
  Landmark,
  Layers,
  MessageSquare,
  Package,
  PhoneCall,
  Presentation,
  ShieldCheck,
  Sprout,
  Store,
  Truck,
  Users,
  Volume2,
  Warehouse,
  Wrench,
} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {SafeImage} from '../../components/SafeImage';
import {SpeakButton} from '../../components/SpeakButton';
import {getOfflineGuides} from '../../lib/offlineStorage';
import {HomeGroups} from '../../components/HomeGroups';
import {PWAInstallButton} from '../../components/PWAInstallButton';
import {LANGUAGE_OPTIONS, type LanguageCode} from '../../lib/i18n';
import {
  COMMON_AGRICULTURAL_PROBLEMS,
  KNOWLEDGE_CATEGORIES,
  type KnowledgeCategory,
} from '../../data/knowledgeCenter';

const CATEGORY_ICONS: Record<KnowledgeCategory['iconKey'], React.ComponentType<{className?: string}>> = {
  sprout: Sprout,
  layers: Layers,
  package: Package,
  bug: Bug,
  feather: Feather,
  heart: HeartHandshake,
  fish: Fish,
  home: Home,
  'cloud-rain': CloudRain,
  warehouse: Warehouse,
  store: Store,
  truck: Truck,
  landmark: Landmark,
  wrench: Wrench,
  graduation: GraduationCap,
  shield: ShieldCheck,
};

export const HomePage: React.FC = () => {
  const {tr, language, setLanguage, lowBandwidth, setListenMode, listenMode} = useApp();
  const navigate = useNavigate();
  const offlineCount = getOfflineGuides().length;
  const [openProblemId, setOpenProblemId] = useState<string | null>(COMMON_AGRICULTURAL_PROBLEMS[0]?.id || null);

  const handleListenAction = () => {
    setListenMode(true);
    navigate('/guides?listen=1');
  };

  return (
    <div className="space-y-10 md:space-y-14">
      {/* HERO + FOUR PROMINENT ACTIONS */}
      <section className="bg-gradient-to-b from-[#DDEFE0] to-[#F3F8F0] border-b border-[#183B2B]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7 md:py-11 space-y-7">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-[#16803C]">
                  Team 8 · Inclusive Agricultural e-Advisory Platform · Liberia
                </p>
                <SpeakButton
                  id="home-welcome"
                  label="Welcome Overview"
                  text={`${tr('heroTitle')} ${tr('heroSubtitle')}`}
                />
              </div>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-[#183B2B] leading-tight text-balance">
                {tr('heroTitle')}
              </h1>
              <p className="text-base sm:text-lg text-[#183B2B]/85 max-w-2xl leading-relaxed">
                {tr('heroSubtitle')}
              </p>
            </div>

            {!lowBandwidth && (
              <div className="lg:col-span-5">
                <div className="h-56 sm:h-64 lg:h-72 rounded-3xl overflow-hidden border border-[#183B2B]/10 shadow-sm bg-white">
                  <SafeImage
                    src="/src/assets/images/hero_liberia_farm_1794924193363.jpg"
                    alt="Liberian smallholder farmers tending green cassava and rice plots"
                    className="w-full h-full object-cover"
                    fallbackTitle="Liberian Smallholder Farm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4 PROMINENT PRIMARY HOMEPAGE ACTIONS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to="/advisor"
              className="group rounded-3xl bg-[#16803C] text-white p-5 shadow-md hover:bg-[#116630] transition-colors flex flex-col justify-between gap-4 min-h-[148px]"
            >
              <div className="flex items-center justify-between">
                <span className="w-12 h-12 rounded-2xl bg-[#F5B942] text-[#183B2B] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-6 h-6" aria-hidden="true" />
                </span>
                <ArrowRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-lg font-extrabold leading-snug">
                  Ask Agricultural Advisor
                </h2>
                <p className="text-xs sm:text-sm text-white/85 leading-snug">
                  Chat by text, voice, or optional crop photo for safe guidance.
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={handleListenAction}
              className="group text-left rounded-3xl bg-white border-2 border-[#16803C]/25 p-5 shadow-xs hover:border-[#16803C] transition-colors flex flex-col justify-between gap-4 min-h-[148px]"
            >
              <div className="flex items-center justify-between">
                <span className="w-12 h-12 rounded-2xl bg-[#DDEFE0] text-[#16803C] flex items-center justify-center shrink-0">
                  <Volume2 className="w-6 h-6" aria-hidden="true" />
                </span>
                <span className="text-xs font-bold text-[#16803C]">
                  {listenMode ? 'Active' : 'Audio First'}
                </span>
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-lg font-extrabold text-[#183B2B] leading-snug">
                  Listen to Farming Advice
                </h2>
                <p className="text-xs sm:text-sm text-[#183B2B]/75 leading-snug">
                  Enable Smart Listen Mode to hear crop, livestock, and fish guides aloud.
                </p>
              </div>
            </button>

            <Link
              to="/marketplace"
              className="group rounded-3xl bg-white border border-[#183B2B]/15 p-5 shadow-xs hover:border-[#16803C] transition-colors flex flex-col justify-between gap-4 min-h-[148px]"
            >
              <div className="flex items-center justify-between">
                <span className="w-12 h-12 rounded-2xl bg-[#F5B942]/30 text-[#183B2B] flex items-center justify-center shrink-0">
                  <Store className="w-6 h-6" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold text-[#183B2B]/65">Demo Listings</span>
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-lg font-extrabold text-[#183B2B] leading-snug">
                  Agricultural Marketplace
                </h2>
                <p className="text-xs sm:text-sm text-[#183B2B]/75 leading-snug">
                  Post farm produce in LRD or connect with local buyers—no payments required.
                </p>
              </div>
            </Link>

            <Link
              to="/experts"
              className="group rounded-3xl bg-[#183B2B] text-white p-5 shadow-sm hover:bg-[#1f4c38] transition-colors flex flex-col justify-between gap-4 min-h-[148px]"
            >
              <div className="flex items-center justify-between">
                <span className="w-12 h-12 rounded-2xl bg-white/15 text-[#F5B942] flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6" aria-hidden="true" />
                </span>
                <ArrowRight className="w-5 h-5 text-white/75 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-lg font-extrabold leading-snug">
                  Get Expert Help
                </h2>
                <p className="text-xs sm:text-sm text-white/80 leading-snug">
                  Send a farm question with photo or voice note to an extension officer.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <HomeGroups />

      {/* HACKATHON JUDGE DEMO BANNER + BASIC PHONE CALL SIMULATOR */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-[#DDEFE0] border border-[#16803C]/25 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#0F5C2A]">
              Hackathon Prototype Showcase · Nov 20–22, 2026
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#183B2B]">
              Guided Demo Scenarios for Judges
            </h2>
            <p className="text-sm text-[#183B2B]/80 leading-relaxed">
              Walk through 4 clear hackathon journeys—listening to cassava advice, simulating a Bassa/Mano button-phone call, posting to the farmer &amp; supplier marketplace, and inspecting the Ministry food security dashboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/demo"
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#16803C] text-white text-sm font-bold hover:bg-[#116630]"
            >
              <Presentation className="w-4 h-4" aria-hidden="true" />
              <span>Open Judge Demo Mode</span>
            </Link>
            <Link
              to="/coming-soon"
              className="min-h-[44px] inline-flex items-center px-4 py-2.5 rounded-xl bg-white text-[#183B2B] text-sm font-semibold border border-[#183B2B]/15 hover:bg-[#F3F8F0]"
            >
              View Future Roadmap
            </Link>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#16803C]">
              Inclusive Access · No Smartphone Needed
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#183B2B]">
              {tr('askExpertTitle')}
            </h2>
            <p className="text-sm text-[#183B2B]/80 leading-relaxed">
              {tr('askExpertDesc')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/phone-simulator"
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F5B942] text-[#183B2B] text-sm font-bold hover:bg-[#f7c55f]"
            >
              <PhoneCall className="w-4 h-4" aria-hidden="true" />
              <span>Try Button-Phone Simulator</span>
            </Link>
            <Link
              to="/language-lab"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#183B2B]/15 text-sm font-semibold text-[#183B2B] hover:bg-[#F3F8F0]"
            >
              <Languages className="w-4 h-4 text-[#16803C]" aria-hidden="true" />
              <span>Bassa &amp; Mano Lab</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 8 AGRICULTURAL PROBLEM STATEMENTS */}
      <section aria-labelledby="eight-modules-heading" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#16803C]">Phase 2 Hackathon Core</p>
            <h2 id="eight-modules-heading" className="font-display text-2xl font-bold text-[#183B2B]">
              Eight Liberian Agricultural Problem Statements
            </h2>
            <p className="text-sm text-[#183B2B]/75 mt-1">
              Connected tools built for Liberian farmers, buyers, agricultural suppliers, local dialect speakers, and Ministry planners.
            </p>
          </div>
          <Link
            to="/ministry"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#16803C] hover:underline whitespace-nowrap min-h-[44px]"
          >
            <BarChart3 className="w-4 h-4" aria-hidden="true" />
            <span>Ministry Dashboard</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              num: '1',
              title: 'Agricultural Marketing',
              desc: 'Farmers, buyers, and agricultural suppliers connect and post LRD listings without payments.',
              to: '/marketplace',
              tag: 'Demo Marketplace',
              icon: Store,
            },
            {
              num: '2',
              title: 'Weather Information',
              desc: '15-county sample rainfall profiles, planting guidance, and weather risk notices with audio.',
              to: '/weather',
              tag: 'Sample Data',
              icon: CloudRain,
            },
            {
              num: '3',
              title: 'Pests & Diseases',
              desc: 'Crop, poultry, and livestock symptom guides, safe prevention steps, AI check, and expert help.',
              to: '/pests',
              tag: 'Working + AI',
              icon: Bug,
            },
            {
              num: '4',
              title: 'Local Dialect Translation',
              desc: 'Bassa, Mano, and Kpelle audio scripts, speaker consent capture, and simulated phone call.',
              to: '/language-lab',
              tag: 'Audio Lab + Sim',
              icon: Languages,
            },
            {
              num: '5',
              title: 'Ministry Food Security',
              desc: 'County production trends, product mix, and reported farm challenges for policy demonstration.',
              to: '/ministry',
              tag: 'Synthetic Demo',
              icon: BarChart3,
            },
            {
              num: '6',
              title: 'Soil & Fertilizer Advisory',
              desc: 'Interactive crop + soil condition selector, composting lessons, and soil testing guidance.',
              to: '/soil',
              tag: 'Interactive Tool',
              icon: Layers,
            },
            {
              num: '7',
              title: 'Crops Library (9 Crops)',
              desc: 'Rice, Cassava, Maize, Pepper, Okra, Tomatoes, Plantain, Sweet Potatoes & Groundnuts.',
              to: '/crops',
              tag: 'Full Guides + Audio',
              icon: Sprout,
            },
            {
              num: '8',
              title: 'Livestock & Fish Farming',
              desc: 'Poultry, goats, cattle, pigs, sheep, and aquaculture pond care with veterinary referral notes.',
              to: '/livestock',
              tag: '6 Categories',
              icon: Fish,
            },
          ].map((mod) => {
            const ModIcon = mod.icon;
            return (
              <Link
                key={mod.num}
                to={mod.to}
                className="group rounded-2xl bg-white border border-[#183B2B]/10 p-5 hover:border-[#16803C] transition-colors flex flex-col justify-between gap-3 min-h-[160px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="w-10 h-10 rounded-xl bg-[#DDEFE0] text-[#16803C] flex items-center justify-center shrink-0">
                    <ModIcon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-bold text-[#183B2B]/75">{mod.tag}</span>
                </div>
                <div className="space-y-1">
                  <h3 className="font-display font-bold text-base text-[#183B2B] group-hover:text-[#16803C]">
                    {mod.num}. {mod.title}
                  </h3>
                  <p className="text-xs text-[#183B2B]/75 leading-relaxed">{mod.desc}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#16803C]">
                  Open Module <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* LANGUAGE SELECTION & LOCAL LANGUAGE LAB */}
      <section aria-labelledby="language-section-heading" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="language-section-heading" className="font-display text-2xl font-bold text-[#183B2B]">
              Local Language Support (Bassa, Mano &amp; Kpelle Priority)
            </h2>
            <p className="text-sm text-[#183B2B]/75 mt-1">
              Select a language below or visit the Local Language AI Lab to record and review native-speaker clips.
            </p>
          </div>
          <Link
            to="/language-lab"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#16803C] hover:underline min-h-[44px]"
          >
            <span>Open Local Language AI Lab</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = language === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => void setLanguage(opt.code as LanguageCode)}
                className={`text-left rounded-2xl p-4 border transition-colors min-h-[96px] flex flex-col justify-between ${
                  active
                    ? 'bg-[#16803C] border-[#16803C] text-white shadow-sm'
                    : 'bg-white border-[#183B2B]/10 text-[#183B2B] hover:border-[#16803C]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold text-base">{opt.name}</span>
                  <span className={`text-xs font-mono ${active ? 'text-[#F5B942]' : 'text-[#16803C]'}`}>
                    {opt.shortCode}
                  </span>
                </div>
                <p className={`text-xs leading-snug mt-2 ${active ? 'text-white/85' : 'text-[#183B2B]/65'}`}>
                  {opt.status === 'active'
                    ? 'Full UI & Voice'
                    : opt.code === 'bas' || opt.code === 'man'
                    ? 'Audio Lab Priority'
                    : opt.status === 'preview'
                    ? 'Reviewed Strings'
                    : 'Roadmap'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 16 AGRICULTURAL CATEGORIES */}
      <section aria-labelledby="categories-heading" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="categories-heading" className="font-display text-2xl font-bold text-[#183B2B]">
              16 Agricultural Knowledge Categories
            </h2>
            <p className="text-sm text-[#183B2B]/75 mt-1">
              Practical Liberian guidance covering staple crops, poultry, livestock, fish ponds, storage, markets, and land safety.
            </p>
          </div>
          <Link
            to="/guides"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#16803C] hover:underline whitespace-nowrap min-h-[44px]"
          >
            <span>Open Full Knowledge Center</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {KNOWLEDGE_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.iconKey] || Sprout;
            return (
              <div
                key={cat.id}
                className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 hover:border-[#16803C] transition-colors flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/guides?topic=${cat.id}`} className="flex items-center gap-2.5 group flex-1 min-h-[44px]">
                    <span className="w-10 h-10 rounded-xl bg-[#DDEFE0] text-[#16803C] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="font-display font-bold text-sm text-[#183B2B] group-hover:text-[#16803C] leading-snug">
                      {cat.number}. {cat.shortName}
                    </span>
                  </Link>
                  <SpeakButton
                    compact
                    id={`home-cat-${cat.id}`}
                    label={cat.shortName}
                    text={`${cat.name}. ${cat.description}`}
                  />
                </div>
                <p className="text-xs text-[#183B2B]/75 leading-relaxed">{cat.description}</p>
                <Link
                  to={`/guides?topic=${cat.id}`}
                  className="text-xs font-semibold text-[#16803C] hover:underline inline-flex items-center gap-1 min-h-[44px]"
                >
                  <span>Read {cat.articles.length} guide{cat.articles.length === 1 ? '' : 's'}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* 11 COMMON AGRICULTURAL PROBLEMS */}
      <section aria-labelledby="problems-heading" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="problems-heading" className="font-display text-2xl font-bold text-[#183B2B]">
              11 Common Farming Questions in Liberia
            </h2>
            <p className="text-sm text-[#183B2B]/75 mt-1">
              Tap any question to read clear practical steps or press Listen to hear it read aloud.
            </p>
          </div>
          <Link
            to="/guides?tab=problems"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#16803C] hover:underline min-h-[44px]"
          >
            <span>See All 11 Solutions</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {COMMON_AGRICULTURAL_PROBLEMS.map((prob) => {
            const isOpen = openProblemId === prob.id;
            return (
              <div
                key={prob.id}
                className="rounded-2xl bg-white border border-[#183B2B]/10 overflow-hidden"
              >
                <div className="p-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenProblemId(isOpen ? null : prob.id)}
                    aria-expanded={isOpen}
                    className="flex-1 text-left flex items-center justify-between gap-2 min-h-[44px]"
                  >
                    <span className="font-display font-bold text-sm sm:text-base text-[#183B2B]">
                      {prob.question}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[#16803C] shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#183B2B]/60 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                  <SpeakButton
                    compact
                    id={`home-prob-${prob.id}`}
                    label={prob.question}
                    text={`${prob.question} ${prob.quickSummary} ${prob.steps.join('. ')} ${prob.safetyDisclaimer}`}
                  />
                </div>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-[#183B2B]/10 space-y-2.5 bg-[#F3F8F0]/50">
                    <p className="text-sm font-medium text-[#183B2B]">{prob.quickSummary}</p>
                    <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-[#183B2B]/80">
                      {prob.steps.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-[#183B2B]/65">{prob.safetyDisclaimer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* OFFLINE LIBRARY & LOW-BANDWIDTH + ABOUT TEAM 8 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl bg-[#DDEFE0] border border-[#16803C]/20 p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2.5 text-[#0F5C2A] font-semibold text-sm">
            <Download className="w-5 h-5" aria-hidden="true" />
            <span>Offline Library &amp; Low-Bandwidth Support</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#183B2B]">{tr('offlineBannerTitle')}</h2>
          <p className="text-sm sm:text-base text-[#183B2B]/85 leading-relaxed">
            {tr('offlineBannerDesc')}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              to="/offline"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#16803C] text-white text-sm font-semibold hover:bg-[#116630]"
            >
              <span>Offline Library ({offlineCount})</span>
            </Link>
            <PWAInstallButton />
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 sm:p-8 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[#16803C]">Team 8 Prototype Governance</p>
            <h2 className="font-display text-2xl font-bold text-[#183B2B]">{tr('aboutTeam8Title')}</h2>
            <p className="text-sm sm:text-base text-[#183B2B]/80 leading-relaxed">
              {tr('aboutTeam8Desc')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#183B2B] text-white text-sm font-semibold hover:bg-[#183B2B]/90"
            >
              <BookOpen className="w-4 h-4 text-[#F5B942]" aria-hidden="true" />
              <span>Farmer Dashboard</span>
            </Link>
            <Link
              to="/management"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl border border-[#183B2B]/20 text-sm font-semibold text-[#183B2B] hover:bg-[#F3F8F0]"
            >
              Admin &amp; Review Console
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
