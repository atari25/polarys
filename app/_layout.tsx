import '@/src/tasks';
import { AppColors } from '@/constants/theme';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { listenForNightNotifications } from '@/src/notification-routing';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export default function RootLayout() {
  useEffect(() => listenForNightNotifications(() => router.push('/alert')), []);
  return (
    <ThemeProvider value={{ ...DarkTheme, colors: { ...DarkTheme.colors, primary: AppColors.highlight, background: AppColors.background, card: AppColors.surface, text: '#FFFFFF', border: '#333333', notification: '#FFFFFF' } }}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="state-laws" options={{ headerShown: false }} />
        <Stack.Screen name="home-address" options={{ headerShown: false }} />
        <Stack.Screen name="car" options={{ headerShown: false }} />
        <Stack.Screen name="purchase" options={{ headerShown: false }} />
        <Stack.Screen name="alert" options={{ headerShown: false }} />
        <Stack.Screen name="shortcuts" options={{ headerShown: false }} />
        <Stack.Screen name="got-dui"  options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
