-- =============================================================================
-- ACA Connect — 0003 · Functions, triggers & RPC
-- =============================================================================
-- Contains:
--   * set_updated_at()            — generic updated_at maintenance
--   * handle_new_user()           — provision profile + default role on signup
--   * current_user_role()/is_admin()/can_edit_members()
--                                 — role helpers used by RLS
--   * audit_row_change()          — append-only audit trail
--   * member_set_family()         — RPC to set a member's primary household
--
-- All SECURITY DEFINER functions pin `search_path` and have EXECUTE revoked
-- from PUBLIC so they cannot be abused by anonymous callers.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'user_roles', 'families', 'members', 'invitations']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so they can read user_roles regardless of RLS)
-- ----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.can_edit_members()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'editor'), false);
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.is_admin()         from public;
revoke all on function public.can_edit_members() from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin()          to authenticated;
grant execute on function public.can_edit_members()  to authenticated;

-- ----------------------------------------------------------------------------
-- Signup provisioning: create profile + default role for every new auth user
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

  insert into public.user_roles (user_id, role, status)
  values (new.id, 'viewer', 'active')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Audit trail
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
begin
  -- Only members are audited today; keep the function generic for future use.
  if tg_table_name = 'members' then
    if tg_op = 'INSERT' then
      v_action  := 'member.created';
      v_changes := to_jsonb(new);
    elsif tg_op = 'UPDATE' then
      v_action  := 'member.updated';
      v_changes := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    else
      v_action  := 'member.deleted';
      v_changes := to_jsonb(old);
    end if;
  else
    v_action  := lower(tg_table_name) || '.' || lower(tg_op);
    v_changes := case
      when tg_op = 'DELETE' then to_jsonb(old)
      else to_jsonb(new)
    end;
  end if;

  select email into v_email from auth.users where id = v_actor;

  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, entity_code, changes)
  values (
    v_actor,
    v_email,
    v_action,
    case tg_table_name
      when 'members'  then 'member'
      when 'families' then 'family'
      else tg_table_name
    end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    case
      when tg_table_name = 'members' then
        case when tg_op = 'DELETE' then old.member_code else new.member_code end
      when tg_table_name = 'families' then
        case when tg_op = 'DELETE' then old.code else new.code end
      else null
    end,
    v_changes
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists members_audit on public.members;
create trigger members_audit
  after insert or update or delete on public.members
  for each row execute function public.audit_row_change();

drop trigger if exists families_audit on public.families;
create trigger families_audit
  after insert or update or delete on public.families
  for each row execute function public.audit_row_change();

-- ----------------------------------------------------------------------------
-- RPC: set (or clear) a member's primary household.
-- The app works with human codes, so we resolve them to UUIDs server-side and
-- keep the family_members join table consistent.
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
  if not public.can_edit_members() then
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

revoke all on function public.member_set_family(text, text) from public;
grant execute on function public.member_set_family(text, text) to authenticated;
