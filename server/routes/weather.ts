import {Router} from 'express';
import {checkAndRecordRateLimit, clientAddress, hashIdentifier} from '../security.ts';
import {locationsForApi, weatherService, WeatherInputError, WeatherUnavailableError} from '../weather.ts';

/** Public, read-only forecast endpoints. No account, no cookies needed, nothing about the visitor is stored or sent to the provider (the SERVER asks, with rounded coordinates). */
export const weatherRouter = Router();
const err = (res: import('express').Response, status: number, code: string, message: string) => { res.status(status).json({error: {code, message}}); };

weatherRouter.get('/weather/locations', (_req, res) => { res.json({locations: locationsForApi()}); });

weatherRouter.get('/weather', async (req, res) => {
  const rl = checkAndRecordRateLimit(hashIdentifier(`weather:${clientAddress(req)}`), 'weather_read', 120, 60, true);
  if (!rl.allowed) { res.setHeader('Retry-After', '600'); err(res, 429, 'RATE_LIMITED', 'Too many weather requests. Please wait a little.'); return; }
  const {location, lat, lon} = req.query;
  const extra = Object.keys(req.query).filter((k) => !['location', 'lat', 'lon'].includes(k)); if (extra.length) { err(res, 400, 'INVALID_LOCATION', 'Only a place or a position can be requested.'); return; }
  try {
    let query: {locationId: string} | {lat: number; lon: number};
    if (typeof location === 'string' && lat === undefined && lon === undefined) query = {locationId: location};
    else if (typeof lat === 'string' && typeof lon === 'string' && location === undefined && /^-?\d{1,2}(\.\d{1,6})?$/.test(lat) && /^-?\d{1,2}(\.\d{1,6})?$/.test(lon)) query = {lat: Number(lat), lon: Number(lon)};
    else { err(res, 400, 'INVALID_LOCATION', 'Choose a place from the list, or allow your device position.'); return; }
    const report = await weatherService().get(query);
    res.json({report});
  } catch (e) {
    if (e instanceof WeatherInputError) { err(res, 400, 'INVALID_LOCATION', e.message); return; }
    if (e instanceof WeatherUnavailableError) { err(res, 503, 'WEATHER_UNAVAILABLE', 'The weather service could not be reached just now, and no earlier forecast is available. Please try again later.'); return; }
    throw e;
  }
});
