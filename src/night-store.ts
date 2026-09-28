import { deviceStorage, STORAGE_KEYS } from './storage';
import { emptyNight, NightEvent, NightSession, reduceNight } from './night-session';

let queue: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
export function subscribeNight(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function serializeNight<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  return result;
}
export async function readNight(now = Date.now()): Promise<NightSession> {
  const raw = await deviceStorage.getItem(STORAGE_KEYS.night);
  if (!raw) return emptyNight(now);
  try {
    const s = JSON.parse(raw) as NightSession;
    const nullableNumber = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x) && x >= 0);
    if (s.version !== 1 || !['idle','at_venue','between_venues','at_risk'].includes(s.status) ||
      !Number.isFinite(s.totalVenueMs) || s.totalVenueMs < 0 || !Number.isFinite(s.updatedAt) ||
      ![s.entryTime,s.startedAt,s.windowEndsAt,s.lastLeftAt,s.atRiskUntil].every(nullableNumber) ||
      typeof s.alertHandled !== 'boolean' || typeof s.carAlertIssued !== 'boolean' ||
      (s.nudgeNotificationId !== null && typeof s.nudgeNotificationId !== 'string') ||
      (s.currentVenue !== null && (typeof s.currentVenue?.id !== 'string' || typeof s.currentVenue?.name !== 'string')) ||
      (s.status === 'at_venue' && (!s.currentVenue || s.entryTime === null || s.startedAt === null || s.windowEndsAt === null))) return emptyNight(now);
    return s;
  } catch { return emptyNight(now); }
}
export async function writeNight(session: NightSession) {
  await deviceStorage.setItem(STORAGE_KEYS.night, JSON.stringify(session));
  listeners.forEach(listener => listener());
}
// Use inside serializeNight when side effects must be ordered with the update.
export async function applyNight(event: NightEvent, now: number) {
  const previous = await readNight(now);
  const next = reduceNight(previous, event, now);
  await writeNight(next);
  return { previous, next };
}
