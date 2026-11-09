# ACA Connect — Test Report

Date: 2026-11-09
Project: `yujyxdrznbkkbxvhwzey` (ACA connect, production)
Android package: `org.acapozhichalur.connect`
APK version: 1.2.1 (versionCode 4)

## Automated tests
- `npm run typecheck` — PASS (`tsc -b`)
- `npm run lint` — PASS (oxlint)
- `npm run build` — PASS (Vite production build, `dist/`)
- `node scripts/rls-bypass-test.mjs` — NOT RUN (requires live Supabase service-role key; no Supabase CLI available on this machine)
- `node scripts/test-attendance-reminders.mjs` — NOT RUN (requires live Supabase service-role key and anon key)

## Platform builds
- Web build: PASS (`release/web/`)
- Android release APK: PASS (`release/android/ACA-Connect-1.2.1-release.apk`, signed, versionCode 4, versionName 1.2.1)
  - `apksigner verify --print-certs` — DOES VERIFY
  - Certificate DN: `C=US, O=Android, CN=Android Debug` (matches previous APK)
  - Certificate SHA-256: `f45e5c4e1fd71f925ad51bc77e709dd05e06e628bdaab183c072f23e9954bd96` (matches previous APK)
  - `aapt dump badging` — package `org.acapozhichalur.connect`, minSdk 24, targetSdk 36
  - Permissions: INTERNET, POST_NOTIFICATIONS, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, C2DM_RECEIVE
- Windows installer: PASS (`release/windows/ACA-Connect-1.2.0-Setup.exe`)
- `npx cap sync android` — PASS (6 Capacitor plugins synced including push-notifications)

## Edge Functions
- `send-push-notification` — code present and correct; deployment status NOT VERIFIED (no Supabase CLI available; cannot run `supabase functions deploy`)
- `send-invitation` — deployed (per previous report)
- Firebase service-account authentication — NOT VERIFIED on this machine (requires Supabase dashboard/CLI access to confirm secrets `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `APP_URL` are set)

## Pending / requires physical device
- Android push notification delivery on a real device (FCM) — pending physical device test. No `adb` available on this machine; no device connected.
- Migration `20261113000000_push_chat_notifications.sql` — NOT APPLIED. Adds `chat_message` to `public.notification_type` enum, required for chat push notifications. Must be applied once via Supabase SQL API (not idempotent — do not run twice).
- Web push delivery — pending (requires VAPID keys and service worker push handler; not implemented).
- Shared login/data consistency across real devices — pending manual verification.

## Code change summary
- `src/services/push.ts`: `registerDeviceToken()` now always calls `PushNotifications.register()` on every launch to pick up FCM token rotations. Previously it skipped registration when a stored token existed, so tokens rotated by Firebase while the app was closed were never re-registered — the #1 cause of notifications silently stopping.

## Notes
- `FIREBASE_PROJECT_ID` was corrected to `aca-connect-b254d` (matches `android/app/google-services.json`) per previous fix.
- No new database migration was required for the attendance reminder fix itself; the chat migration (`20261113000000`) is pending.
- Physical device testing could not be performed (no ADB, no device connected).
