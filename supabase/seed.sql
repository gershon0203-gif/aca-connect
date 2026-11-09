-- =============================================================================
-- ACA Connect — seed data (DEVELOPMENT ONLY)
-- =============================================================================
-- Run this AFTER the migrations, and only against a non-production project.
-- It mirrors the fabricated records the app ships with in demo mode so a
-- freshly provisioned project looks the same. Replace with real data before
-- going live.
--
--   Option A (CLI):   supabase db reset          -- runs migrations + seed
--   Option B (SQL):   paste this file into the Supabase SQL editor
--
-- This file does NOT create auth users (that requires the Auth service).
-- Create the first administrator through the dashboard (Authentication → Users),
-- then run the "promote" block at the bottom of this file.
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Families
-- ----------------------------------------------------------------------------
insert into public.families (code, name, address)
values
  ('FAM-001', 'Selvakumar Family', '14 Church Street, Pozhichalur'),
  ('FAM-002', 'Daniel Family',     '22 Kovil Pathai, Pozhichalur'),
  ('FAM-003', 'Raj Family',        '5 Nehru Nagar, Pozhichalur'),
  ('FAM-004', 'Rani Family',       '9 Temple View, Pozhichalur'),
  ('FAM-005', 'Newton Family',     '3 Cantonment Road, Pozhichalur'),
  ('FAM-006', 'Bharath Family',    '71 Sastri Nagar, Pozhichalur')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Members
-- ----------------------------------------------------------------------------
insert into public.members (
  member_code, first_name, last_name, email, phone, gender, date_of_birth,
  marital_status, address, city, joined_at, status, membership_role,
  ministries, baptism_status, avatar_url, notes
)
values
  ('ACA-0001', 'Arul', 'Selvakumar', 'arul.selvakumar@example.com', '+91 98400 11223', 'male',   '1978-04-12', 'married',  '14 Church Street, Pozhichalur',   'Chennai', '2011-06-19', 'active',      'elder',           array['Worship','Pastoral Care'],       'baptised',     null, 'Coordinates the Sunday evening prayer meeting.'),
  ('ACA-0002', 'Mercy', 'Daniel',     'mercy.daniel@example.com',   '+91 98410 22334', 'female', '1985-09-02', 'married',  '22 Kovil Pathai, Pozhichalur',    'Chennai', '2014-01-05', 'active',      'ministry-leader', array['Sunday School','Women''s Fellowship'], 'baptised', null, null),
  ('ACA-0003', 'Joseph', 'Raj',       'joseph.raj@example.com',     '+91 99620 33445', 'male',   '1992-11-21', 'single',   '5 Nehru Nagar, Pozhichalur',      'Chennai', '2019-08-11', 'active',      'deacon',          array['Youth','Media'],                 'baptised',     null, null),
  ('ACA-0004', 'Esther', 'Williams',  'esther.williams@example.com','+91 90030 44556', 'female', '1966-02-14', 'widowed',  '88 Bazaar Road, Pozhichalur',     'Chennai', '1998-03-22', 'active',      'member',          array['Hospitality'],                   'baptised',     null, null),
  ('ACA-0005', 'Samuel', 'Prakash',   'samuel.prakash@example.com', '+91 98400 55667', 'male',   '2001-07-30', 'single',   '31 Anna Salai, Pozhichalur',      'Chennai', '2024-02-18', 'new',         'member',          array['Youth'],                         'not-baptised', null, null),
  ('ACA-0006', 'Grace', 'Rani',       'grace.rani@example.com',     '+91 98840 66778', 'female', '1974-12-08', 'married',  '9 Temple View, Pozhichalur',      'Chennai', '2006-11-02', 'active',      'ministry-leader', array['Choir','Women''s Fellowship'],   'baptised',     null, null),
  ('ACA-0007', 'Daniel', 'Isaac',     'daniel.isaac@example.com',   '+91 99400 77889', 'male',   '1989-05-17', 'married',  '17 Lake Bund Road, Pozhichalur',  'Chennai', '2016-09-25', 'inactive',    'member',          array[]::text[],                        'baptised',     null, 'Relocated temporarily for work.'),
  ('ACA-0008', 'Ruth', 'Shanthi',     'ruth.shanthi@example.com',   '+91 95000 88990', 'female', '1996-03-25', 'single',   '44 Gandhi Nagar, Pozhichalur',    'Chennai', '2021-04-04', 'active',      'member',          array['Media','Youth'],                 'not-baptised', null, null),
  ('ACA-0009', 'Isaac', 'Newton',     'isaac.newton@example.com',   '+91 98410 99001', 'male',   '1981-10-11', 'married',  '3 Cantonment Road, Pozhichalur',  'Chennai', '2009-07-14', 'active',      'deacon',          array['Ushering','Worship'],            'baptised',     null, null),
  ('ACA-0010', 'Priscilla', 'Jebakumari', 'priscilla.j@example.com','+91 90800 10112', 'female', '1959-01-19', 'widowed',  '62 Market Lane, Pozhichalur',     'Chennai', '1991-05-30', 'active',      'member',          array['Intercession'],                  'baptised',     null, null),
  ('ACA-0011', 'Timothy', 'Bharath',  'timothy.bharath@example.com','+91 99620 11223','male',   '1998-08-06', 'single',   '71 Sastri Nagar, Pozhichalur',    'Chennai', '2020-12-06', 'active',      'member',          array['Media'],                         'not-baptised', null, null),
  ('ACA-0012', 'Lydia', 'Kumari',     'lydia.kumari@example.com',   '+91 98840 12234', 'female', '1994-06-28', 'married',  '28 Bharathi Street, Pozhichalur', 'Chennai', '2018-03-18', 'transferred', 'member',          array['Sunday School'],                 'baptised',     null, 'Transferred to ACA Tambaram congregation.')
on conflict (member_code) do nothing;

-- ----------------------------------------------------------------------------
-- Household links (resolve human codes to UUIDs)
-- ----------------------------------------------------------------------------
insert into public.family_members (family_id, member_id, is_primary)
select f.id, m.id, true
from (values
  ('ACA-0001', 'FAM-001'),
  ('ACA-0002', 'FAM-002'),
  ('ACA-0003', 'FAM-003'),
  ('ACA-0006', 'FAM-004'),
  ('ACA-0007', 'FAM-002'),
  ('ACA-0009', 'FAM-005'),
  ('ACA-0011', 'FAM-006'),
  ('ACA-0012', 'FAM-004')
) as link(member_code, family_code)
join public.members  m on m.member_code = link.member_code
join public.families f on f.code        = link.family_code
on conflict (family_id, member_id) do nothing;

commit;

-- =============================================================================
-- Promote the first administrator
-- -----------------------------------------------------------------------------
-- 1. Create the user in Authentication → Users (e.g. pastor@acapozhichalur.org).
-- 2. Uncomment and run:
--
--   insert into public.user_roles (user_id, role, status)
--   values (
--     (select id from auth.users where email = 'pastor@acapozhichalur.org'),
--     'super_admin', 'active'
--   )
--   on conflict (user_id) do update
--     set role = 'super_admin', status = 'active';
--
-- 3. Optionally seed the profile display name:
--
--   update public.profiles
--      set full_name = 'Rev. Christopher Jeyaraj'
--    where id = (select id from auth.users where email = 'pastor@acapozhichalur.org');
-- =============================================================================
