import { deviceStorage } from './storage';
import { HomeAddress, validCoordinates } from './ride-links';
import { BarVenue } from './venues';

export const SAVED_PLACES_KEY = 'polarys.savedPlaces.v1';
export const MAX_SAVED_PLACES = 10;
export const isSavedPlace = (id: string) => id.startsWith('personal:');
export type SavedPlace = BarVenue & { address: string };

export async function readSavedPlaces(): Promise<SavedPlace[]> {
  const raw = await deviceStorage.getItem(SAVED_PLACES_KEY);
  if (!raw) return [];
  let values: unknown;
  try { values = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(values)) return [];
  const valid = values.filter((p): p is SavedPlace => p && typeof p.id === 'string' && isSavedPlace(p.id) &&
    typeof p.name === 'string' && p.name.trim() && typeof p.address === 'string' && p.address.trim() &&
    validCoordinates({ latitude: p.lat, longitude: p.lon }));
  return [...new Map(valid.map(p => [p.id, p])).values()].slice(0, MAX_SAVED_PLACES);
}

export async function savePlace(address: HomeAddress, name: string): Promise<void> {
  if (!validCoordinates(address) || !address.address.trim()) throw new Error('Choose and confirm an address first.');
  const places = await readSavedPlaces();
  const id = `personal:${address.latitude.toFixed(6)},${address.longitude.toFixed(6)}`;
  if (!places.some(p => p.id === id) && places.length >= MAX_SAVED_PLACES) throw new Error('Remove a saved place before adding another. You can save up to 10.');
  const place = { id, name: name.trim() || address.address.trim(), address: address.address.trim(), lat: address.latitude, lon: address.longitude };
  await deviceStorage.setItem(SAVED_PLACES_KEY, JSON.stringify([...places.filter(p => p.id !== id), place]));
}

export async function removeSavedPlace(id: string): Promise<void> {
  await deviceStorage.setItem(SAVED_PLACES_KEY, JSON.stringify((await readSavedPlaces()).filter(p => p.id !== id)));
}
