import { NIGHT_CONFIG } from './config';
export type BarVenue = { id: string; name: string; lat: number; lon: number };
export type Venue = BarVenue & { kind: 'bar' | 'fraternity' | 'test'; radius: number };
// Built-in venues work without an online Places lookup.
export const CORE_VENUES: readonly Venue[] = [
  { id: 'cys-roost', name: "Cy's Roost", kind: 'bar', lat: 42.0219482, lon: -93.6503831, radius: NIGHT_CONFIG.geofenceRadiusM },
  { id: 'blue-owl', name: 'Blue Owl Bar', kind: 'bar', lat: 42.020454, lon: -93.6504317, radius: NIGHT_CONFIG.geofenceRadiusM },
  // AJ's: 2401 Chamberlain St; Paddy's: 124 Welch Ave, Ames.
  { id: 'ajs-ultra-lounge', name: "AJ's Ultra Lounge", kind: 'bar', lat: 42.0215528, lon: -93.6486753, radius: NIGHT_CONFIG.geofenceRadiusM },
  { id: 'paddys-irish-pub', name: "Paddy's Irish Pub", kind: 'bar', lat: 42.0218, lon: -93.6499, radius: NIGHT_CONFIG.geofenceRadiusM },
  { id: 'kappa-sigma', name: 'Kappa Sigma', kind: 'fraternity', lat: 42.0205169, lon: -93.6450128, radius: NIGHT_CONFIG.geofenceRadiusM },
];
// Friley is deliberately absent: this checkout has no verified test coordinates.
// Add it only with the opt-in debug setting in phase 3.

// Supported Google request types. Response aliases also cover other providers.
export const NIGHTLIFE_SEARCH_TYPES = [
  'bar', 'pub', 'night_club', 'bar_and_grill', 'brewpub', 'gastropub',
  'irish_pub', 'cocktail_bar', 'lounge_bar',
] as const;
const NIGHTLIFE_TYPES = new Set<string>([...NIGHTLIFE_SEARCH_TYPES, 'nightclub', 'club']);
export function isNightlifePlace(place: { primaryType?: string; types?: string[] }) {
  return [place.primaryType, ...(place.types ?? [])].some(type =>
    typeof type === 'string' && NIGHTLIFE_TYPES.has(type.trim().toLowerCase().replace(/[ -]+/g, '_')));
}
