-- =============================================================================
-- ACA Connect — 0006 · Production authorization model
-- =============================================================================
-- Replaces the original admin/editor/viewer model with an explicit, least-
-- privilege model:
--
--   super_admin — platform owner. Only role that may assign roles, manage
--                 invitations, link member accounts, or touch audit logs by
--                 policy. Full record access.
--   staff       — trusted volunteers. Full CRUD on member/household records and
--                 read-only access to the activity trail. Cannot manage roles,
--                 invitations or settings.
--   member      — a linked congregation member. May read and update ONLY their
--                 own member record, and only an approved subset of fields.
--
-- Everything is enforced server-side:
--   * Role checks run through SECURITY DEFINER helpers that read user_roles by
--     auth.uid(); the client can never supply a role, member id or permission.
--   * New sign-ups provision a profile ONLY — never a role, so public
--     registration cannot self-grant access.
--   * Access is granted exclusively through a super_admin invitation/link RPC.
--   * Member self-updates are constrained by a BEFORE UPDATE trigger, so even a
--     direct PostgREST UPDATE cannot change role/status/link fields.
--
-- This migration is self-contained and atomic. It does not edit earlier files;
-- it drops and rebuilds the objects they created.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Tear down storage + table policies that reference the old helpers
-- ----------------------------------------------------------------------------
drop policy if exists avatars_select on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;

drop policy if exists profiles_select        on public.profiles;
drop policy if exists profiles_insert        on public.profiles;
drop policy if exists profiles_update        on public.profiles;
drop policy if exists profiles_delete        on public.profiles;
drop policy if exists user_roles_select      on public.user_roles;
drop policy if exists user_roles_insert      on public.user_roles;
drop policy if exists user_roles_update      on public.user_roles;
drop policy if exists user_roles_delete      on public.user_roles;
drop policy if exists families_select        on public.families;
drop policy if exists families_write         on public.families;
drop policy if exists members_select         on public.members;
drop policy if exists members_insert         on public.members;
drop policy if exists members_update         on public.members;
drop policy if exists members_delete         on public.members;
drop policy if exists family_members_select  on public.family_members;
drop policy if exists family_members_write   on public.family_members;
drop policy if exists invitations_select     on public.invitations;
drop policy if exists invitations_insert     on public.invitations;
drop policy if exists invitations_update     on public.invitations;
drop policy if exists invitations_delete     on public.invitations;
drop policy if exists audit_logs_select      on public.audit_logs;

-- ----------------------------------------------------------------------------
-- 1. Drop functions that depended on the old enum / helpers
-- ----------------------------------------------------------------------------
drop function if exists public.is_admin();
drop function if exists public.can_edit_members();
drop function if exists public.current_user_role();
drop function if exists public.member_set_family(text, text);

-- ----------------------------------------------------------------------------
-- 2. New role enum + column migration
-- ----------------------------------------------------------------------------
create type public.app_role as enum ('super_admin', 'staff', 'member');

alter table public.user_roles alter column role drop default;
alter table public.user_roles
  alter column role type public.app_role using (
    case role::text
      when 'admin'  then 'super_admin'
      when 'editor' then 'staff'
      else 'member'
    end
  )::public.app_role;
alter table public.user_roles alter column role set default 'member';

alter table public.invitations alter column role drop default;
alter table public.invitations
  alter column role type public.app_role using (
    case role::text
      when 'admin'  then 'super_admin'
      when 'editor' then 'staff'
      else 'member'
    end
  )::public.app_role;
alter table public.invitations alter column role set default 'member';

-- Invitations may target a specific member record to link on acceptance.
alter table public.invitations
  add column if not exists member_code text
  references public.members(member_code) on delete set null;

-- The old enum is no longer referenced by any column, function or policy.
drop type public.user_role;

-- ----------------------------------------------------------------------------
-- 3. Role helpers (SECURITY DEFINER; read user_roles regardless of RLS)
-- ----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select ur.role
  from public.user_roles ur
  where ur.user_id = auth.uid()
    and ur.status = 'active'
  limit 1;
$$;

create or replace function public.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() is not null;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'super_admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('super_admin', 'staff'), false);
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'member', false);
$$;

-- The member_code linked to the calling account (or null).
create or replace function public.current_member_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.member_code from public.members m where m.user_id = auth.uid() limit 1;
$$;

-- True when `object_name` is the avatar of the member linked to the caller.
create or replace function public.member_owns_avatar(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and split_part(object_name, '/', 1) = 'members'
      and split_part(object_name, '/', 2) = m.member_code
  );
$$;

revoke all on function public.current_user_role()      from public;
revoke all on function public.has_app_access()         from public;
revoke all on function public.is_super_admin()         from public;
revoke all on function public.is_staff()               from public;
revoke all on function public.is_member()              from public;
revoke all on function public.current_member_code()    from public;
revoke all on function public.member_owns_avatar(text) from public;

grant execute on function public.current_user_role()      to authenticated;
grant execute on function public.has_app_access()         to authenticated;
grant execute on function public.is_super_admin()         to authenticated;
grant execute on function public.is_staff()               to authenticated;
grant execute on function public.is_member()              to authenticated;
grant execute on function public.current_member_code()    to authenticated;
grant execute on function public.member_owns_avatar(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Signup provisioning — profile ONLY, never a role
-- ----------------------------------------------------------------------------
-- Public registration must never grant access. New accounts are inert until a
-- super_admin invites/links them, which is the only path that creates a row in
-- user_roles (via accept_invitation / admin_link_member).
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

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Member self-update guard (column-level least privilege)
-- ----------------------------------------------------------------------------
-- RLS lets a member UPDATE their own members row. This trigger narrows that to
-- an approved field set so a crafted PATCH cannot alter status, role, link or
-- identifiers. Staff and super_admin bypass the check.
create or replace function public.enforce_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_staff() then
    return new;
  end if;

  if new.member_code    is distinct from old.member_code
     or new.user_id     is distinct from old.user_id
     or new.first_name  is distinct from old.first_name
     or new.last_name   is distinct from old.last_name
     or new.gender      is distinct from old.gender
     or new.date_of_birth   is distinct from old.date_of_birth
     or new.marital_status  is distinct from old.marital_status
     or new.joined_at   is distinct from old.joined_at
     or new.status      is distinct from old.status
     or new.membership_role is distinct from old.membership_role
     or new.ministries  is distinct from old.ministries
     or new.baptism_status  is distinct from old.baptism_status
     or new.notes       is distinct from old.notes
     or new.created_by  is distinct from old.created_by
     or new.created_at  is distinct from old.created_at
  then
    raise exception 'Members may only update approved personal fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists members_self_update_guard on public.members;
create trigger members_self_update_guard
  before update on public.members
  for each row execute function public.enforce_member_self_update();

-- ----------------------------------------------------------------------------
-- 6. Invitation + account-linking RPCs (server-verified)
-- ----------------------------------------------------------------------------
-- Accept an invitation as the signed-in user. The token, the invited email and
-- the granted role are all validated server-side; the client only supplies the
-- opaque token.
create or replace function public.accept_invitation(p_token uuid)
returns public.app_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv   public.invitations;
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to accept an invitation'
      using errcode = '42501';
  end if;

  select * into v_inv from public.invitations where token = p_token;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'This invitation is no longer valid';
  end if;
  if v_inv.expires_at < now() then
    update public.invitations
       set status = 'expired', updated_at = now()
     where id = v_inv.id;
    raise exception 'This invitation has expired';
  end if;

  v_email := lower(coalesce(
    auth.jwt() ->> 'email',
    (select u.email from auth.users u where u.id = v_uid)
  ));
  if v_email is distinct from lower(v_inv.email) then
    raise exception 'This invitation was issued to a different email address'
      using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role, status, granted_by)
  values (v_uid, v_inv.role, 'active', v_inv.invited_by)
  on conflict (user_id) do update
    set role       = excluded.role,
        status     = 'active',
        granted_by = excluded.granted_by,
        updated_at = now();

  if v_inv.member_code is not null then
    update public.members
       set user_id = v_uid, updated_at = now()
     where member_code = v_inv.member_code
       and (user_id is null or user_id = v_uid);
    if not found then
      raise exception 'Member % is already linked to another account',
        v_inv.member_code;
    end if;
  end if;

  update public.invitations
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid,
         updated_at = now()
   where id = v_inv.id;

  return v_inv.role;
end;
$$;

-- Super_admin-only: link an existing account (by email) to a member record.
create or replace function public.admin_link_member(p_member_code text, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_hit integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super_admin may link member accounts'
      using errcode = '42501';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = lower(p_email) limit 1;
  if v_uid is null then
    raise exception 'No account found for %', p_email using errcode = 'P0002';
  end if;

  update public.members
     set user_id = v_uid, updated_at = now()
   where member_code = p_member_code
     and (user_id is null or user_id = v_uid);
  get diagnostics v_hit = row_count;
  if v_hit = 0 then
    raise exception 'Member % not found or already linked to another account', p_member_code;
  end if;
end;
$$;

-- Super_admin-only: detach the account linked to a member record.
create or replace function public.admin_unlink_member(p_member_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super_admin may unlink member accounts'
      using errcode = '42501';
  end if;

  update public.members
     set user_id = null, updated_at = now()
   where member_code = p_member_code;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: set (or clear) a member's primary household (staff only)
-- ----------------------------------------------------------------------------
create or replace function public.member_set_family(p_member_code text, p_family_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_family_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to change a member household'
      using errcode = '42501';
  end if;

  select id into v_member_id from public.members where member_code = p_member_code;
  if v_member_id is null then
    raise exception 'Member % not found', p_member_code using errcode = 'P0002';
  end if;

  delete from public.family_members where member_id = v_member_id and is_primary;

  if p_family_code is null or btrim(p_family_code) = '' then
    return;
  end if;

  select id into v_family_id from public.families where code = p_family_code;
  if v_family_id is null then
    raise exception 'Family % not found', p_family_code using errcode = 'P0002';
  end if;

  insert into public.family_members (family_id, member_id, is_primary)
  values (v_family_id, v_member_id, true)
  on conflict (family_id, member_id) do update set is_primary = true;
end;
$$;

revoke all on function public.accept_invitation(uuid)            from public;
revoke all on function public.admin_link_member(text, text)      from public;
revoke all on function public.admin_unlink_member(text)          from public;
revoke all on function public.member_set_family(text, text)      from public;

grant execute on function public.accept_invitation(uuid)         to authenticated;
grant execute on function public.admin_link_member(text, text)   to authenticated;
grant execute on function public.admin_unlink_member(text)       to authenticated;
grant execute on function public.member_set_family(text, text)   to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Audit trail (redacted: no tokens, no member field values)
-- ----------------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_email  text;
  v_action text;
  v_changes jsonb;
  v_row    jsonb;
  v_code   text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if tg_table_name in ('members', 'families') then
    if tg_op = 'INSERT' then
      v_action  := tg_table_name || '.created';
      v_changes := jsonb_build_object('fields', '*');
    elsif tg_op = 'UPDATE' then
      v_action := tg_table_name || '.updated';
      -- Record WHICH fields changed, never their values.
      select coalesce(jsonb_object_agg(n.key, 'changed'), '{}'::jsonb)
        into v_changes
      from jsonb_each(to_jsonb(new)) as n(key, value)
      where to_jsonb(old) -> n.key is distinct from n.value;
    else
      v_action  := tg_table_name || '.deleted';
      v_changes := '{}'::jsonb;
    end if;
  elsif tg_table_name = 'user_roles' then
    v_action  := 'user_role.' || lower(tg_op);
    v_changes := jsonb_build_object(
      'role',   v_row ->> 'role',
      'status', v_row ->> 'status'
    );
  elsif tg_table_name = 'invitations' then
    v_action  := 'invitation.' || lower(tg_op);
    -- Deliberately excludes the invitation token.
    v_changes := jsonb_build_object(
      'email',       v_row ->> 'email',
      'role',        v_row ->> 'role',
      'status',      v_row ->> 'status',
      'member_code', v_row ->> 'member_code'
    );
  else
    v_action  := lower(tg_table_name) || '.' || lower(tg_op);
    v_changes := '{}'::jsonb;
  end if;

  select u.email into v_email from auth.users u where u.id = v_actor;

  v_code := case tg_table_name
    when 'members'     then v_row ->> 'member_code'
    when 'families'    then v_row ->> 'code'
    when 'invitations' then v_row ->> 'email'
    when 'user_roles'  then (select u.email from auth.users u where u.id = (v_row ->> 'user_id')::uuid)
    else null
  end;

  insert into public.audit_logs
    (actor_id, actor_email, action, entity_type, entity_id, entity_code, changes)
  values (
    v_actor,
    v_email,
    v_action,
    case tg_table_name
      when 'members'     then 'member'
      when 'families'    then 'family'
      when 'user_roles'  then 'user_role'
      when 'invitations' then 'invitation'
      else tg_table_name
    end,
    (v_row ->> 'id')::uuid,
    v_code,
    v_changes
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();

drop trigger if exists invitations_audit on public.invitations;
create trigger invitations_audit
  after insert or update or delete on public.invitations
  for each row execute function public.audit_row_change();

-- ----------------------------------------------------------------------------
-- 9. Row Level Security policies
-- ----------------------------------------------------------------------------
-- profiles -------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_super_admin());

-- user_roles (role assignment is super_admin only) ---------------------------
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using (public.is_super_admin());

-- families (staff only) ------------------------------------------------------
drop policy if exists families_select on public.families;
create policy families_select on public.families
  for select to authenticated
  using (public.is_staff());

drop policy if exists families_write on public.families;
create policy families_write on public.families
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- members --------------------------------------------------------------------
-- staff see everyone; a member sees only the record linked to their account.
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (public.is_staff() or user_id = auth.uid());

drop policy if exists members_insert on public.members;
create policy members_insert on public.members
  for insert to authenticated
  with check (public.is_staff());

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update to authenticated
  using (public.is_staff() or user_id = auth.uid())
  with check (public.is_staff() or user_id = auth.uid());

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete to authenticated
  using (public.is_staff());

-- family_members (staff only) ------------------------------------------------
drop policy if exists family_members_select on public.family_members;
create policy family_members_select on public.family_members
  for select to authenticated
  using (public.is_staff());

drop policy if exists family_members_write on public.family_members;
create policy family_members_write on public.family_members
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- invitations (super_admin only; acceptance runs through the definer RPC) ----
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists invitations_insert on public.invitations;
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists invitations_update on public.invitations;
create policy invitations_update on public.invitations
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.is_super_admin());

-- audit_logs (staff read-only; rows written by triggers only) -----------------
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- 10. Storage policies (private `avatars` bucket)
-- ----------------------------------------------------------------------------
-- staff: any object. member: only their own profile folder (<uid>/) and their
-- own linked member photo (members/<member_code>/). Everyone else: nothing.
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      public.is_staff()
      or split_part(name, '/', 1) = auth.uid()::text
      or public.member_owns_avatar(name)
    )
  );

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.is_staff()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (public.is_staff() or owner = auth.uid())
  )
  with check (
    bucket_id = 'avatars'
    and (
      public.is_staff()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (public.is_staff() or owner = auth.uid())
  );

commit;
