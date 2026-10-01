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
  const [step, setStep] = useState<'transport' | 'drinks' | 'rides'>('transport');
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
    ['Text a friend'], ['Transit home'], ['Nearest hospital','https://maps.apple.com/?q=hospital'], ["Dismiss reminder"],
  ];
  return <SafeAreaView style={{ flex: 1, backgroundColor: AppColors.background }}>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ color: AppColors.highlight, fontSize: 30, fontWeight: '800' }}>{step === 'transport' ? 'How are you getting home?' : step === 'drinks' ? 'How much have you had to drink?' : 'Choose a safe ride'}</Text>
      <Text style={{ color: '#DDD', lineHeight: 22 }}>Polarys cannot tell whether you are safe to drive. If you have been drinking, choose a sober ride.</Text>
      {step === 'transport' && <>
        <Pressable accessibilityRole="button" onPress={() => setStep('drinks')} style={{padding:20,borderRadius:16,backgroundColor:AppColors.highlight}}><Text style={{color:AppColors.background,fontSize:18,fontWeight:'700'}}>I was planning to drive</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setStep('rides')} style={{padding:20,borderRadius:16,backgroundColor:AppColors.highlight}}><Text style={{color:AppColors.background,fontSize:18,fontWeight:'700'}}>Find a ride home</Text></Pressable>
      </>}
      {step === 'drinks' && <>
        {['0', '1–3', '4–5', '6+', 'Prefer not to say'].map(answer => <Pressable key={answer} accessibilityRole="button" onPress={() => setStep('rides')} style={{padding:20,borderRadius:16,backgroundColor:AppColors.highlight}}><Text style={{color:AppColors.background,fontSize:18,fontWeight:'700'}}>{answer}</Text></Pressable>)}
        <Text style={{color:'#DDD'}}>Your answer is not saved. Ride options are available for every answer.</Text>
      </>}
      {step === 'rides' && options.map(([label,url,fallback]) => <Pressable key={label} accessibilityRole="button" disabled={busy} onPress={() => void choose(label,url,fallback)} style={{ padding: 20, borderRadius: 16, backgroundColor: label === "Dismiss reminder" ? AppColors.surface : AppColors.highlight, opacity: busy ? 0.5 : 1 }}><Text style={{ color: label === "Dismiss reminder" ? '#FFF' : '#1C100D', fontSize: 18, fontWeight: '700' }}>{label}</Text></Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}
