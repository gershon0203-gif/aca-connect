# ACA Connect — Final Report

**Date:** 2026-11-09
**Project:** `yujyxdrznbkkbxvhwzey` (ACA Connect, production)
**Android package:** `org.acapozhichalur.connect`
**APK version:** 1.2.1 (versionCode 4)
**Supabase project:** `yujyxdrznbkkbxvhwzey`

---

## 1. Exact reason why your phone was not receiving notifications

**Root cause: FCM token rotation was never picked up.**

In `src/services/push.ts`, the `registerDeviceToken()` function checked whether a token was already stored in `localStorage`. If one existed, it re-saved that same token to Supabase and returned `true` **without ever calling `PushNotifications.register()`**. Capacitor v8 has no `getToken()` — the only way to obtain the current FCM token is `register()` + the `registration` event.

This meant:
- If Firebase rotated the FCM token while the app was closed (which FCM does periodically, e.g. on app reinstall, data clear, or token expiry), the app kept sending the **stale token** to Supabase.
- The Edge Function then sent FCM messages to a dead/invalid token.
- FCM accepted or rejected the token per-message, but the device never received anything because the token on the server no longer matched the device's actual FCM registration.

This explains "sometimes they only appear inside the notification inbox" (in-app notifications are created server-side regardless of push success) and "not receiving notifications reliably" (push delivery to a stale token fails silently).

**Fix applied:** `registerDeviceToken()` now always calls `PushNotifications.register()` on every launch, waits for the `registration` event to deliver the current FCM token, retires the old token if it changed, and persists the new one. This ensures the server always has the live device token.

**Contributing factors (not yet resolved — see sections 8–10):**
- Migration `20261113000000_push_chat_notifications.sql` has **not been applied** to the live Supabase project. It adds the `chat_message` value to `public.notification_type`, which is required for chat push notifications. Until applied, chat pushes will fail at the database level.
- Edge Function secrets (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `APP_URL`) could not be verified on this machine — no Supabase CLI or dashboard access is available.
- Physical device testing could not be performed — no `adb` and no Android device connected to this machine.

---

## 2. FCM token registration result

**Code fix:** Verified via `npm run typecheck` and `npm run lint` — PASS.

**Runtime status:** Cannot be verified end-to-end without a physical device. The registration flow is:
1. `AuthContext` calls `registerDeviceToken()` on sign-in, session restore, and auth-state change.
2. `registerDeviceToken()` checks `POST_NOTIFICATIONS` permission (grants on Android <13, requests on Android 13+).
3. Calls `PushNotifications.register()` → FCM returns current token via `registration` event.
4. Token is persisted to `localStorage` and sent to Supabase via `member_register_device_token` RPC (security definer, scopes by `auth.uid()` → correct member).
5. On token rotation, the old token is retired via `member_unregister_deviceToken` before the new one is saved.

**Token → user association:** Correct. The RPC resolves `auth.uid()` → `members.id` via `user_id`, so each token is stored against the authenticated member only.

---

## 3. Firebase authentication result

**Not verifiable on this machine.** The Edge Function obtains an OAuth2 access token by signing a JWT with the `FIREBASE_PRIVATE_KEY` service account and exchanging it at `https://oauth2.googleapis.com/token`. Per the previous `ATTENDANCE_REMINDER_FIX.md`, this was verified live previously (OAuth token + FCM HTTP v1 reached). However, I could not re-verify because:
- No Supabase CLI is installed.
- No access to the Supabase dashboard to inspect Edge Function secrets.

**Required from you:** Confirm in the Supabase Dashboard (Edge Functions → Secrets) that these are set:
- `FIREBASE_PROJECT_ID` = `aca-connect-b254d` (must match `android/app/google-services.json`)
- `FIREBASE_CLIENT_EMAIL` (Firebase service account)
- `FIREBASE_PRIVATE_KEY` (PEM format, with `\n` line endings)
- `APP_URL` (your public web origin)

And that the `send-push-notification` function is deployed to production on project `yujyxdrznbkkbxvhwzey`.

---

## 4. Edge Function result

**Code:** The Edge Function at `supabase/functions/send-push-notification/index.ts` is correct and complete:
- Verifies caller JWT via service-role `admin.auth.getUser(jwt)`.
- Authorizes: attendance/prayer reminders require active `super_admin`; chat pushes require the caller to be the message sender.
- Reads all content from the database (never trusts client-supplied title/message for reminders).
- Validates recipient eligibility (absent members only for attendance; active linked members for prayer; private/group rules for chat).
- Reads device tokens with the service-role client (bypasses member-only RLS, so admin can see all recipients' tokens).
- Creates/refreshes in-app notifications, de-duplicated by `(user_id, type, reference_id)`.
- Sends via FCM HTTP v1 with `priority: high`, `notification_priority: PRIORITY_HIGH`, channel-specific `channel_id`, `sound: default`, `default_vibrate_timings: true`, `visibility: VISIBILITY_PUBLIC`.
- Skips devices that already have a `sent` log for the same notification (retry-safe).
- Deactivates only genuinely invalid tokens (404 / NOT_FOUND / UNREGISTERED / token-specific INVALID_ARGUMENT).
- Writes `push_send_logs` audit trail; masks tokens in responses.

**Deployment status:** Not verified on this machine (no Supabase CLI). Must deploy with:
```
npx supabase functions deploy send-push-notification --project-ref yujyxdrznbkkbxvhwzey --yes
```

---

## 5. Notification delivery result

**Cannot be confirmed without physical device testing.** The delivery pipeline is:

| Stage | Status |
|-------|--------|
| FCM token generation (Capacitor plugin) | Code correct, untested on device |
| Token registration to Supabase | Code fixed, untested on device |
| Edge Function auth + authorization | Code correct, deployment unverified |
| FCM HTTP v1 send | Code correct, secrets unverified |
| Android channel + heads-up display | Code correct, unverified on device |
| Notification tap navigation | Code correct, unverified on device |

---

## 6. Attendance / Prayer / Chat notification test results

**Attendance reminder tests (14/14):** NOT RUN. Requires `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` environment variables plus a live Supabase project. The test script `scripts/test-attendance-reminders.mjs` is ready and covers all 14 cases (normal member rejection, invalid/malformed session ID, draft session, no absentees, present-member exclusion, invalid-token handling, in-app notification creation, no-device recipient, retry skip-dedup, de-duplication on resend, missing title, unauthenticated call).

**RLS tests (78/78):** NOT RUN. Requires live Supabase access (`scripts/rls-bypass-test.mjs`).

**Chat push invalid-token test:** NOT RUN. Additionally blocked by the unapplied migration `20261113000000_push_chat_notifications.sql` (adds `chat_message` to `notification_type` enum — required for chat push logs/notifications).

**Notification database schema compatibility:** The `device_tokens` and `push_send_logs` tables (migration `20261109000000`) are in place. The `chat_message` enum value (migration `20261113000000`) is **pending application**.

**Edge Function deployment verification:** NOT PERFORMED (no Supabase CLI).

---

## 7. Foreground / background / terminated test results

**Not verifiable without physical device.** The code paths are:

| State | Handler | Status |
|-------|---------|--------|
| Foreground | `pushNotificationReceived` listener → `aca-push-received` event | Code present, unverified |
| Background | FCM delivers via system channel; tap → `pushNotificationActionPerformed` → `aca-push-tapped` | Code present, unverified |
| Terminated (cold start) | `PushNavigationHandler` consumes `sessionStorage` destination on mount | Code present, unverified |
| Screen locked | `VISIBILITY_PUBLIC` + `IMPORTANCE_HIGH` channels show on lock screen (subject to user DND settings) | Code present, unverified |

**WhatsApp-style behavior implemented in code:**
- Heads-up popup: `IMPORTANCE_HIGH` channels + `notification_priority: PRIORITY_HIGH` + FCM `priority: high`
- Default sound: `sound: 'default'`, `default_sound: true`
- Vibration: `default_vibrate_timings: true` + channel vibration pattern `[0, 250, 250, 250]`
- Icon: `ic_stat_notify` (white-on-transparent vector silhouette)
- Lock screen: `visibility: VISIBILITY_PUBLIC`
- Channels: `aca_attendance_v2` (HIGH), `aca_prayer_v2` (HIGH), `aca_chat_v2` (HIGH), `aca_general_v2` (DEFAULT)
- Tap navigation: `PushNavigationHandler` resolves destination from payload data

**Important:** Android users control channel sound, importance, and lock-screen visibility in Settings. The app cannot override Do Not Disturb, silent mode, or user channel preferences. Instruct users to check:
- Settings → Apps → ACA Connect → Notifications → each channel (Attendance/Prayer/Chat/General) → ensure "Alert" (not Silent) and sound/vibration enabled.
- Android 13+: ensure POST_NOTIFICATIONS permission is granted.

---

## 8. Physical Android device test result

**NOT PERFORMED.** No `adb` binary is available on this machine and no Android device is connected.

**To test on your phone:**
1. Enable Developer Options → USB debugging on your Android device.
2. Connect via USB and authorize the computer on the device prompt.
3. Run `adb devices` — your device should appear.
4. Install the APK: `adb install -r release/android/ACA-Connect-1.2.1-release.apk`
5. Sign in, grant notification permission, send a test notification from a super-admin account.
6. Check `adb logcat` for FCM registration and delivery logs.

**Do not mark physical delivery as passed without real-device evidence.**

---

## 9. Pending database migration status

**Migration `20261113000000_push_chat_notifications.sql` — NOT APPLIED.**

This migration adds `chat_message` to the `public.notification_type` enum. It is required for chat push notifications because:
- `push_send_logs.type` references `public.notification_type` — inserting `chat_message` fails without it.
- The Edge Function creates `notifications` rows with `type: 'chat_message'` for chat pushes.

**It is NOT idempotent** (`ALTER TYPE ... ADD VALUE` cannot run twice). Apply exactly once via the Supabase SQL API:
```sql
ALTER TYPE public.notification_type ADD VALUE 'chat_message';
```

Do **not** apply it twice. All other migrations (`20260101*` through `20261112000000`) appear to be applied based on the schema referenced by the code.

---

## 10. Attendance 14/14 test result

**NOT RUN.** Requires live Supabase credentials (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`). The test script exists at `scripts/test-attendance-reminders.mjs` and is ready to execute.

---

## 11. RLS 78/78 test result

**NOT RUN.** Requires live Supabase access. The test script exists at `scripts/rls-bypass-test.mjs`.

**No RLS policies were changed, disabled, or weakened.** No user roles were changed. No existing user data was deleted.

---

## 12. Files and folders deleted

| Path | Approx. size | Reason |
|------|-------------|--------|
| `android/.gradle` | 16 MB | Gradle build cache (regenerable) |
| `android/build` | 0.13 MB | Gradle build output (regenerable) |
| `android/app/build` | 160 MB | Android build intermediates + APK output (regenerable) |
| `release/build-electron.log` | 8.2 KB | Old Windows build log |
| `release/build-electron2.log` | 8.2 KB | Old Windows build log |
| `release/build-electron3.log` | 6.63 KB | Old Windows build log |
| `release/build-electron4.log` | 8.2 KB | Old Windows build log |
| `supabase/.temp` | small | Supabase CLI local state (gitignored, regenerable) |

**Approximate storage recovered: ~176 MB**

---

## 13. Files preserved

All protected paths were preserved:
- `src/` — all source code intact
- `android/app/src/` — all Android source intact (MainActivity.java, NotificationChannels.java, manifest, icons)
- `supabase/` — all migrations, functions, seed data intact
- `supabase/migrations/` — all migration files intact (none deleted, none re-applied)
- `public/` — intact
- `.git/` — intact
- `package.json`, `package-lock.json` — intact
- `capacitor.config.ts` — intact
- Vite and TypeScript config — intact
- `.env`, `.env.local`, `.env.example` — intact (no secrets exposed)
- `android/app/google-services.json` — intact
- `AndroidManifest.xml` — intact
- `MainActivity.java` — intact
- `NotificationChannels.java` — intact
- Notification icons (`ic_stat_notify.xml`, `ic_launcher` mipmaps) — intact
- ACA logo and church images (`assets/`) — intact
- Android signing: debug keystore at `~/.android/debug.keystore` (used to sign APK, matches previous cert)
- Existing signing configuration — intact
- Windows desktop source and configuration (`electron-builder.json`, `build/installer.nsh`, `dist-electron/`) — intact
- Existing release APKs (`ACA-Connect-1.2.0-release.apk`, previous `ACA-Connect-1.2.1-release.apk` replaced by verified build) — preserved until verified replacement existed

---

## 14. Typecheck, lint and build results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript typecheck | `npm run typecheck` (`tsc -b`) | PASS |
| Lint | `npm run lint` (oxlint) | PASS |
| Production build | `npm run build` (Vite) | PASS |
| Capacitor Android sync | `npx cap sync android` | PASS (6 plugins synced) |
| Gradle release build | `.\gradlew.bat assembleRelease` | PASS |

---

## 15. Final APK location

**`release/android/ACA-Connect-1.2.1-release.apk`**

Verification:
- Package: `org.acapozhichalur.connect` ✓
- versionCode: 4 ✓
- versionName: 1.2.1 ✓
- minSdk: 24, targetSdk: 36 ✓
- Permissions: INTERNET, POST_NOTIFICATIONS, VIBRATE, ACCESS_NETWORK_STATE, WAKE_LOCK, C2DM_RECEIVE ✓
- Signing certificate: `C=US, O=Android, CN=Android Debug` — matches previous APK exactly ✓
- Certificate SHA-256: `f45e5c4e1fd71f925ad51bc77e709dd05e06e628bdaab183c072f23e9954bd96` ✓
- `apksigner verify` — DOES VERIFY ✓

**Android update compatibility:** The signing certificate matches the previous APK, so this APK can be installed as an update over the existing installation on your phone.

---

## 16. Manual steps you must perform

### A. Supabase database (required for chat notifications)
Apply migration `20261113000000_push_chat_notifications.sql` **once** via the Supabase SQL API:
```sql
ALTER TYPE public.notification_type ADD VALUE 'chat_message';
```
Do not run it twice.

### B. Supabase Edge Function secrets (required for all push)
In the Supabase Dashboard → Edge Functions → Secrets for project `yujyxdrznbkkbxvhwzey`, verify these are set (do not change values unless incorrect):
- `FIREBASE_PROJECT_ID` → `aca-connect-b254d`
- `FIREBASE_CLIENT_EMAIL` → your Firebase service account email
- `FIREBASE_PRIVATE_KEY` → your Firebase service account PEM private key
- `APP_URL` → your public web origin

### C. Deploy the Edge Function
```bash
npx supabase functions deploy send-push-notification --project-ref yujyxdrznbkkbxvhwzey --yes
```

### D. Run backend tests (requires live Supabase access)
```bash
export SUPABASE_SERVICE_ROLE_KEY="..."
export SUPABASE_ANON_KEY="..."
node scripts/test-attendance-reminders.mjs     # expect 14/14
node scripts/rls-bypass-test.mjs              # expect 78/78
```

### E. Install and test on your physical Android phone
1. Enable Developer Options → USB debugging on your device.
2. Connect via USB, authorize the computer.
3. `adb install -r release/android/ACA-Connect-1.2.1-release.apk`
4. Sign in as a member, grant notification permission.
5. Send an attendance/prayer reminder (super admin) or a chat message.
6. Verify the heads-up popup with sound appears in all states (open, background, terminated, locked).
7. Check Android notification channel settings if no sound/popup appears.

### F. User-facing channel settings (share with your users)
Android users control each notification channel. Tell members to verify:
- Settings → Apps → ACA Connect → Notifications
- Attendance Reminders, Prayer Reminders, Chat Messages: set to **Alert** (highest importance), sound on, vibration on
- General Announcements: can be **Default** importance
- Ensure "Do Not Disturb" and silent mode are off during service times

The app cannot override these system settings — they are user-controlled by design.

---

## 17. What was NOT done (blocked, requires your action)

| Item | Why blocked | What you need to provide |
|------|-------------|--------------------------|
| Physical device notification test | No `adb`, no device | Connect Android phone via USB debugging |
| Run `test-attendance-reminders.mjs` (14/14) | No Supabase access | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| Run `rls-bypass-test.mjs` (78/78) | No Supabase access | Live Supabase project access |
| Apply `20261113000000` migration | No Supabase CLI/SQL access | Supabase dashboard or CLI |
| Verify Edge Function secrets | No Supabase access | Supabase dashboard |
| Deploy Edge Function | No Supabase CLI | `npx supabase functions deploy ...` |
| Verify FCM auth / FCM HTTP v1 live | No Supabase access | Supabase dashboard function logs |

---

## Summary

The code-level notification bug (stale FCM token) has been fixed. The project has been cleaned (~176 MB recovered). A signed APK (version 1.2.1, versionCode 4, same signing certificate as before) has been built and verified at `release/android/ACA-Connect-1.2.1-release.apk`. Typecheck, lint, build, cap sync, and Gradle release build all pass.

Remaining work requires your action: Supabase migration, secret verification, Edge Function deployment, backend test execution, and physical device testing.