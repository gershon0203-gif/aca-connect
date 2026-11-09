-- =============================================================================
-- ACA Connect — 0004 · Row Level Security
-- =============================================================================
-- Every table is locked down. Access mirrors the UI's role model:
--
--   viewer  — read-only (members, families, own profile)
--   editor  — viewer + create/update/delete members, add households, upload photos
--   admin   — editor + manage users/roles, invitations, read audit trail
--
-- Helpers `current_user_role()`, `is_admin()` and `can_edit_members()` are
-- SECURITY DEFINER (see 0003) and must be used from policies instead of
-- querying user_roles directly, otherwise RLS recursion becomes a problem.
-- =============================================================================

alter table public.profiles       enable row level security;
alter table public.user_roles     enable row level security;
alter table public.families       enable row level security;
alter table public.members        enable row level security;
alter table public.family_members enable row level security;
alter table public.invitations    enable row level security;
alter table public.audit_logs     enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.can_edit_members());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- user_roles  (role escalation is admin-only)
-- ----------------------------------------------------------------------------
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- families
-- ----------------------------------------------------------------------------
drop policy if exists families_select on public.families;
create policy families_select on public.families
  for select to authenticated
  using (public.current_user_role() is not null);

drop policy if exists families_write on public.families;
create policy families_write on public.families
  for all to authenticated
  using (public.can_edit_members())
  with check (public.can_edit_members());

-- ----------------------------------------------------------------------------
-- members
-- ----------------------------------------------------------------------------
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (public.current_user_role() is not null);

drop policy if exists members_insert on public.members;
create policy members_insert on public.members
  for insert to authenticated
  with check (public.can_edit_members());

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update to authenticated
  using (public.can_edit_members())
  with check (public.can_edit_members());

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using (public.can_edit_members());

-- ----------------------------------------------------------------------------
-- family_members
-- ----------------------------------------------------------------------------
drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members
  for select to authenticated
  using (public.current_user_role() is not null);

drop policy if exists family_members_write on public.family_members;
create policy family_members_write on public.family_members
  for all to authenticated
  using (public.can_edit_members())
  with check (public.can_edit_members());

-- ----------------------------------------------------------------------------
-- invitations  (admin only)
-- ----------------------------------------------------------------------------
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.is_admin());

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists invitations_update on public.invitations;
create policy invitations_update on public.invitations
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- audit_logs  (read-only to staff with edit rights; written only by triggers)
-- ----------------------------------------------------------------------------
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_admin() or public.can_edit_members());

-- No INSERT/UPDATE/DELETE policies: the audit trigger runs as the table owner
-- (SECURITY DEFINER) and therefore bypasses RLS. Direct client writes are
-- impossible.
