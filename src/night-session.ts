import { NIGHT_CONFIG as C } from './config';

export type NightVenue = { id: string; name: string };
export type NightSession = {
  version: 1;
  status: 'idle' | 'at_venue' | 'between_venues' | 'at_risk';
  currentVenue: NightVenue | null;
  entryTime: number | null;
  startedAt: number | null;
  windowEndsAt: number | null;
  totalVenueMs: number;
  lastLeftAt: number | null;
  nudgeNotificationId: string | null;
  departureNotified?: boolean;
  carConnectionPoints?: number;
  alertHandled: boolean;
  carAlertIssued: boolean;
  atRiskUntil: number | null;
  updatedAt: number;
};
export type NightEvent =
  | { type: 'enter'; venue: NightVenue }
  | { type: 'leave' }
  | { type: 'finalize' }
  | { type: 'home' }
  | { type: 'tick' }
  | { type: 'handled' }
  | { type: 'car' };

export function emptyNight(now: number): NightSession {
  return { version: 1, status: 'idle', currentVenue: null, entryTime: null,
    startedAt: null, windowEndsAt: null, totalVenueMs: 0, lastLeftAt: null,
    carConnectionPoints: 0, departureNotified: false, nudgeNotificationId: null, alertHandled: false,
    carAlertIssued: false, atRiskUntil: null, updatedAt: now };
}
export function isNightTime(now: number): boolean {
  const hour = new Date(now).getHours();
  return hour >= C.startHour || hour < C.endHour;
}
function windowEnd(now: number): number {
  const date = new Date(now);
  if (date.getHours() >= C.startHour) date.setDate(date.getDate() + 1);
  date.setHours(C.endHour, 0, 0, 0);
  return date.getTime();
}
export function thresholdMs(_session?: NightSession): number {
  return C.thresholdMs;
}
export function totalVenueMs(session: NightSession, now: number): number {
  const cappedNow = Math.min(now, session.windowEndsAt ?? now,
    session.startedAt === null ? now : session.startedAt + C.maxTrackingMs);
  return session.totalVenueMs + (session.status === 'at_venue' && session.entryTime !== null
    ? Math.max(0, cappedNow - session.entryTime) : 0);
}
function leave(session: NightSession, now: number): NightSession {
  if (session.status !== 'at_venue') return session;
  return { ...session, status: 'between_venues', totalVenueMs: totalVenueMs(session, now),
    currentVenue: null, entryTime: null, lastLeftAt: now, updatedAt: now };
}
function finalize(session: NightSession, now: number): NightSession {
  const left = leave(session, now);
  if (left.status === 'idle' || left.status === 'at_risk') return left;
  const expiry = Math.min((left.lastLeftAt ?? now) + C.atRiskDurationMs, left.windowEndsAt ?? now);
  if (left.totalVenueMs < thresholdMs(left) || now >= expiry) return emptyNight(now);
  return { ...left, status: 'at_risk', atRiskUntil: expiry, updatedAt: now };
}
export function normalizeNight(session: NightSession, now: number): NightSession {
  if (session.status === 'idle') return session;
  if (!isNightTime(now) || (session.windowEndsAt !== null && now >= session.windowEndsAt)) return emptyNight(now);
  if (session.status === 'at_risk') {
    if (session.totalVenueMs < C.thresholdMs) return emptyNight(now);
    return session.atRiskUntil === null || now >= session.atRiskUntil ? emptyNight(now) : session;
  }
  if (session.startedAt !== null && now >= session.startedAt + C.maxTrackingMs) {
    return finalize(session, session.startedAt + C.maxTrackingMs).status === 'at_risk'
      ? normalizeNight(finalize(session, session.startedAt + C.maxTrackingMs), now) : emptyNight(now);
  }
  if (session.status === 'between_venues' && session.lastLeftAt !== null && now - session.lastLeftAt > C.barHopGraceMs) return finalize(session, now);
  return session;
}
/** Pure transitions: no storage, native API, React, or wall-clock reads. */
export function reduceNight(previous: NightSession, event: NightEvent, now: number): NightSession {
  if (!Number.isFinite(now) || now < previous.updatedAt) return previous;
  let session = normalizeNight(previous, now);
  if (event.type === 'home') return emptyNight(now);
  if (event.type === 'tick') return session;
  if (event.type === 'handled') return { ...session, alertHandled: true, updatedAt: now };
  if (!isNightTime(now)) return emptyNight(now);
  switch (event.type) {
    case 'enter': {
      if (session.status === 'at_venue' && session.currentVenue?.id === event.venue.id) return session;
      if (session.status === 'at_venue') session = leave(session, now);
      const continues = session.lastLeftAt !== null && now - session.lastLeftAt <= C.barHopGraceMs;
      const base = continues ? session : { ...emptyNight(now), startedAt: now, windowEndsAt: windowEnd(now) };
      return { ...base, status: 'at_venue', currentVenue: event.venue, entryTime: now,
        atRiskUntil: null, lastLeftAt: null, updatedAt: now };
    }
    case 'leave': return leave(session, now);
    case 'finalize': return finalize(session, now);
    case 'car': {
      // A car may be parked inside the fence. Evaluate current accumulated time too.
      const eligible = session.status === 'at_risk' || totalVenueMs(session, now) >= thresholdMs(session);
      if (session.status === 'idle' || !eligible || session.carAlertIssued) return session;
      const ready = finalize(session, now);
      return ready.status === 'at_risk' ? { ...ready, carAlertIssued: true, carConnectionPoints: C.carConnectionPoints, updatedAt: now } : ready;
    }
  }
}

/** Activity indicators only; these are not a clinical or intoxication score. */
export function activityBreakdown(saved: NightSession, now: number) {
  const session = normalizeNight(saved, now);
  const reachedThreshold = session.status !== 'idle' && totalVenueMs(session, now) >= C.thresholdMs;
  const venuePoints = session.status === 'idle' ? 0 : Math.floor(totalVenueMs(session, now) / 60_000) * C.pointsPerMinute;
  const carPoints = reachedThreshold && (session.carConnectionPoints ?? 0) > 0 ? C.carConnectionPoints : 0;
  return { venuePoints, carPoints, total: venuePoints + carPoints,
    level: (carPoints > 0 ? 'High' : reachedThreshold ? 'Medium' : 'Low') as 'Low' | 'Medium' | 'High' };
}
