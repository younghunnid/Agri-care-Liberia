import {formatAge} from '../dataCache';
import {weatherCondition} from './codes';
import type {WeatherDay} from './types';

/**
 * Weather as the USSD simulator shows it. The handset has no network of its own: the page hands it the forecast it loaded for the farmer's place (or the
 * copy saved on this phone). Nothing is invented: with no forecast the screen says so.
 */
export interface UssdWeather {
  state: 'loading' | 'none' | 'live' | 'provider-down' | 'saved';
  place: string;
  /** When the provider data was retrieved (ISO). */
  fetchedAt: string | null;
  nowC: number | null; nowCondition: string | null;
  days: Pick<WeatherDay, 'date' | 'condition' | 'tMaxC' | 'tMinC' | 'rainMm' | 'rainChancePct'>[];
}
export const NO_USSD_WEATHER: UssdWeather = {state: 'loading', place: 'your place', fetchedAt: null, nowC: null, nowCondition: null, days: []};
const dayName = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {weekday: 'short', timeZone: 'UTC'});

export function ussdWeatherLines(w: UssdWeather, now = Date.now()): string[] {
  if (w.state === 'loading') return ['Loading the forecast. Use Refresh below the phone.'];
  if (w.state === 'none' || !w.fetchedAt || w.days.length === 0) return ['No forecast on this phone yet.', 'Open the app once with internet to save one. No weather is made up.'];
  const when = w.state === 'live' ? 'LIVE forecast.' : w.state === 'provider-down' ? `NOT LIVE: the service did not answer. Last copy from ${formatAge(w.fetchedAt, now)}.` : `SAVED copy from ${formatAge(w.fetchedAt, now)}. May be old, not live.`;
  const out = [when];
  if (w.nowC !== null && w.state === 'live') out.push(`Now ${Math.round(w.nowC)}C, ${w.nowCondition ?? ''}.`);
  w.days.slice(0, 3).forEach((d, i) => out.push(`${i === 0 ? 'Today' : dayName(d.date)}: ${d.condition}, ${Math.round(d.tMinC)}-${Math.round(d.tMaxC)}C, rain ${Math.round(d.rainMm)}mm${d.rainChancePct !== null ? `, ${d.rainChancePct}%` : ''}.`));
  out.push('Forecast can be wrong. Source: Open-Meteo.');
  return out;
}
export { weatherCondition };
