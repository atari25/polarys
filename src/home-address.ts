import * as Location from 'expo-location';
import { GOOGLE_API_KEY } from './config';
import { deviceStorage, STORAGE_KEYS } from './storage';
import { HomeAddress, validCoordinates } from './ride-links';
import { addressLabel } from './user-location';
export type AddressSuggestion = { id: string; address: string; source: 'google'|'device'; coordinates?: HomeAddress };
export async function readHome(): Promise<HomeAddress | null> {
  try {
    const value = JSON.parse(await deviceStorage.getItem(STORAGE_KEYS.home) ?? 'null');
    const address = value?.address;
    return validCoordinates(value) ? { ...value, address: typeof address === 'string' ? address : 'Home' } : null;
  } catch { return null; }
}
let googleUnavailable = false;
async function googleSuggestions(input: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  if (input.trim().length < 4) return [];
  if (!GOOGLE_API_KEY) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method:'POST', signal, headers:{'Content-Type':'application/json','X-Goog-Api-Key':GOOGLE_API_KEY},
    body:JSON.stringify({ input, includedRegionCodes:['us'], locationBias:{circle:{center:{latitude:42.0308,longitude:-93.6319},radius:50000}} }),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) googleUnavailable = true;
    throw new Error('Google address lookup unavailable.');
  }
  const data = await res.json() as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[] };
  return (data.suggestions ?? []).flatMap(({placePrediction:p}) => p?.placeId && p.text?.text ? [{id:p.placeId,address:p.text.text,source:'google' as const}] : []);
}
export async function suggestAddresses(input: string, signal: AbortSignal): Promise<AddressSuggestion[]> {
  if (input.trim().length < 4 || signal.aborted) return [];
  if (GOOGLE_API_KEY && !googleUnavailable) {
    try {
      const values = await googleSuggestions(input,signal);
      if (values.length || signal.aborted) return signal.aborted ? [] : values;
    } catch { if (signal.aborted) return []; }
  }
  const values = await findFullAddress(input);
  return signal.aborted ? [] : values;
}
export async function resolveAddress(suggestion: AddressSuggestion): Promise<HomeAddress> {
  if (suggestion.coordinates) return suggestion.coordinates;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(suggestion.id)}`,{
      headers:{'X-Goog-Api-Key':GOOGLE_API_KEY,'X-Goog-FieldMask':'formattedAddress,location'},
    });
    if (res.ok) {
      const data = await res.json() as { formattedAddress?: string; location?: {latitude:number;longitude:number} };
      if (validCoordinates(data.location)) return {...data.location,address:data.formattedAddress ?? suggestion.address};
    }
  } catch { /* Resolve the selected address using the device below. */ }
  const matches = await findFullAddress(suggestion.address);
  if (matches.length === 1 && matches[0].coordinates) return matches[0].coordinates;
  throw new Error('Could not confirm that address. Enter the full street address and tap Find address.');
}

export async function findFullAddress(input: string): Promise<AddressSuggestion[]> {
  const results = await Location.geocodeAsync(input);
  return Promise.all(results.filter(validCoordinates).slice(0,5).map(async (point,index) => {
    let label = input.trim();
    try {
      const [address] = await Location.reverseGeocodeAsync(point);
      if (address) label = addressLabel(address) || label;
    } catch { /* A valid geocoded pin remains saveable without reverse lookup. */ }
    return { id:String(index),address:label,source:'device' as const,coordinates:{latitude:point.latitude,longitude:point.longitude,address:label} };
  }));
}
export async function saveHome(home: HomeAddress) {
  if (!validCoordinates(home) || !home.address.trim()) throw new Error('Choose a home address from the results.');
  await deviceStorage.setItem(STORAGE_KEYS.home,JSON.stringify(home));
}
