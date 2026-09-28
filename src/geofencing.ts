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

const KEY = 'polarys.tracking.v2';
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
}
async function startPrecise(runtime: Runtime, now: number) {
  if (!isNightTime(now) || now < runtime.blockedUntil) return;
  if (!(await Location.getBackgroundPermissionsAsync()).granted) return;
  if (!await Location.hasStartedLocationUpdatesAsync(TASK_NAMES.venueCheck)) {
    await Location.startLocationUpdatesAsync(TASK_NAMES.venueCheck, {
      accuracy: Location.Accuracy.High, distanceInterval: C.trackingDistanceIntervalM,
      pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: false,
    });
  }
  runtime.startedAt ??= now;
}
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
  if ((await Location.getBackgroundPermissionsAsync()).granted) {
    const regions = runtime.venues.map(v => ({ identifier: v.id, latitude: v.lat, longitude: v.lon, radius: C.geofenceRadiusM, notifyOnEnter: true, notifyOnExit: true }));
    // Re-register only if the set changes; registration itself produces initial events on iOS.
    const signature = JSON.stringify(regions);
    if (!await Location.hasStartedGeofencingAsync(TASK_NAMES.geofence) || await deviceStorage.getItem(KEY+'.regions') !== signature) {
      await Location.startGeofencingAsync(TASK_NAMES.geofence, regions);
      await deviceStorage.setItem(KEY+'.regions',signature);
    }
  }
  await save(runtime);
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
  if (!await safety(runtime,now)) {
    if (refreshRegions) await refresh(runtime,position.coords.latitude,position.coords.longitude,now);
    return;
  }
  const { latitude: lat, longitude: lon, accuracy } = position.coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || accuracy == null || accuracy < 0 || accuracy > C.maxAccuracyM ||
      !Number.isFinite(accuracy) || position.timestamp <= runtime.lastFix || now-position.timestamp > C.maxFixAgeMs || position.timestamp-now > C.maxFutureFixMs) return;
  runtime.lastFix = position.timestamp;
  if (refreshRegions) await refresh(runtime,lat,lon,now);
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
  if (nearest && distance + accuracy <= C.preciseVenueRadiusM) {
    await dispatchNight({ type: 'enter', venue: nearest },now);
    await startPrecise(runtime,now);
  } else if (night.status === 'at_venue') {
    const current = runtime.venues.find(v => v.id === night.currentVenue?.id);
    // Accuracy buffer prevents GPS jitter from causing an exit.
    if (current && haversineMeters(lat,lon,current.lat,current.lon) - accuracy > C.preciseVenueRadiusM) await dispatchNight({ type: 'leave' },now);
  }
  const after = await readNight(now);
  if (distance - accuracy > C.finalizeDistanceM && after.lastLeftAt !== null && now-after.lastLeftAt > C.barHopGraceMs) {
    await dispatchNight({ type: 'finalize' },now);
    await stopPrecise(); runtime.startedAt = null;
  } else await dispatchNight({ type: 'tick' },now);
  await save(runtime);
}
export const processVenueLocation = (position: Location.LocationObject, refreshRegions = false) => serial(() => processFix(position,refreshRegions));
export function handleGeofence(eventType: Location.GeofencingEventType, region: Location.LocationRegion) {
  return serial(async () => {
    const now = Date.now(), runtime = await read();
    const venue = runtime.venues.find(v => v.id === region.identifier);
    if (!venue) return;
    await refresh(runtime,venue.lat,venue.lon,now);
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
  await serial(async () => {
    // One-time migration after removing the manual end-night control.
    // Home detection below still applies immediately to the next good fix.
    if (await deviceStorage.getItem(KEY + '.manualEndRemoved') !== 'yes') {
      const runtime = await read();
      runtime.blockedUntil = 0;
      await save(runtime);
      await deviceStorage.setItem(KEY + '.manualEndRemoved', 'yes');
    }
  });
  await stopLocationTask(TASK_NAMES.legacy);
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  await processVenueLocation(position,true);
}
export const checkTrackingSafety = () => serial(async () => { await safety(await read(),Date.now()); });
