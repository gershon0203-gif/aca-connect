import { useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Cake,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAsync } from '@/hooks/useAsync'
import { listMembers } from '@/services/members'
import { fullName, getInitials, pluralize } from '@/lib/format'
import {
  buildBirthdayEntries,
  daysInMonth,
  entriesInMonth,
  firstWeekdayOfMonth,
  startOfDay,
  type BirthdayEntry,
} from '@/lib/birthdays'
import type { Member } from '@/types'

const NO_MEMBERS: Member[] = []
const UPCOMING_LIMIT = 12
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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

function formatDayMonth(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function relativeLabel(daysAway: number): string {
  if (daysAway === 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  return `In ${daysAway} days`
}

/**
 * Human grouping for the upcoming list. Handles today / rest of the current
 * week / remainder of this calendar month / everything beyond it, so a
 * birthday in early January is correctly labelled even in late December.
 */
function sectionLabel(entry: BirthdayEntry, today: Date): string {
  if (entry.daysAway === 0) return 'Today'
  if (entry.daysAway <= 6) return 'This week'
  if (
    entry.next.getFullYear() === today.getFullYear() &&
    entry.next.getMonth() === today.getMonth()
  ) {
    return 'Later this month'
  }
  return 'Coming up'
}

interface BirthdayStatProps {
  icon: ComponentType<{ className?: string }>
  label: string
  value: number
  hint: string
}

function BirthdayStat({ icon: Icon, label, value, hint }: BirthdayStatProps) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-navy-500">{label}</p>
        <p className="text-2xl font-semibold text-navy-900">{value}</p>
        <p className="truncate text-xs text-navy-400">{hint}</p>
      </div>
    </Card>
  )
}

function DayCell({
  day,
  entries,
  isToday,
}: {
  day: number
  entries: BirthdayEntry[]
  isToday: boolean
}) {
  const names = entries
    .map((entry) => fullName(entry.member.firstName, entry.member.lastName))
    .join(', ')

  return (
    <div
      className={
        isToday
          ? 'min-h-[4.5rem] rounded-xl border border-gold-400 bg-gold-50 p-1.5 sm:min-h-20'
          : 'min-h-[4.5rem] rounded-xl border border-cream-200 bg-cream-50/40 p-1.5 sm:min-h-20'
      }
      title={entries.length > 0 ? names : undefined}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={
            isToday
              ? 'text-xs font-semibold text-gold-800'
              : 'text-xs font-semibold text-navy-500'
          }
        >
          {day}
        </span>
        {isToday && (
          <span className="text-[10px] font-medium text-gold-700">Today</span>
        )}
      </div>
      {entries.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {entries.slice(0, 2).map((entry) => (
            <span
              key={entry.member.id}
              className="flex items-center gap-1 overflow-hidden rounded-md bg-white px-1 py-0.5 text-[10px] leading-none text-navy-700 ring-1 ring-cream-200"
            >
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[8px] font-semibold text-cream-100">
                {getInitials(entry.member.firstName, entry.member.lastName)}
              </span>
              <span className="hidden truncate sm:inline">
                {entry.member.firstName}
              </span>
            </span>
          ))}
          {entries.length > 2 && (
            <span className="pl-1 text-[10px] text-navy-400">
              +{entries.length - 2} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function UpcomingRow({ entry }: { entry: BirthdayEntry }) {
  return (
    <Link
      to={`/members/${entry.member.id}`}
      className="flex items-center gap-3 px-5 py-3 transition hover:bg-cream-50"
    >
      <Avatar
        firstName={entry.member.firstName}
        lastName={entry.member.lastName}
        src={entry.member.avatarUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-navy-900">
          {fullName(entry.member.firstName, entry.member.lastName)}
        </p>
        <p className="truncate text-xs text-navy-400">
          {formatDayMonth(entry.next)}
          {entry.turningAge !== null ? ` · turns ${entry.turningAge}` : ''}
        </p>
      </div>
      <Badge tone={entry.daysAway === 0 ? 'gold' : 'neutral'}>
        {relativeLabel(entry.daysAway)}
      </Badge>
    </Link>
  )
}

export default function BirthdaysPage() {
  const { openMenu } = useAppShell()
  const members = useAsync(() => listMembers(), [])
  const today = useMemo(() => startOfDay(new Date()), [])

  const memberList = members.status === 'success' ? members.data : NO_MEMBERS
  const entries = useMemo(
    () => buildBirthdayEntries(memberList, today),
    [memberList, today],
  )
  const missingDob = memberList.filter((member) => !member.dateOfBirth).length

  const [view, setView] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }))

  const todayEntries = entries.filter((entry) => entry.daysAway === 0)
  const weekEntries = entries.filter(
    (entry) => entry.daysAway >= 1 && entry.daysAway <= 6,
  )
  const monthEntries = entries.filter((entry) => entry.month === today.getMonth())

  const isCurrentMonth =
    view.year === today.getFullYear() && view.month === today.getMonth()
  const blanks = firstWeekdayOfMonth(view.year, view.month)
  const totalDays = daysInMonth(view.year, view.month)
  const monthLabel = `${MONTH_LABELS[view.month]} ${view.year}`
  const birthdaysThisView = entriesInMonth(entries, view.month)

  const entriesByDay = useMemo(() => {
    const map = new Map<number, BirthdayEntry[]>()
    for (const entry of birthdaysThisView) {
      const list = map.get(entry.day) ?? []
      list.push(entry)
      map.set(entry.day, list)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, view.year, view.month])

  const upcoming = useMemo(
    () => entries.slice(0, UPCOMING_LIMIT),
    [entries],
  )

  const groupedUpcoming = useMemo(() => {
    const groups: { label: string; items: BirthdayEntry[] }[] = []
    for (const entry of upcoming) {
      const label = sectionLabel(entry, today)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(entry)
      else groups.push({ label, items: [entry] })
    }
    return groups
  }, [upcoming, today])

  const goToMonth = (offset: number) => {
    setView((current) => {
      const next = current.month + offset
      if (next < 0) return { year: current.year - 1, month: 11 }
      if (next > 11) return { year: current.year + 1, month: 0 }
      return { year: current.year, month: next }
    })
  }

  const cells: Array<number | null> = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ]

  return (
    <>
      <Header
        title="Birthdays"
        subtitle="Celebrate the congregation's upcoming birthdays."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        {members.status === 'loading' && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Card key={index} className="p-5">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <Skeleton className="mt-3 h-3 w-20" />
                  <Skeleton className="mt-2 h-6 w-12" />
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-2">
                <Skeleton className="h-72 w-full rounded-xl" />
              </Card>
              <Card className="p-5">
                <Skeleton className="h-72 w-full rounded-xl" />
              </Card>
            </div>
          </>
        )}

        {members.status === 'error' && (
          <Card>
            <EmptyState
              icon={AlertCircle}
              title="Could not load birthdays"
              description={members.error}
              action={
                <Button variant="secondary" onClick={members.reload}>
                  Try again
                </Button>
              }
            />
          </Card>
        )}

        {members.status === 'success' && (
          <>
            {todayEntries.length > 0 && (
              <Card className="flex items-center gap-4 border-gold-200 bg-gold-50 p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-500 text-navy-950">
                  <PartyPopper className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900">
                    Celebrating today
                  </p>
                  <p className="truncate text-sm text-navy-600">
                    {todayEntries
                      .map((entry) =>
                        fullName(entry.member.firstName, entry.member.lastName),
                      )
                      .join(', ')}
                  </p>
                </div>
              </Card>
            )}

            <section
              aria-label="Birthday summary"
              className="grid grid-cols-1 gap-4 sm:grid-cols-3"
            >
              <BirthdayStat
                icon={PartyPopper}
                label="Today"
                value={todayEntries.length}
                hint={pluralize(todayEntries.length, 'birthday')}
              />
              <BirthdayStat
                icon={CalendarDays}
                label="Next 7 days"
                value={weekEntries.length}
                hint="This week"
              />
              <BirthdayStat
                icon={Cake}
                label={MONTH_LABELS[today.getMonth()]}
                value={monthEntries.length}
                hint="This month"
              />
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                      <CalendarDays className="size-5" />
                    </span>
                    <div>
                      <CardTitle>{monthLabel}</CardTitle>
                      <p className="text-sm text-navy-500">
                        {birthdaysThisView.length}{' '}
                        {pluralize(birthdaysThisView.length, 'birthday')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label="Previous month"
                      onClick={() => goToMonth(-1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isCurrentMonth}
                      onClick={() =>
                        setView({
                          year: today.getFullYear(),
                          month: today.getMonth(),
                        })
                      }
                    >
                      Today
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label="Next month"
                      onClick={() => goToMonth(1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </CardHeader>

                <div className="p-3 sm:p-5">
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-navy-400">
                    {WEEKDAY_LABELS.map((label) => (
                      <div key={label} className="py-1">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {cells.map((day, index) =>
                      day === null ? (
                        <div key={`blank-${index}`} />
                      ) : (
                        <DayCell
                          key={day}
                          day={day}
                          entries={entriesByDay.get(day) ?? []}
                          isToday={
                            isCurrentMonth && day === today.getDate()
                          }
                        />
                      ),
                    )}
                  </div>
                </div>
              </Card>

              <Card className="flex flex-col lg:col-span-1">
                <CardHeader>
                  <CardTitle>Upcoming birthdays</CardTitle>
                  <Badge tone="navy">{entries.length}</Badge>
                </CardHeader>

                {entries.length === 0 ? (
                  <EmptyState
                    icon={Cake}
                    title="No birthdays yet"
                    description="Members with a date of birth will appear here."
                  />
                ) : (
                  <div className="max-h-[32rem] overflow-y-auto">
                    {groupedUpcoming.map((group) => (
                      <div key={group.label}>
                        <p className="sticky top-0 bg-cream-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
                          {group.label}
                        </p>
                        <ul className="divide-y divide-cream-200">
                          {group.items.map((entry) => (
                            <li key={entry.member.id}>
                              <UpcomingRow entry={entry} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {missingDob > 0 && (
                  <p className="mt-auto flex items-center gap-2 border-t border-cream-200 px-5 py-3 text-xs text-navy-400">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {missingDob} {pluralize(missingDob, 'member')} without a date
                    of birth
                  </p>
                )}
              </Card>
            </div>
          </>
        )}
      </Page>
    </>
  )
}
