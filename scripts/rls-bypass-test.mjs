// =============================================================================
// ACA Connect — live authorization (RLS) bypass test — two-role model
// =============================================================================
// Proves that the final super_admin / member model and the attendance, prayer
// and notification modules are enforced by the DATABASE, not merely by the UI.
// It creates two throwaway accounts, runs allowed/denied checks through the
// public Supabase API with each account's own JWT, prints a report, then
// deletes everything it created.
//
// Prerequisites
// -------------
//   1. All migrations are applied, INCLUDING
//      `supabase/migrations/20261108000000_attendance_prayer_notifications.sql`
//      (the script exits 2 with a clear message if that one is missing).
//   2. A gitignored `.env.test.local` exists containing:
//        SUPABASE_URL=<project url>
//        SUPABASE_SERVICE_ROLE_KEY=<service role key>
//      (SUPABASE_URL, or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, is also
//      read from `.env.local` as a fallback for url + anon key.)
//
// Run:  node scripts/rls-bypass-test.mjs
// Exit: 0 when every check passes, 1 otherwise, 2 when configuration or the
//       new migration is missing.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const testEnv = parseEnvFile(join(root, '.env.test.local'))
const localEnv = parseEnvFile(join(root, '.env.local'))

const URL = testEnv.SUPABASE_URL || localEnv.VITE_SUPABASE_URL
const SERVICE_KEY = testEnv.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = localEnv.VITE_SUPABASE_ANON_KEY

if (!URL || !SERVICE_KEY || !ANON_KEY) {
  console.error(
    '\nMissing configuration. Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in\n' +
      '.env.test.local, and VITE_SUPABASE_ANON_KEY in .env.local.\n',
  )
  process.exit(2)
}

const PASSWORD = 'Bypass-Test-' + randomUUID().slice(0, 8)
const MEMBER_CODE = 'ACA-9101'
const MEMBER2_CODE = 'ACA-9102'
const MEMBER3_CODE = 'ACA-9103'
const FAMILY_CODE = 'FAM-RLSATT'
const SESSION_SERVICE = 'RLS Test Service'
const SESSION2_SERVICE = 'RLS Test Hidden'
const PRAYER_CATEGORY = 'RLS Test Category'
const PRAYER_ITEM = 'RLS Test Prayer'
const PRAYER_ITEM2 = 'RLS Test Archived Prayer'

const USERS = {
  super_admin: 'rls-superadmin@acapozhichalur.test',
  member: 'rls-member@acapozhichalur.test',
}

const createdFamilyCodes = []

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const results = []
function record(label, role, ok, detail = '') {
  results.push({ label, role, ok, detail })
  const mark = ok ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${role.padEnd(11)} ${label}${detail ? ` — ${detail}` : ''}`)
}

/** Denied = an error, or a result that exposes no rows. */
function expectDenied(label, role, { data, error }) {
  const leaked = !error && Array.isArray(data) && data.length > 0
  record(label, role, !leaked, error ? `blocked (${error.code ?? 'err'})` : 'no rows')
}

/** Allowed = no error and at least one row. */
function expectAllowed(label, role, { data, error }, predicate = () => true) {
  const ok = !error && Array.isArray(data) && data.length > 0 && predicate(data)
  record(label, role, ok, error ? `unexpected: ${error.message}` : `${data?.length ?? 0} row(s)`)
}

/** The exact row count, as an array result. */
function expectCount(label, role, { data, error }, count) {
  const ok = !error && Array.isArray(data) && data.length === count
  record(label, role, ok, error ? `unexpected: ${error.message}` : `${data?.length ?? 0} row(s)`)
}

async function signIn(email) {
  const client = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return client
}

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers()
  const ids = (data?.users ?? [])
    .filter((u) => Object.values(USERS).includes(u.email))
    .map((u) => u.id)

  await admin.from('attendance_sessions').delete().like('service_name', 'RLS Test%')
  await admin.from('prayer_items').delete().like('title', 'RLS Test%')
  await admin.from('prayer_categories').delete().like('name', 'RLS Test%')

  for (const id of ids) {
    await admin.from('notifications').delete().eq('user_id', id)
    await admin.auth.admin.deleteUser(id)
  }

  // The prayer-reminder RPC broadcasts to every eligible member, which can
  // include real linked accounts in a live project. Remove the exact test
  // notifications so the test never pollutes a real member's inbox.
  await admin
    .from('notifications')
    .delete()
    .in('message', ['Test prayer reminder', 'Member attempt'])

  await admin.from('invitations').delete().like('email', '%@test.local')
  await admin.from('families').delete().eq('code', FAMILY_CODE)
  if (createdFamilyCodes.length) {
    await admin.from('families').delete().in('code', createdFamilyCodes)
  }
  await admin
    .from('members')
    .delete()
    .in('member_code', [MEMBER_CODE, MEMBER2_CODE, MEMBER3_CODE])

  // Audit rows are written by the seed inserts AND by the deletes above, so
  // they must be cleared last — otherwise the live activity feed keeps showing
  // deleted test fixtures.
  await admin
    .from('audit_logs')
    .delete()
    .in('entity_code', [
      MEMBER_CODE,
      MEMBER2_CODE,
      MEMBER3_CODE,
      FAMILY_CODE,
      ...createdFamilyCodes,
    ])
}

async function main() {
  console.log(`\nLive RLS bypass test against ${URL}\n`)

  // Fail loudly, before changing anything, if the new migration is absent.
  const preflight = await admin.from('attendance_sessions').select('id').limit(1)
  if (preflight.error) {
    console.error(
      'The attendance/prayer/notification migration is not applied.\n' +
        'Apply supabase/migrations/20261108000000_attendance_prayer_notifications.sql\n' +
        'in the Supabase SQL editor, then re-run this script.\n' +
        `(${preflight.error.message})\n`,
    )
    // Signal the missing migration with a distinct exit code, without a forced
    // exit while the HTTP client is still closing (that trips a libuv assertion
    // on Windows).
    process.exitCode = 2
    return
  }

  await cleanup()

  // --- seed records + 2 accounts --------------------------------------------
  const { error: familyErr } = await admin
    .from('families')
    .insert({ code: FAMILY_CODE, name: 'Bypass Household' })
  if (familyErr) throw new Error(`seed family: ${familyErr.message}`)

  // `status` must be `active`: the attendance roster and both reminder RPCs
  // deliberately target active member records only (the schema default is
  // `new`).
  const { error: memberErr } = await admin.from('members').insert([
    { member_code: MEMBER_CODE, first_name: 'Bypass', last_name: 'Test', status: 'active' },
    { member_code: MEMBER2_CODE, first_name: 'Bypass', last_name: 'Two', status: 'active' },
    { member_code: MEMBER3_CODE, first_name: 'Bypass', last_name: 'Three', status: 'active' },
  ])
  if (memberErr) throw new Error(`seed members: ${memberErr.message}`)

  const { data: famRow, error: famReadErr } = await admin
    .from('families')
    .select('id')
    .eq('code', FAMILY_CODE)
    .single()
  if (famReadErr) throw new Error(`read family: ${famReadErr.message}`)
  const { data: memRows, error: memReadErr } = await admin
    .from('members')
    .select('id, member_code, user_id')
    .in('member_code', [MEMBER_CODE, MEMBER2_CODE, MEMBER3_CODE])
  if (memReadErr) throw new Error(`read members: ${memReadErr.message}`)

  const memberByCode = new Map((memRows ?? []).map((m) => [m.member_code, m]))
  const memberId = memberByCode.get(MEMBER_CODE)?.id

  const { error: linkFamErr } = await admin.from('family_members').insert(
    (memRows ?? [])
      .filter((m) => m.member_code !== MEMBER3_CODE)
      .map((m) => ({
        family_id: famRow.id,
        member_id: m.id,
        is_primary: true,
        relationship: 'member',
      })),
  )
  if (linkFamErr) throw new Error(`link family: ${linkFamErr.message}`)

  const ids = {}
  for (const [role, email] of Object.entries(USERS)) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`create ${role}: ${error.message}`)
    ids[role] = data.user.id
  }

  for (const [role, id] of Object.entries(ids)) {
    const { error } = await admin
      .from('user_roles')
      .upsert({ user_id: id, role, status: 'active' }, { onConflict: 'user_id' })
    if (error) throw new Error(`grant ${role}: ${error.message}`)
  }

  const clients = {}
  for (const [role, email] of Object.entries(USERS)) {
    clients[role] = await signIn(email)
  }

  // Link the member account to its member record the way a super_admin would.
  const { error: linkErr } = await clients.super_admin
    .from('members')
    .update({ user_id: ids.member })
    .eq('member_code', MEMBER_CODE)
  if (linkErr) throw new Error(`link member: ${linkErr.message}`)

  // --- super_admin -----------------------------------------------------------
  console.log('\nsuper_admin:')
  expectAllowed('read all members', 'super_admin',
    await clients.super_admin.from('members').select('member_code'))
  expectAllowed('read user_roles', 'super_admin',
    await clients.super_admin.from('user_roles').select('user_id'))
  expectAllowed('read audit_logs', 'super_admin',
    await clients.super_admin.from('audit_logs').select('id'))

  const created = await clients.super_admin
    .from('invitations')
    .insert({ email: 'invitee@test.local', role: 'member', member_code: MEMBER_CODE })
    .select('id, token')
    .single()
  record('create an invitation', 'super_admin', !created.error && !!created.data?.token,
    created.error?.message)

  expectAllowed('read invitations', 'super_admin',
    await clients.super_admin.from('invitations').select('id'))

  const reissued = await clients.super_admin.rpc('reissue_invitation', {
    p_invitation_id: created.data?.id,
    p_email: 'corrected@test.local',
  })
  record('reissue invitation (fresh token)', 'super_admin',
    !reissued.error &&
      !!reissued.data?.token &&
      reissued.data.token !== created.data?.token,
    reissued.error?.message)

  // --- families & relationships ----------------------------------------------
  console.log('\nfamilies & relationships:')

  const createdFamily = await clients.super_admin.rpc('create_family', {
    p_name: 'RPC Test Family',
    p_address: '1 Test Street',
  })
  const rpcFamilyCode = createdFamily.data?.code
  if (rpcFamilyCode) createdFamilyCodes.push(rpcFamilyCode)
  record('create_family returns an auto code', 'super_admin',
    !createdFamily.error && /^FAM-[0-9]+$/.test(rpcFamilyCode ?? ''),
    createdFamily.error?.message ?? rpcFamilyCode)

  const add2 = await clients.super_admin.rpc('family_add_member', {
    p_family_code: rpcFamilyCode,
    p_member_code: MEMBER2_CODE,
    p_is_primary: false,
  })
  record('family_add_member links a member', 'super_admin', !add2.error, add2.error?.message)
  const add3 = await clients.super_admin.rpc('family_add_member', {
    p_family_code: rpcFamilyCode,
    p_member_code: MEMBER3_CODE,
    p_is_primary: false,
  })
  record('family_add_member links a second member', 'super_admin', !add3.error, add3.error?.message)

  const setContact = await clients.super_admin.rpc('family_set_primary_contact', {
    p_family_code: rpcFamilyCode,
    p_member_code: MEMBER3_CODE,
  })
  record('family_set_primary_contact (member)', 'super_admin', !setContact.error, setContact.error?.message)
  const badContact = await clients.super_admin.rpc('family_set_primary_contact', {
    p_family_code: rpcFamilyCode,
    p_member_code: MEMBER_CODE,
  })
  record('primary contact must be in the household', 'super_admin', !!badContact.error,
    badContact.error?.code ?? 'unexpected success')

  const famEmbed = await clients.super_admin
    .from('families')
    .select(
      'code, name, address, notes, archived_at, primary_contact_member_id, ' +
        'family_members(count), ' +
        'primary_contact:members!families_primary_contact_member_id_fkey(member_code, first_name, last_name)',
    )
    .eq('code', rpcFamilyCode)
    .maybeSingle()
  record('families list embed resolves', 'super_admin',
    !famEmbed.error && famEmbed.data?.primary_contact?.member_code === MEMBER3_CODE,
    famEmbed.error?.message ?? JSON.stringify(famEmbed.data?.primary_contact))

  const archived = await clients.super_admin
    .from('families')
    .update({ archived_at: new Date().toISOString() })
    .eq('code', rpcFamilyCode)
    .select('code')
  record('archive a family (soft)', 'super_admin',
    !archived.error && archived.data?.length === 1, archived.error?.message)
  await clients.super_admin.from('families').update({ archived_at: null }).eq('code', rpcFamilyCode)

  const pAB = await clients.super_admin.rpc('add_member_relationship', {
    p_member_code: MEMBER_CODE, p_related_code: MEMBER2_CODE, p_type: 'parent',
  })
  record('relationship parent A->B', 'super_admin', !pAB.error, pAB.error?.message)
  const pBC = await clients.super_admin.rpc('add_member_relationship', {
    p_member_code: MEMBER2_CODE, p_related_code: MEMBER3_CODE, p_type: 'parent',
  })
  record('relationship parent B->C', 'super_admin', !pBC.error, pBC.error?.message)
  const pCA = await clients.super_admin.rpc('add_member_relationship', {
    p_member_code: MEMBER3_CODE, p_related_code: MEMBER_CODE, p_type: 'parent',
  })
  record('cycle C->A is rejected', 'super_admin', !!pCA.error,
    pCA.error?.code ?? 'unexpected success')

  const removed = await clients.super_admin.rpc('remove_member_relationship', { p_id: pAB.data?.id })
  record('remove_member_relationship', 'super_admin', !removed.error, removed.error?.message)

  const spouse = await clients.super_admin.rpc('add_member_relationship', {
    p_member_code: MEMBER_CODE, p_related_code: MEMBER2_CODE, p_type: 'spouse',
  })
  record('add_member_relationship (spouse)', 'super_admin',
    !spouse.error && spouse.data?.relationship_type === 'spouse', spouse.error?.message)

  const setAnn = await clients.super_admin.rpc('set_spouse_anniversary', {
    p_relationship_id: spouse.data?.id,
    p_date: '2012-06-15',
  })
  record('super_admin sets a spouse anniversary', 'super_admin', !setAnn.error, setAnn.error?.message)

  const myAnn = await clients.member.rpc('get_my_anniversary')
  record('get_my_anniversary returns own couple', 'member',
    !myAnn.error && myAnn.data?.anniversaryDate === '2012-06-15',
    myAnn.error?.message ?? JSON.stringify(myAnn.data))

  // --- member ----------------------------------------------------------------
  console.log('\nmember:')
  const mine = await clients.member.from('members').select('member_code')
  record('sees ONLY own record', 'member',
    !mine.error && mine.data?.length === 1 && mine.data[0].member_code === MEMBER_CODE,
    `${mine.data?.length ?? 'err'} row(s)`)
  expectAllowed('update own phone', 'member',
    await clients.member
      .from('members')
      .update({ phone: '+91-9000000000' })
      .eq('member_code', MEMBER_CODE)
      .select('member_code'))
  expectDenied('change own protected field (status)', 'member',
    await clients.member
      .from('members')
      .update({ status: 'inactive' })
      .eq('member_code', MEMBER_CODE)
      .select())
  expectDenied('insert a member', 'member',
    await clients.member
      .from('members')
      .insert({ member_code: 'ACA-TESTBYPASS2', first_name: 'x', last_name: 'y' })
      .select())
  expectDenied('read invitations', 'member',
    await clients.member.from('invitations').select('id'))
  expectDenied('read audit_logs', 'member',
    await clients.member.from('audit_logs').select('id'))
  expectDenied('read families', 'member',
    await clients.member.from('families').select('id'))
  expectDenied('read family_members directly', 'member',
    await clients.member.from('family_members').select('family_id'))

  const myFamily = await clients.member.rpc('get_my_family')
  const households = Array.isArray(myFamily.data) ? myFamily.data : []
  record('get_my_family returns own household only', 'member',
    !myFamily.error && households.length === 1 && households[0].members?.length === 2,
    myFamily.error ? myFamily.error.message : `${households.length} household(s)`)
  const familyLeaks = /email|phone|address|date_of_birth|notes/i.test(
    JSON.stringify(myFamily.data ?? ''),
  )
  record('get_my_family exposes no contact fields', 'member', !familyLeaks)

  expectDenied('read other users\' roles', 'member',
    await clients.member.from('user_roles').select('user_id').neq('user_id', ids.member))
  expectDenied('grant itself a role', 'member',
    await clients.member
      .from('user_roles')
      .upsert({ user_id: ids.member, role: 'super_admin' }, { onConflict: 'user_id' })
      .select())

  // --- attendance ------------------------------------------------------------
  console.log('\nattendance:')

  const today = new Date().toISOString().slice(0, 10)
  const session = await clients.super_admin.rpc('admin_create_attendance_session', {
    p_date: today,
    p_service: SESSION_SERVICE,
  })
  const sessionId = session.data
  record('super_admin creates a session', 'super_admin', !session.error && !!sessionId,
    session.error?.message)

  const duplicate = await clients.super_admin.rpc('admin_create_attendance_session', {
    p_date: today,
    p_service: SESSION_SERVICE,
  })
  record('duplicate day/service session is rejected', 'super_admin', !!duplicate.error,
    duplicate.error?.code ?? 'unexpected success')

  // Member 1 is absent (and is the linked account), member 2 is present.
  const saved = await clients.super_admin.rpc('admin_save_attendance', {
    p_session_id: sessionId,
    p_records: [
      { member_id: memberId, status: 'absent' },
      { member_id: memberByCode.get(MEMBER2_CODE)?.id, status: 'present' },
    ],
  })
  record('super_admin saves the sheet', 'super_admin', !saved.error && saved.data === 2,
    saved.error?.message ?? `${saved.data} record(s)`)

  const emptySheet = await clients.super_admin
    .from('attendance_records')
    .select('id')
    .eq('session_id', sessionId)
  expectCount('sheet has exactly two records', 'super_admin', emptySheet, 2)

  const memberSessions = await clients.member
    .from('attendance_sessions')
    .select('id, service_name')
  record('member sees only sessions they appear in', 'member',
    !memberSessions.error &&
      memberSessions.data?.length === 1 &&
      memberSessions.data[0].service_name === SESSION_SERVICE,
    memberSessions.error?.message ?? `${memberSessions.data?.length ?? 0} session(s)`)

  const memberRecords = await clients.member
    .from('attendance_records')
    .select('member_id, status, session_id')
  record('member sees only own attendance record', 'member',
    !memberRecords.error &&
      memberRecords.data?.length === 1 &&
      memberRecords.data[0].member_id === memberId &&
      memberRecords.data[0].status === 'absent',
    memberRecords.error?.message ?? `${memberRecords.data?.length ?? 0} row(s)`)

  const otherRecords = await clients.member
    .from('attendance_records')
    .select('id')
    .eq('member_id', memberByCode.get(MEMBER2_CODE)?.id)
  expectCount('member cannot read another member\'s rows', 'member', otherRecords, 0)

  expectDenied('member cannot write attendance records', 'member',
    await clients.member
      .from('attendance_records')
      .update({ status: 'present' })
      .eq('session_id', sessionId)
      .select())

  const memberCreate = await clients.member.rpc('admin_create_attendance_session', {
    p_date: today,
    p_service: 'Member Attempt',
  })
  record('member cannot create a session', 'member', !!memberCreate.error,
    memberCreate.error?.code ?? 'unexpected success')

  const memberSave = await clients.member.rpc('admin_save_attendance', {
    p_session_id: sessionId,
    p_records: [{ member_id: memberId, status: 'present' }],
  })
  record('member cannot save a sheet', 'member', !!memberSave.error,
    memberSave.error?.code ?? 'unexpected success')

  const memberFinalize = await clients.member.rpc('admin_finalize_attendance', {
    p_session_id: sessionId,
  })
  record('member cannot complete a session', 'member', !!memberFinalize.error,
    memberFinalize.error?.code ?? 'unexpected success')

  const reminderTooEarly = await clients.super_admin.rpc(
    'admin_send_attendance_reminders',
    {
      p_session_id: sessionId,
      p_member_ids: [memberId],
      p_title: 'We missed you',
      p_message: 'Test reminder',
    },
  )
  record('reminders need a completed session', 'super_admin', !!reminderTooEarly.error,
    reminderTooEarly.error?.code ?? 'unexpected success')

  const finalized = await clients.super_admin.rpc('admin_finalize_attendance', {
    p_session_id: sessionId,
  })
  record('super_admin completes the session', 'super_admin', !finalized.error,
    finalized.error?.message)

  const sentAttendance = await clients.super_admin.rpc(
    'admin_send_attendance_reminders',
    {
      p_session_id: sessionId,
      p_member_ids: [memberId],
      p_title: 'We missed you',
      p_message: 'Test attendance reminder',
    },
  )
  record('attendance reminder reaches the linked absent member', 'super_admin',
    !sentAttendance.error && sentAttendance.data === 1,
    sentAttendance.error?.message ?? `${sentAttendance.data} sent`)

  const resentAttendance = await clients.super_admin.rpc(
    'admin_send_attendance_reminders',
    {
      p_session_id: sessionId,
      p_member_ids: [memberId],
      p_title: 'We missed you (updated)',
      p_message: 'Updated attendance reminder',
    },
  )
  record('resending refreshes instead of duplicating', 'super_admin',
    !resentAttendance.error && resentAttendance.data === 1,
    resentAttendance.error?.message ?? `${resentAttendance.data} sent`)

  const attendanceInbox = await clients.member
    .from('notifications')
    .select('id, type, title')
    .eq('type', 'attendance_reminder')
  expectCount('member has exactly one attendance reminder', 'member', attendanceInbox, 1)

  // A second, draft session must stay invisible to the member.
  const hidden = await clients.super_admin.rpc('admin_create_attendance_session', {
    p_date: today,
    p_service: SESSION2_SERVICE,
  })
  record('super_admin creates a second draft session', 'super_admin',
    !hidden.error && !!hidden.data, hidden.error?.message)
  const memberSessions2 = await clients.member
    .from('attendance_sessions')
    .select('id')
  record('member still sees only their own session', 'member',
    !memberSessions2.error && memberSessions2.data?.length === 1,
    memberSessions2.error?.message ?? `${memberSessions2.data?.length ?? 0} session(s)`)

  const memberReport = await clients.member
    .from('attendance_records')
    .select('session_id, status, attendance_sessions!inner(session_date, service_name, status)')
    .eq('attendance_sessions.status', 'completed')
  record('member attendance report resolves', 'member',
    !memberReport.error && memberReport.data?.length === 1,
    memberReport.error?.message ?? `${memberReport.data?.length ?? 0} row(s)`)

  // --- prayer ----------------------------------------------------------------
  console.log('\nprayer:')

  const category = await clients.super_admin
    .from('prayer_categories')
    .insert({ name: PRAYER_CATEGORY, description: 'RLS test category' })
    .select('id')
    .single()
  record('super_admin creates a category', 'super_admin', !category.error && !!category.data?.id,
    category.error?.message)

  const item = await clients.super_admin
    .from('prayer_items')
    .insert({ category_id: category.data?.id, title: PRAYER_ITEM })
    .select('id, status')
    .single()
  record('super_admin creates a prayer', 'super_admin', !item.error && !!item.data?.id,
    item.error?.message)

  const archivedItem = await clients.super_admin
    .from('prayer_items')
    .insert({ category_id: category.data?.id, title: PRAYER_ITEM2, status: 'archived' })
    .select('id')
    .single()

  const memberCategories = await clients.member
    .from('prayer_categories')
    .select('id, name')
  expectAllowed('member reads active categories', 'member', memberCategories,
    (rows) => rows.every((row) => row.name !== 'RLS Test Hidden Category'))

  // An archived category must hide its (still active) prayers from members.
  const hiddenCategory = await clients.super_admin
    .from('prayer_categories')
    .insert({ name: 'RLS Test Hidden Category' })
    .select('id')
    .single()
  const hiddenItem = await clients.super_admin
    .from('prayer_items')
    .insert({ category_id: hiddenCategory.data?.id, title: 'RLS Test Hidden Prayer' })
    .select('id')
    .single()
  await clients.super_admin
    .from('prayer_categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', hiddenCategory.data?.id)

  const memberHiddenCategories = await clients.member
    .from('prayer_categories')
    .select('id')
    .eq('id', hiddenCategory.data?.id)
  expectCount('archived category is hidden from members', 'member', memberHiddenCategories, 0)

  const memberHiddenItems = await clients.member
    .from('prayer_items')
    .select('id')
    .eq('category_id', hiddenCategory.data?.id)
  expectCount('archived category hides its prayers', 'member', memberHiddenItems, 0)
  record('super_admin creates a prayer in the hidden category', 'super_admin',
    !hiddenItem.error && !!hiddenItem.data?.id, hiddenItem.error?.message)

  const memberItems = await clients.member
    .from('prayer_items')
    .select('title, status')
    .eq('category_id', category.data?.id)
  record('member sees active prayers only', 'member',
    !memberItems.error &&
      memberItems.data?.length === 1 &&
      memberItems.data[0].title === PRAYER_ITEM &&
      !memberItems.data.some((row) => row.title === PRAYER_ITEM2),
    memberItems.error?.message ?? `${memberItems.data?.length ?? 0} row(s)`)

  expectDenied('member cannot create a category', 'member',
    await clients.member
      .from('prayer_categories')
      .insert({ name: 'Member Attempt' })
      .select())
  expectDenied('member cannot edit a prayer', 'member',
    await clients.member
      .from('prayer_items')
      .update({ title: 'Changed' })
      .eq('id', item.data?.id)
      .select())
  expectDenied('member cannot archive a category', 'member',
    await clients.member
      .from('prayer_categories')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', category.data?.id)
      .select())

  const { data: linkedMembers } = await admin
    .from('members')
    .select('user_id')
    .eq('status', 'active')
    .not('user_id', 'is', null)
  const linkedUserIds = [...new Set((linkedMembers ?? []).map((m) => m.user_id))]
  const { data: linkedRoles } = await admin
    .from('user_roles')
    .select('user_id')
    .in('user_id', linkedUserIds)
    .eq('role', 'member')
    .eq('status', 'active')
  const prayerAudience = new Set((linkedRoles ?? []).map((r) => r.user_id)).size

  const sentPrayer = await clients.super_admin.rpc('admin_send_prayer_reminder', {
    p_item_id: item.data?.id,
    p_title: 'Prayer reminder',
    p_message: 'Test prayer reminder',
  })
  record('prayer reminder reaches every linked member', 'super_admin',
    !sentPrayer.error && sentPrayer.data === prayerAudience,
    sentPrayer.error?.message ?? `${sentPrayer.data} sent (expected ${prayerAudience})`)

  const memberSendPrayer = await clients.member.rpc('admin_send_prayer_reminder', {
    p_item_id: item.data?.id,
    p_title: 'Member attempt',
    p_message: 'Should be blocked',
  })
  record('member cannot send prayer reminders', 'member', !!memberSendPrayer.error,
    memberSendPrayer.error?.code ?? 'unexpected success')

  const archivedReminder = await clients.super_admin.rpc('admin_send_prayer_reminder', {
    p_item_id: archivedItem.data?.id,
    p_title: 'Archived prayer',
    p_message: 'Should be blocked',
  })
  record('archived prayer cannot be sent', 'super_admin', !!archivedReminder.error,
    archivedReminder.error?.code ?? 'unexpected success')

  // --- notifications ----------------------------------------------------------
  console.log('\nnotifications:')

  const inbox = await clients.member.from('notifications').select('id, type, is_read')
  record('member inbox holds both reminders', 'member',
    !inbox.error &&
      inbox.data?.length === 2 &&
      new Set(inbox.data.map((row) => row.type)).size === 2,
    inbox.error?.message ?? `${inbox.data?.length ?? 0} row(s)`)

  const adminInbox = await clients.member
    .from('notifications')
    .select('id')
    .eq('user_id', ids.super_admin)
  expectCount('member cannot read the super_admin inbox', 'member', adminInbox, 0)

  expectDenied('member cannot insert a notification', 'member',
    await clients.member
      .from('notifications')
      .insert({
        user_id: ids.member,
        type: 'prayer_reminder',
        title: 'Forged',
        message: 'Forged by the client',
      })
      .select())

  const notifId = inbox.data?.[0]?.id
  const markOne = await clients.member
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notifId)
    .select('id, is_read')
  record('member marks own notification read', 'member',
    !markOne.error && markOne.data?.[0]?.is_read === true, markOne.error?.message)

  expectDenied('member cannot edit a notification body', 'member',
    await clients.member
      .from('notifications')
      .update({ title: 'Tampered' })
      .eq('id', notifId)
      .select())

  const markAll = await clients.member.rpc('mark_all_notifications_read')
  record('mark_all_notifications_read marks the inbox', 'member',
    !markAll.error && markAll.data === 1,
    markAll.error?.message ?? `${markAll.data} updated`)

  const afterMarkAll = await clients.member
    .from('notifications')
    .select('id')
    .eq('is_read', false)
  expectCount('member inbox is fully read', 'member', afterMarkAll, 0)

  expectAllowed('super_admin reads delivery history', 'super_admin',
    await clients.super_admin.from('notifications').select('id'))

  // --- anon -------------------------------------------------------------------
  console.log('\nanon (no session):')
  const anon = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  expectDenied('read members', 'anon', await anon.from('members').select('member_code'))
  expectDenied('insert a member', 'anon',
    await anon
      .from('members')
      .insert({ member_code: 'ACA-TESTBYPASS3', first_name: 'x', last_name: 'y' })
      .select())
  expectDenied('read attendance sessions', 'anon',
    await anon.from('attendance_sessions').select('id'))
  expectDenied('read attendance records', 'anon',
    await anon.from('attendance_records').select('id'))
  expectDenied('read prayer categories', 'anon',
    await anon.from('prayer_categories').select('id'))
  expectDenied('read notifications', 'anon',
    await anon.from('notifications').select('id'))

  await cleanup()

  const failed = results.filter((r) => !r.ok)
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed.` +
      (failed.length ? ` ${failed.length} FAILED.` : ' All enforcement verified.') +
      '\n',
  )
  process.exitCode = failed.length ? 1 : 0
}

main().catch(async (error) => {
  console.error('\nTest harness error:', error.message)
  try {
    await cleanup()
  } catch {
    // best effort
  }
  process.exitCode = 1
})
