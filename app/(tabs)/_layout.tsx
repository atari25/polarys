import { AppColors } from '@/constants/theme';
import { PolarysProvider } from '@/components/AppPages';
import { Tabs } from 'expo-router';
import React from 'react';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
  return (
    <PolarysProvider><Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: AppColors.background,
          borderTopColor: AppColors.accent,
        },
        tabBarActiveTintColor: AppColors.highlight,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.6)',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={26} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen name="ride" options={{ title: 'Ride', tabBarIcon: ({ color }) => <IconSymbol size={24} name="car.fill" color={color} /> }} />
      <Tabs.Screen name="socials" options={{ title: 'Socials', tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} /> }} />
      <Tabs.Screen name="resources" options={{ title: 'Resources', tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <IconSymbol size={24} name="gearshape.fill" color={color} /> }} />
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs></PolarysProvider>
  );
}
