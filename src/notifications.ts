import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'safe-ride';
const NOTIFICATION_TYPE = 'leaving-bar';
let lastHandledResponse: string | null = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function prepareChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Safe ride reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
}

function hasPermission(settings: Notifications.NotificationPermissionsStatus) {
  return settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await prepareChannel();
    const current = await Notifications.getPermissionsAsync();
    if (hasPermission(current)) return true;
    if (!current.canAskAgain) return false;
    return hasPermission(await Notifications.requestPermissionsAsync());
  } catch (error) {
    console.warn('Could not request notification permission', error);
    return false;
  }
}

export async function sendLeavingBarNotification(barName: string): Promise<boolean> {
  if (Platform.OS === 'web' || !barName.trim()) return false;
  try {
    // Background location callbacks must never trigger a permission prompt.
    if (!hasPermission(await Notifications.getPermissionsAsync())) return false;
    await prepareChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Need a safe ride home?',
        body: `Leaving ${barName}? Tap to explore safe ride options.`,
        sound: 'default',
        data: { type: NOTIFICATION_TYPE, barName },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
    return true;
  } catch (error) {
    console.warn('Could not send safe ride notification', error);
    return false;
  }
}

function consumeResponse(response: Notifications.NotificationResponse | null): string | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const { identifier, content } = response.notification.request;
  if (identifier === lastHandledResponse || content.data.type !== NOTIFICATION_TYPE) return null;
  const barName = content.data.barName;
  if (typeof barName !== 'string' || !barName.trim()) return null;
  lastHandledResponse = identifier;
  // Clear synchronously so an old tap is not replayed after the next launch.
  Notifications.clearLastNotificationResponse();
  return barName;
}

export async function consumePendingLeavingBarNotification(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return consumeResponse(await Notifications.getLastNotificationResponseAsync());
  } catch (error) {
    console.warn('Could not read notification response', error);
    return null;
  }
}

export function subscribeToLeavingBarNotifications(onOpen: (barName: string) => void) {
  if (Platform.OS === 'web') return () => {};
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const barName = consumeResponse(response);
    if (barName) onOpen(barName);
  });
  return () => subscription.remove();
}

export async function getNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return hasPermission(await Notifications.getPermissionsAsync());
  } catch {
    return false;
  }
}
