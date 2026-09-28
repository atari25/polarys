# Current location, home search, and ride destinations

Home and Ride display the latest current-location address, with tap-to-refresh and a last-known label if refresh fails. Location access is required; a pin is still usable if reverse address lookup fails.

Settings → Home address now opens a typed search. Google Places supplies debounced suggestions (using the existing Places API key), and selecting a suggestion resolves its coordinates. The explicit Save home address button commits the selection. If Google suggestions fail or return nothing, search now automatically uses the device geocoder. Find & review home address is also available for typed text; a single match is selected for review, then Save commits it. A reverse-geocode failure no longer discards a valid address pin. Old coordinate-only homes stay usable for rides until edited. Google suggestions require the project's Places API configuration; no live billing/API-account changes were made.

Uber and Lyft now receive home as the destination and a fresh pickup location when available. The app falls back to provider web links with destination parameters intact. Transit uses the same saved home. Booking and fare confirmation remain in the provider app. Applies to Ride, the check-in screen, and legacy departure dialogs.

Text a friend opens an editable SMS draft:
“Hey, could you pick me up? I’m at [current address]. Trying to get home — here’s my pin: [map link]”
The pin is the user's freshly requested location, not their home or an old venue. If a fresh location cannot be obtained, the app asks the user to retry instead of inserting a stale location. Nothing is sent automatically.

Car Bluetooth is now the first Settings card. “Mark this as my car’s Bluetooth” is always visible, including when disconnected; pressing it explains how to pair/select car audio or whether the native module is missing.

## Files

app/home-address.tsx, app/alert.tsx, app/_layout.tsx, components/AppPages.tsx, components/modals/GeofenceExitFlow.tsx, src/home-address.ts, src/user-location.ts, src/use-current-location.ts, src/ride-links.ts, src/ride-actions.ts, tests/home-address.test.cjs, tests/ride-links.test.cjs.

## Device check

1. Reload this code in the development build. If using an installed bundled build without Metro, install a fresh bundle/build; unplugging does not update the old app.
2. Open Settings: Car Bluetooth should be first and its save button visible. Connect to the car, select it as the iPhone audio output, then press the button. Existing native module support is still required.
3. Open Home address, enter a street address including city/state, select a suggestion, then Save home address. Reopen to verify it persisted. Editing text must clear the selected result until another one is chosen.
4. Check Home/Ride current location and tap to refresh.
5. From Ride, tap Uber/Lyft and verify pickup versus home destination before booking. Repeat from the check-in screen. Without the provider installed, verify its website opens with the destination. Provider app/web version behavior must still be checked on the phone.
6. Tap Text a friend, verify the current-address draft and map pin, then cancel the draft; no message needs to be sent.
7. Deny location and repeat: no stale pickup should be sent to a friend. Home remains available as a ride destination, with pickup selected inside the provider app.

Validation: TypeScript, lint, mocked address resolution/storage tests, URL encoding/destination tests, friend-message tests, and iOS JavaScript export. Actual provider apps, Google account access, and physical-device location require the checks above.

References:
- Uber deep links: https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
- Lyft official SDK parameters: https://github.com/lyft/Lyft-iOS-sdk/blob/master/Sources/LyftUI/LyftDeepLink.swift
- Google autocomplete: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete

## Address search fix

A live request for the public address 121 Welch Ave, Ames returned HTTP 403, “The caller does not have permission,” with the existing Google API configuration. No API key value was exposed or account settings changed. Native iPhone address lookup now provides a fallback automatically, and Google authorization failures stop repeated Google requests for the current app session. Enter a full street address, city and state if partial input has no match.

The Save action is no longer unreachable without autocomplete: typed text enables Find & review home address. Review the resolved address, then tap Save home address. Existing saved home is preserved if a lookup fails or the user backs out.

Regression tests cover the actual 403 path, saving device candidates despite reverse-lookup failure, Google Place Details fallback, and feeding the saved result through openRide into Uber/Lyft pickup and destination URLs. Physical-device geocoder/provider behavior remains to be verified.
