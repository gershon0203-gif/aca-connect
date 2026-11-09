-- =============================================================================
-- ACA Connect — 20261110000000 · Common chat, private chat, events, daily hub
-- =============================================================================
-- Additive only. Creates tables for two chat areas, church events and daily hub
-- posts, with RLS enforcing the two-role model. Realtime is enabled on the
-- chat and (optionally) events tables so clients can subscribe.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Common + private chat
-- ----------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null check (channel in ('group','private')),
  sender_id   uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  body        text not null,
  reply_to    uuid references public.chat_messages(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint chat_messages_body_len check (char_length(btrim(body)) between 1 and 2000),
  constraint chat_messages_private_recipient check (
    (channel = 'private' and recipient_id is not null) or
    (channel = 'group' and recipient_id is null)
  )
);

create index if not exists chat_messages_group_idx
  on public.chat_messages (created_at desc) where channel = 'group';

create index if not exists chat_messages_private_idx
  on public.chat_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);

alter table public.chat_messages enable row level security;

drop policy if exists chat_messages_group_select on public.chat_messages;
create policy chat_messages_group_select
  on public.chat_messages for select to authenticated
  using (channel = 'group');

drop policy if exists chat_messages_private_select on public.chat_messages;
create policy chat_messages_private_select
  on public.chat_messages for select to authenticated
  using (
    channel = 'private' and (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_super_admin())
  );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert
  on public.chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      (channel = 'group')
      or (channel = 'private' and (recipient_id is not null))
    )
  );

-- Only the author (or super_admin) may delete their own message.
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_delete
  on public.chat_messages for delete to authenticated
  using (sender_id = auth.uid() or public.is_super_admin());

grant select, insert, delete on public.chat_messages to authenticated;
revoke all on public.chat_messages from anon;

-- ----------------------------------------------------------------------------
-- 2. Church events
-- ----------------------------------------------------------------------------
create table if not exists public.church_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  event_date  date not null,
  event_time  time,
  location    text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint church_events_title_len check (char_length(btrim(title)) between 1 and 120)
);

create index if not exists church_events_date_idx on public.church_events (event_date);

alter table public.church_events enable row level security;

drop policy if exists church_events_select on public.church_events;
create policy church_events_select
  on public.church_events for select to authenticated
  using (true);

drop policy if exists church_events_admin_write on public.church_events;
create policy church_events_admin_write
  on public.church_events for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on public.church_events to authenticated;
grant insert, update, delete on public.church_events to authenticated;
revoke all on public.church_events from anon;

drop trigger if exists set_updated_at on public.church_events;
create trigger set_updated_at before update on public.church_events
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Daily hub
-- ----------------------------------------------------------------------------
create table if not exists public.daily_hub_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  content     text not null,
  post_date   date not null default current_date,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint daily_hub_posts_title_len check (char_length(btrim(title)) between 1 and 120)
);

create index if not exists daily_hub_posts_date_idx on public.daily_hub_posts (post_date desc);

alter table public.daily_hub_posts enable row level security;

drop policy if exists daily_hub_select on public.daily_hub_posts;
create policy daily_hub_select
  on public.daily_hub_posts for select to authenticated
  using (true);

drop policy if exists daily_hub_admin_write on public.daily_hub_posts;
create policy daily_hub_admin_write
  on public.daily_hub_posts for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

grant select on public.daily_hub_posts to authenticated;
grant insert, update, delete on public.daily_hub_posts to authenticated;
revoke all on public.daily_hub_posts from anon;

drop trigger if exists set_updated_at on public.daily_hub_posts;
create trigger set_updated_at before update on public.daily_hub_posts
  for each row execute function public.set_updated_at();

commit;
