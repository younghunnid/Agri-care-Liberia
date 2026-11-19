import React, {useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Feather,
  PhoneCall,
  Presentation,
  RotateCcw,
  Sprout,
  Store,
  Users,
  Volume2,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {
  clearLocalDemoState,
  getCompletedScenarios,
  markScenarioComplete,
} from '../../lib/demoStorage';

export const DemoModePage: React.FC = () => {
  const {setListenMode, setLanguage, user} = useApp();
  const isAdmin = Boolean(user?.roles.includes('admin'));
  const navigate = useNavigate();
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => getCompletedScenarios());
  const [resetting, setResetting] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const handleCompleteScenario = (id: string) => {
    setCompleted(markScenarioComplete(id));
  };

  // Journey 1: Accessible Crop Advice (Cassava + Listen Mode)
  const handleJourney1 = () => {
    handleCompleteScenario('journey1');
    void setLanguage('en');
    setListenMode(true);
    navigate('/crops/cassava?listen=1');
  };

  // Journey 2: Local-Language Access (Simulated Phone Service in Bassa/Mano)
  const handleJourney2 = () => {
    handleCompleteScenario('journey2');
    void setLanguage('bas');
    navigate('/phone-simulator?scenario=rice');
  };

  // Journey 3: Agricultural Marketplace (Filter, Details Modal, Direct Call Farmer)
  const handleJourney3 = () => {
    handleCompleteScenario('journey3');
    navigate('/marketplace');
  };

  // Journey 4: Ministry of Agriculture Food Security Dashboard
  const handleJourney4 = () => {
    handleCompleteScenario('journey4');
    navigate('/ministry');
  };

  // Bonus Quick Flow: Poultry AI + Expert Escalation
  const handleBonusPoultry = () => {
    handleCompleteScenario('poultry');
    void setLanguage('en');
    navigate('/advisor?topic=poultry&q=My+young+chicks+look+cold+during+heavy+rain.+What+safe+steps+can+I+take+and+when+should+I+call+an+expert%3F');
  };

  const handleResetDemo = async () => {
    setResetting(true);
    setStatusNotice(null);
    try {
      clearLocalDemoState();
      setCompleted({});
      if (!isAdmin) {
        // Resetting shared server data wipes everyone's demo content, so the server only allows administrators to do it.
        setStatusNotice('Scenario progress on this phone was reset. Resetting the shared demo data needs an administrator account.');
        return;
      }
      await apiFetch('/demo/reset', {method: 'POST'});
      setStatusNotice('Demo marketplace (farmers & suppliers), simulated expert queue, and scenario progress reset to clean hackathon defaults.');
    } catch (err) {
      setStatusNotice(err instanceof Error ? err.message : 'Could not reset demo data.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="rounded-3xl bg-[#183B2B] text-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B942]">
            <Presentation className="w-4 h-4" aria-hidden="true" />
            <span>Team 8 Hackathon Judge Presentation · November 20–22, 2026</span>
          </div>
          <h1 className="font-display text-2xl sm:text-4xl font-extrabold leading-tight">
            Hackathon Demo Mode · 4 Demonstration Journeys
          </h1>
          <p className="text-sm sm:text-base text-white/85 leading-relaxed">
            Walk judges through all 4 required Team 8 demonstration journeys covering our 8 agricultural problem statements, or reset all demo listings back to clean defaults before presenting.
          </p>
        </div>

        <button
          type="button"
          disabled={resetting}
          onClick={() => void handleResetDemo()}
          className="min-h-[48px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#F5B942] text-[#183B2B] text-sm font-extrabold hover:bg-[#f7c55f] disabled:opacity-60 shrink-0"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          <span>{resetting ? 'Resetting Demo...' : isAdmin ? 'Reset Demo Data' : 'Reset My Progress'}</span>
        </button>
      </div>

      {statusNotice && (
        <div role="status" className="rounded-2xl bg-[#DDEFE0] border border-[#16803C]/30 p-4 text-sm font-semibold text-[#183B2B] flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-[#16803C] shrink-0" aria-hidden="true" />
          <span>{statusNotice}</span>
        </div>
      )}

      <div className="rounded-2xl bg-sky-50 border border-sky-300 p-4 flex flex-wrap items-center justify-between gap-3" data-testid="ministry-analytics-link">
        <p className="text-sm font-bold text-[#183B2B]">New: Ministry &amp; Extension View (Demo): county production, illustrative food security index, weather, disease signals and a simulated SMS/USSD campaign tool. Synthetic data only.</p>
        <Link to="/ministry-analytics" className="inline-flex items-center min-h-[44px] rounded-xl bg-[#183B2B] text-white text-sm font-bold px-4">Open the dashboard demo</Link>
      </div>

      <div className="rounded-2xl bg-[#DDEFE0] border border-[#16803C]/30 p-4 flex flex-wrap items-center justify-between gap-3" data-testid="cassava-demo-link">
        <p className="text-sm font-bold text-[#183B2B]">New: the 11-step Bong County cassava farmer demonstration (crop problems, offline saving, expert question, calculator).</p>
        <Link to="/demo/cassava" className="inline-flex items-center min-h-[44px] rounded-xl bg-[#16803C] text-white text-sm font-bold px-4">Open the cassava demo</Link>
      </div>

      {/* 4 COMPLETE DEMONSTRATION JOURNEYS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* JOURNEY 1 */}
        <article className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#16803C]">
                <Sprout className="w-4 h-4" aria-hidden="true" />
                JOURNEY 1 · ACCESSIBLE CROP ADVICE
              </span>
              {completed.journey1 && (
                <span className="text-xs font-bold text-[#16803C] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Viewed
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold text-[#183B2B]">
              Cassava Crop Guide + Smart Listen Mode
            </h2>
            <p className="text-sm text-[#183B2B]/80 leading-relaxed">
              Opens the illustrated Cassava guide with Smart Listen Mode active so farmers with limited reading fluency can hear planting, pest, soil, harvest, and storage advice aloud.
            </p>
            <ul className="list-disc pl-5 text-xs text-[#183B2B]/75 space-y-1">
              <li>Activates browser-based Smart Listen audio reading</li>
              <li>Covers all 10 crop sections plus live marketplace cassava links</li>
              <li>Connects directly to Soil &amp; Fertilizer and Pests &amp; Diseases</li>
            </ul>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleJourney1}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#16803C] text-white text-sm font-bold hover:bg-[#116630]"
            >
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              <span>Launch Journey 1 (Cassava + Listen)</span>
            </button>
            <Link
              to="/soil"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1 text-xs font-semibold text-[#16803C] hover:underline"
            >
              <span>Inspect Soil &amp; Fertilizer Selector</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </article>

        {/* JOURNEY 2 */}
        <article className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#16803C]">
                <PhoneCall className="w-4 h-4" aria-hidden="true" />
                JOURNEY 2 · LOCAL-LANGUAGE ACCESS
              </span>
              {completed.journey2 && (
                <span className="text-xs font-bold text-[#16803C] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Viewed
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold text-[#183B2B]">
              Simulated Phone Service · Bassa &amp; Mano
            </h2>
            <p className="text-sm text-[#183B2B]/80 leading-relaxed">
              Shows how farmers without smartphones dial a simulated button-phone menu to select Bassa or Mano voice guidance on rice, cassava, and weather risks.
            </p>
            <ul className="list-disc pl-5 text-xs text-[#183B2B]/75 space-y-1">
              <li>Explicitly labeled SIMULATED PHONE CALL — NO TELECOM YET</li>
              <li>Demonstrates DTMF key presses and Bassa/Mano audio slots</li>
              <li>Links to Local Language Lab speaker consent workflow</li>
            </ul>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleJourney2}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#16803C] text-white text-sm font-bold hover:bg-[#116630]"
            >
              <PhoneCall className="w-4 h-4" aria-hidden="true" />
              <span>Launch Journey 2 (Simulated Phone)</span>
            </button>
            <Link
              to="/language-lab"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1 text-xs font-semibold text-[#16803C] hover:underline"
            >
              <span>Inspect Bassa &amp; Mano Audio Lab</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </article>

        {/* JOURNEY 3 */}
        <article className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#16803C]">
                <Store className="w-4 h-4" aria-hidden="true" />
                JOURNEY 3 · DIRECT CALL MARKETPLACE
              </span>
              {completed.journey3 && (
                <span className="text-xs font-bold text-[#16803C] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Viewed
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold text-[#183B2B]">
              Filter by County · Details Popup · Call Farmer
            </h2>
            <p className="text-sm text-[#183B2B]/80 leading-relaxed">
              Removes written buyer inquiry literacy barriers: buyers filter by county, inspect rice, cassava, or tilapia details, and call farmers directly via telephone.
            </p>
            <ol className="list-decimal pl-5 text-xs text-[#183B2B]/75 space-y-1">
              <li>Filter products by Liberian county (e.g., Lofa, Bong, or Bomi)</li>
              <li>Select Rice, Cassava, or Tilapia and tap <strong>Details</strong></li>
              <li>Show full location, availability, and seller details modal</li>
              <li>Tap <strong>Call Farmer</strong> for dialer or labeled demo simulation</li>
            </ol>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleJourney3}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#16803C] text-white text-sm font-bold hover:bg-[#116630]"
            >
              <PhoneCall className="w-4 h-4" aria-hidden="true" />
              <span>Launch Journey 3 (Marketplace + Call Farmer)</span>
            </button>
          </div>
        </article>

        {/* JOURNEY 4 */}
        <article className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#16803C]">
                <BarChart3 className="w-4 h-4" aria-hidden="true" />
                JOURNEY 4 · MINISTRY DASHBOARD
              </span>
              {completed.journey4 && (
                <span className="text-xs font-bold text-[#16803C] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Viewed
                </span>
              )}
            </div>
            <h2 className="font-display text-xl font-bold text-[#183B2B]">
              Ministry of Agriculture Food Security Dashboard
            </h2>
            <p className="text-sm text-[#183B2B]/80 leading-relaxed">
              Presents county-level synthetic demonstration insights showing registered farmers, crop/livestock distribution, reported pest/weather pressures, and marketplace totals.
            </p>
            <ul className="list-disc pl-5 text-xs text-[#183B2B]/75 space-y-1">
              <li>Explicitly labeled Synthetic Demonstration Data — Not Official</li>
              <li>Interactive county filter updates regional breakdowns</li>
              <li>4 visual charts + live prototype marketplace counter</li>
            </ul>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleJourney4}
              className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#16803C] text-white text-sm font-bold hover:bg-[#116630]"
            >
              <BarChart3 className="w-4 h-4" aria-hidden="true" />
              <span>Launch Journey 4 (Ministry Dashboard)</span>
            </button>
            <Link
              to="/weather"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-1 text-xs font-semibold text-[#16803C] hover:underline"
            >
              <span>Inspect Sample Weather Planning</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        </article>
      </div>

      {/* BONUS AI + EXPERT + LIVESTOCK QUICK LAUNCH */}
      <div className="rounded-3xl bg-[#F3F8F0] border border-[#183B2B]/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-bold text-[#16803C] flex items-center gap-1.5">
            <Feather className="w-4 h-4" aria-hidden="true" />
            Additional Judge Walkthrough · AI Advisor, Pests &amp; Livestock
          </p>
          <p className="text-sm font-semibold text-[#183B2B]">
            Test non-diagnostic Poultry AI advice, photo escalation to our Simulated Extension Officer queue, or open the Livestock &amp; Fish Farming hub.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleBonusPoultry}
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#183B2B] text-white text-xs font-bold hover:bg-[#1f4c38]"
          >
            <Users className="w-4 h-4 text-[#F5B942]" aria-hidden="true" />
            <span>Poultry AI + Expert</span>
          </button>
          <Link
            to="/livestock/poultry"
            className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#183B2B]/15 text-xs font-bold text-[#183B2B] hover:bg-[#DDEFE0]"
          >
            <span>Livestock &amp; Aquaculture</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
