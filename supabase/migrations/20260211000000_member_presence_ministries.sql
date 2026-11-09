-- =============================================================================
-- ACA Connect — 20260211000000 · "Right Now" + ministry catalogue
-- =============================================================================
-- Additive only — no existing column, table or policy is dropped or altered
-- destructively. Safe to run on the live project.
--
--   * members.right_now  — the member's CURRENT ministry / status, a single
--     free-text value chosen from the ministry catalogue plus the membership
--     statuses. Deliberately a plain column (not derived) so a record keeps a
--     stable "right now" answer.
--   * public.ministries  — the canonical ministry catalogue (the fixed standard
--     list seeds Worship, Children, Youth, Outreach, Others, after which an
--     administrator may add/rename/archive more).
--
-- The member self-update guard is re-created to add `right_now` to the list of
-- fields a linked member may NOT change (staff/admin only), preserving the
-- existing least-privilege behaviour.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. members.right_now
-- ----------------------------------------------------------------------------
alter table public.members
  add column if not exists right_now text;

do $$ begin
  alter table public.members
    add constraint members_right_now_len
    check (right_now is null or char_length(right_now) <= 80);
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Re-assert the member self-update guard (now blocks right_now too)
-- ----------------------------------------------------------------------------
-- Mirrors 20260105000000_member_guard_trusted.sql, with `right_now` added to
-- the blocked set. Staff, admin and service roles bypass the check as before.
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
     or new.right_now   is distinct from old.right_now
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

-- ----------------------------------------------------------------------------
-- 3. Ministry catalogue
-- ----------------------------------------------------------------------------
create table if not exists public.ministries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ministries_name_len check (char_length(name) between 1 and 60)
);

create index if not exists ministries_sort_idx on public.ministries (sort_order, name);

-- Seed the fixed standard list only when the catalogue is empty.
insert into public.ministries (name, sort_order)
values
  ('Worship', 10),
  ('Children', 20),
  ('Youth', 30),
  ('Outreach', 40),
  ('Others', 50)
on conflict (name) do nothing;

-- updated_at maintenance
create or replace function public.touch_ministries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ministries_touch_updated_at on public.ministries;
create trigger ministries_touch_updated_at
  before update on public.ministries
  for each row execute function public.touch_ministries_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS — everyone signed in may read the catalogue; only staff may change it
-- ----------------------------------------------------------------------------
alter table public.ministries enable row level security;

drop policy if exists ministries_select on public.ministries;
create policy ministries_select on public.ministries
  for select to authenticated
  using (true);

drop policy if exists ministries_insert on public.ministries;
create policy ministries_insert on public.ministries
  for insert to authenticated
  with check (public.is_staff());

drop policy if exists ministries_update on public.ministries;
create policy ministries_update on public.ministries
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists ministries_delete on public.ministries;
create policy ministries_delete on public.ministries
  for delete to authenticated
  using (public.is_staff());

commit;
