-- =============================================================================
-- ACA Connect - 20261113000000 Push chat notifications
-- =============================================================================
-- Adds the `chat_message` value to the `public.notification_type` enum so the
-- `send-push-notification` Edge Function can record chat push attempts in
-- `push_send_logs` and (optionally) create in-app chat notifications.
--
-- NOTE: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block, so
-- this statement is intentionally standalone (no BEGIN/COMMIT). It is also
-- not idempotent: running it twice would error. It is applied once to
-- production via the Supabase SQL API.
-- =============================================================================

alter type public.notification_type add value 'chat_message';
