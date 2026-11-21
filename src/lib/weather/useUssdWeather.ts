import {useCallback, useEffect, useState} from 'react';
import {findLocation} from './locations';
import {loadSelection, loadWeather, upcomingDays} from './client';
import {NO_USSD_WEATHER, type UssdWeather} from './ussd';

/** The forecast for the farmer's saved place (same choice as the Weather page), shaped for the USSD handset. Loads on its own; `refresh` reloads it. */
export function useUssdWeather(online: boolean): {weather: UssdWeather; refresh: () => void} {
  const [weather, setWeather] = useState<UssdWeather>(NO_USSD_WEATHER);
  const refresh = useCallback(() => {
    const sel = loadSelection(); const place = sel.kind === 'town' ? findLocation(sel.id)?.name ?? 'your place' : 'your location';
    void loadWeather(sel, online).then((r) => {
      if (!r.report) { setWeather({...NO_USSD_WEATHER, state: 'none', place}); return; }
      const days = r.status === 'saved' ? upcomingDays(r.report) : r.report.daily;
      setWeather({state: days.length === 0 ? 'none' : r.status === 'none' ? 'none' : r.status, place: r.report.location.name || place, fetchedAt: r.report.fetchedAt, nowC: r.report.current.temperatureC, nowCondition: r.report.current.condition, days});
    }).catch(() => setWeather({...NO_USSD_WEATHER, state: 'none', place}));
  }, [online]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 10 * 60_000); return () => clearInterval(t); }, [refresh]);
  return {weather, refresh};
}
