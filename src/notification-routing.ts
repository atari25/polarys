import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
export function listenForNightNotifications(open: () => void) {
  if (Platform.OS === 'web') return () => {};
  let active = true;
  let lastId: string | null = null;
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!active || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const request = response.notification.request;
    if (request.content.data.route !== 'alert' || request.identifier === lastId) return;
    lastId = request.identifier;
    Notifications.clearLastNotificationResponse();
    open();
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  return () => { active = false; subscription.remove(); };
}
