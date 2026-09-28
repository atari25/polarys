# Standalone iPhone build

Use Xcode Release configuration to bundle JavaScript inside Polarys. AppDelegate loads main.jsbundle from the app in Release; Debug normally loads Metro.

Build from the project root:

```sh
xcodebuild -workspace ios/Polarys.xcworkspace -scheme Polarys -configuration Release -destination 'generic/platform=iOS' -derivedDataPath /tmp/polarys-standalone -allowProvisioningUpdates build
```

Install the signed app over the existing bundle ID, com.polarys.app, to preserve app data:

```sh
xcrun devicectl device install app --device atari /tmp/polarys-standalone/Build/Products/Release-iphoneos/Polarys.app
xcrun devicectl device process launch --device atari --terminate-existing com.polarys.app
```

Before the walk test, unplug the phone, turn off Wi-Fi while leaving cellular enabled, and reopen Polarys. Verify Home loads and the location updates. Always + Precise Location and notification permission are still required for background reminders. The five built-in venues do not depend on Google lookup. Address lookup, provider apps and other online services may use cellular data.

Release builds hide development-only controls such as Resume night. Saved home and car settings remain intact. The manual end-night button has been removed. This update clears a previously saved pause once on initialization; automatic home detection still applies. Future source edits need another bundle/install to update this standalone app.

Build verification: signed Release build succeeded; bundled main.jsbundle contains the one-time pause migration and no manual end-night button.
