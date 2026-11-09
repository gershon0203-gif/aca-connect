-- =============================================================================
-- ACA Connect — 20261112000000 · Atomic member_code generation
-- =============================================================================
-- Replaces frontend-derived codes with a database sequence so concurrent
-- registrations can never collide. Existing codes are preserved; the sequence
-- starts after the highest existing ACA-#### code.
-- =============================================================================

begin;

create sequence if not exists public.member_code_seq;

do $$
declare
  m integer;
begin
  select coalesce(max((regexp_replace(member_code, '^ACA-', ''))::integer), 0)
    into m
  from public.members
  where member_code ~ '^ACA-[0-9]+$';

  if m = 0 then
    perform setval('public.member_code_seq', 1, false);
  else
    perform setval('public.member_code_seq', m, true);
  end if;
end
$$;

create or replace function public.next_member_code()
returns text
language sql
security definer
set search_path = public
as $$
  select 'ACA-' || lpad(nextval('public.member_code_seq')::text, 4, '0');
$$;

-- Use the sequence as the column default so even a client that omits the code
-- gets a unique value.
alter table public.members
  alter column member_code set default public.next_member_code();

revoke all on function public.next_member_code() from public;
grant execute on function public.next_member_code() to authenticated;

commit;
