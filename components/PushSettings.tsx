import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { broadcastsEnabled, pushConfigured, setBroadcastsEnabled, syncPushRegistration } from '@/src/push-notifications';
export function PushSettings() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => { void broadcastsEnabled().then(setEnabled).catch(() => {}); }, []);
  if (!pushConfigured) return null;
  const update = async (value: boolean) => {
    setBusy(true);
    try { setStatus(await setBroadcastsEnabled(value)); }
    catch { setStatus(value ? 'Could not connect. Tap Retry when you’re online.' : 'Turn-off is saved on this phone. Tap Retry when online to finish removing it from broadcasts.'); }
    finally { setEnabled(await broadcastsEnabled()); setBusy(false); }
  };
  return <View style={{ backgroundColor: '#34211A', padding: 22, borderRadius: 24, gap: 12 }}>
    <Text style={{ color: '#FFF8EF', fontSize: 22, fontWeight: '700' }}>Messages from Polarys</Text>
    <Text style={{ color: '#C7BAB2', fontSize: 16 }}>Get occasional updates and ride reminders from the Polarys team. This shares a notification token with Expo and Supabase, not your location or drink answers. Departure reminders stay separate.</Text>
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled, disabled: busy }} disabled={busy} onPress={() => void update(!enabled)}>
      <Text style={{ color: '#FFF8EF', fontSize: 18, fontWeight: '600', paddingVertical: 8 }}>{busy ? 'Saving…' : enabled ? 'Turn off messages' : 'Turn on messages'}</Text>
    </Pressable>
    {!!status && <Text accessibilityLiveRegion="polite" style={{ color: '#C7BAB2' }}>{status}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={async () => {
      setBusy(true); try { setStatus(await syncPushRegistration()); } catch { setStatus('Still unable to connect. Try again when online.'); } finally { setBusy(false); }
    }}><Text style={{ color: '#FFF8EF' }}>Retry connection</Text></Pressable>
  </View>;
}
