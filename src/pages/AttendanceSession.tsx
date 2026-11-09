import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardCheck,
  Send,
  UserCheck,
  UserX,
  X,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Textarea } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAuth } from '@/context/auth-context'
import { useAsync } from '@/hooks/useAsync'
import {
  countSessionReminders,
  DEFAULT_ATTENDANCE_REMINDER,
  finalizeAttendanceSession,
  getAttendanceSession,
  saveAttendance,
  sendAttendanceReminders,
} from '@/services/attendance'
import { formatDate, fullName } from '@/lib/format'
import type { AttendanceMemberRow, AttendanceStatus } from '@/types'

const STATUS_TONE = {
  completed: 'success',
  draft: 'warning',
  cancelled: 'neutral',
} as const

const STATUS_LABEL = {
  completed: 'Completed',
  draft: 'Draft',
  cancelled: 'Cancelled',
} as const

export default function AttendanceSessionPage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  const detail = useAsync(
    () => (id ? getAttendanceSession(id) : Promise.resolve(null)),
    [id],
  )

  const [rows, setRows] = useState<AttendanceMemberRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [reminderOpen, setReminderOpen] = useState(false)
  const [reminderTitle, setReminderTitle] = useState('We missed you')
  const [reminderMessage, setReminderMessage] = useState(
    DEFAULT_ATTENDANCE_REMINDER,
  )
  const [reminderError, setReminderError] = useState<string | undefined>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [remindersSent, setRemindersSent] = useState(0)

  const data = detail.status === 'success' ? detail.data : null
  const session = data?.session ?? null

  // The sheet is an editable local draft: when the server data reloads (after
  // save/complete), copy it back into local state. This is intentional
  // synchronisation with fetched data, not derived render state.
  useEffect(() => {
    if (data) {
      // oxlint-disable-next-line react/set-state-in-effect
      setRows(data.rows)
      setDirty(false)
    }
  }, [data])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    countSessionReminders(id)
      .then((count) => {
        if (!cancelled) setRemindersSent(count)
      })
      .catch(() => {
        if (!cancelled) setRemindersSent(0)
      })
    return () => {
      cancelled = true
    }
  }, [id, data])

  const present = useMemo(
    () => rows.filter((row) => row.status === 'present').length,
    [rows],
  )
  const absent = useMemo(
    () => rows.filter((row) => row.status === 'absent').length,
    [rows],
  )
  const unrecorded = rows.length - present - absent
  const absentees = useMemo(
    () => rows.filter((row) => row.status === 'absent'),
    [rows],
  )
  const eligibleAbsentees = absentees.filter((row) => row.hasAccount)

  const setStatus = (memberId: string, status: AttendanceStatus) => {
    setRows((prev) =>
      prev.map((row) =>
        row.memberId === memberId
          ? { ...row, status: row.status === status ? null : status }
          : row,
      ),
    )
    setDirty(true)
  }

  const markAll = (status: AttendanceStatus) => {
    setRows((prev) => prev.map((row) => ({ ...row, status })))
    setDirty(true)
  }

  const clearAll = () => {
    setRows((prev) => prev.map((row) => ({ ...row, status: null })))
    setDirty(true)
  }

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      const count = await saveAttendance(id, rows)
      toast({
        title: 'Attendance saved',
        description: `${count} member${count === 1 ? '' : 's'} recorded.`,
        variant: 'success',
      })
      detail.reload()
    } catch (error) {
      toast({
        title: 'Could not save attendance',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!id) return
    setFinalizing(true)
    try {
      await finalizeAttendanceSession(id)
      toast({ title: 'Session completed', variant: 'success' })
      setFinalizeOpen(false)
      detail.reload()
    } catch (error) {
      toast({
        title: 'Could not complete the session',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setFinalizing(false)
    }
  }

  const openReminders = () => {
    setSelected(new Set(eligibleAbsentees.map((row) => row.memberId)))
    setReminderTitle(`We missed you${session ? ` — ${session.serviceName}` : ''}`)
    setReminderMessage(DEFAULT_ATTENDANCE_REMINDER)
    setReminderError(undefined)
    setReminderOpen(true)
  }

  const toggleRecipient = (memberId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  const handleSend = async () => {
    if (!id) return
    if (selected.size === 0) {
      setReminderError('Select at least one absent member.')
      return
    }
    setSending(true)
    setReminderError(undefined)
    try {
      const result = await sendAttendanceReminders(
        id,
        Array.from(selected),
        reminderTitle,
        reminderMessage,
      )
      const { sent, failed, alreadySent, recipients, skipped } = result

      const deliveredSummary = [
        sent > 0 ? `${sent} device${sent === 1 ? '' : 's'} delivered` : null,
        alreadySent > 0
          ? `${alreadySent} device${alreadySent === 1 ? '' : 's'} already had it`
          : null,
        failed > 0
          ? `${failed} device${failed === 1 ? '' : 's'} failed`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')

      if (failed > 0) {
        // Keep the dialog open so the Super Admin can retry just the failures.
        setReminderError(
          `${failed} push notification${failed === 1 ? '' : 's'} failed to deliver. ` +
            `${sent} delivered${alreadySent > 0 ? `, ${alreadySent} already delivered` : ''}. ` +
            'Pressing Send again will retry only the devices that have not received it.',
        )
        toast({
          title: `${failed} push notification${failed === 1 ? '' : 's'} failed`,
          description: `In-app reminder saved for ${recipients} member${
            recipients === 1 ? '' : 's'
          }. ${deliveredSummary}.`,
          variant: 'error',
        })
      } else if (recipients > 0 && skipped === 'no registered devices') {
        toast({
          title: 'In-app reminder sent',
          description: `Saved for ${recipients} member${
            recipients === 1 ? '' : 's'
          }. None of them has a registered device yet, so no push notification was sent.`,
          variant: 'info',
        })
        setReminderOpen(false)
      } else if (sent > 0 || alreadySent > 0) {
        toast({
          title:
            sent > 0
              ? `${sent} reminder${sent === 1 ? '' : 's'} delivered`
              : 'Reminder already delivered',
          description: `In-app notification saved for ${recipients} member${
            recipients === 1 ? '' : 's'
          }${deliveredSummary ? ` · ${deliveredSummary}` : ''}.`,
          variant: 'success',
        })
        setReminderOpen(false)
      } else {
        toast({
          title: 'No eligible recipients',
          description:
            skipped === 'no eligible recipients'
              ? 'None of the selected absent members has an active linked account.'
              : 'Nothing was sent.',
          variant: 'info',
        })
        setReminderOpen(false)
      }

      const count = await countSessionReminders(id)
      setRemindersSent(count)
    } catch (error) {
      setReminderError(
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setSending(false)
    }
  }

  if (detail.status === 'loading') {
    return (
      <>
        <Header title="Attendance" onMenuClick={openMenu} />
        <Page className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="space-y-3 p-5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
            </Card>
          ))}
        </Page>
      </>
    )
  }

  if (detail.status === 'error') {
    return (
      <>
        <Header title="Attendance" onMenuClick={openMenu} />
        <Page>
          <Card>
            <EmptyState
              icon={AlertCircle}
              title="Could not load this session"
              description={detail.error}
              action={<Button onClick={detail.reload}>Try again</Button>}
            />
          </Card>
        </Page>
      </>
    )
  }

  if (!session) {
    return (
      <>
        <Header title="Attendance" onMenuClick={openMenu} />
        <Page>
          <Card>
            <EmptyState
              icon={ClipboardCheck}
              title="Session not found"
              description="It may have been deleted, or you may not have access to it."
              action={
                <Button onClick={() => navigate('/attendance')}>
                  Back to attendance
                </Button>
              }
            />
          </Card>
        </Page>
      </>
    )
  }

  const isSuperAdmin = user?.role === 'super_admin'
  const canSendReminders =
    isSuperAdmin &&
    session.status === 'completed' &&
    eligibleAbsentees.length > 0

  return (
    <>
      <Header
        title={session.serviceName}
        subtitle={`${formatDate(session.date)} · attendance register`}
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        <button
          type="button"
          onClick={() => navigate('/attendance')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 transition hover:text-navy-800"
        >
          <ArrowLeft className="size-4" />
          All sessions
        </button>

        <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-cream-200 text-navy-700">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-navy-900">
                  {formatDate(session.date)}
                </p>
                <Badge tone={STATUS_TONE[session.status]}>
                  {STATUS_LABEL[session.status]}
                </Badge>
                {dirty && <Badge tone="warning">Unsaved changes</Badge>}
              </div>
              <p className="text-sm text-navy-500">
                {present} present · {absent} absent · {unrecorded} not recorded
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAll('present')}
            >
              Mark all present
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={!dirty}
            >
              Save sheet
            </Button>
            {session.status !== 'completed' && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => setFinalizeOpen(true)}
                disabled={present + absent === 0}
              >
                Complete session
              </Button>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
              Present
            </p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">
              {present}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
              Absent
            </p>
            <p className="mt-1 text-2xl font-semibold text-red-600">{absent}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
              Not recorded
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy-500">
              {unrecorded}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
              Total members
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy-900">
              {rows.length}
            </p>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Member attendance</CardTitle>
            <p className="text-sm text-navy-500">
              Tap Present or Absent. Tap again to clear a marking.
            </p>
          </CardHeader>
          {rows.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No active members"
              description="Add active member records before recording attendance."
            />
          ) : (
            <ul className="divide-y divide-cream-200">
              {rows.map((row) => (
                <li
                  key={row.memberId}
                  className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy-900">
                      {fullName(row.firstName, row.lastName)}
                    </p>
                    <p className="font-mono text-xs text-navy-400">
                      {row.memberCode}
                      {row.status === null && (
                        <span className="ml-2 font-sans text-amber-600">
                          Not recorded
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={row.status === 'present' ? 'primary' : 'secondary'}
                      icon={<Check className="size-4" />}
                      onClick={() => setStatus(row.memberId, 'present')}
                    >
                      Present
                    </Button>
                    <Button
                      size="sm"
                      variant={row.status === 'absent' ? 'danger' : 'secondary'}
                      icon={<X className="size-4" />}
                      onClick={() => setStatus(row.memberId, 'absent')}
                    >
                      Absent
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isSuperAdmin && (
          <Card className="overflow-hidden">
            <CardHeader>
              <div>
                <CardTitle>Absentee reminders</CardTitle>
                <p className="mt-0.5 text-sm text-navy-500">
                  {session.status === 'completed'
                    ? `${eligibleAbsentees.length} absent member${
                        eligibleAbsentees.length === 1 ? '' : 's'
                      } with an active account can be reminded.`
                    : 'Complete the session before sending reminders.'}
                </p>
              </div>
              <Button
                icon={<Send className="size-4" />}
                onClick={openReminders}
                disabled={!canSendReminders}
              >
                Send reminder
              </Button>
            </CardHeader>
            {absentees.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="No absentees"
                description="Members marked absent will appear here for a reminder."
              />
            ) : (
              <ul className="divide-y divide-cream-200">
                {absentees.map((row) => (
                  <li
                    key={row.memberId}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <UserX className="size-4 text-red-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-900">
                        {fullName(row.firstName, row.lastName)}
                      </p>
                      <p className="text-xs text-navy-400">
                        {row.memberCode} ·{' '}
                        {row.hasAccount
                          ? 'active account linked'
                          : 'no linked account — will not be sent'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {remindersSent > 0 && (
              <p className="border-t border-cream-200 bg-cream-50 px-5 py-3 text-xs text-navy-500">
                {remindersSent} reminder{remindersSent === 1 ? '' : 's'} already
                sent for this session. Resending refreshes the same notification
                instead of creating a duplicate.
              </p>
            )}
          </Card>
        )}
      </Page>

      <ConfirmDialog
        open={finalizeOpen}
        title="Complete this attendance session?"
        description={
          <>
            The session will be marked <strong>Completed</strong> and will start
            counting towards member attendance reports. You can still edit the
            sheet afterwards.
          </>
        }
        confirmLabel="Complete session"
        tone="primary"
        loading={finalizing}
        onConfirm={handleFinalize}
        onClose={() => setFinalizeOpen(false)}
      />

      <Modal
        open={reminderOpen}
        onClose={() => (sending ? undefined : setReminderOpen(false))}
        title="Send attendance reminders"
        description="Review the recipients and edit the message before sending."
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setReminderOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              icon={<Send className="size-4" />}
              onClick={handleSend}
              loading={sending}
              disabled={selected.size === 0}
            >
              Send to {selected.size}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {remindersSent > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>
                Reminders were already sent for this session. Sending again
                updates the existing notification (no duplicates).
              </p>
            </div>
          )}

          {reminderError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="whitespace-pre-line">{reminderError}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-navy-800">
              Recipients ({selected.size} selected)
            </p>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-cream-300 p-2">
              {eligibleAbsentees.map((row) => (
                <li key={row.memberId}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-cream-50">
                    <input
                      type="checkbox"
                      className="size-4 accent-navy-900"
                      checked={selected.has(row.memberId)}
                      onChange={() => toggleRecipient(row.memberId)}
                    />
                    <span className="flex-1">
                      {fullName(row.firstName, row.lastName)}
                    </span>
                    <span className="font-mono text-xs text-navy-400">
                      {row.memberCode}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {eligibleAbsentees.length === 0 && (
              <p className="text-sm text-navy-500">
                None of the absent members has an active linked account, so
                there is nobody to notify.
              </p>
            )}
          </div>

          <Input
            label="Title"
            value={reminderTitle}
            maxLength={120}
            onChange={(event) => setReminderTitle(event.target.value)}
          />
          <Textarea
            label="Message"
            value={reminderMessage}
            maxLength={1000}
            onChange={(event) => setReminderMessage(event.target.value)}
          />
        </div>
      </Modal>
    </>
  )
}
