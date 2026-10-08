/** Target night-session rules. Activated in phases 2–5, not by this refactor. */
export const NIGHT_CONFIG = {
  startHour: 21, endHour: 5,
  thresholdMs: 45 * 60_000, carConnectionPoints: 40, pointsPerMinute: 0.5,
  barHopGraceMs: 15 * 60_000, atRiskDurationMs: 90 * 60_000,
  geofenceRadiusM: 100, preciseVenueRadiusM: 40, savedPlaceRadiusM: 40, homeRadiusM: 40,
  finalizeDistanceM: 200, maxTrackingMs: 6 * 60 * 60_000,
  maxAccuracyM: 25, maxFixAgeMs: 30_000, maxFutureFixMs: 5_000,
  placesRadiusM: 5000, placesRefreshMs: 60_000, foregroundRefreshMs: 30_000,
  maxGeofences: 20, trackingDistanceIntervalM: 10,
  discoveryDistanceIntervalM: 100, discoveryMaxAccuracyM: 250,
  debugLogLimit: 100, debugUnlockTaps: 5, shortcutTestWindowMs: 60_000,
} as const;
export const TASK_NAMES = { geofence: 'BAR_FENCE', venueCheck: 'VENUE_CHECK', legacy: 'polarys-background-location' } as const;
/** Preserve existing behavior until the staged tracking migration. */
export const LEGACY_CONFIG = {
  geofenceRadiusM: 100, dwellRadiusM: 30, minDwellMs: 3 * 60_000,
  pollIntervalMs: 10_000, maxAccuracyM: 25, maxFixAgeMs: 30_000,
  maxDwellGapMs: 45_000, placesLookupIntervalMs: 60_000,
  maxPlaces: 20, maxFutureFixMs: 5_000, vehicleSpeedMps: 10,
  distanceIntervalM: 0, pointsPerMinute: 0.5, bluetoothPoints: 40,
  highPoints: 60, mediumPoints: 40, clockIntervalMs: 30_000,
} as const;
export const LOCATION_PERMISSION_COPY = {
  foreground: 'Polarys uses your location to find safe rides and nearby help.',
  background: 'Polarys checks your location near bars at night so it can offer you a safe ride home before you drive.',
} as const;
export const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
