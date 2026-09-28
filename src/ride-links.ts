export type Coordinates = { latitude: number; longitude: number };
export type HomeAddress = Coordinates & { address: string };
export function validCoordinates(value: unknown): value is Coordinates {
  const v = value as Coordinates | null;
  return !!v && Number.isFinite(v.latitude) && Math.abs(v.latitude) <= 90 && Number.isFinite(v.longitude) && Math.abs(v.longitude) <= 180;
}
const query = (values: Record<string,string>) => Object.entries(values).map(([key,value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
export function rideLinks(provider: 'uber'|'lyft', home: HomeAddress, pickup?: Coordinates) {
  if (!validCoordinates(home)) throw new Error('Choose a valid home address first.');
  const values: Record<string,string> = provider === 'uber'
    ? { action:'setPickup', 'dropoff[latitude]':String(home.latitude), 'dropoff[longitude]':String(home.longitude), 'dropoff[nickname]':'Home', 'dropoff[formatted_address]':home.address }
    : { id:'lyft', 'destination[latitude]':String(home.latitude), 'destination[longitude]':String(home.longitude) };
  if (pickup && validCoordinates(pickup)) {
    values['pickup[latitude]'] = String(pickup.latitude); values['pickup[longitude]'] = String(pickup.longitude);
  } else if (provider === 'uber') values.pickup = 'my_location';
  const params = query(values);
  return provider === 'uber' ? { native:`uber://?${params}`, web:`https://m.uber.com/ul/?${params}` }
    : { native:`lyft://ridetype?${params}`, web:`https://ride.lyft.com/u?${params}` };
}
export function friendMessage(location: Coordinates & { label: string }) {
  if (!validCoordinates(location)) throw new Error('Current location unavailable.');
  return `Hey, could you pick me up? I’m at ${location.label}. Trying to get home — here’s my pin: https://maps.apple.com/?ll=${location.latitude},${location.longitude}&q=Pick%20me%20up`;
}
