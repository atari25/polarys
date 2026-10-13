# Restore Polarys on another Mac

This repository preserves app source, assets, tests, the local Bluetooth module, dependency lockfiles, and the working native iOS project.

## Before returning the loaner

- Verify the latest commit at https://github.com/atari25/polarys.
- GitHub contains a placeholder-only `.env`; the real key is not backed up there. Recover or replace it through your Google Cloud account, or keep it in your password manager. Do not commit real keys.
- Keep access and recovery methods for GitHub, Expo/EAS, Apple developer, and Google Cloud accounts. Credentials and Apple signing private keys are not in GitHub. Xcode may need a new development signing certificate on another Mac.
- Save important Codex conversations separately: GitHub backs up the project, not chat history.
- After verifying backups, sign out and remove personal credentials according to the lending desk's return procedure.

## On the next Mac

Install Xcode and its command-line tools, Node.js compatible with Expo SDK 54, and CocoaPods.

```sh
git clone https://github.com/atari25/polarys.git
cd polarys
# .env already contains a placeholder.
# Restore your Maps key into .env before building.
npm ci
cd ios
pod install
cd ..
open ios/Polarys.xcworkspace
```

Sign into your Apple account in Xcode and select your development team in Signing & Capabilities. Preserve bundle identifier `com.polarys.app` and compatible signing when updating an existing installation. Avoid clean prebuild unless you intend to regenerate and review the native configuration.

```sh
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
```

See [standalone-iphone.md](standalone-iphone.md) for Release builds with embedded JavaScript. Development-signed phone installations may need rebuilding when provisioning expires; they are not permanent distribution.

## Current behavior and outstanding configuration

- Built-in venues: Cy's Roost, Blue Owl, AJ's Ultra Lounge, Paddy's Irish Pub, and Kappa Sigma.
- Monitoring window: 9 p.m.–5 a.m.; 100-meter geofences, 40-meter precise visit checks.
- Departure check-in after 45+ venue minutes; car Bluetooth is supplemental.
- Background reminders require Always location, Precise Location, and notifications enabled.
- Previous testing encountered Google Places permission/quota errors. Built-in venues work without Places; discovery still depends on API access and quota.
- Home address, car selection, permissions, and sessions are stored on the phone, not GitHub.

## October 13 release backup

- `main` contains the tested iOS bundle-ID headers for the restricted Google Places key and build number 4. The build 4 archive succeeded locally; confirm its upload status in App Store Connect.
- Unfinished push-notification work is saved on `codex/push-notifications-wip`. It is not part of the build 4 release. Switch to that branch only when resuming push setup. Supabase functions, Expo/APNs credentials, and device delivery still need completion and verification.
- Website source: https://github.com/atari25/polarys-website- (branch `main`). Clone it separately.
- Install Node in a persistent location. Set `NODE_BINARY` in ignored `ios/.xcode.env.local` to the absolute path printed by `command -v node`; do not reuse the previous Mac's temporary or Codex runtime path.
- Build archives, installed dependencies, private credentials, and local phone data are not included in the source backup.
