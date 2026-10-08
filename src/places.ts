import { GOOGLE_API_KEY, LEGACY_CONFIG } from './config';
import { haversineMeters } from './geo';
import { BarVenue, NIGHTLIFE_SEARCH_TYPES, isNightlifePlace } from './venues';
type PlacesResponse = {
  places?: {
    id?: string;
    displayName?: { text?: string };
    primaryType?: string;
    types?: string[];
    location?: { latitude?: number; longitude?: number };
  }[];
};

let lookupError: string | null = null;
export const getPlacesLookupError = () => lookupError;

export async function findNearbyBars(
  lat: number,
  lon: number,
  radius: number = LEGACY_CONFIG.geofenceRadiusM
): Promise<BarVenue[]> {
  if (!GOOGLE_API_KEY) {
    lookupError = 'Nearby bar lookup is not configured in this build. Saved places still work.';
    return [];
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.primaryType,places.types,places.location',
      },
      body: JSON.stringify({
        maxResultCount: LEGACY_CONFIG.maxPlaces,
        rankPreference: 'DISTANCE',
        includedTypes: [...NIGHTLIFE_SEARCH_TYPES],
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
            radius,
          },
        },
      }),
    });

    if (!res.ok) {
      lookupError = `Nearby bars could not load (service ${res.status}). Saved places still work.`;
      return [];
    }

    const data = (await res.json()) as PlacesResponse;
    lookupError = null;
    const places = data.places?.filter(
      (p) => p.id && p.displayName?.text && isNightlifePlace(p) &&
        Number.isFinite(p.location?.latitude) && Number.isFinite(p.location?.longitude)
    ).sort((a, b) =>
      haversineMeters(lat, lon, a.location!.latitude!, a.location!.longitude!) -
      haversineMeters(lat, lon, b.location!.latitude!, b.location!.longitude!)
    ) ?? [];

    return places.map(place => ({
      id: place.id!, name: place.displayName!.text!,
      lat: place.location!.latitude!, lon: place.location!.longitude!,
    }));
  } catch {
    lookupError = 'Nearby bars could not load. Check your internet connection. Saved places still work.';
    return [];
  } finally { clearTimeout(timeout); }
}


export async function findNearbyBar(lat: number, lon: number): Promise<BarVenue | null> {
  return (await findNearbyBars(lat, lon))[0] ?? null;
}
