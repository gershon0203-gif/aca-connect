import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ShieldAlert,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/FormField'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/context/auth-context'
import { useAsync } from '@/hooks/useAsync'
import { getMyAttendance } from '@/services/attendance'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { MyAttendanceRecord } from '@/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Stable empty list so memo dependencies do not change while loading. */
const EMPTY_RECORDS: MyAttendanceRecord[] = []

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${MONTH_LABELS[month - 1] ?? ''} ${year}`
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number)
  const next = new Date(year, month - 1 + delta, 1)
  return monthKey(next)
}

function maxMonthKey(): string {
  return monthKey(new Date())
}

/**
 * "My Attendance" for a linked member.
 *
 * `attendance_records` is read directly, but Row Level Security restricts every
 * row to `member_id = current_member_id()`. The client never sends a member id,
 * so the report cannot be widened by editing state or the URL.
 */
export default function MyAttendancePage() {
  const { openMenu } = useAppShell()
  const { user } = useAuth()
  const linked = Boolean(user?.memberCode)
  const report = useAsync(() => getMyAttendance(), [user?.memberCode])

  const [selectedMonth, setSelectedMonth] = useState(() => maxMonthKey())

  const records = report.status === 'success' ? report.data.records : EMPTY_RECORDS

  const recordsByDate = useMemo(() => {
    const map = new Map<string, MyAttendanceRecord>()
    for (const record of records) map.set(record.date, record)
    return map
  }, [records])

  const monthRecords = useMemo(() => {
    return records
      .filter((record) => record.date.startsWith(selectedMonth))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [records, selectedMonth])

  const calendar = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const first = new Date(year, month - 1, 1)
    const daysInMonth = new Date(year, month, 0).getDate()
    const leading = first.getDay()
    const cells: Array<{ day: number; date: string } | null> = []
    for (let i = 0; i < leading; i += 1) cells.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ day, date: `${year}-${pad(month)}-${pad(day)}` })
    }
    return cells
  }, [selectedMonth])

  return (
    <>
      <Header
        title="My attendance"
        subtitle="Your recorded attendance across church gatherings."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        {!linked && (
          <Card>
            <EmptyState
              icon={ShieldAlert}
              title="Your account isn't linked yet"
              description="Once an administrator links your account to your member record, your attendance will appear here."
            />
          </Card>
        )}

        {linked && report.status === 'loading' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="space-y-2 p-5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-14" />
                </Card>
              ))}
            </div>
            <Card className="p-6">
              <Skeleton className="h-64 w-full" />
            </Card>
          </div>
        )}

        {linked && report.status === 'error' && (
          <Card>
            <EmptyState
              icon={ClipboardList}
              title="Could not load your attendance"
              description={report.error}
              action={<Button onClick={report.reload}>Try again</Button>}
            />
          </Card>
        )}

        {linked && report.status === 'success' && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card className="p-5">
                <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
                  Attendance
                </p>
                <p className="mt-1 flex items-baseline gap-1 text-2xl font-semibold text-navy-900">
                  {report.data.percentage}%
                  <TrendingUp className="size-4 text-emerald-600" />
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
                  Present
                </p>
                <p className="mt-1 text-2xl font-semibold text-emerald-700">
                  {report.data.present}
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
                  Absent
                </p>
                <p className="mt-1 text-2xl font-semibold text-red-600">
                  {report.data.absent}
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
                  Sessions
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy-900">
                  {report.data.totalSessions}
                </p>
              </Card>
            </div>

            {report.data.totalSessions === 0 && (
              <Card>
                <EmptyState
                  icon={CalendarDays}
                  title="No attendance recorded yet"
                  description="Your attendance will appear here once a completed session includes your member record."
                />
              </Card>
            )}

            {report.data.totalSessions > 0 && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader className="flex-wrap gap-3">
                    <div>
                      <CardTitle>{monthLabel(selectedMonth)}</CardTitle>
                      <p className="text-sm text-navy-500">
                        {monthRecords.filter((r) => r.status === 'present').length}{' '}
                        present ·{' '}
                        {monthRecords.filter((r) => r.status === 'absent').length}{' '}
                        absent this month
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMonth((current) => shiftMonth(current, -1))
                        }
                        className="rounded-lg border border-cream-300 p-2 text-navy-600 transition hover:border-navy-300 hover:text-navy-900"
                        aria-label="Previous month"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedMonth((current) => shiftMonth(current, 1))
                        }
                        className="rounded-lg border border-cream-300 p-2 text-navy-600 transition hover:border-navy-300 hover:text-navy-900"
                        aria-label="Next month"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </CardHeader>

                  <div className="p-4 sm:p-5">
                    <Input
                      label="Month"
                      type="month"
                      value={selectedMonth}
                      max={maxMonthKey()}
                      onChange={(event) => {
                        if (event.target.value) {
                          setSelectedMonth(event.target.value)
                        }
                      }}
                    />

                    <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                      {WEEKDAYS.map((day) => (
                        <span
                          key={day}
                          className="py-1 text-[11px] font-semibold tracking-wide text-navy-400 uppercase"
                        >
                          {day}
                        </span>
                      ))}
                      {calendar.map((cell, index) => {
                        if (!cell) {
                          return <span key={`blank-${index}`} />
                        }
                        const record = recordsByDate.get(cell.date)
                        return (
                          <div
                            key={cell.date}
                            title={
                              record
                                ? `${formatDate(cell.date)} · ${record.serviceName} · ${record.status}`
                                : formatDate(cell.date)
                            }
                            className={cn(
                              'flex aspect-square flex-col items-center justify-center rounded-lg border text-xs',
                              record?.status === 'present' &&
                                'border-emerald-200 bg-emerald-50 font-semibold text-emerald-700',
                              record?.status === 'absent' &&
                                'border-red-200 bg-red-50 font-semibold text-red-700',
                              !record &&
                                'border-transparent text-navy-400 hover:bg-cream-100',
                            )}
                          >
                            <span>{cell.day}</span>
                            {record && (
                              <span
                                className={cn(
                                  'mt-0.5 size-1.5 rounded-full',
                                  record.status === 'present'
                                    ? 'bg-emerald-500'
                                    : 'bg-red-500',
                                )}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-4 text-xs text-navy-500">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-emerald-500" />
                        Present
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-red-500" />
                        Absent
                      </span>
                    </div>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader>
                    <div>
                      <CardTitle>History</CardTitle>
                      <p className="text-sm text-navy-500">
                        {monthRecords.length === 0
                          ? 'No sessions in the selected month.'
                          : `${monthRecords.length} session${
                              monthRecords.length === 1 ? '' : 's'
                            } in ${monthLabel(selectedMonth)}`}
                      </p>
                    </div>
                  </CardHeader>

                  {monthRecords.length === 0 ? (
                    <EmptyState
                      icon={CalendarDays}
                      title="Nothing recorded this month"
                      description="Try another month, or wait until a session is completed and includes your record."
                    />
                  ) : (
                    <ul className="divide-y divide-cream-200">
                      {monthRecords.map((record) => (
                        <li
                          key={record.sessionId}
                          className="flex items-center gap-3 px-5 py-3.5"
                        >
                          {record.status === 'present' ? (
                            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                          ) : (
                            <XCircle className="size-5 shrink-0 text-red-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-navy-900">
                              {record.serviceName}
                            </p>
                            <p className="text-xs text-navy-400">
                              {formatDate(record.date)}
                            </p>
                          </div>
                          <Badge
                            tone={record.status === 'present' ? 'success' : 'danger'}
                          >
                            {record.status === 'present' ? 'Present' : 'Absent'}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}
          </>
        )}
      </Page>
    </>
  )
}
