import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Landmark,
  LineChart,
  PieChart,
  Store,
} from 'lucide-react';
import {apiFetch} from '../../lib/api';
import {useApp} from '../../context/AppContext';
import {SYNTHETIC_MINISTRY_DATA} from '../../data/weatherSoilMinistry';
import {SpeakButton} from '../../components/SpeakButton';
import {SavedInfoBar} from '../../components/SavedInfoBar';
import {
  cacheGet,
  cacheSet,
  MINISTRY_SUMMARY_KEY,
  summaryFreshness,
  type CachedSnapshot,
} from '../../lib/dataCache';

interface PrototypeCounts {
  demoAndExperimentalData: {
    marketplaceListings: number;
    marketplaceInquiries: number;
    localLanguageRecordings: number;
    simulatedExpertRequests: number;
  };
}

export const MinistryDashboardPage: React.FC = () => {
  const {isOnline} = useApp();
  const [countyFilter, setCountyFilter] = useState('All Counties');
  const [snap, setSnap] = useState<CachedSnapshot<PrototypeCounts['demoAndExperimentalData']> | null>(null);
  const [fromSaved, setFromSaved] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loadedSaved, setLoadedSaved] = useState(false);
  const liveDemoCounts = snap?.data ?? null;

  // Only the public aggregate counts are saved (see lib/dataCache.ts allow-list).
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await apiFetch<PrototypeCounts>('/prototype/management-summary');
      // Saved only after the request succeeded, so a failure can never wipe the previous copy.
      const saved = await cacheSet(MINISTRY_SUMMARY_KEY, res.demoAndExperimentalData);
      setSnap(saved);
      setFromSaved(false);
    } catch {
      setFromSaved(true); // what is on screen is the older saved copy, not something just retrieved
      setRefreshError('Could not refresh the counts.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void cacheGet<PrototypeCounts['demoAndExperimentalData']>(MINISTRY_SUMMARY_KEY).then((saved) => {
      if (!alive) return;
      if (saved) setSnap((cur) => cur ?? saved);
      setLoadedSaved(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isOnline) void refresh();
  }, [isOnline, refresh]);

  const rows =
    countyFilter === 'All Counties'
      ? SYNTHETIC_MINISTRY_DATA.counties
      : SYNTHETIC_MINISTRY_DATA.counties.filter((c) => c.county === countyFilter);

  const totalFarmers = rows.reduce((sum, r) => sum + r.demoFarmers, 0);
  const totalRequests = rows.reduce((sum, r) => sum + r.advisoryRequests, 0);
  const totalEstRice = rows.reduce((sum, r) => sum + r.estimatedRiceTons, 0);
  const totalEstCassava = rows.reduce((sum, r) => sum + r.estimatedCassavaTons, 0);
  const maxFarmers = Math.max(...SYNTHETIC_MINISTRY_DATA.counties.map((c) => c.demoFarmers));
  const maxProblem = Math.max(...SYNTHETIC_MINISTRY_DATA.reportedProblems.map((p) => p.count));

  // Conic gradient stops for Pie Chart
  let runningPct = 0;
  const pieStops = SYNTHETIC_MINISTRY_DATA.productDistribution
    .map((slice) => {
      const start = runningPct;
      runningPct += slice.pct;
      return `${slice.color} ${start}% ${runningPct}%`;
    })
    .join(', ');

  // SVG Line Chart coordinates
  const trendPoints = SYNTHETIC_MINISTRY_DATA.productionTrends;
  const maxTrend = 1700;
  const buildPolyline = (key: 'riceTons' | 'cassavaTons') =>
    trendPoints
      .map((pt, idx) => {
        const x = 35 + idx * 80;
        const y = 140 - Math.round((pt[key] / maxTrend) * 115);
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="rounded-3xl bg-[#183B2B] text-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B942]">
            <Landmark className="w-4 h-4" aria-hidden="true" />
            <span>Module 5 · Ministry Food Security Statistics Prototype</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold">
            Food Security &amp; Agricultural Insights Dashboard
          </h1>
          <p className="text-sm sm:text-base text-white/85 leading-relaxed">
            Demonstrates how county-level agricultural reports, advisory questions, and seasonal trends could help agricultural planners spot early food-security risks across Liberia.
          </p>
        </div>

        <SpeakButton
          id="ministry-overview"
          label="Dashboard Overview"
          text={`Synthetic Ministry Demonstration Dashboard. Filter: ${countyFilter}. Showing ${totalFarmers} synthetic demonstration farmers, ${totalRequests} sample advisory requests, and ${totalEstRice} metric tons estimated sample rice production. Reminder: Synthetic demonstration data only, not official Ministry of Agriculture statistics.`}
        />
      </div>

      {/* MANDATORY DATA INTEGRITY NOTICE */}
      <div className="rounded-2xl bg-[#F5B942]/30 border-2 border-[#F5B942] p-4 sm:p-5 flex items-start gap-3 text-sm text-[#183B2B]">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-extrabold uppercase tracking-wide text-xs sm:text-sm">
            {SYNTHETIC_MINISTRY_DATA.notice}
          </p>
          <p className="text-xs sm:text-sm text-[#183B2B]/90 leading-relaxed">
            {SYNTHETIC_MINISTRY_DATA.disclaimer}
          </p>
        </div>
      </div>

      {!isOnline && (
        <p role="status" className="rounded-2xl bg-amber-50 border border-amber-300 px-4 py-3 text-sm font-semibold text-amber-900">
          You are offline. Everything on this page is saved information, not live.
        </p>
      )}

      {/* County Filter + Summary KPIs */}
      <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <label htmlFor="ministry-county-filter" className="font-display font-bold text-sm text-[#183B2B]">
          Filter Synthetic Dashboard by County:
        </label>
        <select
          id="ministry-county-filter"
          value={countyFilter}
          onChange={(e) => setCountyFilter(e.target.value)}
          className="min-h-[44px] sm:w-64 rounded-xl border border-[#183B2B]/20 bg-[#F3F8F0] px-3 text-sm font-semibold"
        >
          <option value="All Counties">All Sample Counties (7)</option>
          {SYNTHETIC_MINISTRY_DATA.counties.map((c) => (
            <option key={c.county} value={c.county}>
              {c.county} County
            </option>
          ))}
        </select>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {label: 'Demo Registered Farmers (Synthetic)', val: totalFarmers.toLocaleString()},
          {label: 'Sample Advisory Requests', val: totalRequests.toLocaleString()},
          {label: 'Sample Rice Production (Est. Tons)', val: `${totalEstRice} t`},
          {label: 'Sample Cassava Production (Est. Tons)', val: `${totalEstCassava} t`},
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl bg-white border border-[#183B2B]/10 p-5 space-y-1">
            <p className="text-xs font-semibold text-[#16803C]">Synthetic Demo Data</p>
            <p className="font-display text-2xl sm:text-3xl font-extrabold tabular-nums text-[#183B2B]">
              {kpi.val}
            </p>
            <p className="text-xs text-[#183B2B]/75">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CHART 1: Farmers by County — Bar Chart */}
        <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[#16803C]">Synthetic Demonstration Data</p>
              <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
                <span>Farmers by County (Bar Chart)</span>
              </h2>
            </div>
          </div>

          <div className="space-y-2.5">
            {SYNTHETIC_MINISTRY_DATA.counties.map((c) => {
              const widthPct = Math.round((c.demoFarmers / maxFarmers) * 100);
              const isSelected = countyFilter === c.county;
              return (
                <div key={c.county} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className={isSelected ? 'text-[#16803C] font-extrabold' : 'text-[#183B2B]'}>
                      {c.county}
                    </span>
                    <span className="tabular-nums text-[#183B2B]/75">{c.demoFarmers} farmers</span>
                  </div>
                  <div className="h-3.5 rounded-full bg-[#F3F8F0] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isSelected ? 'bg-[#F5B942]' : 'bg-[#16803C]'
                      }`}
                      style={{width: `${widthPct}%`}}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* CHART 2: Agricultural Product Distribution — Pie Chart */}
        <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-[#16803C]">Synthetic Demonstration Data</p>
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <PieChart className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <span>Agricultural Product Distribution (Pie Chart)</span>
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
            <div
              role="img"
              aria-label="Pie chart showing synthetic product category shares"
              className="w-44 h-44 rounded-full shrink-0 border-4 border-[#F3F8F0] shadow-inner relative flex items-center justify-center"
              style={{background: `conic-gradient(${pieStops})`}}
            >
              <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center text-center">
                <span className="text-[10px] font-bold text-[#183B2B]/70">SAMPLE</span>
                <span className="text-xs font-extrabold text-[#183B2B]">100%</span>
              </div>
            </div>

            <div className="space-y-2 flex-1 w-full">
              {SYNTHETIC_MINISTRY_DATA.productDistribution.map((slice) => (
                <div key={slice.label} className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="flex items-center gap-2 font-medium text-[#183B2B]">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{backgroundColor: slice.color}}
                    />
                    {slice.label}
                  </span>
                  <span className="font-bold tabular-nums text-[#183B2B]">{slice.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CHART 3: Reported Agricultural Problems — Bar Chart */}
        <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-[#16803C]">Synthetic + Aggregated Prototype Reports</p>
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#F5B942]" aria-hidden="true" />
              <span>Reported Crop &amp; Livestock Challenges</span>
            </h2>
          </div>

          <div className="space-y-2.5">
            {SYNTHETIC_MINISTRY_DATA.reportedProblems.map((p) => {
              const widthPct = Math.round((p.count / maxProblem) * 100);
              return (
                <div key={p.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-[#183B2B]">{p.label}</span>
                    <span className="tabular-nums text-[#183B2B]/75">{p.count} reports (demo)</span>
                  </div>
                  <div className="h-3.5 rounded-full bg-[#F3F8F0] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#183B2B]"
                      style={{width: `${widthPct}%`}}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* CHART 4: Sample Production Trends — Line Chart */}
        <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold text-[#16803C]">Synthetic Demonstration Data (Metric Tons)</p>
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <LineChart className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <span>Sample Seasonal Production Trends</span>
            </h2>
          </div>

          <svg viewBox="0 0 390 175" className="w-full h-44 bg-[#F3F8F0]/60 rounded-2xl p-2" role="img" aria-label="Line chart of sample rice and cassava seasonal trends">
            <line x1="25" y1="140" x2="375" y2="140" stroke="#183B2B" strokeOpacity="0.2" />
            <polyline
              fill="none"
              stroke="#16803C"
              strokeWidth="3"
              points={buildPolyline('cassavaTons')}
            />
            <polyline
              fill="none"
              stroke="#F5B942"
              strokeWidth="3"
              points={buildPolyline('riceTons')}
            />
            {trendPoints.map((pt, idx) => {
              const x = 35 + idx * 80;
              const yC = 140 - Math.round((pt.cassavaTons / maxTrend) * 115);
              const yR = 140 - Math.round((pt.riceTons / maxTrend) * 115);
              return (
                <g key={pt.season}>
                  <circle cx={x} cy={yC} r="4" fill="#16803C" />
                  <circle cx={x} cy={yR} r="4" fill="#F5B942" />
                  <text x={x} y="160" textAnchor="middle" fontSize="9" fill="#183B2B">
                    {pt.season}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="flex flex-wrap gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#16803C]" /> Cassava (Sample Tons)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#F5B942]" /> Rice (Sample Tons)
            </span>
          </div>
        </section>
      </div>

      {/* MARKETPLACE ACTIVITY CARDS + COUNTY FOOD SECURITY TABLE */}
      <section className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#16803C]">
              Live Prototype Marketplace Counts + Synthetic County Indicators
            </p>
            <h2 className="font-display text-lg font-bold text-[#183B2B] flex items-center gap-2">
              <Store className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
              <span>Marketplace Activity &amp; County Indicators</span>
            </h2>
          </div>
          <Link to="/marketplace" className="text-xs font-bold text-[#16803C] hover:underline">
            Open Marketplace Prototype
          </Link>
        </div>

        <SavedInfoBar
          label="Prototype counts from this server (marketplace, simulated expert reports, language entries). Not Ministry statistics."
          fetchedAt={snap?.fetchedAt ?? null}
          fromSaved={fromSaved}
          online={isOnline}
          refreshing={refreshing}
          refreshError={refreshError}
          onRefresh={() => void refresh()}
        >
          {snap && summaryFreshness(snap) === 'stale' && (
            <p role="status" className="text-xs font-bold text-amber-900">
              These counts are more than 24 hours old. Refresh when you are connected.
            </p>
          )}
          {!snap && loadedSaved && (
            <p role="status" className="text-sm font-semibold text-[#183B2B]">
              No counts are saved on this phone yet. Open this page once while connected and they will be saved here.
            </p>
          )}
        </SavedInfoBar>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-[#DDEFE0] p-4">
            <p className="text-xs font-bold text-[#16803C]">Prototype Demo Listings</p>
            <p className="font-display text-2xl font-extrabold tabular-nums">
              {liveDemoCounts?.marketplaceListings ?? '—'}
            </p>
          </div>
          <div className="rounded-2xl bg-[#DDEFE0] p-4">
            <p className="text-xs font-bold text-[#16803C]">Prototype Buyer Inquiries</p>
            <p className="font-display text-2xl font-extrabold tabular-nums">
              {liveDemoCounts?.marketplaceInquiries ?? '—'}
            </p>
          </div>
          <div className="rounded-2xl bg-[#F3F8F0] p-4">
            <p className="text-xs font-bold text-[#183B2B]/70">Simulated Expert Reports</p>
            <p className="font-display text-2xl font-extrabold tabular-nums">
              {liveDemoCounts?.simulatedExpertRequests ?? '—'}
            </p>
          </div>
          <div className="rounded-2xl bg-[#F3F8F0] p-4">
            <p className="text-xs font-bold text-[#183B2B]/70">Bassa/Mano Voice Entries</p>
            <p className="font-display text-2xl font-extrabold tabular-nums">
              {liveDemoCounts?.localLanguageRecordings ?? '—'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto pt-2">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-[#183B2B]/15 text-[#183B2B]/70">
              <tr>
                <th className="py-2.5 pr-4">County</th>
                <th className="py-2.5 pr-4">Top Crop Issue (Sample)</th>
                <th className="py-2.5 pr-4">Top Livestock Concern (Sample)</th>
                <th className="py-2.5">Food Security Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#183B2B]/10">
              {rows.map((r) => (
                <tr key={r.county}>
                  <td className="py-3 pr-4 font-bold text-[#183B2B]">{r.county}</td>
                  <td className="py-3 pr-4 text-[#183B2B]/85">{r.topCropIssue}</td>
                  <td className="py-3 pr-4 text-[#183B2B]/85">{r.topLivestockIssue}</td>
                  <td className="py-3 font-semibold text-[#16803C]">{r.foodSecurityIndex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
