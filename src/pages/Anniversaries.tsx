import { useMemo, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Heart,
  HeartHandshake,
  Info,
  Pencil,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import { listSpouseCouples, setSpouseAnniversary } from '@/services/families'
import { pluralize } from '@/lib/format'
import {
  anniversaryEntriesInMonth,
  buildAnniversaryEntries,
  coupleLabel,
  daysInMonth,
  firstWeekdayOfMonth,
  startOfDay,
  type AnniversaryEntry,
} from '@/lib/anniversaries'
import type { SpouseCouple } from '@/types'

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

function formatFullDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

function relativeLabel(daysAway: number): string {
  if (daysAway === 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  return `In ${daysAway} days`
}

function sectionLabel(entry: AnniversaryEntry, today: Date): string {
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

interface StatProps {
  icon: ComponentType<{ className?: string }>
  label: string
  value: number
  hint: string
}

function Stat({ icon: Icon, label, value, hint }: StatProps) {
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
  entries: AnniversaryEntry[]
  isToday: boolean
}) {
  const names = entries.map((entry) => coupleLabel(entry.couple)).join(', ')
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
              key={entry.couple.relationshipId}
              className="flex items-center gap-1 overflow-hidden rounded-md bg-white px-1 py-0.5 text-[10px] leading-none text-navy-700 ring-1 ring-cream-200"
            >
              <Heart className="size-3 shrink-0 text-gold-600" />
              <span className="hidden truncate sm:inline">
                {entry.couple.members[0].lastName}
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

export default function AnniversariesPage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()
  const couples = useAsync(() => listSpouseCouples(), [])
  const [today] = useState(() => startOfDay(new Date()))
  const todayValue = useMemo(() => {
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${today.getFullYear()}-${month}-${day}`
  }, [today])

  const [view, setView] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }))
  const [editing, setEditing] = useState<SpouseCouple | null>(null)
  const [editDate, setEditDate] = useState('')
  const [saving, setSaving] = useState(false)

  const result =
    couples.status === 'success'
      ? couples.data
      : { available: true, couples: [] as SpouseCouple[] }

  const entries = useMemo(
    () => buildAnniversaryEntries(result.couples, today),
    [result.couples, today],
  )

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
  const thisView = anniversaryEntriesInMonth(entries, view.month)

  const entriesByDay = useMemo(() => {
    const map = new Map<number, AnniversaryEntry[]>()
    for (const entry of thisView) {
      const list = map.get(entry.day) ?? []
      list.push(entry)
      map.set(entry.day, list)
    }
    return map
  }, [thisView])

  const groupedUpcoming = useMemo(() => {
    const groups: { label: string; items: AnniversaryEntry[] }[] = []
    for (const entry of entries.slice(0, 12)) {
      const label = sectionLabel(entry, today)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(entry)
      else groups.push({ label, items: [entry] })
    }
    return groups
  }, [entries, today])

  const withoutDate = result.couples.filter((c) => !c.date)

  const goToMonth = (offset: number) => {
    setView((current) => {
      const next = current.month + offset
      if (next < 0) return { year: current.year - 1, month: 11 }
      if (next > 11) return { year: current.year + 1, month: 0 }
      return { year: current.year, month: next }
    })
  }

  const openEditor = (couple: SpouseCouple) => {
    setEditing(couple)
    setEditDate(couple.date ?? '')
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await setSpouseAnniversary(editing.relationshipId, editDate || null)
      setEditing(null)
      couples.reload()
      toast({
        title: editDate ? 'Anniversary saved' : 'Anniversary cleared',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Could not save anniversary',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const cells: Array<number | null> = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ]

  return (
    <>
      <Header
        title="Anniversaries"
        subtitle="Celebrate the wedding anniversaries of couples in the church."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        {couples.status === 'loading' && (
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

        {couples.status === 'error' && (
          <Card>
            <EmptyState
              icon={AlertCircle}
              title="Could not load anniversaries"
              description={couples.error}
              action={
                <Button variant="secondary" onClick={couples.reload}>
                  Try again
                </Button>
              }
            />
          </Card>
        )}

        {couples.status === 'success' && !result.available && (
          <Card className="flex items-start gap-3 border-amber-200 bg-amber-50 p-5">
            <Info className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-medium text-navy-900">
                Anniversary tracking is not enabled yet
              </p>
              <p className="text-sm text-navy-600">
                The database migration for wedding anniversaries has not been
                applied. Spouse couples are shown below, but dates cannot be
                recorded until an administrator applies the migration.
              </p>
            </div>
          </Card>
        )}

        {couples.status === 'success' && result.available && (
          <>
            {todayEntries.length > 0 && (
              <Card className="flex items-center gap-4 border-gold-200 bg-gold-50 p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-500 text-navy-950">
                  <HeartHandshake className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900">
                    Celebrating today
                  </p>
                  <p className="truncate text-sm text-navy-600">
                    {todayEntries
                      .map((entry) => `${coupleLabel(entry.couple)} (${entry.years}y)`)
                      .join(', ')}
                  </p>
                </div>
              </Card>
            )}

            <section
              aria-label="Anniversary summary"
              className="grid grid-cols-1 gap-4 sm:grid-cols-3"
            >
              <Stat
                icon={Heart}
                label="Today"
                value={todayEntries.length}
                hint={pluralize(todayEntries.length, 'anniversary', 'anniversaries')}
              />
              <Stat
                icon={CalendarDays}
                label="Next 7 days"
                value={weekEntries.length}
                hint="This week"
              />
              <Stat
                icon={HeartHandshake}
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
                        {thisView.length}{' '}
                        {pluralize(thisView.length, 'anniversary', 'anniversaries')}
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
                          isToday={isCurrentMonth && day === today.getDate()}
                        />
                      ),
                    )}
                  </div>
                </div>
              </Card>

              <Card className="flex flex-col lg:col-span-1">
                <CardHeader>
                  <CardTitle>Upcoming anniversaries</CardTitle>
                  <Badge tone="navy">{entries.length}</Badge>
                </CardHeader>

                {entries.length === 0 ? (
                  <EmptyState
                    icon={HeartHandshake}
                    title="No anniversaries yet"
                    description="Couples with a wedding date will appear here."
                  />
                ) : (
                  <div className="max-h-[32rem] overflow-y-auto">
                    {groupedUpcoming.map((group) => (
                      <div key={group.label}>
                        <p className="sticky top-0 bg-cream-50 px-5 py-1.5 text-[11px] font-semibold tracking-wide text-navy-400 uppercase">
                          {group.label}
                        </p>
                        <ul className="divide-y divide-cream-200">
                          {group.items.map((entry) => (
                            <li
                              key={entry.couple.relationshipId}
                              className="flex items-center gap-3 px-5 py-3"
                            >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-gold-600">
                                <HeartHandshake className="size-4.5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-navy-900">
                                  {coupleLabel(entry.couple)}
                                </p>
                                <p className="truncate text-xs text-navy-400">
                                  {formatDayMonth(entry.next)} · {entry.years} years
                                </p>
                              </div>
                              <Badge
                                tone={entry.daysAway === 0 ? 'gold' : 'neutral'}
                              >
                                {relativeLabel(entry.daysAway)}
                              </Badge>
                              <button
                                type="button"
                                aria-label={`Edit anniversary for ${coupleLabel(entry.couple)}`}
                                onClick={() => openEditor(entry.couple)}
                                className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-100 hover:text-navy-700"
                              >
                                <Pencil className="size-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {withoutDate.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                      <Pencil className="size-5" />
                    </span>
                    <div>
                      <CardTitle>Add an anniversary</CardTitle>
                      <p className="text-sm text-navy-500">
                        Spouse couples without a wedding date on record.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <ul className="divide-y divide-cream-200">
                  {withoutDate.map((couple) => (
                    <li
                      key={couple.relationshipId}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy-900">
                          {coupleLabel(couple)}
                        </p>
                        <Link
                          to={`/members/${couple.members[0].memberCode}`}
                          className="text-xs text-navy-400 hover:text-navy-700"
                        >
                          View couple
                        </Link>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<CalendarDays className="size-4" />}
                        onClick={() => openEditor(couple)}
                      >
                        Set date
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}

        {couples.status === 'success' &&
          result.available &&
          entries.length === 0 &&
          withoutDate.length === 0 && (
            <Card>
              <EmptyState
                icon={HeartHandshake}
                title="No spouse couples on record"
                description="Record a spouse relationship on a member's profile to track anniversaries."
              />
            </Card>
          )}

        <Modal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          title="Wedding anniversary"
          description={
            editing ? coupleLabel(editing) : undefined
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              {editDate && (
                <Button
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50"
                  disabled={saving}
                  onClick={() => setEditDate('')}
                >
                  Clear date
                </Button>
              )}
              <Button loading={saving} onClick={handleSave}>
                Save
              </Button>
            </>
          }
        >
          <Input
            type="date"
            label="Wedding date"
            value={editDate}
            max={todayValue}
            hint="Stored once for the couple. Leave empty and save to clear."
            onChange={(event) => setEditDate(event.target.value)}
          />
          {editing?.date && (
            <p className="mt-3 text-xs text-navy-400">
              Currently on file: {formatFullDate(editing.date)}
            </p>
          )}
        </Modal>
      </Page>
    </>
  )
}
