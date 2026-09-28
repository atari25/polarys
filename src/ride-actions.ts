import { Linking, Platform } from 'react-native';
import { readHome } from './home-address';
import { currentLocation } from './user-location';
import { friendMessage, rideLinks } from './ride-links';
import { deviceStorage } from './storage';
export async function openRide(provider:'uber'|'lyft') {
  const home = await readHome();
  if (!home) throw new Error('Add your home address in Settings first.');
  const pickup = await currentLocation().catch(() => undefined);
  const links = rideLinks(provider,home,pickup);
  try {
    if (await Linking.canOpenURL(links.native)) { await Linking.openURL(links.native); return; }
  } catch { /* Fall back to the provider website with the same destination. */ }
  await Linking.openURL(links.web);
}
export async function textFriendWithLocation() {
  const location = await currentLocation(true);
  const friend = await deviceStorage.getItem('polarys.friend.v1') ?? '';
  await Linking.openURL(`sms:${friend.replace(/[^+0-9]/g,'')}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(friendMessage(location))}`);
}
export async function openTransitHome() {
  const home = await readHome();
  if (!home) throw new Error('Add your home address in Settings first.');
  await Linking.openURL(`https://maps.apple.com/?daddr=${encodeURIComponent(`${home.latitude},${home.longitude}`)}&dirflg=r`);
}
