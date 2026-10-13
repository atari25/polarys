import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { deviceStorage } from './storage';
import { getNotificationPermission, requestNotificationPermission } from './notifications';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const preferenceKey = 'polarys.broadcasts.enabled';
export const pushConfigured = Boolean(URL && KEY);
const client = URL && KEY ? createClient(URL, KEY, { auth: {
  storage: deviceStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
} }) : null;
let pending: Promise<string> | null = null;
export async function broadcastsEnabled() { return await deviceStorage.getItem(preferenceKey) === 'yes'; }
export async function syncPushRegistration(): Promise<string> {
  if (pending) return pending;
  pending = sync().finally(() => { pending = null; });
  return pending;
}
async function sync() {
  if (!client || Platform.OS !== 'ios') return 'Broadcasts are not available in this build yet.';
  const enabled = await broadcastsEnabled();
  const allowed = await getNotificationPermission();
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  let session = data.session;
  if (!enabled || !allowed) {
    if (session) {
      const { error } = await client.from('push_devices').delete().eq('user_id', session.user.id);
      if (error) throw error;
    }
    return enabled ? 'Allow notifications in iPhone Settings to receive messages.' : 'Messages from Polarys are off.';
  }
  if (!session) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  if (!session) throw new Error('Registration unavailable');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Missing Expo project');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await client.from('push_devices').upsert({
    user_id: session.user.id, token, platform: 'ios', updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return 'You’re set to receive messages from Polarys.';
}
export async function setBroadcastsEnabled(enabled: boolean) {
  if (pending) await pending.catch(() => {});
  if (enabled && !await requestNotificationPermission()) return 'Allow notifications in iPhone Settings first.';
  await deviceStorage.setItem(preferenceKey, enabled ? 'yes' : 'no');
  return syncPushRegistration();
}
export function startPushRegistration() {
  if (!client || Platform.OS !== 'ios') return () => {};
  const sync = () => { client.auth.startAutoRefresh(); void syncPushRegistration().catch(() => {}); };
  sync();
  const app = AppState.addEventListener('change', state => {
    if (state === 'active') sync(); else client.auth.stopAutoRefresh();
  });
  const token = Notifications.addPushTokenListener(sync);
  return () => { app.remove(); token.remove(); client.auth.stopAutoRefresh(); };
}
