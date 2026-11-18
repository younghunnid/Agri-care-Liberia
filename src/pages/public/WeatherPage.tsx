import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CloudRain,
  Droplets,
  Layers,
  MapPin,
  Sprout,
  Thermometer,
} from 'lucide-react';
import {LIBERIA_COUNTIES} from '../../../server/constants';
import {getWeatherForCounty} from '../../data/weatherSoilMinistry';
import {SpeakButton} from '../../components/SpeakButton';
import {SavedInfoBar} from '../../components/SavedInfoBar';
import {useApp} from '../../context/AppContext';
import {BUNDLED_CONTENT_UPDATED} from '../../data/contentVersion';
import {
  forecastFreshness,
  formatExact,
  loadWeatherSnapshot,
  type CachedSnapshot,
  type LiveWeatherData,
} from '../../lib/dataCache';

export const WeatherPage: React.FC = () => {
  const {isOnline} = useApp();
  const [selectedCounty, setSelectedCounty] = useState<string>('Bong');
  // A saved copy of weather from a real weather service (none is connected yet, so this is normally empty).
  const [saved, setSaved] = useState<CachedSnapshot<LiveWeatherData> | null>(null);
  useEffect(() => {
    let alive = true;
    setSaved(null);
    void loadWeatherSnapshot(selectedCounty).then((s) => alive && setSaved(s));
    return () => {
      alive = false;
    };
  }, [selectedCounty]);
  const weather = saved ? saved.data.profile : getWeatherForCounty(selectedCounty);
  const freshness = saved ? forecastFreshness(saved) : null;
  const forecastExpired = freshness === 'expired';

  const weatherAudioSummary =
    `Sample agricultural weather report for ${weather.county} County. ` +
    `${weather.conditionSummary}. Temperature ${weather.tempMinC} to ${weather.tempMaxC} degrees Celsius. ` +
    `Humidity ${weather.humidityPct} percent. Seven-day sample rainfall ${weather.rainfallMm7d} millimeters. ` +
    `Weather risk notice: ${weather.riskNotice}. ` +
    `Planting guidance: ${weather.plantingGuidance}. ` +
    `Reminder: This is sample demonstration weather data, not a live meteorological forecast.`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="rounded-3xl bg-[#183B2B] text-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F5B942]">
            <CloudRain className="w-4 h-4" aria-hidden="true" />
            <span>Module 2 · Agricultural Weather Information · Sample Data</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold">
            County Weather &amp; Rainfall Planning
          </h1>
          <p className="text-sm sm:text-base text-white/85 leading-relaxed">
            Select any of Liberia’s 15 counties to check sample rainfall profiles, agricultural risk notices, and practical planting guidance.
          </p>
        </div>

        <SpeakButton
          id={`weather-${weather.county}`}
          label={`${weather.county} Weather Advice`}
          text={weatherAudioSummary}
        />
      </div>

      {/* Honest Data Source Notice */}
      <div className="rounded-2xl bg-[#F5B942]/25 border border-[#F5B942] p-4 flex items-start gap-3 text-sm text-[#183B2B]">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-bold">Sample Weather Information — Not Live Meteorological API</p>
          <p className="text-xs sm:text-sm text-[#183B2B]/85 mt-0.5">
            No live external weather feed is connected in this prototype. Figures below are representative demonstration seasonal profiles for Liberia; always combine with local sky checks and official radio updates.
          </p>
        </div>
      </div>

      {/* Where this information comes from, and how old it is */}
      {saved ? (
        <SavedInfoBar
          label={`Weather for ${selectedCounty} County saved from ${saved.data.provider}. Saved Information, not a live forecast.`}
          fetchedAt={saved.fetchedAt}
          fromSaved
          online={isOnline}
        >
          <p className="text-xs text-[#183B2B]">
            {saved.issuedAt ? `Issued: ${formatExact(saved.issuedAt)}. ` : ''}
            {saved.validUntil ? `Valid until: ${formatExact(saved.validUntil)}.` : 'The provider did not say how long it is valid.'}
          </p>
          {freshness === 'expired' && (
            <p role="alert" className="rounded-xl bg-red-100 border-2 border-red-400 px-3 py-2 text-sm font-extrabold text-red-900">
              EXPIRED FORECAST — do not use this to plan today. Reconnect and refresh, and check local sky conditions and official radio updates.
            </p>
          )}
          {freshness === 'stale' && (
            <p role="status" className="rounded-xl bg-amber-100 border border-amber-400 px-3 py-2 text-sm font-bold text-amber-900">
              This forecast is getting old. Treat it with caution.
            </p>
          )}
        </SavedInfoBar>
      ) : (
        <div className="rounded-2xl bg-white border border-[#183B2B]/15 p-4 space-y-1.5" data-testid="weather-sample-status">
          <p className="text-sm font-extrabold text-[#183B2B]">
            {isOnline ? 'Prototype sample profile' : 'Saved Information — Not Live: prototype sample profile'}
          </p>
          <p className="text-xs text-[#183B2B]/85">
            Bundled with the app (content dated {BUNDLED_CONTENT_UPDATED}). It was <strong>not</strong> retrieved from a weather service, it is{' '}
            <strong>not a forecast for today</strong>, and it never updates by itself. The 3-day outlook below is a sample, not a prediction.
          </p>
          <p className="text-xs text-[#183B2B]/70">
            Refresh: no live weather service is connected in this prototype, so there is nothing to refresh. Nothing is saved from the internet here.
          </p>
        </div>
      )}

      {/* County Picker */}
      <div className="rounded-2xl bg-white border border-[#183B2B]/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <MapPin className="w-5 h-5 text-[#16803C]" aria-hidden="true" />
          <label htmlFor="weather-county-select" className="font-display font-bold text-base text-[#183B2B]">
            Select Your County:
          </label>
        </div>
        <select
          id="weather-county-select"
          value={selectedCounty}
          onChange={(e) => setSelectedCounty(e.target.value)}
          className="min-h-[46px] sm:w-72 rounded-xl border border-[#183B2B]/20 bg-[#F3F8F0] px-4 text-sm font-semibold text-[#183B2B]"
        >
          {LIBERIA_COUNTIES.map((c) => (
            <option key={c} value={c}>
              {c} County
            </option>
          ))}
        </select>
      </div>

      {/* Weather Metrics & Advice Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#16803C]">
                  {weather.county} County · {weather.region} · {saved ? 'Saved Information' : 'Sample Profile'}
                </p>
                <h2 className="font-display text-2xl font-extrabold text-[#183B2B] mt-1">
                  {weather.conditionSummary}
                </h2>
              </div>
              <span
                className={`px-3 py-1 rounded-xl text-xs font-bold ${
                  weather.riskLevel === 'Elevated Rain Risk'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-[#DDEFE0] text-[#16803C]'
                }`}
              >
                {weather.riskLevel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-1">
                <p className="text-xs text-[#183B2B]/70 flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" /> Temperature
                </p>
                <p className="font-display text-xl font-extrabold text-[#183B2B] tabular-nums">
                  {weather.tempMinC}–{weather.tempMaxC}°C
                </p>
              </div>
              <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-1">
                <p className="text-xs text-[#183B2B]/70 flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" /> 7-Day Rain
                </p>
                <p className="font-display text-xl font-extrabold text-[#183B2B] tabular-nums">
                  {weather.rainfallMm7d} mm
                </p>
              </div>
              <div className="rounded-2xl bg-[#F3F8F0] p-4 space-y-1">
                <p className="text-xs text-[#183B2B]/70 flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-[#16803C]" aria-hidden="true" /> Humidity
                </p>
                <p className="font-display text-xl font-extrabold text-[#183B2B] tabular-nums">
                  {weather.humidityPct}%
                </p>
              </div>
            </div>

            {/* 3-Day Forecast */}
            {forecastExpired ? (
              <p role="alert" className="rounded-2xl bg-red-50 border border-red-300 p-4 text-sm font-bold text-red-900">
                The saved forecast has expired and is hidden so it cannot be mistaken for today's weather.
              </p>
            ) : (
            <div className="space-y-2.5">
              <h3 className="font-display font-bold text-sm text-[#183B2B]">
                {saved ? 'Saved Outlook (Not Live)' : 'Short-Term Sample Outlook (Demonstration)'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {weather.forecast3Day.map((f) => (
                  <div key={f.day} className="rounded-2xl border border-[#183B2B]/10 p-3.5 space-y-1">
                    <p className="text-xs font-bold text-[#16803C]">{f.day}</p>
                    <p className="text-sm font-semibold text-[#183B2B]">{f.condition}</p>
                    <p className="text-xs text-[#183B2B]/75">{f.tempRange} · {f.rainNote}</p>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Agricultural Weather Guidance & Connections */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-3xl bg-white border border-[#183B2B]/10 p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-[#183B2B]">
                Farm Actions for This Weather
              </h2>
              <SpeakButton
                compact
                id={`weather-act-${weather.county}`}
                label="Farm weather actions"
                text={`${weather.riskNotice} ${weather.plantingGuidance}`}
              />
            </div>

            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-1">
              <p className="text-xs font-bold text-amber-900">Weather Risk Notice</p>
              <p className="text-sm text-amber-950 leading-relaxed">{weather.riskNotice}</p>
            </div>

            <div className="rounded-2xl bg-[#DDEFE0] p-4 space-y-1">
              <p className="text-xs font-bold text-[#16803C]">Rainfall Planting Guidance</p>
              <p className="text-sm text-[#183B2B] leading-relaxed">{weather.plantingGuidance}</p>
            </div>

            {/* Connected Module Navigation */}
            <div className="space-y-2 pt-2 border-t border-[#183B2B]/10">
              <p className="text-xs font-bold text-[#183B2B]/70">Connected Crop &amp; Soil Guidance:</p>
              <div className="flex flex-wrap gap-2">
                {weather.recommendedCropSlugs.map((slug) => (
                  <Link
                    key={slug}
                    to={`/crops/${slug}`}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F3F8F0] border border-[#183B2B]/15 text-xs font-bold text-[#183B2B] hover:bg-[#16803C] hover:text-white transition-colors capitalize"
                  >
                    <Sprout className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{slug} Guide</span>
                  </Link>
                ))}
                <Link
                  to="/soil"
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#16803C] text-white text-xs font-bold hover:bg-[#116630]"
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Soil &amp; Drainage Tool</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
