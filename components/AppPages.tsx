import { dailyHeadline } from '../src/daily-headline';
import { readHome } from '@/src/home-address';
import { HomeAddress } from '@/src/ride-links';
import { useCurrentLocation } from '@/src/use-current-location';
import { openRide, openTransitHome, textFriendWithLocation } from '@/src/ride-actions';
import { AppColors } from '@/constants/theme';
import React, { useCallback, useEffect, useState, useRef, createContext, useContext } from 'react';
import {
  Alert,
  AppState,
  AppStateStatus,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { useBarDetection } from '@/services/bar-detection';
import { useBluetoothDetection } from '@/services/bluetooth';
import { useNightSession } from '@/src/use-night-session';
import { totalVenueMs, activityBreakdown } from '@/src/night-session';
import { resumeNightForTesting } from '@/src/geofencing';
import { receiveCar } from '@/src/night-controller';
import { useRiskStore } from '@/services/risk-store';
import {
  getNotificationPermission,
  consumePendingLeavingBarNotification,
  requestNotificationPermission,
  sendLeavingBarNotification,
  subscribeToLeavingBarNotifications,
} from '@/services/notifications';
import {
  getDuiStatsForState,
  getStateLawSummary,
  STATE_CODE_TO_NAME,
  STATE_NAME_TO_CODE,
} from '@/services/state-laws';
import { GeofenceExitFlow } from '@/components/modals/GeofenceExitFlow';

import { SafeAreaView } from 'react-native-safe-area-context';
import { deviceStorage as AsyncStorage, STORAGE_KEYS } from '@/src/storage';
function formatDuration(enteredAt?: number, endedAt = Date.now()) {
  const seconds = enteredAt === undefined ? 0 : Math.max(0, Math.floor((endedAt - enteredAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours > 0 ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function useAppState() {
  const [exitedBar, setExitedBar] = useState<string | null>(null);
  const [showFlow, setShowFlow] = useState(false);
  const [showScoreDetails, setShowScoreDetails] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => { void AsyncStorage.getItem(STORAGE_KEYS.intro).then(value => setShowIntro(value !== 'yes')).catch(() => setShowIntro(true)); }, []);
  const dismissIntro = () => { setShowIntro(false); void AsyncStorage.setItem(STORAGE_KEYS.intro, 'yes').catch(() => {}); };
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);

  const [detectedStateCode, setDetectedStateCode] = useState<string | null>(null);
  const [, setNow] = useState(new Date());

  const { bluetoothActive, riskBreakdown } =
    useRiskStore();
  const detectedStateLaw = getStateLawSummary(detectedStateCode);
  const detectedStateName = detectedStateLaw?.stateName ??
    (detectedStateCode ? STATE_CODE_TO_NAME[detectedStateCode] ?? detectedStateCode : 'STATE');
  const detectedStats = detectedStateLaw
    ? getDuiStatsForState(detectedStateLaw.stateCode)
    : null;

  const { night, error: nightError } = useNightSession();
  const bluetooth = useBluetoothDetection();
  const currentPosition = useCurrentLocation();
  const previousCarConnection = useRef(false);
  useEffect(() => {
    const connected = bluetooth.available && bluetooth.carConnected;
    const justConnected = connected && !previousCarConnection.current;
    previousCarConnection.current = connected;
    if (justConnected) {
      void receiveCar('bluetooth').then(show => {
        if (show) router.push('/alert');
      }).catch(() => Alert.alert('Car check-in unavailable', 'Could not read your night session. Ride options are still available.'));
    }
  }, [bluetooth.available, bluetooth.carConnected]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    void requestNotificationPermission().then(setNotificationsEnabled);
    return () => clearInterval(id);
  }, []);

  const openExitFlow = useCallback((barName: string) => {
    setExitedBar(barName);
    setShowFlow(true);
  }, []);

  useEffect(() => {
    const checkPendingNotification = async () => {
      const barName = await consumePendingLeavingBarNotification();
      if (barName) openExitFlow(barName);
    };

    const handleAppState = (status: AppStateStatus) => {
      if (status === 'active') {
        void checkPendingNotification();
        void getNotificationPermission().then(setNotificationsEnabled);
      }
    };

    const unsubscribe = subscribeToLeavingBarNotifications(openExitFlow);
    void checkPendingNotification();
    const subscription = AppState.addEventListener('change', handleAppState);
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [openExitFlow]);

  const { locationPermission, candidateVenue, detectionConfigured, backgroundEnabled, monitoringError, enableBackground } = useBarDetection();
  const refreshCurrentLocation = currentPosition.refresh;
  useEffect(() => { if (locationPermission === 'granted') void refreshCurrentLocation(); }, [locationPermission, refreshCurrentLocation]);
  const activeVisit = night.status === 'at_venue';

  const getCurrentLocationLabel = useCallback(async () => {
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [address] = await Location.reverseGeocodeAsync(current.coords);
      const street = [address?.streetNumber, address?.street].filter(Boolean).join(' ');
      const cityState = [address?.city, address?.region].filter(Boolean).join(', ');
      return address?.name || street || cityState || 'your current location';
    } catch {
      return 'your current location';
    }
  }, []);

  useEffect(() => {
    const detectState = async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;

      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const [address] = await Location.reverseGeocodeAsync(current.coords);
        const region = address?.region;
        const code = region
          ? STATE_NAME_TO_CODE[region] ?? (region.length === 2 ? region.toUpperCase() : null)
          : null;
        setDetectedStateCode(code);
      } catch {
        setDetectedStateCode(null);
      }
    };

    void detectState();
  }, [locationPermission]);

  const handleDismiss = useCallback(() => {
    setShowFlow(false);
    setExitedBar(null);
  }, []);


  return { exitedBar, showFlow, showScoreDetails, setShowScoreDetails, showIntro, setShowIntro, dismissIntro, notificationsEnabled, setNotificationsEnabled, detectedStateCode, venueSession: night.currentVenue && night.entryTime !== null ? { name: night.currentVenue.name, enteredAt: night.entryTime, exitedAt: undefined } : null, bluetoothActive, riskBreakdown, detectedStateName, detectedStats, bluetooth, currentPosition, night, nightError, backgroundEnabled, monitoringError, enableBackground, locationPermission, candidateVenue, detectionConfigured, activeVisit, getCurrentLocationLabel, handleDismiss };
}
const AppContext = createContext<ReturnType<typeof useAppState> | null>(null);
function usePolarys() {
  const state = useContext(AppContext);
  if (!state) throw new Error('Missing PolarysProvider');
  return state;
}
export function PolarysProvider({ children }: { children: React.ReactNode }) {
  const state = useAppState();
  return <AppContext.Provider value={state}>{children}<AppOverlays /></AppContext.Provider>;
}
export function AppPage({ page }: { page: 'Home' | 'Ride' | 'Resources' | 'Settings' }) {
  const { setShowScoreDetails, setShowIntro, notificationsEnabled, setNotificationsEnabled, detectedStateCode, venueSession, detectedStateName, detectedStats, bluetooth, currentPosition, night, nightError, backgroundEnabled, monitoringError, enableBackground, locationPermission, activeVisit, getCurrentLocationLabel } = usePolarys();
  const [showDeveloper, setShowDeveloper] = useState(false);
  const [resumingNight, setResumingNight] = useState(false);
  const [savedHome, setSavedHome] = useState<HomeAddress | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    void readHome().then(value => { if (active) setSavedHome(value); });
    return () => { active = false; };
  }, []));
  const points = activityBreakdown(night, Date.now());
  const [rideBusy, setRideBusy] = useState(false);
  const runRideAction = async (action: () => Promise<void>) => {
    if (rideBusy) return;
    setRideBusy(true);
    try { await action(); }
    catch (error) { Alert.alert('Could not open ride option', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setRideBusy(false); }
  };
  const openUber = () => runRideAction(() => openRide('uber'));
  const openLyft = () => runRideAction(() => openRide('lyft'));
  const openTransit = () => runRideAction(openTransitHome);
  const textFriend = () => runRideAction(textFriendWithLocation);


  return <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}><View>
        <Text style={styles.wordmark}>{page === 'Home' ? 'polarys' : page}</Text>
        <Text style={styles.tagline}>{page === 'Home' ? 'Your visit. Your way home.' : page === 'Ride' ? 'Choose how you’ll get home.' : page === 'Resources' ? 'Understand your options.' : 'Make Polarys work for you.'}</Text>
      </View></View>
      {(page === 'Home' || page === 'Ride') && <Pressable accessibilityRole="button" onPress={() => void currentPosition.refresh()}>
        <Text style={styles.scoreLabel}>{currentPosition.error && currentPosition.location ? 'LAST KNOWN LOCATION' : 'CURRENT LOCATION'}</Text>
        <Text style={styles.detectedBarDetail}>{currentPosition.location?.label ?? (currentPosition.loading ? 'Finding you…' : 'Location unavailable')}</Text>
        <Text style={styles.scoreHint}>{currentPosition.error ?? (currentPosition.loading ? 'Updating…' : 'Tap to refresh')}</Text>
      </Pressable>}
      {page === 'Home' && <>
        <View style={styles.detectedBarCard}>
          <View style={styles.riskHeader}>
            <Text style={styles.detectedBarLabel}>{activeVisit ? 'AT A VENUE' : 'YOUR NIGHT'}</Text>
            <Text style={[styles.riskBadge, points.level === 'High' ? styles.riskHigh : points.level === 'Medium' ? styles.riskMedium : styles.riskLow]}>{nightError ? 'Status unavailable' : `${points.level} activity risk`}</Text>
          </View>
          <Text style={styles.detectedBarName}>{activeVisit ? venueSession?.name : locationPermission === 'denied' ? 'Location is off' : night.status === 'between_venues' || night.status === 'at_risk' ? 'Heading home?' : dailyHeadline()}</Text>
          <Pressable style={styles.visitSummary} accessibilityRole="button" accessibilityLabel="Venue timer. Show points breakdown" onPress={() => setShowScoreDetails(true)}>
            <Text style={styles.scoreLabel}>TIME AT VENUES</Text>
            <Text style={styles.visitDuration}>{formatDuration(0, totalVenueMs(night, Date.now()))}</Text>
            <Text style={styles.connectionNote}>{points.total} points · Tap for breakdown ›</Text>
          </Pressable>
          <Text style={styles.scoreHint}>{nightError ? 'Could not load your night.' : '45+ minutes? We’ll remind you when you leave.'}</Text>
          <Text style={styles.statusFootnote}>Activity signals only. Not a sobriety check.</Text>
        </View>

        <Pressable accessibilityRole="button" style={styles.rideButton} onPress={() => router.navigate('/ride')}>
          <Text style={styles.rideButtonText}>Get a safe ride</Text>
          <Text style={styles.rideButtonDetail}>Uber, Lyft, transit or a friend</Text>
        </Pressable>


        {(!backgroundEnabled || locationPermission === 'denied' || notificationsEnabled === false) && <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => router.navigate('/settings')}>
          <Text style={styles.resourceTitle}>Finish setting up</Text>
          <Text style={styles.detectedBarDetail}>Enable {!backgroundEnabled ? 'Always location' : 'notifications'} in Settings →</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => router.navigate('/socials')}>
          <Text style={styles.resourceTitle}>Upcoming socials</Text>
          <Text style={styles.detectedBarDetail}>Cyclone game days, local traditions and seasonal occasions →</Text>
        </Pressable>
      </>}
      {page === 'Ride' && <>
        <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => router.push('/home-address')}>
          <Text style={styles.scoreLabel}>DESTINATION · HOME</Text>
          <Text style={styles.detectedBarDetail}>{savedHome?.address ?? 'Add your home address →'}</Text>
        </Pressable>
        <Text style={styles.detectedBarDetail}>Book a ride, find transit, or ask someone you trust for a pickup.</Text>
          <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => void openUber()}>
            <Text style={styles.resourceTitle}>Get Uber</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => void openLyft()}>
            <Text style={styles.resourceTitle}>Get Lyft</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => void openTransit()}>
            <Text style={styles.resourceTitle}>Public Transit</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => void textFriend()}>
            <Text style={styles.resourceTitle}>Text a Friend</Text>
          </Pressable>

      </>}
      {page === 'Resources' && <>
        <View style={styles.featureGrid}>
          <Pressable
            accessibilityRole="button"
            style={styles.featureButton}
            onPress={() => {
              router.push({
                pathname: '/got-dui',
                params: { stateCode: detectedStateCode ?? '' },
              });
            }}>
            <Text style={styles.featureText}>Got a DUI?</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.featureButton}
            onPress={() => {
              router.push({
                pathname: '/state-laws',
                params: { stateCode: detectedStateCode ?? '' },
              });
            }}>
            <Text style={styles.featureText}>State laws</Text>
          </Pressable>
        </View>

        {detectedStats && <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>{detectedStateName.toUpperCase()} DUI STATS</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>
                {detectedStats?.legalLimit ?? '--'}
              </Text>
              <Text style={styles.statLabel}>Legal BAC limit</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>
                {detectedStats?.fine ?? '--'}
              </Text>
              <Text style={styles.statLabel}>First DUI fine</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statValue}>
                {detectedStats?.suspension ?? '--'}
              </Text>
              <Text style={styles.statLabel}>Fail/refuse revocation</Text>
            </View>
          </View>
        </View>}


      </>}
      {page === 'Settings' && <>
        <View style={styles.resourceButton}>
          <Text style={styles.resourceTitle}>Car Bluetooth</Text>
          <Text style={styles.detectedBarDetail}>{!bluetooth.available ? 'Bluetooth module unavailable in this build.' : bluetooth.carConnected ? `Connected to ${bluetooth.deviceName}` : bluetooth.connected ? `${bluetooth.deviceName} · not saved as your car` : bluetooth.hasSavedCar ? 'Saved car is not the active audio output.' : 'Connect your car and select it as your iPhone’s audio output.'}</Text>
          <Pressable accessibilityRole="button" style={styles.settingsButton} onPress={() => {
            if (!bluetooth.available) { Alert.alert('Bluetooth module unavailable', 'Install the latest iPhone development build, then reopen Polarys.'); return; }
            if (!bluetooth.connected) { Alert.alert('Connect your car first', 'Pair your car in iPhone Settings → Bluetooth. Then select your car as the audio output in Control Center and return here.'); return; }
            if (bluetooth.saveCar()) Alert.alert('Car saved', `${bluetooth.deviceName} is now your car’s Bluetooth.`);
            else Alert.alert('No car audio connection', 'Select your car as the audio output and try again.');
          }}><Text style={styles.featureText}>Mark this as my car’s Bluetooth</Text></Pressable>
          {bluetooth.available && bluetooth.hasSavedCar && <Pressable accessibilityRole="button" style={styles.settingsButton} onPress={() => {
            try { bluetooth.forgetCar(); } catch { Alert.alert('Could not forget car', 'Please try again.'); }
          }}><Text style={styles.featureText}>Forget saved car</Text></Pressable>}
          <Text style={styles.scoreHint}>Checks your saved car’s active audio connection while Polarys is running. Uses the same 45-minute night rule as the car Shortcut. Set up the Shortcut too for connections while the app is asleep or closed.</Text>
        </View>
        <View style={styles.resourceButton}>
          <Text style={styles.resourceTitle}>Departure reminders</Text>
          <Text style={styles.detectedBarDetail}>{backgroundEnabled ? 'Always location enabled · venue geofencing available' : 'Enable Always location for reminders with the app closed.'}</Text>
          <Text style={styles.scoreHint}>After 45+ venue minutes between 9 PM and 5 AM, leaving prompts you to choose a ride. No car connection required.</Text>
          {monitoringError && <Text style={styles.detectedBarDetail}>{monitoringError}</Text>}
          <Pressable accessibilityRole="button" style={styles.settingsButton} onPress={enableBackground}><Text style={styles.featureText}>Set up background location</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => router.push('/shortcuts')}>
          <Text style={styles.resourceTitle}>Add a car Shortcut</Text>
          <Text style={styles.detectedBarDetail}>Background companion to Bluetooth · Opens Polarys when your car connects, even when it is not already running. Tap for setup instructions.</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => router.push('/home-address')}>
          <Text style={styles.resourceTitle}>Home address</Text>
          <Text style={styles.detectedBarDetail}>{savedHome?.address ?? 'Search for your address →'}</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MONITORING STATUS</Text>
          <View style={styles.monitorGrid}>
            <MonitorItem label="LOCATION" value={locationPermission === 'granted' ? 'Allowed' : locationPermission === 'denied' ? 'Off' : 'Checking…'} detail={locationPermission === 'granted' ? 'Location access enabled' : 'Location is needed to detect visits'} />
            <MonitorItem label="NOTIFICATIONS" value={notificationsEnabled === null ? 'Checking…' : notificationsEnabled ? 'Allowed' : 'Off'} detail="Reminders to arrange a safe ride" />
          </View>
          <Pressable accessibilityRole="button" style={styles.settingsButton} onPress={() => void Linking.openSettings()}>
            <Text style={styles.featureText}>Manage permissions</Text>
          </Pressable>
        </View>


        <Pressable accessibilityRole="button" style={styles.resourceButton} onPress={() => setShowIntro(true)}><Text style={styles.resourceTitle}>How Polarys works</Text></Pressable>
        {__DEV__ && <Pressable accessibilityRole="button" style={styles.settingsButton} onPress={() => setShowDeveloper(!showDeveloper)}><Text style={styles.featureText}>{showDeveloper ? 'Hide developer tools' : 'Developer tools'}</Text></Pressable>}
        {__DEV__ && showDeveloper && (
          <View style={styles.devRow}>
            <Pressable accessibilityRole="button" style={styles.devButton} disabled={resumingNight} onPress={async () => {
              setResumingNight(true);
              try {
                const checked = await resumeNightForTesting();
                Alert.alert('Night pause cleared', checked
                  ? 'Ready for a fresh test. The timer starts when a venue is confirmed between 9 PM and 5 AM. Being at your saved home will pause it again.'
                  : 'Ready for a fresh test, but location could not refresh yet. Check location permissions, then reopen the app. The 9 PM–5 AM and saved-home rules still apply.');
              } catch { Alert.alert('Could not resume night', 'Please try again.'); }
              finally { setResumingNight(false); }
            }}>
              <Text style={styles.devButtonText}>{resumingNight ? 'Resuming…' : 'Resume night · testing only'}</Text>
            </Pressable>
            <Text style={styles.scoreHint}>Clears a test pause and starts fresh. Keeps the night hours and home check.</Text>
            <Pressable
              style={styles.devButton}
              onPress={async () => {
                const allowed = await requestNotificationPermission();
                setNotificationsEnabled(allowed);
                const sent = allowed && await sendLeavingBarNotification(
                  venueSession?.name ?? (await getCurrentLocationLabel())
                );
                if (!sent) Alert.alert('Notification unavailable', 'Enable notifications in system settings and use a rebuilt development app.');
              }}>
              <Text style={styles.devButtonText}>DEV: Test System Notification</Text>
            </Pressable>
          </View>
        )}

      </>}
    </ScrollView>
  </SafeAreaView>;
}
function AppOverlays() {
  const { exitedBar, showFlow, showScoreDetails, setShowScoreDetails, showIntro, dismissIntro, night, nightError, handleDismiss } = usePolarys();
  const points = activityBreakdown(night, Date.now());
  return <>
      {showFlow && exitedBar && (
        <GeofenceExitFlow barName={exitedBar} onDismiss={handleDismiss} />
      )}

      <Modal transparent visible={showScoreDetails && !showIntro && !showFlow} animationType="slide" onRequestClose={() => setShowScoreDetails(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.scoreSheet}>
            <ScrollView contentContainerStyle={styles.scoreSheetContent}>
              <Text style={styles.resourceTitle}>Your points</Text>
              <Text style={styles.visitDuration}>{points.total}<Text style={styles.scoreUnit}> pts</Text></Text>
              <Text style={styles.detectedBarDetail}>{nightError ? 'Session unavailable' : `${points.level} activity risk`}</Text>
              <View style={styles.scoreRow}>
                <View style={styles.pointDescription}><Text style={styles.scoreRowLabel}>Time at venues</Text><Text style={styles.scoreHint}>{Math.floor(totalVenueMs(night, Date.now()) / 60000)} min × 0.5 points</Text></View>
                <Text style={styles.scorePoints}>+{points.venuePoints}</Text>
              </View>
              <View style={styles.scoreRow}>
                <View style={styles.pointDescription}><Text style={styles.scoreRowLabel}>Car connected after 45 min</Text><Text style={styles.scoreHint}>{points.carPoints ? 'Connection recorded · counted once' : 'No qualifying connection yet'}</Text></View>
                <Text style={styles.scorePoints}>+{points.carPoints}</Text>
              </View>
              <Text style={styles.scoreHint}>Low: under 45 min · Medium: 45+ min · High: 45+ min + car connection</Text>
              <Text style={styles.detectedBarDetail}>Leaving after 45 minutes sends a ride reminder, even without your car.</Text>
              <Text style={styles.scoreHint}>Time adds 0.5 points each full minute at a venue, from 9 PM–5 AM. Travel time adds nothing. Bluetooth or your car Shortcut adds 40 once after 45 minutes. Points reset when the night ends.</Text>
              <Text style={styles.statusFootnote}>Low does not mean safe to drive. Polarys does not measure intoxication.</Text>
              <Pressable accessibilityRole="button" style={styles.rideButton} onPress={() => setShowScoreDetails(false)}>
                <Text style={styles.rideButtonText}>Done</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>


    <Modal visible={showIntro && !showFlow} transparent animationType="fade" onRequestClose={dismissIntro}>
      <View style={styles.modalOverlay}><View style={styles.scoreSheet}><ScrollView contentContainerStyle={styles.scoreSheetContent}>
        <Text style={styles.resourceTitle}>Meet Polarys</Text>
        <Text style={styles.detectedBarDetail}>1. Detect your visit</Text>
        <Text style={styles.scoreHint}>With location access, Polarys watches 100-meter venue boundaries and confirms nighttime visits using a precise location within 40 meters.</Text>
        <Text style={styles.detectedBarDetail}>2. Keep track</Text>
        <Text style={styles.scoreHint}>Your visit timer starts after confirmation. Between 9 PM and 5 AM, venue time adds up toward a 45-minute check-in threshold.</Text>
        <Text style={styles.detectedBarDetail}>3. Plan a safe ride</Text>
        <Text style={styles.scoreHint}>Set up a car Shortcut in Settings and allow notifications for ride reminders. Open Ride anytime for transportation options. Background reminders depend on phone permissions and location delivery.</Text>
        <Pressable accessibilityRole="button" style={styles.rideButton} onPress={dismissIntro}><Text style={styles.rideButtonText}>Got it</Text></Pressable>
      </ScrollView></View></View>
    </Modal>
  </>;
}
function MonitorItem({
  label,
  value,
  detail,
  danger = false,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.monitorItem}>
      <Text style={styles.monitorLabel}>{label}</Text>
      <Text style={[styles.monitorValue, danger && styles.dangerText]}>{value}</Text>
      <Text style={styles.monitorDetail}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  riskHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, fontSize: 12, fontWeight: '700' },
  riskLow: { backgroundColor: '#4B3D35', color: '#FFF8F0' },
  riskMedium: { backgroundColor: '#F1CD91', color: '#412B12' },
  riskHigh: { backgroundColor: '#E6AAA2', color: '#511811' },
  pointDescription: { flex: 1, gap: 4 },

  root: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 20,
  },
  header: {
    borderBottomWidth: 3,
    borderBottomColor: AppColors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  wordmark: {
    color: AppColors.highlight,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
  },
  tagline: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 13,
    marginTop: 2,
  },
  statusDot: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  dotIdle: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  detectedBarCard: {
    backgroundColor: AppColors.surface,
    borderColor: AppColors.accent,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  detectedBarLabel: {
    color: AppColors.highlight,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  detectedBarName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  detectedBarDetail: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 20,
  },
  scoreSheet: { backgroundColor: AppColors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  scoreSheetContent: { padding: 24, paddingBottom: 40, gap: 12 },
  scorePanel: { marginTop: 18, backgroundColor: AppColors.background, borderRadius: 14, padding: 16, gap: 14 },
  visitSummary: { gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  scoreLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  scoreHint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 18 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  scoreRowLabel: { color: '#FFFFFF', fontSize: 14, flex: 1 },
  scorePoints: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  scoreTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 14 },
  scoreTotal: { color: AppColors.highlight, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  scoreUnit: { fontSize: 14, fontWeight: '500' },
  visitDuration: { color: '#FFFFFF', fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  connectionNote: { color: AppColors.highlight, fontSize: 15, fontWeight: '600', marginTop: 12 },
  statusFootnote: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 18, marginTop: 16 },
  rideButton: { backgroundColor: AppColors.highlight, borderRadius: 18, padding: 20, alignItems: 'center', gap: 4, minHeight: 64 },
  rideButtonText: { color: '#000000', fontSize: 20, fontWeight: '800' },
  rideButtonDetail: { color: '#333333', fontSize: 14 },
  settingsButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  resourceButton: { backgroundColor: AppColors.surface, borderLeftWidth: 3, borderLeftColor: AppColors.accent, borderRadius: 18, padding: 20, gap: 6 },
  resourceTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  permissionBanner: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 14,
  },
  permissionText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: AppColors.highlight,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  monitorGrid: {
    backgroundColor: AppColors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  monitorItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  monitorLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  monitorValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  monitorDetail: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12,
    marginTop: 3,
  },
  dangerText: {
    color: '#FFFFFF',
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureButton: {
    flex: 1,
    minWidth: '30%',
    minHeight: 72,
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  statsSection: {
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statBlock: {
    flex: 1,
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
  },
  statValue: {
    color: AppColors.highlight,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 4,
  },
  devRow: {
    gap: 8,
  },
  devButton: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  devButtonText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  detailsSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 40,
    gap: 16,
  },
  detailsKicker: {
    color: '#666666',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsTitle: {
    color: '#111111',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
  },
  breakdownList: {
    gap: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  breakdownLabel: {
    color: '#3A3A3A',
    fontSize: 15,
    flex: 1,
  },
  breakdownValue: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
  totalValue: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '800',
  },
  closeButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  alertButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertButtonText: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '800',
  },
});
