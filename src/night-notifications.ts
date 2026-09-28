import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getNotificationPermission } from './notifications';
import { NightSession } from './night-session';
import { writeNight } from './night-store';

export async function cancelNudge(id: string | null) {
  if (id && Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(id);
}
// Retire any old timed reminder. Departure notifications are event-driven now.
export async function updateNudge(previous: NightSession, next: NightSession, _now: number, _force = false) {
  if (!previous.nudgeNotificationId) return;
  await cancelNudge(previous.nudgeNotificationId);
  next.nudgeNotificationId = null;
  await writeNight(next);
}
export async function sendDepartureReminder() {
  if (Platform.OS === 'web' || !await getNotificationPermission()) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'How are you getting home?', body: 'Leaving after your night out? Tap for Uber, Lyft, transit, or a friend.', sound: 'default', data: { route: 'alert', kind: 'departure' } },
    trigger: null,
  });
  return true;
}
export async function sendCarCheckIn() {
  if (Platform.OS === 'web' || !await getNotificationPermission()) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Hey, are you good to drive?', body: 'Tap to check your ride options.', sound: 'default', data: { route: 'alert', kind: 'car-check-in' } }, trigger: null,
  });
  return true;
}
