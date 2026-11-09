-- =============================================================================
-- ACA Connect — 20261108000000 · Attendance, prayer & notifications
-- =============================================================================
-- Additive only: no existing table, column, enum or policy is altered or
-- dropped. Safe to apply on top of the current live schema.
--
-- Delivers Phase 4–9 of the two-role upgrade:
--
--   * attendance_sessions / attendance_records
--       - one row per (date, service); one record per (session, member)
--       - drafting vs completed is explicit (`status`), so unrecorded members
--         are never silently counted as absent
--   * prayer_categories / prayer_items
--       - empty by design: no church prayer content is invented here
--   * notifications
--       - in-app inbox for attendance + prayer reminders
--       - a partial unique index prevents accidental duplicate sends, while an
--         explicit resend updates the existing row instead of duplicating it
--
-- Authorization:
--   * super_admin (public.is_super_admin()) manages every write path.
--   * A member may read ONLY their own attendance records; the policy compares
--     against public.current_member_id(), never a client-supplied id.
--   * Notifications are readable only by their recipient (super_admin may read
--     all for the delivery history), and readable status is the only column an
--     authenticated user may update.
--   * All privileged writes run through SECURITY DEFINER RPCs which re-check
--     the trusted role server-side. The service-role key is never used here.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.attendance_status as enum ('present', 'absent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_session_status as enum ('draft', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.prayer_item_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum ('attendance_reminder', 'prayer_reminder');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Attendance
-- ----------------------------------------------------------------------------
create table if not exists public.attendance_sessions (
  id           uuid primary key default gen_random_uuid(),
  session_date date not null,
  service_name text not null,
  status       public.attendance_session_status not null default 'draft',
  notes        text,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint attendance_sessions_service_len
    check (char_length(btrim(service_name)) between 1 and 80)
);

-- One session per service per day, case/spacing insensitive.
create unique index if not exists attendance_sessions_day_service_idx
  on public.attendance_sessions (session_date, lower(btrim(service_name)));

create index if not exists attendance_sessions_date_idx
  on public.attendance_sessions (session_date desc);

create table if not exists public.attendance_records (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  status     public.attendance_status not null,
  marked_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_unique unique (session_id, member_id)
);

create index if not exists attendance_records_session_idx
  on public.attendance_records (session_id);

create index if not exists attendance_records_member_idx
  on public.attendance_records (member_id);

drop trigger if exists set_updated_at on public.attendance_sessions;
create trigger set_updated_at
  before update on public.attendance_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.attendance_records;
create trigger set_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Prayer management
-- ----------------------------------------------------------------------------
create table if not exists public.prayer_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  archived_at timestamptz,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint prayer_categories_name_len
    check (char_length(btrim(name)) between 1 and 80)
);

-- Active category names must be unique; archived names may be reused.
create unique index if not exists prayer_categories_name_idx
  on public.prayer_categories (lower(btrim(name)))
  where archived_at is null;

create table if not exists public.prayer_items (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.prayer_categories(id) on delete restrict,
  title       text not null,
  description text,
  status      public.prayer_item_status not null default 'active',
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint prayer_items_title_len
    check (char_length(btrim(title)) between 1 and 120)
);

create index if not exists prayer_items_category_idx
  on public.prayer_items (category_id, status);

drop trigger if exists set_updated_at on public.prayer_categories;
create trigger set_updated_at
  before update on public.prayer_categories
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.prayer_items;
create trigger set_updated_at
  before update on public.prayer_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. In-app notifications
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         public.notification_type not null,
  title        text not null,
  message      text not null,
  is_read      boolean not null default false,
  destination  text,
  -- The attendance session or prayer item this reminder is about.
  reference_id uuid,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint notifications_title_len
    check (char_length(btrim(title)) between 1 and 120),
  constraint notifications_message_len
    check (char_length(btrim(message)) between 1 and 1000)
);

-- One reminder per recipient/type/reference. An explicit resend refreshes this
-- row (see the RPCs below) instead of creating a duplicate.
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, type, reference_id)
  where reference_id is not null;

create index if not exists notifications_inbox_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where not is_read;

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.attendance_sessions  enable row level security;
alter table public.attendance_records   enable row level security;
alter table public.prayer_categories    enable row level security;
alter table public.prayer_items         enable row level security;
alter table public.notifications        enable row level security;

-- attendance_sessions ---------------------------------------------------------
drop policy if exists attendance_sessions_admin_all on public.attendance_sessions;
create policy attendance_sessions_admin_all
  on public.attendance_sessions
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- A member may read the session header only when they have a record in it.
drop policy if exists attendance_sessions_member_select on public.attendance_sessions;
create policy attendance_sessions_member_select
  on public.attendance_sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.attendance_records ar
      where ar.session_id = attendance_sessions.id
        and ar.member_id = public.current_member_id()
    )
  );

-- attendance_records ----------------------------------------------------------
drop policy if exists attendance_records_admin_all on public.attendance_records;
create policy attendance_records_admin_all
  on public.attendance_records
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists attendance_records_member_select on public.attendance_records;
create policy attendance_records_member_select
  on public.attendance_records
  for select
  to authenticated
  using (member_id = public.current_member_id());

-- prayer_categories -----------------------------------------------------------
drop policy if exists prayer_categories_admin_all on public.prayer_categories;
create policy prayer_categories_admin_all
  on public.prayer_categories
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists prayer_categories_member_select on public.prayer_categories;
create policy prayer_categories_member_select
  on public.prayer_categories
  for select
  to authenticated
  using (archived_at is null or public.is_super_admin());

-- prayer_items ----------------------------------------------------------------
drop policy if exists prayer_items_admin_all on public.prayer_items;
create policy prayer_items_admin_all
  on public.prayer_items
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists prayer_items_member_select on public.prayer_items;
create policy prayer_items_member_select
  on public.prayer_items
  for select
  to authenticated
  using (
    public.is_super_admin()
    or (
      status = 'active'
      and exists (
        select 1
        from public.prayer_categories c
        where c.id = prayer_items.category_id
          and c.archived_at is null
      )
    )
  );

-- notifications ---------------------------------------------------------------
drop policy if exists notifications_select_own_or_admin on public.notifications;
create policy notifications_select_own_or_admin
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

-- Recipients may flip read state on their own notifications only. There is
-- deliberately NO insert/delete policy: notifications are created by the
-- definer RPCs below.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Table privileges: members may only change the read flag.
revoke all on public.attendance_sessions from anon;
revoke all on public.attendance_records  from anon;
revoke all on public.prayer_categories   from anon;
revoke all on public.prayer_items        from anon;
revoke all on public.notifications       from anon;

grant select, insert, update, delete on public.attendance_sessions to authenticated;
grant select, insert, update, delete on public.attendance_records  to authenticated;
grant select, insert, update, delete on public.prayer_categories   to authenticated;
grant select, insert, update, delete on public.prayer_items        to authenticated;

grant select on public.notifications to authenticated;
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: create an attendance session (super admin)
-- ----------------------------------------------------------------------------
create or replace function public.admin_create_attendance_session(
  p_date    date,
  p_service text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may manage attendance'
      using errcode = '42501';
  end if;

  if p_date is null then
    raise exception 'Attendance date is required' using errcode = '22023';
  end if;

  if p_service is null or char_length(btrim(p_service)) = 0 then
    raise exception 'Service name is required' using errcode = '22023';
  end if;

  insert into public.attendance_sessions (session_date, service_name, status, created_by)
  values (p_date, btrim(p_service), 'draft', auth.uid())
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'A session for this service and date already exists'
      using errcode = '23505';
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: save the full attendance sheet for a session (super admin)
-- ----------------------------------------------------------------------------
-- `p_records` is a JSON array of { "member_id": uuid, "status": "present"|"absent" }.
-- Members omitted from the array are removed from the sheet, so an unrecorded
-- member is genuinely unrecorded — never stored as absent by default.
create or replace function public.admin_save_attendance(
  p_session_id uuid,
  p_records    jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count   integer;
  v_records jsonb := coalesce(p_records, '[]'::jsonb);
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may manage attendance'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.attendance_sessions
    where id = p_session_id and status <> 'cancelled'
  ) then
    raise exception 'Attendance session not found or cancelled'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_records) e
    where (e->>'member_id') is null
       or (e->>'member_id') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (e->>'status') not in ('present', 'absent')
  ) then
    raise exception 'Each attendance record needs a valid member_id and present/absent status'
      using errcode = '22023';
  end if;

  -- Drop rows the sheet no longer contains.
  delete from public.attendance_records ar
  where ar.session_id = p_session_id
    and not exists (
      select 1
      from jsonb_array_elements(v_records) e
      where (e->>'member_id')::uuid = ar.member_id
    );

  -- Upsert the supplied rows (deduplicated defensively).
  with payload as (
    select distinct on ((e->>'member_id')::uuid)
           (e->>'member_id')::uuid as member_id,
           (e->>'status')::public.attendance_status as status
    from jsonb_array_elements(v_records) e
    order by (e->>'member_id')::uuid
  )
  insert into public.attendance_records (session_id, member_id, status, marked_by)
  select p_session_id, payload.member_id, payload.status, auth.uid()
  from payload
  on conflict (session_id, member_id) do update
    set status     = excluded.status,
        marked_by  = excluded.marked_by,
        updated_at = now();

  select count(*) into v_count
  from public.attendance_records
  where session_id = p_session_id;

  update public.attendance_sessions
     set updated_at = now()
   where id = p_session_id;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: mark a session complete (super admin)
-- ----------------------------------------------------------------------------
create or replace function public.admin_finalize_attendance(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may manage attendance'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.attendance_sessions
    where id = p_session_id and status <> 'cancelled'
  ) then
    raise exception 'Attendance session not found or cancelled'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.attendance_records where session_id = p_session_id
  ) then
    raise exception 'Record at least one member before completing the session'
      using errcode = '22023';
  end if;

  update public.attendance_sessions
     set status = 'completed', updated_at = now()
   where id = p_session_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC: send attendance reminders (super admin, manual only)
-- ----------------------------------------------------------------------------
create or replace function public.admin_send_attendance_reminders(
  p_session_id uuid,
  p_member_ids uuid[],
  p_title      text,
  p_message    text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_user   uuid;
  v_count  integer := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may send attendance reminders'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.attendance_sessions
    where id = p_session_id and status = 'completed'
  ) then
    raise exception 'Complete the attendance session before sending reminders'
      using errcode = '22023';
  end if;

  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'A reminder title is required' using errcode = '22023';
  end if;

  if p_message is null or char_length(btrim(p_message)) = 0 then
    raise exception 'A reminder message is required' using errcode = '22023';
  end if;

  for v_member in
    select m.id, m.user_id
    from public.members m
    join public.user_roles ur on ur.user_id = m.user_id
    join public.attendance_records ar
      on ar.member_id = m.id and ar.session_id = p_session_id
    where m.id = any(coalesce(p_member_ids, '{}'::uuid[]))
      and ar.status = 'absent'
      and m.status = 'active'
      and m.user_id is not null
      and ur.role = 'member'
      and ur.status = 'active'
  loop
    v_user := v_member.user_id;

    insert into public.notifications
      (user_id, type, title, message, destination, reference_id, created_by)
    values
      (v_user, 'attendance_reminder', btrim(p_title), btrim(p_message),
       '/my-attendance', p_session_id, auth.uid())
    on conflict (user_id, type, reference_id) where reference_id is not null
    do update
      set title       = excluded.title,
          message     = excluded.message,
          is_read     = false,
          created_by  = excluded.created_by,
          created_at  = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. RPC: send a prayer reminder to every eligible member (super admin)
-- ----------------------------------------------------------------------------
create or replace function public.admin_send_prayer_reminder(
  p_item_id uuid,
  p_title   text,
  p_message text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_count integer := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may send prayer reminders'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.prayer_items
    where id = p_item_id and status = 'active'
  ) then
    raise exception 'Select an active prayer before sending a reminder'
      using errcode = '22023';
  end if;

  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'A reminder title is required' using errcode = '22023';
  end if;

  if p_message is null or char_length(btrim(p_message)) = 0 then
    raise exception 'A reminder message is required' using errcode = '22023';
  end if;

  for v_user in
    select ur.user_id
    from public.user_roles ur
    join public.members m on m.user_id = ur.user_id
    where ur.role = 'member'
      and ur.status = 'active'
      and m.status = 'active'
      and m.user_id is not null
  loop
    insert into public.notifications
      (user_id, type, title, message, destination, reference_id, created_by)
    values
      (v_user, 'prayer_reminder', btrim(p_title), btrim(p_message),
       '/notifications', p_item_id, auth.uid())
    on conflict (user_id, type, reference_id) where reference_id is not null
    do update
      set title      = excluded.title,
          message    = excluded.message,
          is_read    = false,
          created_by = excluded.created_by,
          created_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. RPC: mark every notification for the caller as read
-- ----------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.notifications
       set is_read = true
     where user_id = auth.uid()
       and not is_read
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- ----------------------------------------------------------------------------
-- 12. Privileges
-- ----------------------------------------------------------------------------
revoke all on function public.admin_create_attendance_session(date, text)          from public;
revoke all on function public.admin_save_attendance(uuid, jsonb)                  from public;
revoke all on function public.admin_finalize_attendance(uuid)                      from public;
revoke all on function public.admin_send_attendance_reminders(uuid, uuid[], text, text) from public;
revoke all on function public.admin_send_prayer_reminder(uuid, text, text)         from public;
revoke all on function public.mark_all_notifications_read()                        from public;

grant execute on function public.admin_create_attendance_session(date, text)          to authenticated;
grant execute on function public.admin_save_attendance(uuid, jsonb)                  to authenticated;
grant execute on function public.admin_finalize_attendance(uuid)                      to authenticated;
grant execute on function public.admin_send_attendance_reminders(uuid, uuid[], text, text) to authenticated;
grant execute on function public.admin_send_prayer_reminder(uuid, text, text)         to authenticated;
grant execute on function public.mark_all_notifications_read()                        to authenticated;

commit;
