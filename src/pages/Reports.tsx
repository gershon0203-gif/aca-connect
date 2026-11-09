import { useMemo, useState, type ComponentType } from 'react'
import {
  AlertCircle,
  Cake,
  Download,
  HeartHandshake,
  Home,
  Layers,
  Search,
  Users,
  UsersRound,
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
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import { listMembers } from '@/services/members'
import { listFamilies, listSpouseCouples } from '@/services/families'
import {
  baptismBreakdown,
  familyReport,
  genderBreakdown,
  joinedInRange,
  maritalBreakdown,
  ministryBreakdown,
  statusBreakdown,
  type Slice,
} from '@/lib/reports'
import { buildBirthdayEntries, startOfDay } from '@/lib/birthdays'
import {
  buildAnniversaryEntries,
} from '@/lib/anniversaries'
import { buildCsvFilename, downloadCsv, toCsv } from '@/lib/csv'
import { formatDate, fullName, pluralize } from '@/lib/format'
import { MEMBER_STATUS_LABELS } from '@/lib/member-status'
import type { Family, Member, SpouseCouple } from '@/types'

const NO_MEMBERS: Member[] = []
const NO_FAMILIES: Family[] = []
const NO_COUPLES: SpouseCouple[] = []

const BAPTISM_LABELS: Record<Member['baptismStatus'], string> = {
  baptised: 'Baptised',
  'not-baptised': 'Not baptised',
  unknown: 'Unknown',
}

interface MemberColumn {
  key: string
  label: string
  value: (member: Member) => string
  /** Personal contact info: off by default, opt-in by the administrator. */
  sensitive?: boolean
}

const MEMBER_COLUMNS: MemberColumn[] = [
  { key: 'id', label: 'Member ID', value: (m) => m.id },
  { key: 'firstName', label: 'First name', value: (m) => m.firstName },
  { key: 'lastName', label: 'Last name', value: (m) => m.lastName },
  { key: 'gender', label: 'Gender', value: (m) => (m.gender === 'male' ? 'Male' : 'Female') },
  { key: 'dateOfBirth', label: 'Date of birth', value: (m) => m.dateOfBirth ?? '' },
  { key: 'maritalStatus', label: 'Marital status', value: (m) => m.maritalStatus },
  { key: 'status', label: 'Status', value: (m) => MEMBER_STATUS_LABELS[m.status] },
  { key: 'role', label: 'Membership role', value: (m) => m.role },
  { key: 'joinedAt', label: 'Joined', value: (m) => m.joinedAt },
  { key: 'baptismStatus', label: 'Baptism', value: (m) => BAPTISM_LABELS[m.baptismStatus] },
  { key: 'city', label: 'City', value: (m) => m.city },
  { key: 'ministries', label: 'Ministries', value: (m) => m.ministries.join('; ') },
  { key: 'address', label: 'Address', value: (m) => m.address, sensitive: true },
  { key: 'email', label: 'Email', value: (m) => m.email, sensitive: true },
  { key: 'phone', label: 'Phone', value: (m) => m.phone, sensitive: true },
]

const DEFAULT_COLUMNS = MEMBER_COLUMNS.filter((c) => !c.sensitive).map((c) => c.key)

function BarList({ title, slices }: { title: string; slices: Slice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Badge tone="navy">{total}</Badge>
      </CardHeader>
      <div className="space-y-3 p-5">
        {slices.length === 0 ? (
          <p className="text-sm text-navy-400">No data.</p>
        ) : (
          slices.map((slice) => {
            const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0
            return (
              <div key={slice.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-navy-700">{slice.label}</span>
                  <span className="font-medium text-navy-900">
                    {slice.value}
                    <span className="ml-1 text-xs font-normal text-navy-400">
                      ({pct}%)
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream-200">
                  <div
                    className="h-full rounded-full bg-navy-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}

interface ReportStatProps {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint: string
}

function ReportStat({ icon: Icon, label, value, hint }: ReportStatProps) {
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

export default function ReportsPage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()
  const members = useAsync(() => listMembers(), [])
  const families = useAsync(() => listFamilies(), [])
  const couples = useAsync(() => listSpouseCouples(), [])

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMNS)

  const [today] = useState(() => startOfDay(new Date()))
  const memberList = members.status === 'success' ? members.data : NO_MEMBERS
  const familyList = families.status === 'success' ? families.data : NO_FAMILIES
  const coupleList =
    couples.status === 'success' ? couples.data.couples : NO_COUPLES

  const status = useMemo(() => statusBreakdown(memberList), [memberList])
  const gender = useMemo(() => genderBreakdown(memberList), [memberList])
  const marital = useMemo(() => maritalBreakdown(memberList), [memberList])
  const baptism = useMemo(() => baptismBreakdown(memberList), [memberList])
  const ministry = useMemo(() => ministryBreakdown(memberList), [memberList])
  const households = useMemo(
    () => familyReport(memberList, familyList),
    [memberList, familyList],
  )

  const upcomingBirthdays = useMemo(
    () =>
      buildBirthdayEntries(memberList, today).filter((e) => e.daysAway <= 30),
    [memberList, today],
  )
  const upcomingAnniversaries = useMemo(
    () =>
      buildAnniversaryEntries(coupleList, today).filter((e) => e.daysAway <= 30),
    [coupleList, today],
  )

  const ranged = useMemo(
    () => joinedInRange(memberList, from || undefined, to || undefined),
    [memberList, from, to],
  )

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    if (!q) return memberList
    return memberList.filter((m) =>
      [m.id, m.firstName, m.lastName, m.email]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [memberList, memberQuery])

  const activeColumns = MEMBER_COLUMNS.filter((c) =>
    selectedColumns.includes(c.key),
  )

  const toggleColumn = (key: string) => {
    setSelectedColumns((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    )
  }

  const exportMembers = () => {
    if (activeColumns.length === 0) {
      toast({
        title: 'Choose at least one column',
        description: 'Select the columns you want in the export.',
        variant: 'error',
      })
      return
    }
    const csv = toCsv(
      activeColumns.map((c) => c.label),
      filteredMembers.map((m) => activeColumns.map((c) => c.value(m))),
    )
    const ok = downloadCsv(buildCsvFilename('members'), csv)
    toast({
      title: ok ? 'Export started' : 'Export unavailable',
      description: ok
        ? `${filteredMembers.length} ${pluralize(filteredMembers.length, 'member')} exported.`
        : 'This environment cannot download files.',
      variant: ok ? 'success' : 'error',
    })
  }

  const exportJoined = () => {
    const csv = toCsv(
      ['Member ID', 'Name', 'Joined', 'Status'],
      ranged.map((m) => [m.id, fullName(m.firstName, m.lastName), m.joinedAt, m.status]),
    )
    const ok = downloadCsv(buildCsvFilename('joined-members'), csv)
    toast({
      title: ok ? 'Export started' : 'Export unavailable',
      description: `${ranged.length} ${pluralize(ranged.length, 'member')}.`,
      variant: ok ? 'success' : 'error',
    })
  }

  const exportMinistries = () => {
    const csv = toCsv(
      ['Ministry', 'Members'],
      ministry.ministries.map((s) => [s.label, s.value]),
    )
    const ok = downloadCsv(buildCsvFilename('ministries'), csv)
    toast({ title: ok ? 'Export started' : 'Export unavailable', variant: ok ? 'success' : 'error' })
  }

  const exportFamilies = () => {
    const csv = toCsv(
      ['Family code', 'Family', 'Members'],
      households.sizes.map((f) => [f.code, f.name, f.memberCount]),
    )
    const ok = downloadCsv(buildCsvFilename('families'), csv)
    toast({ title: ok ? 'Export started' : 'Export unavailable', variant: ok ? 'success' : 'error' })
  }

  const loading = members.status === 'loading'

  return (
    <>
      <Header
        title="Reports"
        subtitle="Administrative summaries for the church directory."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        {members.status === 'error' && (
          <Card>
            <EmptyState
              icon={AlertCircle}
              title="Could not load reports"
              description={members.error}
              action={<Button onClick={members.reload}>Try again</Button>}
            />
          </Card>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="mt-3 h-3 w-20" />
                <Skeleton className="mt-2 h-6 w-12" />
              </Card>
            ))}
          </div>
        )}

        {members.status === 'success' && (
          <>
            <section
              aria-label="Member totals"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <ReportStat
                icon={Users}
                label="Total members"
                value={memberList.length}
                hint={pluralize(memberList.length, 'record')}
              />
              <ReportStat
                icon={UsersRound}
                label="Active"
                value={memberList.filter((m) => m.status === 'active').length}
                hint="Currently active"
              />
              <ReportStat
                icon={Layers}
                label="Serving in a ministry"
                value={ministry.uniqueMembers}
                hint={`${ministry.unassigned} not yet serving`}
              />
              <ReportStat
                icon={Home}
                label="Families"
                value={households.totalFamilies}
                hint={`${households.activeFamilies} active`}
              />
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <BarList title="Members by status" slices={status} />
              <BarList title="Members by gender" slices={gender} />
              <BarList title="Members by marital status" slices={marital} />
              <BarList title="Members by baptism" slices={baptism} />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                    <Layers className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Members by ministry</CardTitle>
                    <p className="text-sm text-navy-500">
                      {ministry.assignments} assignments across {ministry.uniqueMembers}{' '}
                      {pluralize(ministry.uniqueMembers, 'member')}.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="size-4" />}
                  onClick={exportMinistries}
                  disabled={ministry.ministries.length === 0}
                >
                  CSV
                </Button>
              </CardHeader>
              {ministry.ministries.length === 0 ? (
                <p className="p-6 text-sm text-navy-400">
                  No ministry assignments recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-cream-200">
                  {ministry.ministries.map((slice) => (
                    <li
                      key={slice.label}
                      className="flex items-center justify-between px-6 py-3 text-sm"
                    >
                      <span className="text-navy-700">{slice.label}</span>
                      <span className="font-medium text-navy-900">
                        {slice.value}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="border-t border-cream-200 px-6 py-3 text-xs text-navy-400">
                A member serving in several ministries is counted once under each
                ministry; the distinct total above counts each member once.
              </p>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                      <Cake className="size-5" />
                    </span>
                    <CardTitle>Upcoming birthdays</CardTitle>
                  </div>
                  <Badge tone="navy">{upcomingBirthdays.length}</Badge>
                </CardHeader>
                {upcomingBirthdays.length === 0 ? (
                  <p className="p-6 text-sm text-navy-400">
                    No birthdays in the next 30 days.
                  </p>
                ) : (
                  <ul className="divide-y divide-cream-200">
                    {upcomingBirthdays.slice(0, 8).map((entry) => (
                      <li
                        key={entry.member.id}
                        className="flex items-center justify-between px-6 py-3 text-sm"
                      >
                        <span className="text-navy-700">
                          {fullName(entry.member.firstName, entry.member.lastName)}
                        </span>
                        <span className="text-xs text-navy-400">
                          {formatDate(entry.next.toISOString())}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                      <HeartHandshake className="size-5" />
                    </span>
                    <CardTitle>Upcoming anniversaries</CardTitle>
                  </div>
                  <Badge tone="navy">{upcomingAnniversaries.length}</Badge>
                </CardHeader>
                {couples.status === 'success' && !couples.data.available ? (
                  <p className="p-6 text-sm text-navy-400">
                    Anniversary tracking is not enabled yet.
                  </p>
                ) : upcomingAnniversaries.length === 0 ? (
                  <p className="p-6 text-sm text-navy-400">
                    No anniversaries in the next 30 days.
                  </p>
                ) : (
                  <ul className="divide-y divide-cream-200">
                    {upcomingAnniversaries.slice(0, 8).map((entry) => (
                      <li
                        key={entry.couple.relationshipId}
                        className="flex items-center justify-between px-6 py-3 text-sm"
                      >
                        <span className="text-navy-700">
                          {entry.couple.members
                            .map((p) => fullName(p.firstName, p.lastName))
                            .join(' & ')}
                        </span>
                        <span className="text-xs text-navy-400">
                          {entry.years} yrs · {formatDate(entry.next.toISOString())}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                    <Home className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Families</CardTitle>
                    <p className="text-sm text-navy-500">
                      {households.membersInFamilies} in a household ·{' '}
                      {households.membersWithoutFamily} without
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="size-4" />}
                  onClick={exportFamilies}
                  disabled={households.sizes.length === 0}
                >
                  CSV
                </Button>
              </CardHeader>
              {households.sizes.length === 0 ? (
                <p className="p-6 text-sm text-navy-400">No families recorded.</p>
              ) : (
                <ul className="divide-y divide-cream-200">
                  {households.sizes.slice(0, 10).map((family) => (
                    <li
                      key={family.code}
                      className="flex items-center justify-between px-6 py-3 text-sm"
                    >
                      <span className="text-navy-700">
                        {family.name}{' '}
                        <span className="font-mono text-xs text-navy-400">
                          {family.code}
                        </span>
                      </span>
                      <Badge tone="neutral">{family.memberCount}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                    <Search className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Members who joined in a date range</CardTitle>
                    <p className="text-sm text-navy-500">
                      {ranged.length} {pluralize(ranged.length, 'member')} matched.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="size-4" />}
                  onClick={exportJoined}
                  disabled={ranged.length === 0}
                >
                  CSV
                </Button>
              </CardHeader>
              <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
                <Input
                  type="date"
                  label="Joined from"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <Input
                  type="date"
                  label="Joined to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
              {ranged.length > 0 && (
                <ul className="divide-y divide-cream-200 border-t border-cream-200">
                  {ranged.slice(0, 8).map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between px-6 py-3 text-sm"
                    >
                      <span className="text-navy-700">
                        {fullName(m.firstName, m.lastName)}
                      </span>
                      <span className="text-xs text-navy-400">
                        {formatDate(m.joinedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                    <Download className="size-5" />
                  </span>
                  <div>
                    <CardTitle>Export member list</CardTitle>
                    <p className="text-sm text-navy-500">
                      {filteredMembers.length}{' '}
                      {pluralize(filteredMembers.length, 'member')} · choose the columns
                      to include.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  icon={<Download className="size-4" />}
                  onClick={exportMembers}
                  disabled={filteredMembers.length === 0}
                >
                  Export CSV
                </Button>
              </CardHeader>
              <div className="space-y-4 p-6">
                <Input
                  label="Search members"
                  placeholder="Name, member ID or email"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  leadingIcon={<Search className="size-4.5" />}
                />
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {MEMBER_COLUMNS.map((column) => (
                    <label
                      key={column.key}
                      className="flex items-center gap-2 text-sm text-navy-700"
                    >
                      <input
                        type="checkbox"
                        className="size-4 rounded border-cream-300 text-navy-800 accent-navy-800"
                        checked={selectedColumns.includes(column.key)}
                        onChange={() => toggleColumn(column.key)}
                      />
                      {column.label}
                      {column.sensitive && (
                        <span className="text-xs text-amber-600">(sensitive)</span>
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-navy-400">
                  Exports run in your browser and download directly to this device.
                  Contact columns are off by default. Prayer points and spiritual
                  notes are never included.
                </p>
              </div>
            </Card>
          </>
        )}
      </Page>
    </>
  )
}
