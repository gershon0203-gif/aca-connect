-- Allow trusted backend roles to link/relink member accounts.
--
-- `enforce_member_self_update` restricts which columns a *member* may change.
-- Staff and super_admins already pass (`is_staff()`), but the bare backend
-- `service_role` (used by scripts, seeding and admin tooling) does not run as an
-- authenticated user, so the guard rejected it. `service_role` already bypasses
-- RLS entirely, so letting it through is not a privilege escalation; members
-- remain fully restricted.

begin;

create or replace function public.enforce_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.jwt() ->> 'role', current_user);
begin
  if v_role in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

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

commit;
