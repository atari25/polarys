# Phase 1 — inspection and foundations

## Inspection before changes

- `app/(tabs)/index.tsx` was a small wrapper; shared UI and orchestration were in `components/AppPages.tsx`.
- `services/bar-detection.ts` contained foreground `watchPositionAsync`, foreground/background permission requests, continuous `startLocationUpdatesAsync`, and a top-level `defineTask('polarys-background-location')`.
- No `startGeofencingAsync`, `BAR_FENCE`, `VENUE_CHECK`, Friley, Cy's Roost, Blue Owl, or Kappa Sigma existed.
- Venue and score state were in memory, including during background callbacks. AsyncStorage was used for onboarding and cached football schedules only.
- Expo Notifications, Task Manager, location, dev client and AsyncStorage were already installed. `polarys` scheme and an EAS development profile already existed.
- Existing native car-audio detection is retained during Phase 1. It will be retired when Shortcut routes replace it; no Bluetooth dependency was added.

## Changes

- `src/config.ts`: centralized target night-session rules, task names, permission text, and explicitly separate legacy rules.
- `src/geo.ts`: existing Haversine helper.
- `src/venues.ts`: the three user-specified venues, each with a 100m radius; not registered yet. No invented Friley coordinates.
- `src/places.ts`: existing Places lookup.
- `src/tracking.ts`: existing serialized detection logic, without a React hook or task registration.
- `src/use-bar-detection.ts`: existing React adapter.
- `src/tasks.ts`: existing task registered at module scope; imported by the root layout.
- `src/session.ts`: existing legacy score/session store, pending the Phase 2 pure model.
- `src/notifications.ts`: existing notification helpers.
- `src/permissions.ts`: wrappers around existing permission requests; staged permission UX remains for Phase 3.
- `src/storage.ts`: shared device storage and stable keys. Existing stored values remain readable.
- `services/bar-detection.ts`, `services/risk-store.ts`, `services/notifications.ts`: compatibility exports preserving callers.
- `components/AppPages.tsx`, `app/(tabs)/socials.tsx`: use shared storage keys.
- `app/_layout.tsx`: startup task import; all route default exports preserved.
- `app.json`: requested permission text, location-only background mode, Uber/Lyft query schemes.
- `ios/Polarys/Info.plist`: same configuration applied to existing local native project (gitignored).
- `tests/bar-detection.test.cjs`: test harness now exercises extracted files and task registration.

## iPhone test

1. Keep the iPhone and Mac on the same reachable network. Run `npx expo start --dev-client --lan` from the project root.
2. Open `ios/Polarys.xcworkspace` in Xcode, select your iPhone and Polarys scheme, and Run the Debug build. Rebuild is required for Info.plist changes; a Metro reload is insufficient. Alternatively build/install the EAS `development` profile normally.
3. Open Polarys and verify Home, Ride, Socials, Resources, Settings, points details, and DUI pages remain reachable.
4. Check Settings > Privacy & Security > Location Services > Polarys. Confirm Precise Location is available and the app remains usable with permission denied. Existing grants won't show a fresh permission dialog just because wording changed.
5. With location allowed, confirm the existing venue-search UI still loads. The known venue constants are not registered geofences in this phase.
6. In a development build, open Settings > Developer tools and test the system notification. Tap it and verify the existing ride flow opens.
7. Unplug USB while keeping the same network: the loaded app should remain usable. This does NOT verify operation away from Metro, cold-start background relaunch, or detection at AJ's.

## Phase boundary

Stop here for phone testing. Current runtime behavior is intentionally still the old behavior: 30m/3-minute confirmation and exit reminders, continuous location requests, and in-memory state. It does not yet implement the requested 45/20-minute, 9PM–5AM, car-Shortcut combination. Do not evaluate those future rules using this build.

The next implementation is Phase 2: pure night-session transitions and tests. Phase 3 replaces the legacy task with persisted geofencing/precise tracking and safety stops. Phase 4 replaces car detection and notifications with Shortcut routes and the six-option alert.

A development client normally needs Metro to load JavaScript. Disconnecting the cable is different from leaving the network. A bundled preview/release build is needed for reliable testing away from the Mac; current native compile validation is unsigned and does not install an app or validate provisioning.
