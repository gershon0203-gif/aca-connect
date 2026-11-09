-- =============================================================================
-- ACA Connect — 0001 · Enum types
-- =============================================================================
-- All application enums live in the `public` schema. Each `create type` is
-- wrapped in a guard so the migration is safe to re-run during development.
-- =============================================================================

do $$ begin
  create type public.user_role as enum ('admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum ('active', 'invited', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_status as enum ('active', 'inactive', 'new', 'transferred');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender as enum ('male', 'female');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.marital_status as enum ('single', 'married', 'widowed', 'widower');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.membership_role as enum ('member', 'ministry-leader', 'deacon', 'elder', 'pastor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.baptism_status as enum ('baptised', 'not-baptised', 'unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;
