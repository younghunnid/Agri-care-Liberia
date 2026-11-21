import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle, CloudRain, Crosshair, Droplets, MapPin, RefreshCw, Thermometer, Wind} from 'lucide-react';
import {LIBERIA_COUNTIES} from '../../../server/constants';
import {useApp} from '../../context/AppContext';
import {formatAge} from '../../lib/dataCache';
import {WEATHER_LOCATIONS, findLocation, locationsOfCounty, validCoordinates, roundCoordinate} from '../../lib/weather/locations';
import {REMINDER_MAX_AGE_MIN, ageMinutes, loadSelection, loadWeather, saveSelection, upcomingDays, type WeatherLoad, type WeatherSelection} from '../../lib/weather/client';
import {WEATHER_REMINDER_NOTE, weatherReminders} from '../../lib/weather/advice';
import {SpeakButton} from '../SpeakButton';

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'});
const clock = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? 'unknown time' : d.toLocaleString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}); };
const sel = 'w-full min-h-[48px] rounded-xl border-2 border-[#183B2B]/25 bg-white px-3 text-base';

/** Live agricultural weather for a chosen place in Liberia. `compact` is the card on Farmer Today. */
export const LiveWeatherPanel: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const {isOnline} = useApp();
  const [selection, setSelection] = useState<WeatherSelection>(() => loadSelection());
  const [load, setLoad] = useState<WeatherLoad | null>(null);
  const [busy, setBusy] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const runId = useRef(0);
  const refresh = useCallback(async (s: WeatherSelection, online: boolean) => {
    const id = ++runId.current; setBusy(true);
    const r = await loadWeather(s, online);
    if (id === runId.current) { setLoad(r); setBusy(false); }
  }, []);
  useEffect(() => { void refresh(selection, isOnline); }, [selection, isOnline, refresh]);
  useEffect(() => { if (!isOnline) return; const t = setInterval(() => void refresh(selection, true), 30 * 60_000); return () => clearInterval(t); }, [selection, isOnline, refresh]);
  const choose = (s: WeatherSelection) => { saveSelection(s); setGeoNote(null); setSelection(s); };

  const town = selection.kind === 'town' ? findLocation(selection.id) : undefined;
  const county = town?.county ?? (LIBERIA_COUNTIES[0] as string);
  const towns = useMemo(() => locationsOfCounty(county), [county]);
  const useMyLocation = () => {
    setGeoNote(null);
    if (!navigator.geolocation) { setGeoNote('This browser cannot share a position. Choose your place from the list.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { const lat = roundCoordinate(p.coords.latitude, 1), lon = roundCoordinate(p.coords.longitude, 1); if (!validCoordinates(lat, lon)) { setGeoNote('Your position is outside Liberia. Choose a Liberian place from the list.'); return; } choose({kind: 'device', lat, lon}); },
      (e) => setGeoNote(e.code === 1 ? 'Location was not allowed, so nothing was shared. Choose your place from the list.' : 'Your position could not be found. Choose your place from the list.'),
      {timeout: 10000, maximumAge: 600000});
  };

  const report = load?.report ?? null;
  const days = report ? (load!.status === 'saved' ? upcomingDays(report) : report.daily) : [];
  const dataTime = report?.fetchedAt ?? null; const age = ageMinutes(dataTime);
  const isLive = load?.status === 'live';
  const recent = age !== null && age <= REMINDER_MAX_AGE_MIN;
  const reminders = report && (isLive || recent) && days.length ? weatherReminders({daily: days}) : [];
  const today = days[0]; const next = days.slice(1, compact ? 4 : 7);

  const badge = !load ? null
    : load.status === 'live' ? {cls: 'bg-[#DDEFE0] border-[#16803C]/50 text-[#0F5C2A]', text: 'Live forecast'}
    : load.status === 'provider-down' ? {cls: 'bg-amber-50 border-amber-400 text-amber-950', text: 'Not live: the weather service did not answer, this is its last copy'}
    : load.status === 'saved' ? {cls: 'bg-amber-50 border-amber-400 text-amber-950', text: isOnline ? 'Not live: saved forecast (the weather could not be loaded)' : 'Offline: saved forecast, may be old'}
    : {cls: 'bg-red-50 border-red-300 text-[#7A1010]', text: 'No forecast available'};

  const spoken = report && today ? `Weather for ${report.location.name}. ${isLive ? 'Live forecast.' : 'This is a saved forecast and may be old.'} Now ${Math.round(report.current.temperatureC)} degrees, ${report.current.condition}. Today ${today.condition}, high ${Math.round(today.tMaxC)}, low ${Math.round(today.tMinC)}, rain ${today.rainMm} millimetres${today.rainChancePct !== null ? `, chance of rain ${today.rainChancePct} percent` : ''}. ${reminders.map((r) => r.title).join('. ')}` : '';

  return (
    <section aria-labelledby={compact ? 'lw-compact-h' : 'lw-h'} className="rounded-3xl bg-white border-2 border-[#183B2B]/15 p-4 sm:p-6 space-y-4 text-[#183B2B]" data-testid="live-weather">
      <div className="flex items-start justify-between gap-3">
        <h2 id={compact ? 'lw-compact-h' : 'lw-h'} className="flex items-center gap-2 text-xl font-extrabold"><CloudRain className="w-5 h-5 text-[#16803C]" aria-hidden /> {compact ? 'Weather for my farm' : 'Weather forecast'}</h2>
        {report && <SpeakButton compact id={`live-weather-${report.location.id ?? 'device'}`} label="Weather" text={spoken} />}
      </div>

      <div className="space-y-3" role="group" aria-label="Choose where you farm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor={`lw-county-${compact}`} className="block text-base font-bold mb-1">County</label>
            <select id={`lw-county-${compact}`} data-testid="lw-county" className={sel} value={selection.kind === 'town' ? county : ''} onChange={(e) => { const first = locationsOfCounty(e.target.value)[0]; if (first) choose({kind: 'town', id: first.id}); }}>
              {selection.kind === 'device' && <option value="">Your device location</option>}
              {LIBERIA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div><label htmlFor={`lw-town-${compact}`} className="block text-base font-bold mb-1">Town</label>
            <select id={`lw-town-${compact}`} data-testid="lw-town" className={sel} value={selection.kind === 'town' ? selection.id : ''} onChange={(e) => choose({kind: 'town', id: e.target.value})} disabled={selection.kind === 'device'}>
              {selection.kind === 'device' ? <option value="">Approximate position</option> : towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
        </div>
        <button type="button" onClick={useMyLocation} data-testid="lw-geo" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border-2 border-[#183B2B]/25 px-4 text-base font-bold"><Crosshair className="w-5 h-5" aria-hidden /> Use my location</button>
        <p className="text-sm text-[#183B2B]/80">Optional. Your phone asks your permission first. Only a rounded position (about 10 km) is used to get the forecast and it is not saved on our server.</p>
        {geoNote && <p role="status" className="text-sm font-bold text-amber-900" data-testid="lw-geo-note">{geoNote}</p>}
      </div>

      <div aria-live="polite" className="space-y-3" data-testid="lw-body">
        {!load && <p role="status" className="text-base font-semibold">Loading the forecast…</p>}
        {badge && <p className={`rounded-xl border-2 px-3 py-2 text-base font-bold ${badge.cls}`} data-testid="lw-status" data-status={load!.status}>{badge.text}</p>}
        {load?.status === 'none' && <p className="text-base" data-testid="lw-none">{isOnline ? (load.error ?? 'The weather could not be loaded.') : 'You are offline and no forecast was saved on this phone yet.'} No weather numbers are shown because none are available. Open this page with internet once to save a forecast.</p>}
        {load?.status === 'saved' && load.error && isOnline && <p className="text-sm font-bold text-amber-900">{load.error}</p>}

        {report && (
          <>
            <p className="flex items-center gap-2 text-lg font-extrabold" data-testid="lw-place"><MapPin className="w-5 h-5 text-[#16803C]" aria-hidden /> {report.location.name}{report.location.county ? `, ${report.location.county} County` : ''}</p>
            {load!.status !== 'live' && age !== null && <p className="flex items-start gap-2 text-base font-bold text-amber-900" data-testid="lw-old"><AlertTriangle className="w-5 h-5 shrink-0" aria-hidden /> This forecast was retrieved {formatAge(report.fetchedAt)}. It is not live weather.{!recent && ' It is old: do not rely on it.'}</p>}
            {days.length === 0 ? <p className="text-base font-bold" data-testid="lw-expired">This saved forecast has run out: all its days have passed. Connect to the internet to get a new one.</p> : (
              <>
                <div className="rounded-2xl bg-[#F3F8F0] p-4" data-testid="lw-current">
                  <p className="text-sm font-bold uppercase tracking-wide">{load!.status === 'live' ? 'Now' : 'When it was retrieved'}</p>
                  <p className="flex items-center gap-3 text-4xl font-extrabold"><Thermometer className="w-8 h-8 text-[#16803C]" aria-hidden /> {Math.round(report.current.temperatureC)}°C <span className="text-xl font-bold">{report.current.condition}</span></p>
                  <ul className="mt-2 grid grid-cols-2 gap-2 text-base font-semibold"><li className="flex items-center gap-2"><Droplets className="w-5 h-5" aria-hidden /> Humidity {Math.round(report.current.humidityPct)}%</li><li className="flex items-center gap-2"><Wind className="w-5 h-5" aria-hidden /> Wind {Math.round(report.current.windKmh)} km/h</li></ul>
                </div>
                {today && <div className="rounded-2xl border-2 border-[#183B2B]/15 p-4" data-testid="lw-today"><p className="text-sm font-bold uppercase tracking-wide">Today · {weekday(today.date)}</p>
                  <p className="text-xl font-extrabold">{today.condition}</p>
                  <ul className="mt-1 space-y-1 text-base font-semibold"><li>High {Math.round(today.tMaxC)}°C · Low {Math.round(today.tMinC)}°C</li><li>Rain: {today.rainMm} mm expected</li><li>Chance of rain: {today.rainChancePct === null ? 'not available' : `${today.rainChancePct}%`}</li><li>Strongest wind: {Math.round(today.windMaxKmh)} km/h</li></ul></div>}
                {next.length > 0 && <div data-testid="lw-upcoming"><h3 className="text-lg font-extrabold mb-1">Coming days</h3>
                  <ul className="divide-y divide-[#183B2B]/10 rounded-2xl border-2 border-[#183B2B]/15">{next.map((d) => <li key={d.date} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3 text-base" data-testid="lw-day"><span className="font-extrabold min-w-[6.5rem]">{weekday(d.date)}</span><span className="flex-1">{d.condition}</span><span className="font-semibold">{Math.round(d.tMaxC)}° / {Math.round(d.tMinC)}°</span><span className="font-semibold">Rain {d.rainMm} mm{d.rainChancePct !== null ? ` · ${d.rainChancePct}%` : ''}</span></li>)}</ul></div>}
                {reminders.length > 0 && !compact && (
                  <div className="space-y-2" data-testid="lw-reminders"><h3 className="text-lg font-extrabold">Farming reminders from the forecast</h3>
                    {reminders.map((r) => <p key={r.id} className={`rounded-xl border-2 p-3 text-base ${r.tone === 'watch' ? 'border-amber-400 bg-amber-50' : 'border-[#16803C]/40 bg-[#F3F8F0]'}`} data-testid="lw-reminder"><strong>{r.title}.</strong> {r.detail}</p>)}
                    <p className="text-sm text-[#183B2B]/80">{WEATHER_REMINDER_NOTE}</p></div>)}
                {reminders.length > 0 && compact && <p className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-base font-bold" data-testid="lw-reminder-compact">{reminders[0].title}. <Link to="/weather" className="underline">See details and reminders</Link></p>}
              </>
            )}
            <div className="space-y-1 border-t border-[#183B2B]/15 pt-3 text-sm" data-testid="lw-source">
              <p>Forecast for <strong>{report.location.name}</strong>. Retrieved from the provider: <strong>{clock(report.fetchedAt)}</strong>{load!.savedAt ? <> · saved on this phone: {clock(load!.savedAt)}</> : null}.</p>
              <p><a href={report.source.url} target="_blank" rel="noopener noreferrer" className="font-bold text-[#0F5C2A] underline">{report.source.attribution}</a> · licence <a href={report.source.licenceUrl} target="_blank" rel="noopener noreferrer" className="underline">{report.source.licence}</a>. Forecasts can be wrong.</p>
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void refresh(selection, isOnline)} disabled={busy || !isOnline} data-testid="lw-refresh" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#16803C] px-4 text-base font-extrabold text-white disabled:opacity-50"><RefreshCw className={`w-5 h-5 ${busy ? 'animate-spin' : ''}`} aria-hidden /> {isOnline ? 'Update forecast' : 'Offline: cannot update'}</button>
        {compact && <Link to="/weather" className="inline-flex min-h-[48px] items-center rounded-xl border-2 border-[#183B2B]/25 px-4 text-base font-bold" data-testid="lw-more">Full forecast</Link>}
      </div>
    </section>
  );
};
export const WEATHER_PLACE_COUNT = WEATHER_LOCATIONS.length;
