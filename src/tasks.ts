import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { stopLocationTask } from './location-task-lifecycle';
import { TASK_NAMES } from './config';
import { processVenueLocation, handleGeofence } from './geofencing';
TaskManager.defineTask(TASK_NAMES.geofence, async ({ data, error }) => {
  if (error || !data) return;
  const event = data as { eventType: Location.GeofencingEventType; region: Location.LocationRegion };
  await handleGeofence(event.eventType,event.region);
});
TaskManager.defineTask(TASK_NAMES.venueCheck, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  const latest = locations.reduce<Location.LocationObject | undefined>((a,b) => !a || b.timestamp > a.timestamp ? b : a, undefined);
  if (latest) await processVenueLocation(latest);
});
// Migrate an existing installation without continuing its old always-on tracker.
TaskManager.defineTask(TASK_NAMES.legacy, async () => {
  await stopLocationTask(TASK_NAMES.legacy);
});
