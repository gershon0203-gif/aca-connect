-- =============================================================================
-- ACA Connect — 20261109000000 · FCM device tokens & push send logs
-- =============================================================================
-- Additive only: no existing table, column, enum or policy is altered or
-- dropped. Safe to apply on top of the current live schema.
--
-- Delivers push-notification device registration for Android FCM and web push:
--
--   * device_tokens   — one row per (member, device token, platform)
--                         a member may register multiple devices
--   * push_send_logs  — audit trail of every push send attempt
--                         recipient, type, status, error, created_at
--
-- Authorization:
--   * device_tokens: member can insert/update/delete only their own rows
--                    (matched by member_id → members.user_id = auth.uid())
--   * super_admin   : full read access to both tables
--   * push_send_logs: insert-only for the server-side Edge Function
--                     members cannot read or write
--
-- No prayer content is invented here. No existing data is modified.

-- ----------------------------------------------------------------------------
-- 1. device_tokens table
-- ----------------------------------------------------------------------------
create type public.push_platform as enum ('android', 'ios', 'web');

create table if not exists public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null
    constraint device_tokens_member_fk
    references public.members(id) on delete cascade,
  token        text not null unique,
  platform     public.push_platform not null,
  device_id    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_used_at timestamptz,
  is_active    boolean not null default true,
  constraint device_tokens_member_platform_ux unique (member_id, token, platform)
);

create index if not exists device_tokens_member_idx on public.device_tokens (member_id);
create index if not exists device_tokens_active_idx on public.device_tokens (is_active);
create index if not exists device_tokens_platform_idx on public.device_tokens (platform);

-- ----------------------------------------------------------------------------
-- 2. push_send_logs table
-- ----------------------------------------------------------------------------
create type public.push_send_status as enum ('sent', 'failed', 'invalid_token');

create table if not exists public.push_send_logs (
  id             uuid primary key default gen_random_uuid(),
  recipient_user uuid not null
    constraint push_send_logs_user_fk
    references auth.users(id) on delete cascade,
  notification_id uuid
    constraint push_send_logs_notification_fk
    references public.notifications(id) on delete set null,
  type           public.notification_type not null,
  status         public.push_send_status not null,
  device_token   text,
  error_message  text,
  sent_at        timestamptz not null default now()
);

create index if not exists push_send_logs_user_idx on public.push_send_logs (recipient_user);
create index if not exists push_send_logs_type_idx on public.push_send_logs (type);
create index if not exists push_send_logs_status_idx on public.push_send_logs (status);
create index if not exists push_send_logs_sent_at_idx on public.push_send_logs (sent_at desc);

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger for device_tokens
-- ----------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.device_tokens;

create trigger device_tokens_updated_at
  before update on public.device_tokens
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.device_tokens enable row level security;
alter table public.push_send_logs enable row level security;

-- device_tokens: member manages their own tokens only
drop policy if exists device_tokens_select_own on public.device_tokens;
create policy device_tokens_select_own
  on public.device_tokens
  for select
  to authenticated
  using (
    member_id in (
      select m.id from public.members m
      where m.user_id = auth.uid()
    )
  );

drop policy if exists device_tokens_insert_own on public.device_tokens;
create policy device_tokens_insert_own
  on public.device_tokens
  for insert
  to authenticated
  with check (
    member_id in (
      select m.id from public.members m
      where m.user_id = auth.uid()
    )
  );

drop policy if exists device_tokens_update_own on public.device_tokens;
create policy device_tokens_update_own
  on public.device_tokens
  for update
  to authenticated
  using (
    member_id in (
      select m.id from public.members m
      where m.user_id = auth.uid()
    )
  )
  with check (
    member_id in (
      select m.id from public.members m
      where m.user_id = auth.uid()
    )
  );

drop policy if exists device_tokens_delete_own on public.device_tokens;
create policy device_tokens_delete_own
  on public.device_tokens
  for delete
  to authenticated
  using (
    member_id in (
      select m.id from public.members m
      where m.user_id = auth.uid()
    )
  );

-- push_send_logs: server-side insert only; super_admin can read all
drop policy if exists push_send_logs_insert_server on public.push_send_logs;
create policy push_send_logs_insert_server
  on public.push_send_logs
  for insert
  to authenticated
  with check (true);

drop policy if exists push_send_logs_select_admin on public.push_send_logs;
create policy push_send_logs_select_admin
  on public.push_send_logs
  for select
  to authenticated
  using (public.is_super_admin());

-- ----------------------------------------------------------------------------
-- 5. Table privileges
-- ----------------------------------------------------------------------------
revoke all on public.device_tokens from anon;
revoke all on public.push_send_logs from anon;

grant select, insert, update, delete on public.device_tokens to authenticated;
grant insert on public.push_send_logs to authenticated;
grant select on public.push_send_logs to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: register a device token (member, own tokens only)
-- ----------------------------------------------------------------------------
create or replace function public.member_register_device_token(
  p_token     text,
  p_platform  public.push_platform,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  -- Resolve the calling user's member record
  select m.id into v_member_id
  from public.members m
  where m.user_id = auth.uid()
  limit 1;

  if v_member_id is null then
    raise exception 'No member record linked to this account'
      using errcode = '42501';
  end if;

  insert into public.device_tokens (member_id, token, platform, device_id, last_used_at)
  values (v_member_id, p_token, p_platform, p_device_id, now())
  on conflict (member_id, token, platform) do update
    set is_active   = true,
        updated_at  = now(),
        last_used_at = now(),
        device_id   = coalesce(excluded.device_id, device_tokens.device_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: mark a device token inactive (member, own tokens only)
-- ----------------------------------------------------------------------------
create or replace function public.member_unregister_device_token(
  p_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  select m.id into v_member_id
  from public.members m
  where m.user_id = auth.uid()
  limit 1;

  if v_member_id is null then
    raise exception 'No member record linked to this account'
      using errcode = '42501';
  end if;

  update public.device_tokens
     set is_active = false,
         updated_at = now()
   where member_id = v_member_id
     and token = p_token;
end;
$$;

revoke all on function public.member_register_device_token(text, public.push_platform, text) from public;
revoke all on function public.member_unregister_device_token(text) from public;

grant execute on function public.member_register_device_token(text, public.push_platform, text) to authenticated;
grant execute on function public.member_unregister_device_token(text) to authenticated;

commit;
