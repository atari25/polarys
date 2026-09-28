import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { receiveCar } from '@/src/night-controller';
import { AppColors } from '@/constants/theme';
export function ShortcutReceipt() {
  const [message, setMessage] = useState('Checking your night…');
  const pending = useRef<Promise<string | boolean> | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!pending.current) {
      pending.current = receiveCar();
    }
    void pending.current.then(result => {
      if (!active) return;

        if (result) router.replace('/alert');
        else setMessage('No check-in triggered. This does not mean it is safe to drive.');
    }).catch(() => { if (active) setMessage('Could not read your saved night. Please open ride options or try again.'); });
    return () => { active = false; };
  }, []));
  return <SafeAreaView style={{ flex: 1, backgroundColor: AppColors.background, padding: 24 }}>
    <View style={{ gap: 24 }}>
      <Text style={{ color: AppColors.highlight, fontSize: 28, fontWeight: '700' }}>Car Shortcut received</Text>
      <Text style={{ color: '#DDD', fontSize: 17 }}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={{ backgroundColor: AppColors.highlight, padding: 20, borderRadius: 16 }}><Text>Return home</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/alert')} style={{ padding: 20 }}><Text style={{ color: AppColors.highlight }}>Open ride options</Text></Pressable>
    </View>
  </SafeAreaView>;
}
