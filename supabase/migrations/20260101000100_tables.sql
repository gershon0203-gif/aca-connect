-- =============================================================================
-- ACA Connect — 0002 · Tables
-- =============================================================================
-- Seven tables back the application:
--   profiles        — one row per auth user (display name, contact details)
--   user_roles      — authorisation: one role + status per auth user
--   families        — households, addressed by a short human code (FAM-001)
--   members         — church members, addressed by a human code (ACA-0001)
--   family_members  — many-to-many household <-> member link
--   invitations     — pending invites issued by admins
--   audit_logs      — append-only trail written by database triggers
--
-- Notes:
--   * Surrogate keys are UUIDs (gen_random_uuid, built into Postgres 13+).
--   * Human codes (member_code, family code) carry UNIQUE constraints; the
--     front-end continues to treat those codes as the public identifiers.
--   * members.user_id is the explicit link between an auth account and the
--     member record it represents (nullable, UNIQUE: one account, one member).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_full_name_len check (char_length(full_name) <= 120),
  constraint profiles_phone_len     check (phone is null or char_length(phone) <= 32)
);

create index if not exists profiles_email_idx on public.profiles (lower(email));

-- ----------------------------------------------------------------------------
-- user_roles
-- ----------------------------------------------------------------------------
create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.user_role   not null default 'viewer',
  status      public.user_status not null default 'active',
  granted_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_roles_user_unique unique (user_id)
);

create index if not exists user_roles_user_idx on public.user_roles (user_id);

-- ----------------------------------------------------------------------------
-- families
-- ----------------------------------------------------------------------------
create table if not exists public.families (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  address     text,
  notes       text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint families_code_format check (code ~ '^[A-Z0-9-]{2,32}$'),
  constraint families_name_len    check (char_length(name) between 1 and 120)
);

-- ----------------------------------------------------------------------------
-- members
-- ----------------------------------------------------------------------------
create table if not exists public.members (
  id               uuid primary key default gen_random_uuid(),
  member_code      text not null unique,
  user_id          uuid unique references auth.users(id) on delete set null,
  first_name       text not null,
  last_name        text not null,
  email            text,
  phone            text,
  gender           public.gender          not null default 'male',
  date_of_birth    date,
  marital_status   public.marital_status  not null default 'single',
  address          text,
  city             text,
  joined_at        date not null default current_date,
  status           public.member_status   not null default 'new',
  membership_role  public.membership_role not null default 'member',
  ministries       text[] not null default '{}',
  baptism_status   public.baptism_status  not null default 'unknown',
  avatar_url       text,
  notes            text,
  created_by       uuid default auth.uid() references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint members_code_format check (member_code ~ '^ACA-[0-9]{4,}$'),
  constraint members_name_len    check (
    char_length(first_name) between 1 and 80 and
    char_length(last_name)  between 1 and 80
  ),
  constraint members_dob_past    check (date_of_birth is null or date_of_birth <= current_date),
  constraint members_email_len   check (email is null or char_length(email) <= 254),
  constraint members_phone_len   check (phone is null or char_length(phone) <= 32)
);

create index if not exists members_last_name_idx  on public.members (lower(last_name));
create index if not exists members_first_name_idx on public.members (lower(first_name));
create index if not exists members_status_idx     on public.members (status);
create index if not exists members_ministries_idx on public.members using gin (ministries);

-- ----------------------------------------------------------------------------
-- family_members
-- ----------------------------------------------------------------------------
create table if not exists public.family_members (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  member_id     uuid not null references public.members(id)  on delete cascade,
  relationship  text,
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint family_members_unique unique (family_id, member_id)
);

create index if not exists family_members_member_idx on public.family_members (member_id);
create index if not exists family_members_family_idx on public.family_members (family_id);

-- A member may belong to several households, but only one may be primary.
create unique index if not exists family_members_one_primary_idx
  on public.family_members (member_id)
  where is_primary;

-- ----------------------------------------------------------------------------
-- invitations
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  role         public.user_role         not null default 'viewer',
  token        uuid not null unique default gen_random_uuid(),
  status       public.invitation_status not null default 'pending',
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint invitations_email_len check (char_length(email) between 3 and 254)
);

create index if not exists invitations_email_idx  on public.invitations (lower(email));
create index if not exists invitations_status_idx on public.invitations (status);

-- ----------------------------------------------------------------------------
-- audit_logs
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  entity_code  text,
  changes      jsonb,
  created_at   timestamptz not null default now(),
  constraint audit_action_len          check (char_length(action) between 1 and 40),
  constraint audit_entity_type_len     check (char_length(entity_type) between 1 and 40)
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx   on public.audit_logs (actor_id);
