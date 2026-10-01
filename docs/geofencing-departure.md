# Geofencing and departure reminders

Current behavior supersedes the older timed-nudge and Apple Pay checkpoint.

Home now shows a compact activity-risk badge. Tap the timer for the points breakdown: 0.5 points per completed venue minute, plus 40 once for a car connection after 45 minutes. Low means under 45 minutes, Medium means 45+ without a qualifying car connection, and High means 45+ with one. Labels follow those conditions rather than the raw total; they do not assess sobriety. Travel adds no points. The car Shortcut guide uses four steps and expandable help.

Validation: TypeScript and lint clean; all 41 tests pass; unsigned native iOS Debug build succeeded; iOS JavaScript export succeeds. Physical-device notification timing and visual review still require the phone checks below.

- iOS registers the nearest 20 venues at most, using 100 m boundaries. Cy’s Roost, Blue Owl and Kappa Sigma are built in. Existing Places lookup also contributes bars/nightclubs within 5 km; cached and built-in venues remain usable when lookup fails.
- BAR_FENCE starts precise VENUE_CHECK updates at night. Crossing the outer boundary does not start counting venue time: a fresh, accurate location within 40 m confirms entry. The accuracy buffer rejects uncertain entries/exits.
- After 45+ accumulated venue minutes, a confirmed departure sends “How are you getting home?” without requiring a car connection. Tapping it opens the six ride choices. Reaching 45 minutes while still inside does not send a timed reminder.
- One departure notification per night session. Duplicate precise/fence callbacks and cold restarts do not duplicate it. Bar hops within 15 minutes preserve time while excluding travel.
- Bluetooth/CarPlay Shortcut stays supplemental: after 45 minutes it adds 40 connection points once, and can issue the separate car check-in if unhandled. Points are not an intoxication measurement.
- Home within 40 m clears the session and stops precise tracking; manual “I’m home” does the same. The rest of that night is suppressed so a venue next to home does not immediately restart it.
- Precise tracking is stopped on the next task/foreground callback after 5 AM or six hours. While foregrounded, a 30-second safety check also runs. iOS cannot guarantee a JavaScript callback exactly at a deadline while asleep; this is not an exact native wall-clock shutdown. Session calculations are capped regardless.
- Beyond 200 m from all monitored venues after the 15-minute grace, the night finalizes and precise tracking stops. Car eligibility expires 90 minutes after departure or at 5 AM.
- The old continuous background location task is stopped when the new tracker initializes.
- Apple Pay remains removed; prior scheduled threshold reminders are cancelled when the session controller runs.

## Files in this update

app/shortcuts.tsx, tests/night-session.test.cjs, src/geofencing.ts, src/tasks.ts, src/use-bar-detection.ts, src/places.ts, src/config.ts, src/night-session.ts, src/night-controller.ts, src/night-notifications.ts, components/AppPages.tsx, tests/night-controller.test.cjs, tests/bar-detection.test.cjs.

## iPhone / simulated-location check

1. Install/reload the updated development build. In Polarys Settings → Departure reminders → Set up background location, allow location. In iPhone Settings → Polarys → Location, select Always and turn Precise Location on. Allow notifications as well.
2. Test during 9 PM–5 AM local time. In Xcode’s location simulation, hold Cy’s Roost at latitude 42.0219482, longitude -93.6503831. Home should show the venue and its timer after a precise fix.
3. Stay at that location for 45 minutes. There should be no threshold-time notification. Then move the simulated point to 42.02250, -93.6503831 (about 61 m north) with a good fix. Expect one “How are you getting home?” notification with Bluetooth disconnected.
4. Move farther to 42.02555, -93.6503831 (about 400 m north). Duplicate updates/fence exits must not send another departure reminder. After 15 minutes away, precise tracking can stop when the next location callback arrives.
5. Tap the notification: verify all six options. A saved-car Bluetooth connection or polarys://car after eligibility adds +40 in Home → Night session details. Repeating the signal must not add points again. Below 45 minutes it adds zero.
6. Save a home location from Settings while at the intended location. Moving within its accurate 40 m region should clear the night without a departure notification. Manual “I’m home” is also available in night details.
7. Perform a real-device locked-phone walk test separately. Simulator tests prove logic, not iOS delivery latency. OS events can be delayed; force-quitting the app or disabling location/notifications can prevent reminders. Keep ride options available independently.

Automated tests cover task registration, persisted entry/exit, cold restart, 20-region cap, poor/stale GPS, overlapping fences, hopping, 45-minute departure, duplicate events, home suppression, night rollover, safety stops, and the supplemental Bluetooth bonus. No Friley test coordinates or time-window override were fabricated.

Reference: Expo SDK 54 Location documentation, https://docs.expo.dev/versions/v54.0.0/sdk/location/

## Discovered venue categories

Nearby discovery now requests pub and bar subcategories as well as bar/night_club. Eligibility checks both primaryType and the full types array, so a restaurant with a secondary bar/pub type uses the same timer, points, departure and car rules. Response aliases nightclub and club are accepted as categories; a business name containing “club” alone does not qualify. Distinct nearby businesses are not discarded simply for being within 40 m of a built-in venue.

Live validation encountered HTTP 429: Google SearchNearbyRequest daily quota exceeded. Built-in and cached venues remain available, but new discovery cannot be guaranteed until that external quota recovers or is adjusted. No claim was made that 2311 Chamberlain Street was actually returned by the API. All 72 automated tests pass, including discovered-pub geofence registration and departure/points behavior.

## User-saved places

Settings → “I do stupid stuff here” lets users search for and confirm an address, optionally name it, and remove it later. No example address is preloaded. Up to 10 saved places are stored locally under `polarys.savedPlaces.v1`, with no automatic expiry; removal also removes the cached monitoring region. Search uses the existing Google/device address lookup.

Saved places reserve slots within the existing 20-region limit and use the same 100 m wakeup boundary, accurate 40 m venue entry, 9 PM–5 AM window, 45-minute accumulated venue threshold, and one departure notification per night session as bars. The saved home still takes precedence and ends the night. Removing a place during a visit cancels that visit without producing a departure reminder.

Tapping a night notification opens “How are you getting home?” Choosing “I was planning to drive” opens the drink question; all answers lead to ride options and none is persisted. Users can also open ride options directly.

Validation: tests cover persistence across restart, offline registration, the 45-minute departure, duplicate callbacks, short visits, daytime exclusion, removal, saved-place priority within 20 regions, invalid coordinates, deduplication, and the 10-place limit. Physical iPhone boundary delivery still needs a real walk test with Always + Precise location and notifications enabled.
