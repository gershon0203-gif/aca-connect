-- =============================================================================
-- ACA Connect — 0007 · Member self-service portal
-- =============================================================================
-- Adds the server-side pieces the member portal and admin invitation workflow
-- need. Everything remains enforced in the database; the client is never
-- trusted with a member id, role or permission.
--
--   * get_my_family()        — a linked member reads ONLY their own household(s)
--                              and only a safe subset of each relative's fields
--                              (no contact details of other members).
--   * reissue_invitation()   — super_admin recovery path for a wrong invitation
--                              or a changed email: revokes the old invitation and
--                              issues a fresh token/expiry for the corrected
--                              address. The old token can never be reused.
--
-- Invitations are still created through the RLS-protected `invitations` table
-- (insert allowed only to super_admins) and redeemed through the
-- `accept_invitation` RPC added in 20260102000000_authz.sql.
--
-- Depends on 20260102000000_authz.sql (public.app_role, is_super_admin()).
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Household visibility for a linked member
-- ----------------------------------------------------------------------------
-- Returns a JSON array of the caller's households. For each household it
-- returns the family code/name, whether it is the caller's primary household,
-- and the people in it — first/last name, member code, relationship and whether
-- the row is the caller. It deliberately exposes NO email, phone, address,
-- date of birth, notes or account linkage of any member.
create or replace function public.get_my_family()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_result    jsonb;
begin
  select m.id into v_member_id
  from public.members m
  where m.user_id = auth.uid()
  limit 1;

  if v_member_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(household order by household ->> 'familyName'), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'familyCode', f.code,
      'familyName', f.name,
      'isPrimary',  bool_or(mine.is_primary),
      'members', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'memberCode',   m.member_code,
            'firstName',    m.first_name,
            'lastName',     m.last_name,
            'relationship', link.relationship,
            'isSelf',       (m.user_id = auth.uid())
          )
          order by link.is_primary desc, m.first_name, m.last_name
        ),
        '[]'::jsonb
      )
    ) as household
    from public.family_members mine
    join public.families f       on f.id = mine.family_id
    join public.family_members link on link.family_id = f.id
    join public.members m        on m.id = link.member_id
    where mine.member_id = v_member_id
    group by f.id, f.code, f.name
  ) households;

  return v_result;
end;
$$;

revoke all on function public.get_my_family() from public;
grant execute on function public.get_my_family() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Invitation recovery (super_admin only)
-- ----------------------------------------------------------------------------
-- Revoke an existing invitation and immediately issue a replacement for a
-- (possibly corrected) email address, preserving the role and member link.
-- Returns the NEW invitation row so the caller can share the fresh link.
create or replace function public.reissue_invitation(
  p_invitation_id uuid,
  p_email         text
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.invitations;
  v_new public.invitations;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super_admin may reissue invitations'
      using errcode = '42501';
  end if;

  select * into v_old from public.invitations where id = p_invitation_id;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;

  -- Never reuse a token: retire the old one first.
  update public.invitations
     set status = 'revoked', updated_at = now()
   where id = v_old.id;

  insert into public.invitations (email, role, member_code)
  values (
    lower(btrim(coalesce(nullif(p_email, ''), v_old.email))),
    v_old.role,
    v_old.member_code
  )
  returning * into v_new;

  return v_new;
end;
$$;

revoke all on function public.reissue_invitation(uuid, text) from public;
grant execute on function public.reissue_invitation(uuid, text) to authenticated;

commit;
