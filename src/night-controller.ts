import { NightEvent, reduceNight, normalizeNight, thresholdMs } from './night-session';
import { applyNight, readNight, serializeNight, writeNight } from './night-store';
import { sendCarCheckIn, sendDepartureReminder, updateNudge } from './night-notifications';
import { deviceStorage, STORAGE_KEYS } from './storage';

export const SHORTCUT_KEY = 'polarys.shortcutReceipt.v1';
// Upgrade saved sessions/reminders from the retired purchase threshold.
async function migratePurchaseSession(now: number) {
  const raw = await deviceStorage.getItem(STORAGE_KEYS.night);
  let legacy: { purchaseLogged?: boolean } | null = null;
  try { legacy = raw ? JSON.parse(raw) : null; } catch { /* readNight handles invalid data */ }
  if (legacy && Object.prototype.hasOwnProperty.call(legacy, 'purchaseLogged')) {
    const previous = await readNight(now);
    const next = normalizeNight(previous, now);
    Reflect.deleteProperty(next, 'purchaseLogged');
    await updateNudge(previous, next, now, true);
    await writeNight(next);
  }
  await deviceStorage.removeItem('polarys.lastPurchase.v1');
}
export async function dispatchNight(event: NightEvent, now = Date.now()) {
  return serializeNight(async () => {
    await migratePurchaseSession(now);
    const result = await applyNight(event, now);
    try { await updateNudge(result.previous, result.next, now); }
    catch { console.warn('Night saved, but reminder could not be updated.'); }
    if (event.type === 'leave' && result.previous.status === 'at_venue' &&
        result.next.status === 'between_venues' && result.next.totalVenueMs >= thresholdMs() &&
        !result.next.departureNotified && !result.next.alertHandled) {
      // Claim before sending so duplicate precise/fence exits cannot send twice.
      result.next.departureNotified = true;
      await writeNight(result.next);
      try { await sendDepartureReminder(); } catch { console.warn('Departure reminder could not be delivered.'); }
    }
    return result.next;
  });
}
export async function receiveCar(source: 'shortcut' | 'bluetooth' = 'shortcut') {
  return serializeNight(async () => {
    const now = Date.now();
    await migratePurchaseSession(now);
    if (source === 'shortcut') await deviceStorage.setItem(SHORTCUT_KEY, JSON.stringify({ kind: 'car', receivedAt: now }));
    const previous = await readNight(now);
    const next = reduceNight(previous, { type: 'car' }, now);
    await writeNight(next);
    const showAlert = next.status === 'at_risk' && next.carAlertIssued && !next.alertHandled;
    try {
      await updateNudge(previous, next, now);
      if (showAlert && !previous.carAlertIssued) await sendCarCheckIn();
    } catch { console.warn('Check-in notification unavailable; showing ride options in app.'); }
    return showAlert && (source === 'shortcut' || !previous.carAlertIssued);
  });
}
