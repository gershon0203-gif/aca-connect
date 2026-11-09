-- Harden function execution grants.
--
-- Supabase grants EXECUTE on newly created functions to the `anon`,
-- `authenticated` and `service_role` roles via default privileges, so a
-- `revoke ... from public` alone leaves `anon` able to call them.
--
-- Our SECURITY DEFINER functions all gate on `auth.uid()` / role helpers and
-- return safe values (false/[]/exception) for anonymous callers, so there is
-- no data leak. This migration removes anonymous EXECUTE as defence in depth
-- and keeps it off future functions too. `authenticated` and `service_role`
-- keep access; RLS still governs every table.

begin;

revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;

commit;
