import {LIBERIA_COUNTIES} from '../../../server/constants';

/**
 * Places in Liberia for the live forecast: at least one town per county (the county seat first). Coordinates are APPROXIMATE (about 5 km): a forecast model
 * grid is about 10 km wide, so this is enough for a farmer to read the weather "near" the town. Nothing here is a survey or a boundary.
 */
export interface WeatherLocation {id: string; name: string; county: (typeof LIBERIA_COUNTIES)[number]; lat: number; lon: number}
export const WEATHER_LOCATIONS: readonly WeatherLocation[] = [
  {id: 'tubmanburg', name: 'Tubmanburg', county: 'Bomi', lat: 6.876, lon: -10.819},
  {id: 'gbarnga', name: 'Gbarnga', county: 'Bong', lat: 6.998, lon: -9.472},
  {id: 'bopolu', name: 'Bopolu', county: 'Gbarpolu', lat: 7.132, lon: -10.484},
  {id: 'buchanan', name: 'Buchanan', county: 'Grand Bassa', lat: 5.877, lon: -10.049},
  {id: 'robertsport', name: 'Robertsport', county: 'Grand Cape Mount', lat: 6.754, lon: -11.370},
  {id: 'zwedru', name: 'Zwedru', county: 'Grand Gedeh', lat: 6.067, lon: -8.131},
  {id: 'barclayville', name: 'Barclayville', county: 'Grand Kru', lat: 4.777, lon: -8.226},
  {id: 'voinjama', name: 'Voinjama', county: 'Lofa', lat: 8.422, lon: -9.745},
  {id: 'zorzor', name: 'Zorzor', county: 'Lofa', lat: 7.768, lon: -9.452},
  {id: 'kakata', name: 'Kakata', county: 'Margibi', lat: 6.529, lon: -10.353},
  {id: 'harper', name: 'Harper', county: 'Maryland', lat: 4.375, lon: -7.717},
  {id: 'monrovia', name: 'Monrovia', county: 'Montserrado', lat: 6.300, lon: -10.797},
  {id: 'paynesville', name: 'Paynesville', county: 'Montserrado', lat: 6.280, lon: -10.710},
  {id: 'sanniquellie', name: 'Sanniquellie', county: 'Nimba', lat: 7.364, lon: -8.709},
  {id: 'ganta', name: 'Ganta', county: 'Nimba', lat: 7.235, lon: -8.986},
  {id: 'cestos-city', name: 'Cestos City', county: 'River Cess', lat: 5.466, lon: -9.583},
  {id: 'fish-town', name: 'Fish Town', county: 'River Gee', lat: 5.050, lon: -7.870},
  {id: 'greenville', name: 'Greenville', county: 'Sinoe', lat: 5.012, lon: -9.038},
];
export const DEFAULT_LOCATION_ID = 'monrovia';
export const findLocation = (id: unknown): WeatherLocation | undefined => (typeof id === 'string' ? WEATHER_LOCATIONS.find((l) => l.id === id) : undefined);
export const locationsOfCounty = (county: string): WeatherLocation[] => WEATHER_LOCATIONS.filter((l) => l.county === county);
/** Rough bounding box of Liberia (with a small margin). A device position outside it is refused: the service is for Liberia. */
export const LIBERIA_BOUNDS = {minLat: 4.2, maxLat: 8.6, minLon: -11.6, maxLon: -7.3} as const;
export function validCoordinates(lat: unknown, lon: unknown): lat is number {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= LIBERIA_BOUNDS.minLat && lat <= LIBERIA_BOUNDS.maxLat && lon >= LIBERIA_BOUNDS.minLon && lon <= LIBERIA_BOUNDS.maxLon;
}
/** Coordinates are rounded before they leave the phone or reach the provider (about 1 km at 2 decimals; the phone rounds to 1 decimal, about 11 km). */
export const roundCoordinate = (n: number, decimals = 2): number => Number(n.toFixed(decimals));
