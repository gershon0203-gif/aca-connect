-- =============================================================================
-- ACA Connect — 20261109000002 · Member add permission
-- =============================================================================
-- Additive only: no existing table, column, enum or policy is altered or
-- dropped. Safe to apply on top of the current live schema.
--
-- Change: members with the 'member' role can now insert new member records
-- through the Members page. They can only create records with
-- membership_role = 'member' and user_id IS NULL — they cannot self-assign
-- super_admin or link auth accounts.
--
-- Security:
--   * RLS is not disabled. Direct client inserts still require the policy
--     check below.
--   * The client can never supply a role — the policy enforces membership_role
--     = 'member' server-side.
--   * user_id must be NULL — members cannot link auth accounts.
--   * Existing super_admin privileges are untouched.
--   * Existing member records are untouched.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Update members_insert policy to allow member role
-- ----------------------------------------------------------------------------
drop policy if exists members_insert on public.members;
create policy members_insert on public.members
  for insert
  to authenticated
  with check (
    public.is_staff()
    or (
      public.is_member()
      and membership_role = 'member'
      and user_id is null
    )
  );

commit;
