import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  LayoutGrid,
  List,
  SlidersHorizontal,
  UserPlus,
  Users,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { MemberCard } from '@/components/members/MemberCard'
import { MemberTable } from '@/components/members/MemberTable'
import { MemberForm } from '@/components/members/MemberForm'
import type { MemberFormMarriage } from '@/components/members/MemberForm'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { MemberCardSkeleton, TableSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAuth } from '@/context/auth-context'
import { useMemberFields } from '@/context/member-fields-context'
import { useAsync } from '@/hooks/useAsync'
import { listMinistries } from '@/services/data'
import { listMinistryCatalog } from '@/services/ministries'
import {
  createMember,
  deleteMember,
  getNextMemberId,
  listMembers,
  updateMember,
  type MemberFilters,
} from '@/services/members'
import {
  listFamilies,
  listSpouseCouples,
  saveMemberMarriage,
} from '@/services/families'
import { pluralize, fullName } from '@/lib/format'
import { MEMBER_STATUS_OPTIONS } from '@/lib/member-status'
import { isStaffRole } from '@/lib/roles'
import type { Member, MemberInput } from '@/types'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...MEMBER_STATUS_OPTIONS,
]

type MemberSort = 'name-asc' | 'name-desc' | 'joined-desc' | 'joined-asc'

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
  { value: 'joined-desc', label: 'Newest first' },
  { value: 'joined-asc', label: 'Oldest first' },
]

const PAGE_SIZE = 12

type StatusFilter = NonNullable<MemberFilters['status']>

export default function MembersPage() {
  const { openMenu } = useAppShell()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { settings } = useMemberFields()
  const [searchParams, setSearchParams] = useSearchParams()

  // Only staff/super_admin can add, edit and remove members.
  // Members can add their OWN profile only, and only if they do not already
  // have a linked member record (prevents duplicate profiles).
  const canManage = isStaffRole(user?.role)
  const alreadyLinked = Boolean(user?.memberCode)
  const canAddMember =
    isStaffRole(user?.role) || (user?.role === 'member' && !alreadyLinked)

  const urlQuery = searchParams.get('q') ?? ''
  const [query, setQuery] = useState(urlQuery)
  const [syncedQuery, setSyncedQuery] = useState(urlQuery)

  // Adopt external URL changes (e.g. header search) during render, without an
  // effect — the React-recommended "adjust state when props change" pattern.
  if (urlQuery !== syncedQuery) {
    setSyncedQuery(urlQuery)
    setQuery(urlQuery)
  }

  const [status, setStatus] = useState<StatusFilter>('all')
  const [ministry, setMinistry] = useState('all')
  const [family, setFamily] = useState('all')
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [sort, setSort] = useState<MemberSort>('name-asc')
  const [page, setPage] = useState(1)

  // Add / edit / remove orchestration
  const [addOpen, setAddOpen] = useState(false)
  const [preparingAdd, setPreparingAdd] = useState(false)
  const [suggestedId, setSuggestedId] = useState('')
  const [editTarget, setEditTarget] = useState<Member | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [removing, setRemoving] = useState(false)

  // Auto-open the Add Member form when navigated with ?add=1 (e.g. from the
  // Dashboard "Add member" button or the "Complete your profile" prompt).
  useEffect(() => {
    if (searchParams.get('add') === '1' && canAddMember) {
      const next = new URLSearchParams(searchParams)
      next.delete('add')
      setSearchParams(next, { replace: true })
      openAdd()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canAddMember])

  const members = useAsync(
    () => listMembers({ query, status, ministry, family }),
    [query, status, ministry, family],
  )
  // Unfiltered directory, used for unique-ID checks and family-name lookup.
  const directory = useAsync(() => listMembers(), [])
  const ministries = useAsync(() => listMinistries(), [])
  const ministryCatalog = useAsync(() => listMinistryCatalog(), [])
  const families = useAsync(() => listFamilies(), [])
  const spouseCouples = useAsync(() => listSpouseCouples(), [])

  /** Member code -> current spouse + wedding date, for pre-filling the form. */
  const spouseByMember = useMemo(() => {
    const map = new Map<string, MemberFormMarriage>()
    if (spouseCouples.status === 'success') {
      for (const couple of spouseCouples.data.couples) {
        const [a, b] = couple.members
        const anniversaryDate = couple.date ?? ''
        map.set(a.memberCode, { spouseCode: b.memberCode, anniversaryDate })
        map.set(b.memberCode, { spouseCode: a.memberCode, anniversaryDate })
      }
    }
    return map
  }, [spouseCouples])

  /** Standard catalogue names unioned with tags already on member records. */
  const ministryNames = useMemo(() => {
    const names = new Set<string>()
    if (ministryCatalog.status === 'success') {
      for (const item of ministryCatalog.data) names.add(item.name)
    }
    if (ministries.status === 'success') {
      for (const m of ministries.data) names.add(m.name)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [ministryCatalog, ministries])

  const ministryOptions = useMemo(
    () => [
      { value: 'all', label: 'All ministries' },
      ...ministryNames.map((name) => ({ value: name, label: name })),
    ],
    [ministryNames],
  )

  const familyOptions = useMemo(
    () => [
      { value: 'all', label: 'All families' },
      ...(families.status === 'success'
        ? families.data.map((f) => ({ value: f.id, label: f.name }))
        : []),
    ],
    [families],
  )

  const familyNames = useMemo(() => {
    const map: Record<string, string> = {}
    if (families.status === 'success') {
      for (const f of families.data) map[f.id] = f.name
    }
    return map
  }, [families])

  const directoryMembers =
    directory.status === 'success' ? directory.data : []
  const existingIds = new Set(directoryMembers.map((m) => m.id))

  const updateQuery = (value: string) => {
    setQuery(value)
    setPage(1)
    const next = new URLSearchParams(searchParams)
    if (value) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const clearFilters = () => {
    updateQuery('')
    setStatus('all')
    setMinistry('all')
    setFamily('all')
    setPage(1)
  }

  const reloadAll = () => {
    members.reload()
    directory.reload()
    spouseCouples.reload()
  }

  const openAdd = async () => {
    if (preparingAdd) return
    setPreparingAdd(true)
    try {
      const id = await getNextMemberId()
      setSuggestedId(id)
      setAddOpen(true)
    } catch (error) {
      toast({
        title: 'Could not start a new member',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setPreparingAdd(false)
    }
  }

  const handleCreate = async (
    input: MemberInput,
    marriage: MemberFormMarriage,
  ) => {
    const created = await createMember(input)
    let marriageWarning: string | null = null
    try {
      await saveMemberMarriage(created.id, marriage)
    } catch (error) {
      marriageWarning =
        error instanceof Error
          ? error.message
          : 'The spouse link or anniversary could not be saved.'
    }
    setAddOpen(false)
    reloadAll()
    toast(
      marriageWarning
        ? {
            title: 'Member added, but marriage details were not saved',
            description: marriageWarning,
            variant: 'error',
          }
        : {
            title: 'Member added',
            description: `${fullName(created.firstName, created.lastName)} (${created.id}) was added to the directory.`,
            variant: 'success',
          },
    )
  }

  const handleUpdate = async (
    input: MemberInput,
    marriage: MemberFormMarriage,
  ) => {
    if (!editTarget) return
    const updated = await updateMember(editTarget.id, input)
    let marriageWarning: string | null = null
    try {
      await saveMemberMarriage(updated.id, marriage)
    } catch (error) {
      marriageWarning =
        error instanceof Error
          ? error.message
          : 'The spouse link or anniversary could not be saved.'
    }
    setEditTarget(null)
    reloadAll()
    toast(
      marriageWarning
        ? {
            title: 'Member saved, but marriage details were not saved',
            description: marriageWarning,
            variant: 'error',
          }
        : {
            title: 'Member updated',
            description: `${fullName(updated.firstName, updated.lastName)} was saved.`,
            variant: 'success',
          },
    )
  }

  const handleDelete = async () => {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await deleteMember(removeTarget.id)
      const removed = removeTarget
      setRemoveTarget(null)
      reloadAll()
      toast({
        title: 'Member removed',
        description: `${fullName(removed.firstName, removed.lastName)} (${removed.id}) was removed from the directory.`,
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Could not remove member',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setRemoving(false)
    }
  }

  const results = members.status === 'success' ? members.data : []
  const filtersActive =
    Boolean(query) || status !== 'all' || ministry !== 'all' || family !== 'all'

  const sortedResults = [...results].sort((a, b) => {
    switch (sort) {
      case 'name-desc':
        return fullName(b.firstName, b.lastName).localeCompare(
          fullName(a.firstName, a.lastName),
        )
      case 'joined-desc':
        return (b.joinedAt ?? '').localeCompare(a.joinedAt ?? '')
      case 'joined-asc':
        return (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '')
      default:
        return fullName(a.firstName, a.lastName).localeCompare(
          fullName(b.firstName, b.lastName),
        )
    }
  })

  const pageCount = Math.max(1, Math.ceil(sortedResults.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = sortedResults.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  return (
    <>
      <Header
        title="Members"
        subtitle="Directory of the ACA Pozhichalur congregation."
        onMenuClick={openMenu}
        onAddMember={canAddMember ? openAdd : undefined}
      />
      <Page className="space-y-5">
        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput
              value={query}
              onChange={updateQuery}
              placeholder="Search by name, email or member ID…"
              className="flex-1"
            />
            <div className="grid grid-cols-2 gap-3 lg:w-auto lg:grid-cols-4">
              <div className="[&_label]:sr-only">
                <Select
                  label="Status"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as StatusFilter)
                    setPage(1)
                  }}
                  options={STATUS_OPTIONS}
                />
              </div>
              <div className="[&_label]:sr-only">
                <Select
                  label="Ministry"
                  value={ministry}
                  onChange={(event) => {
                    setMinistry(event.target.value)
                    setPage(1)
                  }}
                  options={ministryOptions}
                />
              </div>
              <div className="[&_label]:sr-only">
                <Select
                  label="Family"
                  value={family}
                  onChange={(event) => {
                    setFamily(event.target.value)
                    setPage(1)
                  }}
                  options={familyOptions}
                />
              </div>
              <div className="[&_label]:sr-only">
                <Select
                  label="Sort"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as MemberSort)
                    setPage(1)
                  }}
                  options={SORT_OPTIONS}
                />
              </div>
            </div>
            <div className="hidden items-center gap-1 rounded-xl border border-cream-300 bg-white p-1 lg:flex">
              <ViewToggle
                active={view === 'grid'}
                onClick={() => setView('grid')}
                label="Card view"
                icon={<LayoutGrid className="size-4.5" />}
              />
              <ViewToggle
                active={view === 'table'}
                onClick={() => setView('table')}
                label="Table view"
                icon={<List className="size-4.5" />}
              />
            </div>
            {canAddMember && (
              <Button
                icon={<UserPlus className="size-4" />}
                onClick={openAdd}
                loading={preparingAdd}
                className="sm:hidden"
              >
                Add member
              </Button>
            )}
          </div>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-navy-500">
            {members.status === 'success'
              ? sortedResults.length > 0
                ? `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${
                    (currentPage - 1) * PAGE_SIZE + pageItems.length
                  } of ${results.length} ${pluralize(results.length, 'member')}`
                : 'No members'
              : 'Loading members…'}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-900"
            >
              <SlidersHorizontal className="size-4" />
              Clear filters
            </button>
          )}
        </div>

        {members.status === 'loading' && view === 'grid' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <MemberCardSkeleton key={i} />
            ))}
          </div>
        )}

        {members.status === 'loading' && view === 'table' && (
          <Card className="overflow-hidden">
            <TableSkeleton />
          </Card>
        )}

        {members.status === 'error' && (
          <Card>
            <EmptyState
              icon={Users}
              title="Something went wrong"
              description={members.error}
              action={<Button onClick={members.reload}>Try again</Button>}
            />
          </Card>
        )}

        {members.status === 'success' && results.length === 0 && (
          <Card>
            <EmptyState
              icon={Users}
              title="No members found"
              description={
                filtersActive
                  ? 'Try adjusting your search or filters to find who you are looking for.'
                  : 'Members added to ACA Connect will appear here.'
              }
              action={
                filtersActive ? (
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : canAddMember ? (
                  <Button onClick={openAdd}>Add member</Button>
                ) : undefined
              }
            />
          </Card>
        )}

        {members.status === 'success' && results.length > 0 && view === 'grid' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                familyName={
                  member.familyId ? familyNames[member.familyId] : undefined
                }
                onSelect={(m) => navigate(`/members/${m.id}`)}
                onEdit={canManage ? setEditTarget : undefined}
                onRemove={canManage ? setRemoveTarget : undefined}
              />
            ))}
          </div>
        )}

        {members.status === 'success' && results.length > 0 && view === 'table' && (
          <Card className="hidden overflow-hidden md:block">
            <MemberTable
              members={pageItems}
              familyNames={familyNames}
              onSelect={(m) => navigate(`/members/${m.id}`)}
              onEdit={canManage ? setEditTarget : undefined}
              onRemove={canManage ? setRemoveTarget : undefined}
            />
          </Card>
        )}

        {members.status === 'success' && pageCount > 1 && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-sm text-navy-500">
              Page {currentPage} of {pageCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage >= pageCount}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Page>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a new member"
        description={`A unique ID (${suggestedId}) has been reserved for this record.`}
        size="lg"
      >
        <MemberForm
          mode="create"
          initial={null}
          suggestedId={suggestedId}
          families={families.status === 'success' ? families.data : []}
          ministries={ministryNames}
          settings={settings}
          existingIds={existingIds}
          spouseOptions={directoryMembers}
          onCancel={() => setAddOpen(false)}
          onSubmit={handleCreate}
        />
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit member"
        description={editTarget ? `Updating ${editTarget.id}` : undefined}
        size="lg"
      >
        {editTarget && (
          <MemberForm
            mode="edit"
            initial={editTarget}
            suggestedId={editTarget.id}
            families={families.status === 'success' ? families.data : []}
            ministries={ministryNames}
            settings={settings}
            existingIds={existingIds}
            spouseOptions={directoryMembers.filter(
              (m) => m.id !== editTarget.id,
            )}
            marriageDefaults={spouseByMember.get(editTarget.id)}
            onCancel={() => setEditTarget(null)}
            onSubmit={handleUpdate}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove this member?"
        description={
          removeTarget ? (
            <>
              <span className="font-medium text-navy-800">
                {fullName(removeTarget.firstName, removeTarget.lastName)}
              </span>{' '}
              ({removeTarget.id}) will be permanently removed from the directory.
              This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Remove member"
        loading={removing}
        onConfirm={handleDelete}
        onClose={() => setRemoveTarget(null)}
      />
    </>
  )
}

function ViewToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={
        'rounded-lg p-2 transition ' +
        (active
          ? 'bg-navy-900 text-cream-50'
          : 'text-navy-400 hover:bg-cream-200 hover:text-navy-800')
      }
    >
      {icon}
    </button>
  )
}
