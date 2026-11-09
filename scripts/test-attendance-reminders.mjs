// Comprehensive live test for the attendance-reminder workflow.
// Uses disposable test users/members/sessions and cleans everything up.
//
// Run with:
//   $env:SUPABASE_SERVICE_ROLE_KEY = "..."   # never commit this
//   $env:SUPABASE_ANON_KEY = "..."
//   node scripts/test-attendance-reminders.mjs
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SB_URL = process.env.SUPABASE_URL ?? 'https://yujyxdrznbkkbxvhwzey.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
if (!SERVICE || !ANON) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY before running this test.');
  process.exit(1);
}

const admin = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = 'ReproPass-1234!';
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
function code() {
  return 'ACA-9' + String(Math.floor(Math.random() * 900) + 100);
}
async function makeUser(role) {
  const email = `${role}-${randomUUID().slice(0, 8)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  const uid = data.user.id;
  const { error: roleErr } = await admin.from('user_roles').upsert({ user_id: uid, role, status: 'active' }, { onConflict: 'user_id' });
  if (roleErr) throw new Error('user_roles: ' + roleErr.message);
  const client = createClient(SB_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: signIn, error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) throw new Error('signIn: ' + signInErr.message);
  return { uid, email, token: signIn.session.access_token, client };
}
async function makeMember(uid, label) {
  const memberCode = code();
  const { data, error } = await admin
    .from('members')
    .insert({ member_code: memberCode, first_name: label, last_name: 'Test', user_id: uid, status: 'active' })
    .select('id')
    .single();
  if (error) throw new Error('member insert: ' + error.message);
  return data.id;
}
async function invoke(token, body) {
  const resp = await fetch(SB_URL + '/functions/v1/send-push-notification', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { status: resp.status, body: parsed ?? text };
}

const sa = await makeUser('super_admin');
const m1 = await makeUser('member');
const m2 = await makeUser('member');
const m3 = await makeUser('member');
const member1 = await makeMember(m1.uid, 'Absent');
const member2 = await makeMember(m2.uid, 'Present');
const member3 = await makeMember(m3.uid, 'NoDevice');
await admin.from('device_tokens').insert([
  { member_id: member1, token: 'fake-token-absent-' + randomUUID().slice(0, 6), platform: 'android', is_active: true },
  { member_id: member2, token: 'fake-token-present-' + randomUUID().slice(0, 6), platform: 'android', is_active: true },
]);

const today = new Date().toISOString().slice(0, 10);
const suffix = randomUUID().slice(0, 6);
async function createSession(service, records, finalize = true) {
  const { data: sid, error } = await sa.client.rpc('admin_create_attendance_session', { p_date: today, p_service: service });
  if (error) throw new Error('create session: ' + error.message);
  const { error: saveErr } = await sa.client.rpc('admin_save_attendance', { p_session_id: sid, p_records: records });
  if (saveErr) throw new Error('save attendance: ' + saveErr.message);
  if (finalize) {
    const { error: finErr } = await sa.client.rpc('admin_finalize_attendance', { p_session_id: sid });
    if (finErr) throw new Error('finalize: ' + finErr.message);
  }
  return sid;
}

const sessionS = await createSession('Test Reminder ' + suffix, [
  { member_id: member1, status: 'absent' },
  { member_id: member2, status: 'present' },
]);
const draftS = await createSession('Test Draft ' + suffix, [
  { member_id: member1, status: 'absent' },
], false);
const emptyS = await createSession('Test NoAbsent ' + suffix, [
  { member_id: member2, status: 'present' },
]);
const noDeviceS = await createSession('Test NoDevice ' + suffix, [
  { member_id: member3, status: 'absent' },
]);

// A. normal member cannot send
const a = await invoke(m1.token, {
  notification_type: 'attendance_reminder', session_id: sessionS, title: 'T', message: 'M',
});
check('Normal member is rejected (403)', a.status === 403 && /super_admin/i.test(a.body?.error ?? ''), `${a.status} ${a.body?.error ?? ''}`);

// B. invalid session
const b = await invoke(sa.token, {
  notification_type: 'attendance_reminder', session_id: '00000000-0000-0000-0000-000000000000', title: 'T', message: 'M',
});
check('Invalid session rejected (404)', b.status === 404, `${b.status} ${b.body?.error ?? ''}`);

// B2. malformed session id
const b2 = await invoke(sa.token, {
  notification_type: 'attendance_reminder', session_id: 'not-a-uuid', title: 'T', message: 'M',
});
check('Malformed session ID rejected (400)', b2.status === 400 && /valid UUID/i.test(b2.body?.error ?? ''), `${b2.status} ${b2.body?.error ?? ''}`);

// C. draft session
const c = await invoke(sa.token, {
  notification_type: 'attendance_reminder', session_id: draftS, title: 'T', message: 'M',
});
check('Draft session rejected (400)', c.status === 400 && /complete/i.test(c.body?.error ?? ''), `${c.status} ${c.body?.error ?? ''}`);

// D. session with no absentees
const d = await invoke(sa.token, {
  notification_type: 'attendance_reminder', session_id: emptyS, title: 'T', message: 'M',
});
check('Session with no absentees rejected (400)', d.status === 400 && /no members marked absent/i.test(d.body?.error ?? ''), `${d.status} ${d.body?.error ?? ''}`);

// E. present member excluded even when the client asks for them
const e = await invoke(sa.token, {
  notification_type: 'attendance_reminder', session_id: sessionS, member_ids: [member1, member2], title: 'T', message: 'M',
});
check('Present member excluded from recipients', e.status === 200 && e.body?.recipients === 1 && e.body?.total_devices === 1, `${e.status} recipients=${e.body?.recipients} devices=${e.body?.total_devices}`);
check('Invalid device reported as invalid_token (not 500)', e.status === 200 && e.body?.invalid_tokens === 1, JSON.stringify(e.body?.results));

const { data: notifRows } = await admin
  .from('notifications')
  .select('id, user_id')
  .eq('type', 'attendance_reminder')
  .eq('reference_id', sessionS);
check('In-app notification created only for the absent member', (notifRows ?? []).length === 1 && notifRows[0].user_id === m1.uid, `rows=${(notifRows ?? []).length}`);

// F. no registered devices still creates the in-app notification
const f = await invoke(sa.token, {
  notification_type: 'attendance_reminder', session_id: noDeviceS, title: 'T', message: 'M',
});
check('No-device recipient handled cleanly', f.status === 200 && f.body?.skipped === 'no registered devices' && f.body?.recipients === 1, `${f.status} ${JSON.stringify(f.body)}`);
const { data: notif3 } = await admin
  .from('notifications').select('id').eq('user_id', m3.uid).eq('reference_id', noDeviceS).maybeSingle();
check('In-app notification created for no-device recipient', !!notif3, notif3?.id ?? 'missing');

// G. retry skips devices that already received the push
// The fake token was correctly deactivated as invalid in test E; reactivate it
// so this test isolates the "already delivered" retry behaviour.
const { data: token1 } = await admin.from('device_tokens').select('token').eq('member_id', member1).single();
if (token1) {
  await admin.from('device_tokens').update({ is_active: true }).eq('member_id', member1);
}
const notif1 = notifRows?.[0];
if (notif1 && token1) {
  await admin.from('push_send_logs').insert({
    recipient_user: m1.uid, notification_id: notif1.id, type: 'attendance_reminder',
    status: 'sent', device_token: token1.token, error_message: null,
  });
}
const g = await invoke(sa.token, {
  notification_type: 'attendance_reminder', session_id: sessionS, title: 'T', message: 'M',
});
check('Retry skips already-delivered device', g.status === 200 && g.body?.already_sent === 1 && g.body?.sent === 0 && g.body?.failed === 0, `${g.status} ${JSON.stringify(g.body)}`);

// H. resend refreshes, never duplicates, the in-app notification
const { data: notifRows2 } = await admin
  .from('notifications').select('id').eq('type', 'attendance_reminder').eq('reference_id', sessionS);
check('In-app notification de-duplicated on resend', (notifRows2 ?? []).length === 1, `rows=${(notifRows2 ?? []).length}`);

// I. missing title validation
const i = await invoke(sa.token, {
  notification_type: 'attendance_reminder', session_id: sessionS, message: 'M',
});
check('Missing title rejected (400)', i.status === 400 && /title/i.test(i.body?.error ?? ''), `${i.status} ${i.body?.error ?? ''}`);

// J. unauthenticated call rejected
const j = await fetch(SB_URL + '/functions/v1/send-push-notification', {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ notification_type: 'attendance_reminder', session_id: sessionS, title: 'T', message: 'M' }),
});
check('Unauthenticated call rejected (401)', j.status === 401, String(j.status));

// cleanup
const sessionIds = [sessionS, draftS, emptyS, noDeviceS];
await admin.from('notifications').delete().in('user_id', [m1.uid, m2.uid, m3.uid]);
await admin.from('push_send_logs').delete().in('recipient_user', [m1.uid, m2.uid, m3.uid]);
await admin.from('attendance_records').delete().in('session_id', sessionIds);
await admin.from('attendance_sessions').delete().in('id', sessionIds);
await admin.from('members').delete().in('id', [member1, member2, member3]);
await admin.from('user_roles').delete().in('user_id', [sa.uid, m1.uid, m2.uid, m3.uid]);
for (const u of [sa, m1, m2, m3]) await admin.auth.admin.deleteUser(u.uid);
console.log('cleanup done');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log('FAILED:', failed.map((r) => r.name).join(', '));
  process.exit(1);
}
