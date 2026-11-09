import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Heart,
  UserPlus,
  Users,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCardSkeleton } from '@/components/ui/Skeleton'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/context/toast-context'
import {
  getDashboardStats,
  getRecentActivity,
  listMinistries,
} from '@/services/data'
import { listMembers } from '@/services/members'
import { listSpouseCouples } from '@/services/families'
import { buildBirthdayEntries } from '@/lib/birthdays'
import { buildAnniversaryEntries, coupleLabel } from '@/lib/anniversaries'
import { isStaffRole } from '@/lib/roles'
import { formatRelative, fullName } from '@/lib/format'
import type { AnniversaryEntry } from '@/lib/anniversaries'
import type { BirthdayEntry } from '@/lib/birthdays'
import type { SpouseCoupleResult } from '@/services/families'

const NO_ENTRIES: BirthdayEntry[] = []
const NO_COUPLE_RESULT: SpouseCoupleResult = { available: true, couples: [] }
const NO_ANNIVERSARIES: AnniversaryEntry[] = []
const CONGREGATION_CAP = 10

function relativeWhen(daysAway: number): string {
  if (daysAway === 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  return `In ${daysAway} days`
}

export default function DashboardPage() {
  const { openMenu } = useAppShell()
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const stats = useAsync(() => getDashboardStats(), [])
  const activity = useAsync(() => getRecentActivity(), [])
  const ministries = useAsync(() => listMinistries(), [])
  const members = useAsync(() => listMembers(), [])

  const canManage = isStaffRole(user?.role)
  const couples = useAsync(
    () => (canManage ? listSpouseCouples() : Promise.resolve(NO_COUPLE_RESULT)),
    [canManage],
  )

  const firstName = (user?.name ?? 'there').split(' ')[1] ?? user?.name

  const upcomingBirthdays =
    members.status === 'success'
      ? buildBirthdayEntries(members.data).slice(0, CONGREGATION_CAP)
      : NO_ENTRIES

  const upcomingAnniversaries =
    canManage && couples.status === 'success'
      ? buildAnniversaryEntries(couples.data.couples).slice(
          0,
          CONGREGATION_CAP,
        )
      : NO_ANNIVERSARIES

  const recentMembers =
    members.status === 'success'
      ? [...members.data]
          .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
          .slice(0, 4)
      : []

  return (
    <>
      <Header
        title={`Good day, ${firstName}`}
        subtitle="Here is what is happening across the congregation today."
        onMenuClick={openMenu}
        onAddMember={() => navigate('/members?add=1')}
      />
      <Page className="space-y-6">
        <section
          aria-label="Key metrics"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {stats.status === 'loading' &&
            Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          {stats.status === 'success' &&
            stats.data.map((stat) => <StatCard key={stat.id} stat={stat} />)}
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Recently joined</CardTitle>
                  <p className="text-sm text-navy-500">
                    Newest additions to the fellowship
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowRight className="size-4" />}
                  onClick={() => navigate('/members')}
                  className="flex-row-reverse"
                >
                  View all
                </Button>
              </CardHeader>
              <div className="divide-y divide-cream-200">
                {members.status === 'loading' && (
                  <div className="space-y-4 p-5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3"
                      >
                        <div className="size-10 animate-pulse rounded-full bg-navy-100/70" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 w-40 animate-pulse rounded bg-navy-100/70" />
                          <div className="h-3 w-28 animate-pulse rounded bg-navy-100/70" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {members.status === 'success' &&
                  recentMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => navigate(`/members/${member.id}`)}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-cream-50"
                    >
                      <Avatar
                        firstName={member.firstName}
                        lastName={member.lastName}
                        src={member.avatarUrl}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-navy-900">
                          {fullName(member.firstName, member.lastName)}
                        </p>
                        <p className="truncate text-sm text-navy-400">
                          Joined {formatRelative(member.joinedAt)}
                        </p>
                      </div>
                      <Badge tone="navy">
                        {member.ministries[0] ?? 'Member'}
                      </Badge>
                    </button>
                  ))}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Recent activity</CardTitle>
                  <p className="text-sm text-navy-500">
                    Latest changes by the leadership team
                  </p>
                </div>
                <Activity className="size-5 text-navy-300" />
              </CardHeader>
              {activity.status === 'loading' && (
                <div className="space-y-4 p-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-4 w-3/4 animate-pulse rounded bg-navy-100/70" />
                  ))}
                </div>
              )}
              {activity.status === 'success' && (
                <ul className="divide-y divide-cream-200">
                  {activity.data.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 px-5 py-3.5 text-sm"
                    >
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gold-400" />
                      <p className="text-navy-600">
                        <span className="font-medium text-navy-900">
                          {item.actor}
                        </span>{' '}
                        {item.action}{' '}
                        <span className="font-medium text-navy-900">
                          {item.target}
                        </span>
                        <span className="block text-xs text-navy-400">
                          {formatRelative(item.at)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Upcoming birthdays</CardTitle>
                  <p className="text-sm text-navy-500">Next celebrations</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowRight className="size-4" />}
                  onClick={() => navigate('/birthdays')}
                  className="flex-row-reverse"
                >
                  View
                </Button>
              </CardHeader>
              {members.status === 'loading' && (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 animate-pulse rounded-lg bg-navy-100/70"
                    />
                  ))}
                </div>
              )}
              {members.status === 'success' &&
                upcomingBirthdays.length === 0 && (
                  <p className="px-5 py-4 text-sm text-navy-400">
                    No upcoming birthdays yet.
                  </p>
                )}
              {members.status === 'success' && upcomingBirthdays.length > 0 && (
                <ul className="divide-y divide-cream-200">
                  {upcomingBirthdays.map((entry) => (
                    <li key={entry.member.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/members/${entry.member.id}`)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-cream-50"
                      >
                        <Avatar
                          firstName={entry.member.firstName}
                          lastName={entry.member.lastName}
                          src={entry.member.avatarUrl}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-navy-900">
                            {fullName(
                              entry.member.firstName,
                              entry.member.lastName,
                            )}
                          </p>
                          <p className="truncate text-xs text-navy-400">
                            {relativeWhen(entry.daysAway)}
                            {entry.turningAge != null
                              ? ` · turns ${entry.turningAge}`
                              : ''}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {canManage && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Upcoming anniversaries</CardTitle>
                    <p className="text-sm text-navy-500">Milestones to honour</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ArrowRight className="size-4" />}
                    onClick={() => navigate('/anniversaries')}
                    className="flex-row-reverse"
                  >
                    View
                  </Button>
                </CardHeader>
                {couples.status === 'loading' && (
                  <div className="space-y-3 p-5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-10 animate-pulse rounded-lg bg-navy-100/70"
                      />
                    ))}
                  </div>
                )}
                {couples.status === 'success' &&
                  upcomingAnniversaries.length === 0 && (
                    <p className="px-5 py-4 text-sm text-navy-400">
                      No upcoming anniversaries yet.
                    </p>
                  )}
                {couples.status === 'success' &&
                  upcomingAnniversaries.length > 0 && (
                    <ul className="divide-y divide-cream-200">
                      {upcomingAnniversaries.map((entry) => (
                        <li
                          key={entry.couple.relationshipId ?? `${entry.couple.members[0]?.memberCode}-${entry.couple.members[1]?.memberCode}`}
                          className="flex items-center gap-3 px-5 py-3"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                            <Heart className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-navy-900">
                              {coupleLabel(entry.couple)}
                            </p>
                            <p className="truncate text-xs text-navy-400">
                              {relativeWhen(entry.daysAway)} · {entry.years}{' '}
                              {entry.years === 1 ? 'year' : 'years'}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Ministries</CardTitle>
                <Users className="size-5 text-navy-300" />
              </CardHeader>
              {ministries.status === 'loading' && (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-lg bg-navy-100/70" />
                  ))}
                </div>
              )}
              {ministries.status === 'success' && (
                <ul className="divide-y divide-cream-200">
                  {ministries.data.map((ministry) => (
                    <li
                      key={ministry.id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy-900">
                          {ministry.name}
                        </p>
                        <p className="truncate text-xs text-navy-400">
                          Led by {ministry.leader}
                        </p>
                      </div>
                      <span className="rounded-full bg-cream-200 px-2.5 py-0.5 text-xs font-medium text-navy-700">
                        {ministry.memberCount}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick actions</CardTitle>
              </CardHeader>
              <div className="space-y-2 p-4">
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<UserPlus className="size-4" />}
                  className="justify-start"
                  onClick={() => navigate('/members')}
                >
                  Browse members
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<CalendarClock className="size-4" />}
                  className="justify-start"
                  onClick={() =>
                    toast({
                      title: 'Coming soon',
                      description:
                        'Event planning will be added in a later stage.',
                      variant: 'info',
                    })
                  }
                >
                  Schedule a visit
                </Button>
              </div>
            </Card>

            {members.status === 'error' && (
              <Card>
                <EmptyState
                  icon={Users}
                  title="Could not load data"
                  description={members.error}
                  action={
                    <Button variant="secondary" onClick={members.reload}>
                      Try again
                    </Button>
                  }
                />
              </Card>
            )}
          </div>
        </div>
      </Page>
    </>
  )
}
