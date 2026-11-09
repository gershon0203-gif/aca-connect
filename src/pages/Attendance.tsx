import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck2, ClipboardCheck, Plus } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import {
  createAttendanceSession,
  listAttendanceSessions,
} from '@/services/attendance'
import { formatDate } from '@/lib/format'
import type { AttendanceSession } from '@/types'

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA')
}

const STATUS_TONE: Record<
  AttendanceSession['status'],
  'success' | 'warning' | 'neutral'
> = {
  completed: 'success',
  draft: 'warning',
  cancelled: 'neutral',
}

const STATUS_LABEL: Record<AttendanceSession['status'], string> = {
  completed: 'Completed',
  draft: 'Draft',
  cancelled: 'Cancelled',
}

export default function AttendancePage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()
  const navigate = useNavigate()
  const sessions = useAsync(() => listAttendanceSessions(), [])

  const [createOpen, setCreateOpen] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [serviceName, setServiceName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const openCreate = () => {
    setDate(todayIso())
    setServiceName('')
    setError(undefined)
    setCreateOpen(true)
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!serviceName.trim()) {
      setError('Enter the service or meeting name.')
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      const id = await createAttendanceSession(date, serviceName)
      toast({ title: 'Attendance session created', variant: 'success' })
      setCreateOpen(false)
      navigate(`/attendance/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const columns: Array<Column<AttendanceSession>> = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className="font-medium text-navy-900">{formatDate(row.date)}</span>
      ),
    },
    {
      key: 'service',
      header: 'Service / meeting',
      render: (row) => row.serviceName,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
      ),
    },
    {
      key: 'recorded',
      header: 'Recorded',
      render: (row) =>
        row.recordedCount === 0 ? (
          <span className="text-navy-400">Not started</span>
        ) : (
          <span>
            {row.recordedCount} · {row.presentCount} present ·{' '}
            {row.absentCount} absent
          </span>
        ),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: () => (
        <span className="text-sm font-medium text-navy-700">Open</span>
      ),
    },
  ]

  return (
    <>
      <Header
        title="Attendance"
        subtitle="Record services, review absentees and send reminders."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
              <CalendarCheck2 className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-navy-900">Attendance register</p>
              <p className="text-sm text-navy-500">
                Mark each member present or absent. Unrecorded members are never
                counted as absent.
              </p>
            </div>
          </div>
          <Button icon={<Plus className="size-4" />} onClick={openCreate}>
            New session
          </Button>
        </Card>

        <Card className="overflow-hidden">
          {sessions.status === 'loading' && <TableSkeleton rows={4} />}
          {sessions.status === 'error' && (
            <EmptyState
              icon={ClipboardCheck}
              title="Could not load attendance"
              description={sessions.error}
              action={<Button onClick={sessions.reload}>Try again</Button>}
            />
          )}
          {sessions.status === 'success' && sessions.data.length === 0 && (
            <EmptyState
              icon={CalendarCheck2}
              title="No attendance sessions yet"
              description="Create a session for a service or meeting, then mark who attended."
              action={
                <Button icon={<Plus className="size-4" />} onClick={openCreate}>
                  New session
                </Button>
              }
            />
          )}
          {sessions.status === 'success' && sessions.data.length > 0 && (
            <DataTable
              columns={columns}
              rows={sessions.data}
              getRowId={(row) => row.id}
              onRowClick={(row) => navigate(`/attendance/${row.id}`)}
              caption="Attendance sessions"
            />
          )}
        </Card>
      </Page>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New attendance session"
        description="Choose the date and the service or meeting."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" form="create-session-form" loading={saving}>
              Create session
            </Button>
          </>
        }
      >
        <form
          id="create-session-form"
          className="space-y-4"
          onSubmit={handleCreate}
        >
          <Input
            label="Date"
            type="date"
            value={date}
            required
            onChange={(event) => setDate(event.target.value)}
          />
          <Input
            label="Service / meeting"
            placeholder="Sunday Worship"
            value={serviceName}
            required
            onChange={(event) => setServiceName(event.target.value)}
            error={error}
          />
        </form>
      </Modal>
    </>
  )
}
