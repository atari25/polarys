import AsyncStorage from '@react-native-async-storage/async-storage';
/** Device-only storage; no purchase or location data is sent to a server here. */
export const deviceStorage = AsyncStorage;
export const STORAGE_KEYS = { intro: 'polarys.introSeen', football: 'polarys.footballSchedule.v1', night: 'polarys.night.v1', home: 'polarys.home.v1', debug: 'polarys.debug.v1' } as const;
