# ACA Connect — Database & Security Report

## Roles
- `super_admin`: full CRUD on members/families, attendance, prayers, events, daily hub, chat moderation, notifications history, users/invitations, settings.
- `member`: read/update own member record (approved fields only), own attendance, own notifications (read flag only), chat participation, view events/daily hub/prayers.

## RLS
- RLS enabled on all tables including `chat_messages`, `church_events`, `daily_hub_posts`, `device_tokens`, `push_send_logs`.
- No unrestricted `WITH CHECK (true)` policies on member data.
- Members cannot change roles; `user_roles` writable only by super_admin.
- Member self-update limited by trigger `enforce_member_self_update` to approved contact fields.
- Private chat scoped to sender/recipient (+super_admin).
- `device_tokens`: members can read/write only their own tokens.
- `push_send_logs`: no client write access; written only by the service-role Edge Function.

## Edge Function authorization
- `send-push-notification` verifies the caller's JWT and requires an active
  `super_admin` role on the server before reading recipients or sending.
- Attendance recipients are re-checked server-side: selected ∩ absent ∩ active
  member ∩ active `member` role account. Present members can never be included.
- FCM credentials and the service-role key stay in Edge Function secrets.

## Secrets
- Only anon key in frontend. Service role key and Firebase private key remain server-side (Edge Functions).
- No secrets committed in source.
- `FIREBASE_PROJECT_ID` corrected to `aca-connect-b254d` to match the Android app.

## Pending manual
- Physical Android device test for FCM delivery (no device/emulator available here).
- Configure Firebase notification channels/permission prompt on the device.
- Web push (VAPID + service worker push handler) is not implemented.
