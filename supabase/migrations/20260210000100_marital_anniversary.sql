-- =============================================================================
-- ACA Connect — 20260210000100 · Wedding anniversary (Phase 5, File B)
-- =============================================================================
-- ⚠️  APPLIED to the live project (verified: anniversary_date column, both RPCs,
--     and the listSpouseCouples embed all resolve live). Additive only — no
--     existing column, table or policy was touched.
--
-- Delivers a wedding date stored ONCE per couple, on the spouse relationship
-- (`member_relationships.anniversary_date`), rather than duplicated across both
-- member records:
--
--   * member_relationships.anniversary_date date  — set only on spouse rows
--   * set_spouse_anniversary(relationship_id,date) — staff-only set/clear
--   * get_my_anniversary()                          — member-safe own couple
--
-- Design notes:
--   * Additive only. No existing column, table or policy is touched.
--   * A partial index keeps the (small) anniversary set cheap to read.
--   * Anniversary data is NOT contact data and is deliberately excluded from
--     ordinary members; organisation-wide lists stay staff-only via the
--     existing `member_relationships_select` policy (staff read all, a member
--     reads only rows they appear on).
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Anniversary column (spouse rows only)
-- ----------------------------------------------------------------------------
alter table public.member_relationships
  add column if not exists anniversary_date date;

do $$ begin
  alter table public.member_relationships
    add constraint member_relationships_anniversary_spouse
    check (anniversary_date is null or relationship_type = 'spouse');
exception when duplicate_object then null; end $$;

create index if not exists member_relationships_anniversary_idx
  on public.member_relationships (anniversary_date)
  where anniversary_date is not null;

-- ----------------------------------------------------------------------------
-- 2. RPC: set (or clear, with a null date) a couple's wedding anniversary
-- ----------------------------------------------------------------------------
create or replace function public.set_spouse_anniversary(
  p_relationship_id uuid,
  p_date            date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.member_relationship_type;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to set an anniversary'
      using errcode = '42501';
  end if;

  select relationship_type into v_type
  from public.member_relationships
  where id = p_relationship_id;

  if v_type is null then
    raise exception 'Relationship not found' using errcode = 'P0002';
  end if;

  if v_type <> 'spouse' then
    raise exception 'An anniversary can only be recorded for a spouse'
      using errcode = '22023';
  end if;

  if p_date is not null and p_date > current_date then
    raise exception 'An anniversary cannot be in the future'
      using errcode = '22023';
  end if;

  update public.member_relationships
     set anniversary_date = p_date, updated_at = now()
   where id = p_relationship_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. RPC: the caller's own wedding anniversary (member-safe)
-- ----------------------------------------------------------------------------
-- Returns the partner name + date only, or 'null' when the caller has no
-- anniversary on file. Never exposes the partner's contact details or account.
create or replace function public.get_my_anniversary()
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
    return null;
  end if;

  select jsonb_build_object(
           'partnerFirstName', other.first_name,
           'partnerLastName',  other.last_name,
           'anniversaryDate',  r.anniversary_date
         )
    into v_result
  from public.member_relationships r
  join public.members other
    on other.id = case
      when r.member_id = v_member_id then r.related_member_id
      else r.member_id
    end
  where r.relationship_type = 'spouse'
    and r.anniversary_date is not null
    and (r.member_id = v_member_id or r.related_member_id = v_member_id)
  limit 1;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Grants (never expose to anon)
-- ----------------------------------------------------------------------------
revoke all on function public.set_spouse_anniversary(uuid, date) from public;
revoke all on function public.get_my_anniversary()                from public;

grant execute on function public.set_spouse_anniversary(uuid, date) to authenticated;
grant execute on function public.get_my_anniversary()                to authenticated;

commit;
