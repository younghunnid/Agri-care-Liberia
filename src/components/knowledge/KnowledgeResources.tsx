import React from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight, BarChart3, Bug, CalendarDays, Calculator, CloudRain, FileText, Fish, GraduationCap, Languages, Layers, Sprout, Store} from 'lucide-react';
import {useApp} from '../../context/AppContext';
import {LANGUAGE_OPTIONS, type LanguageCode} from '../../lib/i18n';
import {HomeGroups} from '../HomeGroups';

/**
 * Detailed learning resources moved here from the homepage so Farming Knowledge & Guides is the one place for them.
 * The topic categories, the 11 common problems and the crop guides are the tabs above this block (not duplicated).
 */
export const KnowledgeResources: React.FC = () => {
  const {language, setLanguage} = useApp();
  return (
    <div className="space-y-10 pt-4" data-testid="knowledge-resources">
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
          Language access: English now, more planned
        </h2>
        <p className="text-sm text-[#183B2B]/75 mt-1">
          English is available. Other language choices are previews or planned; they do not provide complete translations or reviewed local-language recordings.
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


      {/* PLANTING, TECHNIQUES AND LEARNING TOOLS (existing routes, previously reached from several homepage blocks) */}
      <section aria-labelledby="learning-tools-heading" className="space-y-4">
        <div>
          <h2 id="learning-tools-heading" className="font-display text-2xl font-bold text-[#183B2B]">Planting seasons, techniques and learning tools</h2>
          <p className="text-sm text-[#183B2B]/75 mt-1">Practical tools that use the same bundled guidance. Planting and storage rules are draft guidance, not a forecast.</p>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {to: '/guidance', title: 'Planting months & storage', note: 'Planting window and storage guidance by crop and county.', icon: CalendarDays},
            {to: '/advice-cards', title: 'Advice cards', note: 'Short, versioned advice cards with a verification code.', icon: FileText},
            {to: '/learn', title: 'Short lessons', note: 'Audio-friendly farming lessons you can follow step by step.', icon: GraduationCap},
            {to: '/tools/calculator', title: 'Farm calculator', note: 'Plan seed, space and costs for a plot.', icon: Calculator},
          ].map(({to, title, note, icon: Icon}) => (
            <li key={to}>
              <Link to={to} className="group flex h-full min-h-[112px] items-start gap-3 rounded-2xl border border-[#183B2B]/10 bg-white p-4 hover:border-[#16803C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#16803C]">
                <span className="w-10 h-10 rounded-xl bg-[#DDEFE0] text-[#16803C] flex items-center justify-center shrink-0"><Icon className="w-5 h-5" aria-hidden="true" /></span>
                <span><span className="block font-display text-base font-bold text-[#183B2B] group-hover:text-[#16803C]">{title}</span><span className="mt-1 block text-xs leading-relaxed text-[#183B2B]/75">{note}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="-mx-4 sm:-mx-6"><HomeGroups /></div>
    </div>
  );
};
