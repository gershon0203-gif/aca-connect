-- =============================================================================
-- ACA Connect — 20260210000000 · Family management (Phase 4, File A)
-- =============================================================================
-- Delivers the household/relationship foundation:
--
--   * families.archived_at              — soft-archive (null = active)
--   * families.primary_contact_member_id — optional designated contact
--   * member_relationship_type enum      — spouse | parent | sibling |
--                                          guardian | other
--   * member_relationships table          — one typed row per related pair
--   * current_member_id()                 — caller's member uuid (definer)
--   * prevent_relationship_cycle()        — blocks parent/guardian cycles
--
-- RPCs (all staff-only unless noted):
--   create_family / family_add_member / family_remove_member /
--   family_set_primary_contact / add_member_relationship /
--   remove_member_relationship
--   get_my_relationships()  (member-safe: own relationships, names + type only)
--
-- Design notes:
--   * Additive only. Existing tables/columns/policies are untouched.
--   * Relationships are stored ONCE per pair (unique index on the unordered
--     pair) so duplicates and contradictory types cannot both exist.
--   * Canonical direction: for `parent` the subject is the PARENT and the
--     related member is the child; `child` is derived, never stored. `guardian`
--     likewise stores the guardian as subject. `spouse`/`sibling` are
--     symmetric. Nothing is ever inferred from surname or address.
--   * RLS: staff read/write; a member may read only rows they appear on.
--     The member-safe read is also available through get_my_relationships().
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. families — soft archive + optional primary contact
-- ----------------------------------------------------------------------------
alter table public.families
  add column if not exists archived_at timestamptz;

alter table public.families
  add column if not exists primary_contact_member_id uuid
    references public.members(id) on delete set null;

create index if not exists families_archived_idx
  on public.families (archived_at);

create index if not exists families_primary_contact_idx
  on public.families (primary_contact_member_id);

-- ----------------------------------------------------------------------------
-- 2. Relationship enum
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.member_relationship_type as enum
    ('spouse', 'parent', 'sibling', 'guardian', 'other');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 3. member_relationships table
-- ----------------------------------------------------------------------------
-- One row per related pair. `member_id` is the SUBJECT (for parent/guardian
-- that is the senior side); `related_member_id` is the other person.
create table if not exists public.member_relationships (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null
    constraint member_relationships_member_fk
    references public.members(id) on delete cascade,
  related_member_id uuid not null
    constraint member_relationships_related_fk
    references public.members(id) on delete cascade,
  relationship_type public.member_relationship_type not null,
  -- Only used by the `other` type; short free-text descriptor.
  label             text,
  created_by        uuid default auth.uid()
    references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint member_relationships_no_self
    check (member_id <> related_member_id),
  constraint member_relationships_other_label
    check (
      (relationship_type = 'other'
        and label is not null
        and char_length(btrim(label)) between 1 and 40)
      or (relationship_type <> 'other')
    )
);

create index if not exists member_relationships_member_idx
  on public.member_relationships (member_id);

create index if not exists member_relationships_related_idx
  on public.member_relationships (related_member_id);

-- A pair may hold only ONE relationship (prevents duplicates and
-- contradictory types such as spouse + sibling on the same two people).
create unique index if not exists member_relationships_pair_idx
  on public.member_relationships (
    least(member_id, related_member_id),
    greatest(member_id, related_member_id)
  );

drop trigger if exists set_updated_at on public.member_relationships;
create trigger set_updated_at
  before update on public.member_relationships
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Relationship cycle guard (parent / guardian only)
-- ----------------------------------------------------------------------------
-- Walks the member -> related (parent/guardian) edges from the proposed child
-- and rejects the row if it can already reach the proposed parent, which would
-- create a cycle (a person becoming their own ancestor).
create or replace function public.prevent_relationship_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle boolean;
begin
  if new.relationship_type not in ('parent', 'guardian') then
    return new;
  end if;

  with recursive reach(node) as (
    select new.related_member_id
    union
    select r.related_member_id
    from public.member_relationships r
    join reach on r.member_id = reach.node
    where r.relationship_type in ('parent', 'guardian')
      and r.id is distinct from new.id
  )
  select exists (select 1 from reach where node = new.member_id)
    into v_cycle;

  if v_cycle then
    raise exception 'This relationship would create a cycle'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists member_relationships_cycle_guard
  on public.member_relationships;
create trigger member_relationships_cycle_guard
  before insert or update on public.member_relationships
  for each row execute function public.prevent_relationship_cycle();

-- ----------------------------------------------------------------------------
-- 5. Helper: the calling account's member uuid (definer; bypasses RLS)
-- ----------------------------------------------------------------------------
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id from public.members m where m.user_id = auth.uid() limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC: create a family (auto code FAM-###)
-- ----------------------------------------------------------------------------
create or replace function public.create_family(
  p_name    text,
  p_address text default null,
  p_notes   text default null
)
returns public.families
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.families;
  v_seq     integer;
  v_attempt integer := 0;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to create families'
      using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'A family name is required' using errcode = '22023';
  end if;

  loop
    v_attempt := v_attempt + 1;
    select coalesce(max((regexp_replace(code, '^FAM-', ''))::integer), 0) + v_attempt
      into v_seq
    from public.families
    where code ~ '^FAM-[0-9]+$';

    begin
      insert into public.families (code, name, address, notes, created_by)
      values (
        'FAM-' || lpad(v_seq::text, 3, '0'),
        btrim(p_name),
        nullif(btrim(coalesce(p_address, '')), ''),
        nullif(btrim(coalesce(p_notes, '')), ''),
        auth.uid()
      )
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: add a member to a family (optionally as their primary household)
-- ----------------------------------------------------------------------------
create or replace function public.family_add_member(
  p_family_code text,
  p_member_code text,
  p_is_primary  boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_member_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to change family membership'
      using errcode = '42501';
  end if;

  select id into v_family_id from public.families where code = p_family_code;
  if v_family_id is null then
    raise exception 'Family % not found', p_family_code using errcode = 'P0002';
  end if;

  select id into v_member_id from public.members where member_code = p_member_code;
  if v_member_id is null then
    raise exception 'Member % not found', p_member_code using errcode = 'P0002';
  end if;

  -- Only one primary household per member.
  if p_is_primary then
    delete from public.family_members
     where member_id = v_member_id and is_primary;
  end if;

  insert into public.family_members (family_id, member_id, is_primary)
  values (v_family_id, v_member_id, p_is_primary)
  on conflict (family_id, member_id)
    do update set is_primary =
      public.family_members.is_primary or excluded.is_primary;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: remove a member from a family
-- ----------------------------------------------------------------------------
create or replace function public.family_remove_member(
  p_family_code text,
  p_member_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_member_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to change family membership'
      using errcode = '42501';
  end if;

  select id into v_family_id from public.families where code = p_family_code;
  if v_family_id is null then
    raise exception 'Family % not found', p_family_code using errcode = 'P0002';
  end if;

  select id into v_member_id from public.members where member_code = p_member_code;
  if v_member_id is null then
    raise exception 'Member % not found', p_member_code using errcode = 'P0002';
  end if;

  delete from public.family_members
   where family_id = v_family_id and member_id = v_member_id;

  -- Never leave a dangling primary contact.
  update public.families
     set primary_contact_member_id = null, updated_at = now()
   where id = v_family_id and primary_contact_member_id = v_member_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC: set (or clear) a family's primary contact (must be a member)
-- ----------------------------------------------------------------------------
create or replace function public.family_set_primary_contact(
  p_family_code text,
  p_member_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_member_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to set a primary contact'
      using errcode = '42501';
  end if;

  select id into v_family_id from public.families where code = p_family_code;
  if v_family_id is null then
    raise exception 'Family % not found', p_family_code using errcode = 'P0002';
  end if;

  if p_member_code is null or btrim(p_member_code) = '' then
    update public.families
       set primary_contact_member_id = null, updated_at = now()
     where id = v_family_id;
    return;
  end if;

  select m.id into v_member_id
  from public.members m
  join public.family_members fm
    on fm.member_id = m.id and fm.family_id = v_family_id
  where m.member_code = p_member_code;

  if v_member_id is null then
    raise exception 'Member % is not part of family %',
      p_member_code, p_family_code using errcode = 'P0002';
  end if;

  update public.families
     set primary_contact_member_id = v_member_id, updated_at = now()
   where id = v_family_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. RPC: add a typed relationship between two members
-- ----------------------------------------------------------------------------
create or replace function public.add_member_relationship(
  p_member_code  text,
  p_related_code text,
  p_type         public.member_relationship_type,
  p_label        text default null
)
returns public.member_relationships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id  uuid;
  v_related_id uuid;
  v_label      text;
  v_row        public.member_relationships;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to change relationships'
      using errcode = '42501';
  end if;

  select id into v_member_id  from public.members where member_code = p_member_code;
  select id into v_related_id from public.members where member_code = p_related_code;

  if v_member_id is null or v_related_id is null then
    raise exception 'Both members must exist' using errcode = 'P0002';
  end if;
  if v_member_id = v_related_id then
    raise exception 'A member cannot be related to themselves'
      using errcode = '22023';
  end if;

  v_label := nullif(btrim(coalesce(p_label, '')), '');
  if p_type = 'other' and v_label is null then
    raise exception 'Describe the relationship for "Other"'
      using errcode = '22023';
  end if;

  begin
    insert into public.member_relationships
      (member_id, related_member_id, relationship_type, label, created_by)
    values (
      v_member_id,
      v_related_id,
      p_type,
      case when p_type = 'other' then v_label else null end,
      auth.uid()
    )
    returning * into v_row;
  exception when unique_violation then
    raise exception 'These two members already have a relationship recorded'
      using errcode = '23505';
  end;

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. RPC: remove a relationship by id
-- ----------------------------------------------------------------------------
create or replace function public.remove_member_relationship(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Not authorised to change relationships'
      using errcode = '42501';
  end if;

  delete from public.member_relationships where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 12. RPC: the caller's own relationships (member-safe)
-- ----------------------------------------------------------------------------
-- Returns the caller's relatives as name + type only — never contact details or
-- the other party's account linkage.
create or replace function public.get_my_relationships()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_result    jsonb;
begin
  if v_member_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(entry order by entry ->> 'lastName', entry ->> 'firstName'),
    '[]'::jsonb
  )
    into v_result
  from (
    select jsonb_build_object(
      'memberCode',       other.member_code,
      'firstName',        other.first_name,
      'lastName',         other.last_name,
      'relationshipType', r.relationship_type,
      'label',            r.label,
      'subjectIsMe',      (r.member_id = v_member_id)
    ) as entry
    from public.member_relationships r
    join public.members other
      on other.id = case
        when r.member_id = v_member_id then r.related_member_id
        else r.member_id
      end
    where r.member_id = v_member_id or r.related_member_id = v_member_id
  ) rows;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 13. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.member_relationships enable row level security;

-- Staff read everything; a member reads only the rows they appear on.
drop policy if exists member_relationships_select on public.member_relationships;
create policy member_relationships_select on public.member_relationships
  for select to authenticated
  using (
    public.is_staff()
    or member_id = public.current_member_id()
    or related_member_id = public.current_member_id()
  );

drop policy if exists member_relationships_write on public.member_relationships;
create policy member_relationships_write on public.member_relationships
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- 14. Grants (never expose to anon)
-- ----------------------------------------------------------------------------
revoke all on function public.current_member_id()                          from public;
revoke all on function public.create_family(text, text, text)              from public;
revoke all on function public.family_add_member(text, text, boolean)       from public;
revoke all on function public.family_remove_member(text, text)             from public;
revoke all on function public.family_set_primary_contact(text, text)       from public;
revoke all on function public.add_member_relationship(text, text, public.member_relationship_type, text) from public;
revoke all on function public.remove_member_relationship(uuid)             from public;
revoke all on function public.get_my_relationships()                       from public;

grant execute on function public.current_member_id()                       to authenticated;
grant execute on function public.create_family(text, text, text)           to authenticated;
grant execute on function public.family_add_member(text, text, boolean)    to authenticated;
grant execute on function public.family_remove_member(text, text)          to authenticated;
grant execute on function public.family_set_primary_contact(text, text)    to authenticated;
grant execute on function public.add_member_relationship(text, text, public.member_relationship_type, text) to authenticated;
grant execute on function public.remove_member_relationship(uuid)          to authenticated;
grant execute on function public.get_my_relationships()                    to authenticated;

commit;
