import type {WeatherReport} from './types';

/**
 * Cautious, general reminders from a forecast. They are NOT guaranteed conditions and NOT expert-approved farming instructions: a forecast can be wrong,
 * and local conditions differ. Each says what the forecast shows and suggests something simple to CHECK, never a firm instruction.
 */
export interface WeatherReminder {id: string; tone: 'info' | 'watch'; title: string; detail: string}
export const WEATHER_REMINDER_NOTE = 'General reminders from a forecast. A forecast can be wrong. These are not expert-approved instructions: ask an agricultural extension officer when unsure.';
const day = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {weekday: 'long', timeZone: 'UTC'});

export function weatherReminders(report: Pick<WeatherReport, 'daily'>): WeatherReminder[] {
  const out: WeatherReminder[] = []; const days = report.daily.slice(0, 5);
  const heavy = days.find((d) => d.rainMm >= 25 || (d.rainMm >= 15 && (d.rainChancePct ?? 0) >= 70));
  if (heavy) out.push({id: 'heavy-rain', tone: 'watch', title: 'Heavy rain may be coming', detail: `The forecast shows about ${Math.round(heavy.rainMm)} mm of rain on ${day(heavy.date)}. You may want to check that water can drain away from your field, nursery and stored crops. This is only a forecast.`});
  const rainy = days.filter((d) => d.rainMm >= 5 && (d.rainChancePct ?? 100) >= 50).length;
  if (!heavy && rainy >= 3) out.push({id: 'wet-spell', tone: 'info', title: 'Several wet days forecast', detail: `Rain is forecast on ${rainy} of the next ${days.length} days. Wet leaves and soil can make some crop problems more likely, so you may want to look at your plants often.`});
  const total = days.reduce((s, d) => s + d.rainMm, 0);
  if (days.length >= 4 && total < 3 && days.every((d) => (d.rainChancePct ?? 0) < 30)) out.push({id: 'dry-spell', tone: 'info', title: 'Little rain forecast', detail: 'Very little rain is forecast for the next days. You may want to check how moist the soil is before planting or transplanting. A forecast can be wrong.'});
  const windy = days.find((d) => d.windMaxKmh >= 35);
  if (windy) out.push({id: 'wind', tone: 'watch', title: 'Strong wind possible', detail: `Wind up to about ${Math.round(windy.windMaxKmh)} km/h is forecast on ${day(windy.date)}. You may want to check tall crops, plant supports and loose roofing.`});
  const hot = days.find((d) => d.tMaxC >= 34);
  if (hot) out.push({id: 'heat', tone: 'watch', title: 'Hot day forecast', detail: `A high of about ${Math.round(hot.tMaxC)}°C is forecast on ${day(hot.date)}. People and animals may need extra shade and water.`});
  const storm = days.find((d) => d.weatherCode >= 95);
  if (storm) out.push({id: 'storm', tone: 'watch', title: 'Thunderstorm possible', detail: `A thunderstorm is possible on ${day(storm.date)}. If one comes, stay out of open fields and away from tall trees.`});
  return out;
}
