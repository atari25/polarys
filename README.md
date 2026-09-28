# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Safe ride notifications

Polarys uses `expo-notifications` for local iOS and Android reminders when the
location monitor detects a bar exit. No push server or push token is required.
Allow notifications at startup. Tapping a reminder opens the safe-ride flow,
including when the app is launched from the notification. Web delivery is not
supported. Background reminders depend on the location task receiving updates.

After installing dependencies, rebuild the native app with `npm run ios` or
`npm run android`; restarting Metro alone does not add the native module. For
fresh native projects, the `expo-notifications` config plugin is in `app.json`.

In a development build, use **DEV: Test System Notification** on the home screen.
Check delivery while foregrounded and backgrounded, then tap the notification
and verify the safe-ride flow opens once. Also test launching from a delivered
notification after closing the app and denying notification permission. Actual
bar-exit testing requires location permissions and a configured Google Places key.

## Car audio connection (iOS)

Rebuild the iPhone app after pulling the local `modules/polarys-bluetooth` module
(`pod install` in `ios`, then build the workspace, or `npm run ios`). Connect your
car and select it as the active audio output, then tap **Use this as my car** on
the home screen. The saved route is stored locally. **Forget saved car** removes
it. Other Bluetooth audio devices do not count unless explicitly saved as the car.

This reads the active audio route, not all paired Bluetooth devices. It does not
scan BLE peripherals or activate an audio session. Refresh happens every five
seconds while JavaScript is running and when returning to the foreground. iOS
suspension can stop refresh; continuous background car detection is not provided.
Android and web car detection are not implemented. Expo Go cannot load this module.

On a phone, verify saving the car, disconnecting/reconnecting, switching to
headphones, forgetting the car, and reopening the app. In development, select
**DEV: Use live car detection** to clear a simulated Bluetooth override.
