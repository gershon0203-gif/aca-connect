-- =============================================================================
-- ACA Connect — 20261111000000 · Allow a member to submit their own profile
-- =============================================================================
-- Additive only. A signed-in member may insert exactly one members row linked
-- to their own auth user id. RLS + the unique constraint on members.user_id
-- prevent duplicates and prevent linking a profile to another account.
-- =============================================================================

begin;

drop policy if exists members_insert_self on public.members;
create policy members_insert_self on public.members
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and membership_role = 'member'
  );

grant insert on public.members to authenticated;

commit;
