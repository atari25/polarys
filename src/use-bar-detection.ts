import { useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import * as Location from 'expo-location';
import { NIGHT_CONFIG } from './config';
import { initializeGeofencing, processVenueLocation, checkTrackingSafety } from './geofencing';
import { useNightSession } from './use-night-session';

export function useBarDetection() {
  const { night } = useNightSession();
  const [locationPermission,setPermission] = useState<'granted'|'denied'|'pending'>('pending');
  const [backgroundEnabled,setBackground] = useState(false);
  const [monitoringError,setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true, watch: Location.LocationSubscription | null = null;
    const refresh = async () => {
      try {
        let fg = await Location.getForegroundPermissionsAsync();
        if (!fg.granted && fg.canAskAgain) fg = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        setPermission(fg.granted ? 'granted' : 'denied');
        if (!fg.granted) return;
        const bg = await Location.getBackgroundPermissionsAsync();
        setBackground(bg.granted);
        await initializeGeofencing();
        if (active && !watch) {
          watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: NIGHT_CONFIG.trackingDistanceIntervalM }, position => {
            void processVenueLocation(position).catch(() => { if (active) setError('Location update failed.'); });
          });
          if (!active) watch.remove();
        }
        if (active) setError(null);
      } catch { if (active) setError('Could not start venue monitoring. Check location permissions and try reopening Polarys.'); }
    };
    void refresh();
    const app = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { void checkTrackingSafety().catch(() => {}); },NIGHT_CONFIG.foregroundRefreshMs);
    return () => { active = false; app.remove(); watch?.remove(); clearInterval(timer); };
  }, []);
  const enableBackground = () => Alert.alert('Reminders when you leave', 'Allow Always location so Polarys can watch venue boundaries while the app is closed. Precise tracking runs near venues at night. You can still use ride options without this permission.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Continue', onPress: () => { void (async () => {
      try {
        const fg = await Location.requestForegroundPermissionsAsync();
        if (!fg.granted) { setPermission('denied'); return; }
        setPermission('granted');
        const bg = await Location.requestBackgroundPermissionsAsync();
        setBackground(bg.granted);
        await initializeGeofencing();
        if (!bg.granted) setError('For reminders with the app closed, choose Always and Precise Location in iPhone Settings.');
        else setError(null);
      } catch { setError('Could not enable background monitoring. Check iPhone Settings.'); }
    })(); } },
  ]);
  return { locationPermission, backgroundEnabled, monitoringError, enableBackground,
    candidateVenue: null as { name: string } | null, detectionConfigured: true,
    currentBar: night.currentVenue, justExited: null };
}

export type BarDetectionState = ReturnType<typeof useBarDetection>;
