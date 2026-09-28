import { useCallback, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, Alert, View } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '@/constants/theme';
import { deviceStorage } from '@/src/storage';
import { SHORTCUT_KEY } from '@/src/night-controller';
import { NIGHT_CONFIG } from '@/src/config';

export default function ShortcutsGuide() {
  const [showHelp, setShowHelp] = useState(false);
  const [receipt, setReceipt] = useState('No recent test received.');
  useFocusEffect(useCallback(() => {
    let active = true;
    const refresh = async () => {
      try {
        const value = JSON.parse(await deviceStorage.getItem(SHORTCUT_KEY) ?? 'null');
        const recent = value?.kind === 'car' && Date.now() - value.receivedAt >= 0 && Date.now() - value.receivedAt < NIGHT_CONFIG.shortcutTestWindowMs;
        if (active) setReceipt(recent ? 'Received in the last minute ✓' : 'No matching trigger received in the last minute.');
      } catch { if (active) setReceipt('Could not read the last test.'); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    const listener = AppState.addEventListener('change', () => void refresh());
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, []));
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.body}>‹ Settings</Text></Pressable>
    <Text style={styles.title}>Car Shortcut</Text>
    <View style={styles.explainer}>
      <Text style={styles.step}>A backup for Bluetooth</Text>
      <Text style={styles.body}>Opens Polarys when your car connects—even if the app isn’t open. Your leaving reminder works without it.</Text>
    </View>
    {[
      ['Pick your car', 'Open Apple Shortcuts → Automation → +. Choose Bluetooth → your car → Is Connected. Or use CarPlay → Connects.'],
      ['Let it run', 'Choose Run Immediately → Next → New Blank Automation.'],
      ['Add this link', 'Search actions for Open URLs. Add it, then paste the link below into its URL field.'],
    ].map(([title, body], index) => <View key={title} style={styles.instruction}>
      <Text style={styles.step}>{index + 1}. {title}</Text><Text style={styles.body}>{body}</Text>
    </View>)}
    <Text selectable style={styles.url}>polarys://car</Text>
    <Text style={styles.hint}>Hold the link to copy it.</Text>
    <View style={styles.instruction}>
      <Text style={styles.step}>4. Save and check</Text>
      <Text style={styles.body}>Tap Done. Open the automation’s actions and tap ▶ to test. Polarys should open. Come back here within a minute to check below.</Text>
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.hint}>{receipt}</Text>
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => void Linking.openURL('shortcuts://').catch(() => Alert.alert('Open Shortcuts', 'Open Apple’s Shortcuts app from your Home Screen.'))}><Text style={styles.buttonText}>Open Shortcuts</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHelp }} onPress={() => setShowHelp(!showHelp)}><Text style={styles.body}>{showHelp ? 'Hide help −' : 'Need help? +'}</Text></Pressable>
    {showHelp && <View style={styles.explainer}>
      <Text style={styles.body}>Car missing? Pair it in iPhone Settings → Bluetooth first.</Text>
      <Text style={styles.body}>No Run Immediately option? Turn off Ask Before Running if offered, or approve the prompt each time.</Text>
      <Text style={styles.body}>Use Open URLs, not just Open App. Your phone may need to be unlocked. Apple’s button names vary by iOS version.</Text>
      <Text style={styles.body}>No alert during a test is normal before 45 venue minutes. The link can still be working.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/car')}><Text style={styles.step}>Test Polarys only →</Text></Pressable>
      <Text style={styles.hint}>This checks the app, not your saved automation.</Text>
    </View>}

  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.background },
  explainer: { padding: 20, gap: 14, backgroundColor: AppColors.surface, borderRadius: 16 },
  instruction: { gap: 8 },
  content: { padding: 24, gap: 16 }, title: { color: AppColors.highlight, fontSize: 30, fontWeight: '700' },
  hint: { color: '#C6B4A8', fontSize: 13, lineHeight: 19 },
  body: { color: '#E2D5CD', fontSize: 16, lineHeight: 24 }, step: { color: AppColors.highlight, fontSize: 20, fontWeight: '600' },
  url: { color: AppColors.highlight, backgroundColor: AppColors.surface, padding: 18, borderRadius: 12, fontSize: 18 },
  button: { backgroundColor: AppColors.highlight, padding: 20, borderRadius: 16 }, buttonText: { color: AppColors.background, fontWeight: '700', textAlign: 'center' },
});
