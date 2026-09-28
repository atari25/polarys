# Current update: Apple Pay removed

All sessions now use 45 minutes. The saved-car Bluetooth module and car Shortcut both feed the same check-in rule. Bluetooth checks the active audio output while the app is running; the Shortcut can open the app on connection. Settings contains Car Bluetooth (save/forget car) and the car Shortcut guide. Old purchase links return home without recording anything. Saved purchase metadata is removed on session initialization; old purchase-based reminders are rescheduled and eligibility below 45 minutes is cleared.

Validation: TypeScript, lint, and all 29 tests, including shared Bluetooth/Shortcut duplicate protection. For device testing, connect your car, select it as the audio output, open Settings → Car Bluetooth → Use this as my car. Reconnect while Polarys is open and verify the connection status. An eligible 45-minute nighttime session should trigger one check-in; running the Shortcut as well must not send another system notification. Actual hardware behavior still needs this phone test. Test by opening Settings, confirming only the car guide remains, and running polarys://car after a 45-minute night session.

The checkpoint below is historical; its Apple Pay setup and 20-minute testing instructions no longer apply.

# Night sessions and Shortcut triggers checkpoint

Implemented pure persisted night rules, local reminders, car/purchase routes, six-option check-in, Settings Shortcut guides, and current-location home saving for transit directions. Existing venue confirmation feeds the new night controller. The active Bluetooth detection hook and Bluetooth points UI were removed; existing native module sources remain unused.

Rules: local 9 PM–5 AM; 45 minutes total venue time or 20 with a purchase during an active visit; hops up to 15 minutes preserve venue time but exclude travel; eligibility lasts at most 90 minutes after exit and ends at 5 AM. A car trigger can evaluate elapsed time while the car is still inside the venue fence. Handled check-ins suppress another alert for that session. Reminder scheduling pauses on exit and resumes using accumulated time.

Changed files for this checkpoint:
- src/night-session.ts: pure transitions and time calculations.
- src/night-store.ts: validated device persistence and serialized updates.
- src/night-controller.ts: session events and Shortcut receipts.
- src/night-notifications.ts: threshold reminders and immediate car notifications.
- src/use-night-session.ts: UI subscription.
- src/notification-routing.ts: cold and live notification taps.
- src/tracking.ts: existing detector dispatches enter/leave/tick.
- app/car.tsx, app/purchase.tsx, components/ShortcutReceipt.tsx: cold-start-capable routes using stored sessions.
- app/alert.tsx: six ride/check-in actions.
- app/shortcuts.tsx: manual setup instructions, trigger test, recent receipt.
- app/_layout.tsx: notification routing and route headers.
- components/AppPages.tsx: night details, Settings guides, home save; removed active Bluetooth setup.
- tests/night-session.test.cjs, tests/night-controller.test.cjs: rules/persistence/notification tests.
- tests/bar-detection.test.cjs: assert session exit dispatch instead of old departure notification.
- package.json: test:night script.

Validation: TypeScript and lint clean; all 26 tests pass; Expo iOS JavaScript export succeeds. Actual iPhone automation execution, native notification delivery, and visual checks still require device testing.

## iPhone test steps

1. Load this code in the development build (start Metro with npm start and reload the app). A standalone installed build needs a fresh bundled build to include these changes; unplugging does not update its JavaScript.
2. Open Settings → Add a shortcut Apple Pay. Tap Test it. With no active night venue, expect “Shortcut received” and no purchase logged. Return to Settings and reopen the guide within a minute: receipt should show received.
3. In Apple Shortcuts create a shortcut with Open URLs → polarys://purchase?merchant=Test&amount=12.50. Run it with Polarys closed to verify cold launch. In the guide, the matching receipt should appear. Use this action in a Transaction/Wallet automation manually.
4. Open Settings → Add a car Shortcut. Create an Open URLs action using polarys://car and run it with Polarys closed. Without an eligible session expect no check-in, never a claim that you are safe to drive.
5. Between 9 PM and 5 AM, use an Xcode simulated location at a real bar recognized by the existing Places detector, hold a reliable fix for its 3-minute confirmation, then open Home → Night session details. Expect venue time to increase. This phase does not add debug time overrides or the hardcoded fraternity geofences.
6. Run the purchase shortcut during that active session. Expect the threshold to switch to 20 minutes. After 20 total venue minutes, run the car shortcut. Expect the six-option check-in and, with notification permission, “Hey, are you good to drive?” Repeat before handling: no second system notification.
7. Choose “I'm good to drive.” Run car again: no repeated check-in for the handled session. Use a fresh visit/session to test the 45-minute path without a purchase.
8. Allow notifications and keep the phone locked during an active visit: expect the threshold nudge. Tap it to open the six-option screen. Verify Uber/Lyft fallback, SMS compose (choose a recipient), hospital search. Save current location as home in Settings to test transit directions.
9. In night details choose “I'm home” to clear the session and cancel its pending nudge. Use this after leaving the detected venue; the legacy detector can confirm another visit if it still sees you at a bar.

Next phase still required: BAR_FENCE/VENUE_CHECK, precise 40 m match/home check, 200 m finalization, stopping native tracking at 5 AM/6 hours, debug simulations, permission explainer, and “Going out tonight.” This checkpoint caps *session time*, not the legacy native location service. Existing detector still uses its 30 m/3-minute confirmation and 100 m exit. Session restoration cannot reconstruct location changes that iOS did not deliver. The Shortcuts automation must actually run/open Polarys; iOS may require confirmation or an unlocked phone.
