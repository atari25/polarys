import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppColors } from '@/constants/theme';
import { deviceStorage } from '@/src/storage';
import { openRide, openTransitHome, textFriendWithLocation } from '@/src/ride-actions';
import { dispatchNight } from '@/src/night-controller';
export default function AlertScreen() {
  const [busy, setBusy] = useState(false);
  async function choose(option: string, url?: string, fallback?: string) {
    if (busy) return;
    setBusy(true);
    try {
      let target = url;
      if (option === 'Uber' || option === 'Lyft') {
        await openRide(option === 'Uber' ? 'uber' : 'lyft'); target = undefined;
      }
      if (option === 'Transit home') { await openTransitHome(); target = undefined; }
      if (option === 'Text a friend') { await textFriendWithLocation(); target = undefined; }
      if (target) {
        const canOpen = await Linking.canOpenURL(target).catch(() => false);
        await Linking.openURL(canOpen ? target : fallback ?? target);
      }
      await dispatchNight({ type: 'handled' });
      await deviceStorage.setItem('polarys.lastAlertChoice.v1', JSON.stringify({ option, at: Date.now() }));
      router.replace('/');
    } catch (error) { Alert.alert('Could not complete this action', error instanceof Error ? error.message : 'Please try another ride option.'); }
    finally { setBusy(false); }
  }
  const options = [
    ['Uber'],
    ['Lyft'],
    ['Text a friend'], ['Transit home'], ['Nearest hospital','https://maps.apple.com/?q=hospital'], ["I'm good to drive"],
  ];
  return <SafeAreaView style={{ flex: 1, backgroundColor: AppColors.background }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ color: AppColors.highlight, fontSize: 30, fontWeight: '800' }}>Hey, are you good to drive?</Text>
      <Text style={{ color: '#DDD', lineHeight: 22 }}>Polarys doesn’t measure intoxication. Always use your own judgment.</Text>
      {options.map(([label,url,fallback]) => <Pressable key={label} accessibilityRole="button" disabled={busy} onPress={() => void choose(label,url,fallback)} style={{ padding: 20, borderRadius: 16, backgroundColor: label === "I'm good to drive" ? AppColors.surface : AppColors.highlight, opacity: busy ? 0.5 : 1 }}><Text style={{ color: label === "I'm good to drive" ? '#FFF' : '#1C100D', fontSize: 18, fontWeight: '700' }}>{label}</Text></Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}
