import * as Location from 'expo-location';
import { validCoordinates, Coordinates } from './ride-links';
export type CurrentLocation = Coordinates & { label: string; timestamp: number };
export function addressLabel(address: Location.LocationGeocodedAddress) {
  return [[address.streetNumber,address.street].filter(Boolean).join(' ') || address.name,
    address.city, address.region, address.postalCode].filter(Boolean).join(', ');
}
export async function currentLocation(requestPermission = false): Promise<CurrentLocation> {
  const permission = requestPermission ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Allow location in iPhone Settings to show where you are.');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const position = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise<never>((_resolve,reject) => { timeout = setTimeout(() => reject(new Error('Location is taking too long. Try again outdoors or check location access.')),15000); }),
  ]).finally(() => { if (timeout) clearTimeout(timeout); });
  if (!validCoordinates(position.coords) || Date.now()-position.timestamp > 60000 || position.timestamp-Date.now() > 5000) throw new Error('Could not get a fresh location. Try again.');
  const { latitude, longitude } = position.coords;
  let label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  try {
    const [address] = await Location.reverseGeocodeAsync({latitude,longitude});
    if (address) label = addressLabel(address) || label;
  } catch { /* The pin remains usable if address lookup is unavailable. */ }
  return { latitude,longitude,label,timestamp:position.timestamp };
}
