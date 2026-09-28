// Legacy in-memory detector, preserved until phase 3 replaces it with persisted tasks.
import type * as Location from 'expo-location';
import { LEGACY_CONFIG } from './config';
import { haversineMeters } from './geo';
import { findNearbyBar } from './places';
import type { BarVenue } from './venues';
import { markVenueExited, setMovingAtVehicleSpeed, startVenueSession } from './session';
import { dispatchNight } from './night-controller';
type CandidateBar = BarVenue & { firstSeenAt: number | null };

let trackedBar: BarVenue | null = null;
let candidateBar: CandidateBar | null = null;
let pendingExit: { name: string } | null = null;
let lastPlacesLookup = 0;
let lastFixAt = 0;
let locationQueue = Promise.resolve();
const exitListeners = new Set<(barName: string) => void>();

// Serialize foreground and background callbacks so an older Places response
// cannot overwrite a newer venue decision.
export function processLocation(position: Location.LocationObject) {
  const result = locationQueue.then(() => processLocationFix(position));
  locationQueue = result.then(() => {}, () => {});
  return result;
}

async function processLocationFix(position: Location.LocationObject) {
  const { latitude, longitude, accuracy } = position.coords;
  const now = Date.now();
  if (position.timestamp <= lastFixAt) return { currentBar: trackedBar, exitedName: null };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      accuracy == null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > LEGACY_CONFIG.maxAccuracyM ||
      now - position.timestamp > LEGACY_CONFIG.maxFixAgeMs || position.timestamp > now + LEGACY_CONFIG.maxFutureFixMs) {
    if (candidateBar) candidateBar.firstSeenAt = null;
    return { currentBar: trackedBar, exitedName: null };
  }
  if (candidateBar && position.timestamp - lastFixAt > LEGACY_CONFIG.maxDwellGapMs) candidateBar.firstSeenAt = null;
  lastFixAt = position.timestamp;
  setMovingAtVehicleSpeed((position.coords.speed ?? 0) >= LEGACY_CONFIG.vehicleSpeedMps);

  await dispatchNight({ type: 'tick' }, now);
  const current = trackedBar;

  if (current) {
    const dist = haversineMeters(latitude, longitude, current.lat, current.lon);

    if (dist - accuracy > LEGACY_CONFIG.geofenceRadiusM) {
      markVenueExited();
      trackedBar = null;
      pendingExit = { name: current.name };
      await dispatchNight({ type: 'leave' }, now);
      exitListeners.forEach((listener) => listener(current.name));
      return { currentBar: null, exitedName: current.name };
    }

    await dispatchNight({ type: 'enter', venue: { id: current.id, name: current.name } }, now);
    return { currentBar: current, exitedName: null };
  }

  if (candidateBar) {
    const dist = haversineMeters(latitude, longitude, candidateBar.lat, candidateBar.lon);

    if (dist > LEGACY_CONFIG.geofenceRadiusM) {
      candidateBar = null;
      return { currentBar: null, exitedName: null };
    }

    if (dist > LEGACY_CONFIG.dwellRadiusM) {
      candidateBar.firstSeenAt = null;
    } else {
      candidateBar.firstSeenAt ??= position.timestamp;
    }

    if (candidateBar.firstSeenAt !== null && position.timestamp - candidateBar.firstSeenAt >= LEGACY_CONFIG.minDwellMs) {
      trackedBar = {
        id: candidateBar.id,
        name: candidateBar.name,
        lat: candidateBar.lat,
        lon: candidateBar.lon,
      };
      candidateBar = null;
      pendingExit = null;
      startVenueSession(trackedBar.name);
      await dispatchNight({ type: 'enter', venue: { id: trackedBar.id, name: trackedBar.name } }, now);
      return { currentBar: trackedBar, exitedName: null };
    }
  }

  if (now - lastPlacesLookup < LEGACY_CONFIG.placesLookupIntervalMs) {
    return { currentBar: null, exitedName: null };
  }
  lastPlacesLookup = now;

  const bar = await findNearbyBar(latitude, longitude);
  if (!bar) return { currentBar: null, exitedName: null };

  if (!candidateBar || candidateBar.id !== bar.id) {
    candidateBar = { ...bar, firstSeenAt: haversineMeters(latitude, longitude, bar.lat, bar.lon) <= LEGACY_CONFIG.dwellRadiusM ? position.timestamp : null };
  }

  return { currentBar: null, exitedName: null };
}

export function getDetectionSnapshot() { return { trackedBar, candidateBar, pendingExit }; }
export function subscribeToVenueExit(listener: (name: string) => void) {
  exitListeners.add(listener);
  return () => { exitListeners.delete(listener); };
}
