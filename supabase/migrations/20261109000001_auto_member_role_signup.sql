-- =============================================================================
-- ACA Connect — 20261109000001 · Auto-grant member role on sign-up
-- =============================================================================
-- Additive only: no existing table, column, enum or policy is altered or
-- dropped. Safe to apply on top of the current live schema.
--
-- Change: new sign-ups now automatically receive the `member` role so they can
-- log in immediately without email confirmation or admin approval.
--
-- What changes:
--   1. `handle_new_user()` trigger now also inserts a `user_roles` row with
--      role='member', status='active' for every new auth account.
--   2. A trigger on auth.users (INSERT) ensures handle_new_user runs for every
--      new sign-up (idempotent: safe to re-apply).
--
-- Security:
--   * The trigger is SECURITY DEFINER and runs as the table owner, so it can
--     insert into user_roles despite the RLS insert policy (super_admin only).
--   * The role is hardcoded as 'member' — the client can never supply a role.
--   * Only 'member' is granted; never 'super_admin' or 'staff'.
--   * RLS is not disabled. Direct client inserts into user_roles still require
--     super_admin.
--   * Existing Super Admin accounts and all existing data are untouched.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Update handle_new_user() to grant 'member' role on sign-up
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    new.email
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role, status, granted_by)
  values (new.id, 'member', 'active', new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Attach handle_new_user to auth.users INSERT (idempotent)
-- ----------------------------------------------------------------------------
drop trigger if exists handle_new_user on auth.users;
create trigger handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
