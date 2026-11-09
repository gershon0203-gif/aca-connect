import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, House, MapPin, Plus, UserRound, Users } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { FamilyForm } from '@/components/families/FamilyForm'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import { createFamily, listFamilies } from '@/services/families'
import { pluralize } from '@/lib/format'
import type { Family, FamilyInput } from '@/types'

export default function FamiliesPage() {
  const { openMenu } = useAppShell()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const families = useAsync(() => listFamilies({ activeOnly: true }), [])
  const archived = useAsync(
    () => (showArchived ? listFamilies() : Promise.resolve([])),
    [showArchived],
  )

  const all = useMemo(() => {
    if (families.status !== 'success') return []
    const active = families.data
    if (!showArchived || archived.status !== 'success') return active
    const activeIds = new Set(active.map((f) => f.id))
    const archivedOnly = archived.data.filter(
      (f) => f.archivedAt && !activeIds.has(f.id),
    )
    return [...active, ...archivedOnly].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [families, archived, showArchived])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return all
    return all.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        f.id.toLowerCase().includes(needle) ||
        (f.address ?? '').toLowerCase().includes(needle) ||
        (f.primaryContactName ?? '').toLowerCase().includes(needle),
    )
  }, [all, query])

  const loading =
    families.status === 'loading' ||
    (showArchived && archived.status === 'loading')

  const handleCreate = async (input: FamilyInput) => {
    const created = await createFamily(input)
    setAddOpen(false)
    families.reload()
    if (showArchived) archived.reload()
    toast({
      title: 'Family added',
      description: `${created.name} (${created.id}) was added.`,
      variant: 'success',
    })
  }

  return (
    <>
      <Header
        title="Families"
        subtitle="The families in the ACA Pozhichalur congregation."
        onMenuClick={openMenu}
      />
      <Page className="space-y-5">
        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by family name, code or contact…"
              className="flex-1"
            />
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((prev) => !prev)}
              className={
                'inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition ' +
                (showArchived
                  ? 'border-navy-900 bg-navy-900 text-cream-50'
                  : 'border-cream-300 bg-white text-navy-600 hover:border-navy-300 hover:text-navy-900')
              }
            >
              <Archive className="size-4" />
              Show archived
            </button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setAddOpen(true)}
            >
              Add family
            </Button>
          </div>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-navy-500">
            {loading
              ? 'Loading families…'
              : `${results.length} ${pluralize(results.length, 'family', 'families')}`}
          </p>
        </div>

        {loading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="space-y-3 p-6">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-52" />
              </Card>
            ))}
          </div>
        )}

        {families.status === 'error' && (
          <Card>
            <EmptyState
              icon={House}
              title="Something went wrong"
              description={families.error}
              action={<Button onClick={families.reload}>Try again</Button>}
            />
          </Card>
        )}

        {!loading && families.status === 'success' && results.length === 0 && (
          <Card>
            <EmptyState
              icon={House}
              title={query ? 'No families match your search' : 'No families yet'}
              description={
                query
                  ? 'Try a different name, code or contact.'
                  : 'Group members into the family they belong to. Added families appear here.'
              }
              action={
                query ? (
                  <Button variant="secondary" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : (
                  <Button onClick={() => setAddOpen(true)}>Add family</Button>
                )
              }
            />
          </Card>
        )}

        {!loading && results.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((family) => (
              <FamilyCard
                key={family.id}
                family={family}
                onSelect={() => navigate(`/families/${family.id}`)}
              />
            ))}
          </div>
        )}
      </Page>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a family"
        description="A unique code is assigned automatically."
      >
        <FamilyForm
          mode="create"
          initial={null}
          onCancel={() => setAddOpen(false)}
          onSubmit={handleCreate}
        />
      </Modal>
    </>
  )
}

function FamilyCard({
  family,
  onSelect,
}: {
  family: Family
  onSelect: () => void
}) {
  const archived = Boolean(family.archivedAt)
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col gap-3 rounded-2xl border border-cream-300 bg-white p-5 text-left shadow-soft transition hover:border-navy-200 hover:shadow-lifted"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
            <House className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-navy-900">
              {family.name}
            </p>
            <p className="font-mono text-xs text-navy-400">{family.id}</p>
          </div>
        </div>
        {archived && <Badge tone="neutral">Archived</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-navy-500">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4 text-navy-400" />
          {family.memberCount ?? 0}{' '}
          {pluralize(family.memberCount ?? 0, 'member')}
        </span>
        {family.primaryContactName && (
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="size-4 text-navy-400" />
            {family.primaryContactName}
          </span>
        )}
      </div>

      {family.address && (
        <p className="inline-flex items-start gap-1.5 text-sm text-navy-500">
          <MapPin className="mt-0.5 size-4 shrink-0 text-navy-400" />
          <span className="min-w-0 truncate">{family.address}</span>
        </p>
      )}
    </button>
  )
}
