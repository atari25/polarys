# Polarys broadcasts

Status: code prepared; not deployed or verified on a phone. Existing TestFlight builds cannot register for remote push. A new signed build is required after configuration.

## Supabase setup

1. Create a Supabase project. Enable anonymous sign-ins under Authentication. The app uses a per-install anonymous session; users do not enter a password. Keep signup rate limits enabled and review anonymous-auth abuse protection before expanding beyond the beta.
2. Run `supabase/migrations/202610080001_push.sql` in the SQL Editor. Row-level security limits each installation to its own registration. Broadcast and receipt tables are server-only.
3. Add these public values to the ignored `.env.local` and Xcode Cloud build environment:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Generate a random admin secret of at least 32 characters. Store `PUSH_ADMIN_SECRET` only in Supabase Edge Function secrets and the owner's password manager. Never put it in EXPO_PUBLIC variables, app code, GitHub, or a browser bundle.
5. Create an Expo access token and store it as `EXPO_ACCESS_TOKEN` in Edge Function secrets. Enable enhanced push security in Expo for this project's push tokens.
6. Deploy `push-broadcast` with the Supabase CLI from this repository. The config disables gateway JWT validation for this endpoint because the function checks `x-push-admin` itself before accessing the database. The Supabase service-role key stays server-side.

## Apple / Expo setup

Use `eas credentials -p ios` for Expo project `2bd9eacd-959d-4742-9d8e-118c8c1e1a70` to configure the Apple Push Notifications key. Confirm Apple's App ID `com.polarys.app` has Push Notifications enabled. Archive using a refreshed provisioning profile. The native entitlement is development; App Store distribution signing sets production APNs.

Increment the build number before uploading. In the new app, open Settings and enable Messages from Polarys. The app registers its Expo token, refreshes it on foreground/token changes, and removes the registration on opt-out or revoked permission when online. If offline, opt-out removal retries next foreground. Local departure reminders are independent.

## Sending (owner only)

POST JSON to `https://PROJECT.supabase.co/functions/v1/push-broadcast` with `Content-Type: application/json` and `x-push-admin: YOUR_PRIVATE_SECRET`.

Preview first:

```json
{"id":"NEW-UUID-HERE","title":"Heading home?","body":"Check Uber, Lyft, transit, or a friend before you leave.","dryRun":true}
```

For a test, also supply `testToken` from your own row in `push_devices`. This token must already be registered. To send, replace `dryRun` with `"confirm":"SEND"`. Each send must have a unique UUID; reusing an ID is rejected to avoid duplicate broadcasts. A dry run does not reserve the ID. Do not retry an uncertain send with a new ID without investigating.

After 15 minutes, POST `{"action":"receipts"}` with the same admin header. This checks provider handoff and removes DeviceNotRegistered tokens. It does not prove a notification appeared or was read. Run receipt checks after every broadcast and within 24 hours, while Expo retains receipts. No scheduler is configured yet.

The initial sender supports at most 100 recently active registrations (30 days) per broadcast. It rejects larger audiences instead of silently skipping people. Push messages expire after one hour, and taps open the existing alert/ride flow. No location, home address, or drink answers are uploaded. Supabase and Expo still process device identifiers and normal connection metadata. Review the public privacy notice/App Store privacy answers before release; receipts currently retain tokens and should be periodically pruned along with stale anonymous accounts.

## Release checks

- Test permission denied, explicit opt-in, online/offline opt-out, token refresh, and app relaunch.
- Test on a physical iPhone with a signed build, while locked and foregrounded.
- Verify a single-device test before sending to all testers.
- Confirm receipt handling and existing local departure notifications.
- This setup does not automate game results or send any broadcast by itself.
