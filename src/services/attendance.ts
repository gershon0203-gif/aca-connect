import { getSupabaseClient, isDemoMode, RPC, TABLES } from '@/lib/supabase'
import { delay } from './latency'
import * as demo from './demo-store'
import type {
  AttendanceMemberRow,
  AttendanceSession,
  AttendanceSessionDetail,
  AttendanceStatus,
  MyAttendanceRecord,
  MyAttendanceSummary,
} from '@/types'

/**
 * Attendance data access
 * ======================
 *
 * Super-admin paths go through the SECURITY DEFINER RPCs in
 * `20261108000000_attendance_prayer_notifications.sql`; the database re-checks
 * the trusted role, so a tampered client cannot create or edit attendance.
 *
 * The member report reads `attendance_records` directly, but Row Level Security
 * restricts every row to `member_id = current_member_id()`. No client-supplied
 * member id is ever sent, so URL or state manipulation cannot widen the result.
 */

export const DEFAULT_ATTENDANCE_REMINDER =
  "Hi! We missed you at today's church gathering. We hope everything is well. " +
  'We look forward to seeing you at our next gathering. God bless you!'

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

interface AttendanceRecordRow {
  member_id?: string
  status: AttendanceStatus
}

interface AttendanceSessionRow {
  id: string
  session_date: string
  service_name: string
  status: AttendanceSession['status']
  notes: string | null
  created_at: string
  updated_at: string
  attendance_records?: AttendanceRecordRow[]
}

interface AttendanceMemberSourceRow {
  id: string
  member_code: string
  first_name: string
  last_name: string
  user_id: string | null
}

function mapSession(row: AttendanceSessionRow): AttendanceSession {
  const records = row.attendance_records ?? []
  return {
    id: row.id,
    date: String(row.session_date).slice(0, 10),
    serviceName: row.service_name,
    status: row.status,
    notes: row.notes ?? undefined,
    recordedCount: records.length,
    presentCount: records.filter((r) => r.status === 'present').length,
    absentCount: records.filter((r) => r.status === 'absent').length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Every attendance session, newest first (super admin only). */
export async function listAttendanceSessions(): Promise<AttendanceSession[]> {
  if (!isLive()) return delay(demo.listDemoAttendanceSessions())
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase
    .from(TABLES.attendanceSessions)
    .select(
      'id, session_date, service_name, status, notes, created_at, updated_at, attendance_records(status)',
    )
    .order('session_date', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as AttendanceSessionRow[]).map(mapSession)
}

/** A session plus every active member's current status (null = unrecorded). */
export async function getAttendanceSession(
  sessionId: string,
): Promise<AttendanceSessionDetail | null> {
  if (!isLive()) return delay(demo.findDemoAttendanceSession(sessionId))

  const supabase = getSupabaseClient()!
  const { data: sessionRow, error: sessionError } = await supabase
    .from(TABLES.attendanceSessions)
    .select(
      'id, session_date, service_name, status, notes, created_at, updated_at',
    )
    .eq('id', sessionId)
    .maybeSingle()
  if (sessionError) throw new Error(sessionError.message)
  if (!sessionRow) return null

  const [recordsResult, membersResult] = await Promise.all([
    supabase
      .from(TABLES.attendanceRecords)
      .select('member_id, status')
      .eq('session_id', sessionId),
    supabase
      .from(TABLES.members)
      .select('id, member_code, first_name, last_name, user_id')
      .eq('status', 'active')
      .order('last_name', { ascending: true }),
  ])
  if (recordsResult.error) throw new Error(recordsResult.error.message)
  if (membersResult.error) throw new Error(membersResult.error.message)

  const records = new Map(
    ((recordsResult.data ?? []) as AttendanceRecordRow[]).map((row) => [
      String(row.member_id),
      row.status,
    ]),
  )

  const rows: AttendanceMemberRow[] = (
    (membersResult.data ?? []) as AttendanceMemberSourceRow[]
  )
    .map((member) => ({
      memberId: String(member.id),
      memberCode: member.member_code,
      firstName: member.first_name,
      lastName: member.last_name,
      status: records.get(String(member.id)) ?? null,
      hasAccount: Boolean(member.user_id),
    }))
    .sort((a, b) =>
      `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
    )

  return {
    session: mapSession(sessionRow as unknown as AttendanceSessionRow),
    rows,
  }
}

/** Create a draft session for a date + service (super admin). */
export async function createAttendanceSession(
  date: string,
  serviceName: string,
): Promise<string> {
  if (!isLive()) {
    return delay(demo.createDemoAttendanceSession(date, serviceName))
  }
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.rpc(
    RPC.adminCreateAttendanceSession,
    { p_date: date, p_service: serviceName },
  )
  if (error) throw new Error(error.message)
  return String(data)
}

/**
 * Persist the whole sheet. Rows with `status = null` are deliberately omitted,
 * so an unrecorded member stays unrecorded instead of becoming absent.
 */
export async function saveAttendance(
  sessionId: string,
  rows: AttendanceMemberRow[],
): Promise<number> {
  const records = rows
    .filter(
      (row): row is AttendanceMemberRow & { status: AttendanceStatus } =>
        row.status !== null,
    )
    .map((row) => ({ member_id: row.memberId, status: row.status }))

  if (!isLive()) {
    return delay(demo.saveDemoAttendance(sessionId, records.map((r) => ({
      memberId: r.member_id,
      status: r.status,
    }))))
  }

  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.rpc(RPC.adminSaveAttendance, {
    p_session_id: sessionId,
    p_records: records,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

/** Mark a session complete (super admin). */
export async function finalizeAttendanceSession(
  sessionId: string,
): Promise<void> {
  if (!isLive()) {
    demo.finalizeDemoAttendance(sessionId)
    return delay(undefined)
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase.rpc(RPC.adminFinalizeAttendance, {
    p_session_id: sessionId,
  })
  if (error) throw new Error(error.message)
}

/**
 * Send attendance reminders (in-app + push) to selected absent members.
 * Only completed sessions, only members actually marked absent, and only
 * active linked member accounts are eligible — all re-checked inside the
 * database and inside the send-push-notification Edge Function.
 *
 * The Edge Function creates the in-app notifications (via the existing RPCs,
 * which de-duplicate per recipient/session) AND sends FCM push notifications
 * to each recipient's registered devices.
 */
export async function sendAttendanceReminders(
  sessionId: string,
  memberIds: string[],
  title: string,
  message: string,
): Promise<{
  sent: number
  failed: number
  alreadySent: number
  recipients: number
  skipped?: string
}> {
  if (!isLive()) {
    return delay({
      sent: demo.sendDemoAttendanceReminders(),
      failed: 0,
      alreadySent: 0,
      recipients: memberIds.length,
    })
  }
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      notification_type: 'attendance_reminder',
      session_id: sessionId,
      member_ids: memberIds,
      title,
      message,
    },
  })
  if (error) {
    // Supabase functions.invoke puts the real backend error in error.context
    // (a Response). Read it so the UI shows the actual cause instead of the
    // generic "Edge Function returned a non-2xx status code" message.
    let detail = error.message
    try {
      const ctx = (error as any).context
      if (ctx && typeof ctx.text === 'function') {
        const body = await ctx.text()
        try {
          const parsed = JSON.parse(body)
          if (parsed?.error) detail = parsed.error
          else if (body) detail = body
        } catch {
          if (body) detail = body
        }
      }
    } catch {
      /* keep original message */
    }
    throw new Error(detail)
  }
  return {
    sent: Number((data as any)?.sent ?? 0),
    failed: Number((data as any)?.failed ?? 0),
    alreadySent: Number((data as any)?.already_sent ?? 0),
    recipients: Number((data as any)?.recipients ?? 0),
    skipped: (data as any)?.skipped,
  }
}

/** How many reminders already exist for a session (duplicate-send warning). */
export async function countSessionReminders(
  sessionId: string,
): Promise<number> {
  if (!isLive()) return delay(demo.countDemoAttendanceReminders())
  const supabase = getSupabaseClient()!
  const { count, error } = await supabase
    .from(TABLES.notifications)
    .select('id', { count: 'exact', head: true })
    .eq('type', 'attendance_reminder')
    .eq('reference_id', sessionId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * The signed-in member's own report. RLS scopes the rows; only completed
 * sessions are counted.
 */
export async function getMyAttendance(): Promise<MyAttendanceSummary> {
  if (!isLive()) return delay(demo.getDemoMyAttendance())

  const supabase = getSupabaseClient()!
  const { data, error } = await supabase
    .from(TABLES.attendanceRecords)
    .select(
      'session_id, status, attendance_sessions!inner(session_date, service_name, status)',
    )
    .eq('attendance_sessions.status', 'completed')
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Array<{
    session_id: string
    status: AttendanceStatus
    attendance_sessions:
      | { session_date: string; service_name: string }
      | Array<{ session_date: string; service_name: string }>
      | null
  }>

  // PostgREST returns the embedded parent as an object for a many-to-one FK,
  // but tolerate an array shape so the report never crashes on a join quirk.
  const records: MyAttendanceRecord[] = rows
    .map((row) => {
      const parent = Array.isArray(row.attendance_sessions)
        ? row.attendance_sessions[0]
        : row.attendance_sessions
      if (!parent) return null
      return {
        sessionId: String(row.session_id),
        date: String(parent.session_date).slice(0, 10),
        serviceName: parent.service_name,
        status: row.status,
      }
    })
    .filter((row): row is MyAttendanceRecord => row !== null)
    // Newest first — sorted in the client so the query does not depend on
    // PostgREST's embedded-resource ordering.
    .sort((a, b) => b.date.localeCompare(a.date))

  const present = records.filter((r) => r.status === 'present').length
  const total = records.length
  return {
    totalSessions: total,
    present,
    absent: total - present,
    percentage: total === 0 ? 0 : Math.round((present / total) * 1000) / 10,
    records,
  }
}

/** Present / total × 100, rounded to one decimal place. */
export function attendancePercentage(present: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((present / total) * 1000) / 10
}
