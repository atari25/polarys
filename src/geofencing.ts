import * as Location from 'expo-location';
import { stopLocationTask } from './location-task-lifecycle';
import { NIGHT_CONFIG as C, TASK_NAMES } from './config';
import { deviceStorage, STORAGE_KEYS } from './storage';
import { CORE_VENUES, BarVenue } from './venues';
import { haversineMeters } from './geo';
import { findNearbyBars } from './places';
import { dispatchNight } from './night-controller';
import { readNight } from './night-store';
import { isNightTime } from './night-session';
import { isSavedPlace, readSavedPlaces } from './saved-places';

const KEY = 'polarys.tracking.v2';
let locationIssue: string | null = null;
export const getVenueLocationIssue = () => locationIssue;
type Runtime = { venues: BarVenue[]; lastFix: number; startedAt: number | null; blockedUntil: number; lastLookup: number };
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work); queue = result.catch(() => {}); return result;
}
async function read(): Promise<Runtime> {
  try {
    const value = JSON.parse(await deviceStorage.getItem(KEY) ?? 'null');
    if (value && Array.isArray(value.venues) && Number.isFinite(value.lastFix) && Number.isFinite(value.blockedUntil) && Number.isFinite(value.lastLookup) &&
        (value.startedAt === null || Number.isFinite(value.startedAt))) return value;
  } catch { /* Recover missing or obsolete runtime. */ }
  return { venues: [...CORE_VENUES], lastFix: 0, startedAt: null, blockedUntil: 0, lastLookup: 0 };
}
const save = (value: Runtime) => deviceStorage.setItem(KEY, JSON.stringify(value));
function nightEnd(now: number) {
  const date = new Date(now);
  if (date.getHours() >= C.startHour) date.setDate(date.getDate() + 1);
  date.setHours(C.endHour, 0, 0, 0); return date.getTime();
}
export function nearestVenues(venues: BarVenue[], lat: number, lon: number) {
  return venues.filter(v => typeof v.id === 'string' && typeof v.name === 'string' && Number.isFinite(v.lat) && Number.isFinite(v.lon))
    .sort((a,b) => haversineMeters(lat,lon,a.lat,a.lon) - haversineMeters(lat,lon,b.lat,b.lon)).slice(0,C.maxGeofences);
}
async function stopPrecise() {
  await stopLocationTask(TASK_NAMES.venueCheck);
  await deviceStorage.setItem(KEY + '.mode', 'stopped');
}
// One native task changes accuracy instead of running two competing trackers.
async function startBackground(runtime: Runtime, now: number, mode: 'discovery' | 'precise') {
  if (!isNightTime(now) || now < runtime.blockedUntil) return;
  if (!(await Location.getBackgroundPermissionsAsync()).granted) return;
  const signature = `v1:${mode}`;
  if (!await Location.hasStartedLocationUpdatesAsync(TASK_NAMES.venueCheck) ||
      await deviceStorage.getItem(KEY + '.mode') !== signature) {
    await Location.startLocationUpdatesAsync(TASK_NAMES.venueCheck, {
      accuracy: mode === 'precise' ? Location.Accuracy.High : Location.Accuracy.Balanced,
      // Zero allows a better fix even when the person remains seated indoors.
      distanceInterval: mode === 'precise' ? 0 : C.discoveryDistanceIntervalM,
      deferredUpdatesDistance: 0, deferredUpdatesInterval: 0, deferredUpdatesTimeout: 0,
      pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Polarys night reminders',
        notificationBody: 'Checking nearby places so we can remind you when you leave.',
        killServiceOnDestroy: false,
      },
    });
    await deviceStorage.setItem(KEY + '.mode', signature);
  }
  runtime.startedAt ??= now;
}
const startPrecise = (runtime: Runtime, now: number) => startBackground(runtime, now, 'precise');
async function refresh(runtime: Runtime, lat: number, lon: number, now: number) {
  // Apply additions to the built-in list even when a persisted lookup is recent.
  runtime.venues = [...new Map([...runtime.venues, ...CORE_VENUES].map(v => [v.id, v])).values()];
  if (now - runtime.lastLookup >= C.placesRefreshMs) {
    const found = await findNearbyBars(lat, lon, C.placesRadiusM);
    const merged = new Map(runtime.venues.map(v => [v.id,v]));
    for (const v of found) {
      // Keep canonical coordinates for the curated bars.
      if (!CORE_VENUES.some(core => core.name.toLowerCase().replace(/[^a-z0-9]/g,'') === v.name.toLowerCase().replace(/[^a-z0-9]/g,'') && haversineMeters(core.lat,core.lon,v.lat,v.lon) < C.preciseVenueRadiusM)) merged.set(v.id,v);
    }
    for (const v of CORE_VENUES) merged.set(v.id,v);
    runtime.venues = nearestVenues([...merged.values()],lat,lon);
    runtime.lastLookup = now;
  } else runtime.venues = nearestVenues(runtime.venues,lat,lon);
  await syncSavedPlaces(runtime);
  await registerRegions(runtime);
  await save(runtime);
}
async function syncSavedPlaces(runtime: Runtime) {
  const saved = await readSavedPlaces();
  // Reserve slots for explicitly saved addresses, within iOS's 20-region limit.
  runtime.venues = [...saved, ...runtime.venues.filter(v => !isSavedPlace(v.id))].slice(0, C.maxGeofences);
  const night = await readNight();
  if (night.currentVenue && isSavedPlace(night.currentVenue.id) && !saved.some(p => p.id === night.currentVenue!.id)) {
    // Removing a place cancels its visit without generating a departure reminder.
    await dispatchNight({ type: 'home' });
    await stopPrecise();
    runtime.startedAt = null;
  }
}
async function registerRegions(runtime: Runtime) {
  if ((await Location.getBackgroundPermissionsAsync()).granted) {
    const regions = runtime.venues.map(v => ({ identifier: v.id, latitude: v.lat, longitude: v.lon, radius: C.geofenceRadiusM, notifyOnEnter: true, notifyOnExit: true }));
    const signature = JSON.stringify(regions);
    if (!await Location.hasStartedGeofencingAsync(TASK_NAMES.geofence) || await deviceStorage.getItem(KEY+'.regions') !== signature) {
      await Location.startGeofencingAsync(TASK_NAMES.geofence, regions);
      await deviceStorage.setItem(KEY+'.regions', signature);
    }
  }
}
export async function refreshSavedPlaceMonitoring() {
  await serial(async () => {
    const runtime = await read();
    await syncSavedPlaces(runtime);
    await registerRegions(runtime);
    await save(runtime);
  });
  // Registering a fence while already inside it may not produce a new crossing.
  // Evaluate the current position immediately, outside the serial queue.
  if ((await Location.getForegroundPermissionsAsync()).granted) {
    await processVenueLocation(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  }
}

async function safety(runtime: Runtime, now: number) {
  if (runtime.startedAt !== null && now >= nightEnd(runtime.startedAt)) {
    await stopPrecise(); runtime.startedAt = null;
    await dispatchNight({ type: 'tick' },now); await save(runtime);
  }
  const capped = runtime.startedAt !== null && now - runtime.startedAt >= C.maxTrackingMs;
  if (!isNightTime(now) || capped || now < runtime.blockedUntil) {
    await dispatchNight({ type: 'tick' },now);
    if (capped) { await dispatchNight({ type: 'finalize' },now); runtime.blockedUntil = nightEnd(now); }
    await stopPrecise(); runtime.startedAt = null; await save(runtime); return false;
  }
  return true;
}
export function endNightAtHome() {
  return serial(async () => {
    const now = Date.now(), runtime = await read();
    await dispatchNight({ type: 'home' },now);
    runtime.blockedUntil = isNightTime(now) ? nightEnd(now) : now;
    runtime.startedAt = null;
    await save(runtime); await stopPrecise();
  });
}
export async function resumeNightForTesting() {
  if (!__DEV__) throw new Error('Resume night is available only in development builds.');
  await serial(async () => {
    const runtime = await read();
    await stopPrecise();
    await dispatchNight({ type: 'home' });
    runtime.blockedUntil = 0;
    runtime.startedAt = null;
    runtime.lastFix = 0;
    await save(runtime);
  });
  // Refresh outside the queue: initializeGeofencing enqueues the fresh fix itself.
  try { await initializeGeofencing(); return true; }
  catch { return false; } // Pause is cleared even if the next location fix must wait.
}
async function processFix(position: Location.LocationObject, refreshRegions: boolean) {
  const now = Date.now(), runtime = await read();
  const { latitude: lat, longitude: lon, accuracy } = position.coords;
  const usableForDiscovery = Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180 &&
    accuracy != null && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= C.discoveryMaxAccuracyM &&
    Number.isFinite(position.timestamp) && now-position.timestamp <= C.maxFixAgeMs && position.timestamp-now <= C.maxFutureFixMs;
  await syncSavedPlaces(runtime);
  if (!await safety(runtime,now)) {
    locationIssue = null;
    if (refreshRegions && usableForDiscovery) await refresh(runtime,lat,lon,now);
    return;
  }
  if (position.timestamp <= runtime.lastFix) return;
  if (!usableForDiscovery || accuracy == null) {
    locationIssue = 'Waiting for a precise location to confirm your visit. Check Precise Location in Settings.';
    const night = await readNight(now);
    await startBackground(runtime, now, night.status === 'at_venue' || night.status === 'between_venues' ? 'precise' : 'discovery');
    await save(runtime);
    return;
  }
  if (refreshRegions) await refresh(runtime,lat,lon,now);
  const activeNight = await readNight(now);
  const closeToVenue = runtime.venues.some(v => haversineMeters(lat,lon,v.lat,v.lon) <= C.geofenceRadiusM + accuracy);
  await startBackground(runtime, now,
    closeToVenue || activeNight.status === 'at_venue' || activeNight.status === 'between_venues' ? 'precise' : 'discovery');
  if (accuracy > C.maxAccuracyM) {
    locationIssue = 'Waiting for a precise location to confirm your visit. Check Precise Location in Settings.';
    await save(runtime);
    return;
  }
  locationIssue = null;
  runtime.lastFix = position.timestamp;
  let home: { latitude: number; longitude: number } | null = null;
  try { home = JSON.parse(await deviceStorage.getItem(STORAGE_KEYS.home) ?? 'null'); } catch { /* Invalid home must not break monitoring. */ }
  if (home && Number.isFinite(home.latitude) && Number.isFinite(home.longitude) &&
      haversineMeters(lat,lon,home.latitude,home.longitude) + accuracy <= C.homeRadiusM) {
    await dispatchNight({ type: 'home' },now);
    runtime.blockedUntil = nightEnd(now); runtime.startedAt = null;
    await save(runtime); await stopPrecise(); return;
  }
  const venues = nearestVenues(runtime.venues,lat,lon);
  const nearest = venues[0];
  const distance = nearest ? haversineMeters(lat,lon,nearest.lat,nearest.lon) : Infinity;
  const night = await readNight(now);
  if (nearest && distance + accuracy <= (isSavedPlace(nearest.id) ? C.savedPlaceRadiusM : C.preciseVenueRadiusM)) {
    await dispatchNight({ type: 'enter', venue: nearest },now);
    await startPrecise(runtime,now);
  } else if (night.status === 'at_venue') {
    const current = runtime.venues.find(v => v.id === night.currentVenue?.id);
    // Accuracy buffer prevents GPS jitter from causing an exit.
    if (current && haversineMeters(lat,lon,current.lat,current.lon) - accuracy > (isSavedPlace(current.id) ? C.savedPlaceRadiusM : C.preciseVenueRadiusM)) await dispatchNight({ type: 'leave' },now);
  }
  const after = await readNight(now);
  if (distance - accuracy > C.finalizeDistanceM && after.lastLeftAt !== null && now-after.lastLeftAt > C.barHopGraceMs) {
    await dispatchNight({ type: 'finalize' },now);
    await startBackground(runtime,now,'discovery');
  } else await dispatchNight({ type: 'tick' },now);
  await save(runtime);
}
export const processVenueLocation = (position: Location.LocationObject, refreshRegions = true) => serial(() => processFix(position,refreshRegions));
export function handleGeofence(eventType: Location.GeofencingEventType, region: Location.LocationRegion) {
  return serial(async () => {
    const now = Date.now(), runtime = await read();
    await syncSavedPlaces(runtime);
    const venue = runtime.venues.find(v => v.id === region.identifier);
    if (!venue) return;
    // Start location recovery before any network lookup. Saved fences work offline.
    if (!await safety(runtime,now)) return;
    if (eventType === Location.GeofencingEventType.Enter) {
      await startPrecise(runtime,now); await save(runtime);
      // A 100 m fence wakes tracking; only a precise fix confirms time at a venue.
      try { await processFix(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),false); }
      catch { /* Wait for VENUE_CHECK rather than fabricate entry. */ }
    } else if (eventType === Location.GeofencingEventType.Exit) {
      // Prefer fresh precise evidence over an OS boundary event that may be delayed.
      try {
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (Date.now() - fix.timestamp <= C.maxFixAgeMs && fix.coords.accuracy !== null && fix.coords.accuracy <= C.maxAccuracyM) {
          await processFix(fix,false); return;
        }
      } catch { /* Matching fence exit remains a backup. */ }
      const night = await readNight(now);
      if (night.currentVenue?.id === venue.id) await dispatchNight({ type: 'leave' },now);
    }
  });
}
export async function initializeGeofencing() {
  await stopLocationTask(TASK_NAMES.legacy);
  await serial(async () => {
    // One-time migration after removing the manual end-night control.
    // Home detection below still applies immediately to the next good fix.
    if (await deviceStorage.getItem(KEY + '.manualEndRemoved') !== 'yes') {
      const runtime = await read();
      runtime.blockedUntil = 0;
      await save(runtime);
      await deviceStorage.setItem(KEY + '.manualEndRemoved', 'yes');
    }
    const runtime = await read(), now = Date.now();
    await syncSavedPlaces(runtime);
    await registerRegions(runtime);
    if (await safety(runtime,now)) {
      const night = await readNight(now);
      await startBackground(runtime,now,night.status === 'at_venue' || night.status === 'between_venues' ? 'precise' : 'discovery');
      await save(runtime);
    }
  });
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  await processVenueLocation(position,true);
}
export const checkTrackingSafety = () => serial(async () => { await safety(await read(),Date.now()); });
