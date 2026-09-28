import * as Location from 'expo-location';

// Startup, foreground refresh, and a delivered background callback may all
// retire the same task. Serialize its check-and-stop instead of racing them.
const stops = new Map<string, Promise<void>>();
export function stopLocationTask(taskName: string): Promise<void> {
  const existing = stops.get(taskName);
  if (existing) return existing;
  const operation = (async () => {
    if (!await Location.hasStartedLocationUpdatesAsync(taskName)) return;
    try {
      await Location.stopLocationUpdatesAsync(taskName);
    } catch (error) {
      // A native/previous JS runtime may remove it between check and stop.
      // Only tolerate the specific missing-task error when it is now absent.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('not found') || await Location.hasStartedLocationUpdatesAsync(taskName)) throw error;
    }
  })();
  const pending = operation.finally(() => {
    if (stops.get(taskName) === pending) stops.delete(taskName);
  });
  stops.set(taskName, pending);
  return pending;
}
