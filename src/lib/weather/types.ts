export interface WeatherDay {date: string; weatherCode: number; condition: string; tMaxC: number; tMinC: number; rainMm: number; rainChancePct: number | null; windMaxKmh: number}
export interface WeatherReport {
  location: {id: string | null; name: string; county: string | null; lat: number; lon: number; kind: 'town' | 'device'};
  source: {name: 'Open-Meteo'; url: string; licence: string; licenceUrl: string; attribution: string};
  /** When OUR SERVER got this data from the provider (ISO). A cached answer keeps its original time. */
  fetchedAt: string;
  /** True when the provider could not be reached and this is the last good copy. It is never presented as live. */
  stale: boolean;
  timezone: string;
  current: {time: string; temperatureC: number; humidityPct: number; windKmh: number; precipitationMm: number; weatherCode: number; condition: string};
  daily: WeatherDay[];
}
export const OPEN_METEO = {name: 'Open-Meteo' as const, url: 'https://open-meteo.com/', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Weather data by Open-Meteo.com'};
