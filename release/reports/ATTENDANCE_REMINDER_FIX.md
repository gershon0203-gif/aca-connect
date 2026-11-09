# ACA Connect — Attendance Reminder Fix Report

Date: 2026-11-09
Project: `yujyxdrznbkkbxvhwzey` (ACA connect, production)
Function: `send-push-notification`

## 1. Exact root cause

The "Edge Function returned a non-2xx status code" message was caused by a chain
of real backend defects, not by a missing deployment:

1. **Primary 500 — invalid Web Crypto call.**
   `crypto.subtle.importKey()` was given the PEM private key as a **string**.
   Web Crypto requires an `ArrayBuffer`/`BufferSource`, so every send failed
   with:
   `Failed to execute 'importKey' on 'SubtleCrypto': Argument 2 can not be converted to a dictionary`.
   The function returned HTTP 500 and the UI only showed the generic message.

2. **Wrong Firebase project ID secret.**
   `FIREBASE_PROJECT_ID` was set to `aca-connect-b2549`, but the Android app is
   registered to `aca-connect-b254d` (`android/app/google-services.json`).
   After the crypto fix, FCM answered:
   `Permission denied on resource project aca-connect-b2549`.

3. **OAuth scope typo.** The service-account JWT requested
   `https://www.googleapis.com/auth/firebase-messaging` instead of
   `https://www.googleapis.com/auth/firebase.messaging`, so Google rejected the
   token request as unauthenticated.

4. **Invalid FCM payload field.** `message.notification.sound` is not a valid
   FCM HTTP v1 field (sound belongs under `android.notification`). FCM returned
   HTTP 400 `INVALID_ARGUMENT`. The old code treated **every** 400/404 as an
   invalid device token, so a payload bug could deactivate real users' devices.

5. **RLS blocked token reads.** Device tokens were read with the caller's JWT.
   The `device_tokens` RLS policy only lets a member read their own rows, so a
   super admin always saw zero tokens ("no registered devices").

6. **In-app notifications were never created.** The function called
   `admin_send_attendance_reminders` with the service-role client, where
   `auth.uid()` is null. The SECURITY DEFINER RPC checks `is_super_admin()` and
   raised `Only a super admin may send attendance reminders`; the error was
   ignored.

7. **Recipient filter could widen the list.** A client-supplied `member_ids`
   list was used directly, so a present member's ID could be sent if the client
   asked for it. The server now intersects the request with the session's
   absent list.

## 2. Edge Function name

`send-push-notification` (deployed to project `yujyxdrznbkkbxvhwzey`).

## 3. Original HTTP status / backend error

- First observed: HTTP 500 —
  `{"error":"Failed to obtain FCM access token: Failed to execute 'importKey' on 'SubtleCrypto': Argument 2 can not be converted to a dictionary"}`
- After the crypto fix: HTTP 500 —
  `{"error":"Failed to obtain FCM access token: FCM token request failed: 401"}`
- After the scope fix: HTTP 200 with a device-level Google error
  `401 UNAUTHENTICATED` (wrong project).
- After the project-ID fix: FCM authentication succeeded; the remaining
  `invalid_token` result in tests is expected because the test token is fake.

## 4. Files changed

- `supabase/functions/send-push-notification/index.ts` — rewritten send pipeline (previous fixes).
- `src/services/attendance.ts` — returns `sent`, `failed`, `alreadySent`,
  `recipients`, `skipped`; surfaces the real Edge Function error body.
- `src/pages/AttendanceSession.tsx` — role-gated reminder card, accurate
  success/partial-failure/error reporting, retry guidance, dedicated error banner.
- `src/services/prayers.ts` — surfaces the real Edge Function error body.
- `src/services/push.ts` — `registerDeviceToken()` now always calls
  `PushNotifications.register()` to obtain the current FCM token on every
  launch. Previously it skipped `register()` when a token was already stored
  locally, so FCM token rotations while the app was closed were never picked up
  and the device kept using a stale token — notifications silently stopped.
- `release/reports/ATTENDANCE_REMINDER_FIX.md` — this report.
- `release/reports/TEST_REPORT.md` — updated status.

## 5. Database migrations

None. No table, column, policy, role or existing data was changed.

## 6. Secrets (names only)

Present: `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `APP_URL`.
Corrected: `FIREBASE_PROJECT_ID` (was `aca-connect-b2549`, now
`aca-connect-b254d`, matching the Android app). No secret value was printed.

## 7. Fixes implemented

- Decode the PEM key to bytes before `crypto.subtle.importKey()`.
- Correct OAuth scope `firebase.messaging`.
- Remove the invalid `sound` field from `message.notification`; keep it under
  `android.notification`.
- Verify the caller JWT with the service-role client, then read the role with
  the service-role client (no RLS ambiguity); reject non-super-admins with 403.
- Read sessions, records, members, tokens, notifications and logs with the
  service-role client **after** authorization. RLS remains enabled for clients.
- Attendance recipients = selected IDs ∩ absent IDs ∩ active members ∩ active
  `member` role accounts. Present members can never be included.
- Reject draft sessions (400), unknown sessions (404), empty absent lists (400)
  and missing title/message (400).
- Create/refresh the in-app notification for each recipient, de-duplicated by
  `(user_id, type, reference_id)`.
- Skip devices that already have a `sent` log for the same notification, so a
  retry only retries failures.
- Only deactivate a token on genuine token errors (404/NOT_FOUND/UNREGISTERED,
  or an explicit "registration token" INVALID_ARGUMENT). Payload errors no
  longer deactivate devices.
- Write `push_send_logs` with the real recipient, notification ID and masked
  result; update `last_used_at` for delivered devices.
- Never return full FCM tokens in the response (masked to last 6 characters).
- CORS allow-list: `APP_URL`, `https://aca-connect.vercel.app`, localhost dev
  ports and the Capacitor origin.
- Frontend: loading state, disabled button while sending, confirmation modal,
  recipient count, partial-failure message with successful/failed counts,
  retry guidance, real backend error text, and the reminder card hidden for
  non-super-admins.

## 8. Deployment status

`npx supabase functions deploy send-push-notification --project-ref yujyxdrznbkkbxvhwzey --yes`
completed successfully (production). Secret update for `FIREBASE_PROJECT_ID`
applied successfully.

## 9. Frontend checks

- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm run build` — PASS

## 10. Test cases (live, disposable data)

`node scripts/test-attendance-reminders.mjs` — **14/14 PASS**

| # | Case | Result |
|---|------|--------|
| 1 | Normal member cannot send (403) | PASS |
| 2 | Invalid session ID rejected (404) | PASS |
| 3 | Malformed session ID rejected (400, "must be a valid UUID") | PASS |
| 4 | Draft session rejected (400) | PASS |
| 5 | Session with no absentees rejected (400) | PASS |
| 6 | Present member excluded from recipients | PASS |
| 7 | Fake device reported as `invalid_token`, not 500 | PASS |
| 8 | In-app notification created only for the absent member | PASS |
| 9 | No-device recipient handled cleanly (`skipped`) | PASS |
| 10 | In-app notification created for no-device recipient | PASS |
| 11 | Retry skips already-delivered device | PASS |
| 12 | In-app notification de-duplicated on resend | PASS |
| 13 | Missing title rejected (400) | PASS |
| 14 | Unauthenticated call rejected (401) | PASS |

Firebase service-account authentication and the FCM HTTP v1 endpoint were
reached successfully (the fake test token produced the expected
`invalid_token` response).

## 11. Physical phone delivery

**Not verified.** No Android emulator or physical device is connected to this
machine (`adb devices` empty, `emulator -list-avds` empty). Real FCM delivery to
a phone remains unconfirmed until a device is available.

## 12. Remaining manual steps

1. Install the signed APK on a real Android device, sign in as a member, allow
   notifications, then send an attendance reminder from a super admin account.
2. Confirm the member receives the push and that the in-app notification
   appears under Notifications.
3. If push still fails on the device, check that the device's
   `google-services.json` project (`aca-connect-b254d`) matches the server
   secret and that the FCM API is enabled for that project.
