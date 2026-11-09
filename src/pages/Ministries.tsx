import { useState, type FormEvent } from 'react'
import {
  Archive,
  ArchiveRestore,
  Network,
  Pencil,
  Plus,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import {
  createMinistry,
  listMinistryCatalog,
  renameMinistry,
  setMinistryArchived,
} from '@/services/ministries'
import type { MinistryCatalogItem } from '@/types'

export default function MinistriesPage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()

  const [includeArchived, setIncludeArchived] = useState(false)
  const catalog = useAsync(
    () => listMinistryCatalog({ includeArchived }),
    [includeArchived],
  )

  const [formOpen, setFormOpen] = useState(false)
  const [formTarget, setFormTarget] = useState<MinistryCatalogItem | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [archiveTarget, setArchiveTarget] = useState<MinistryCatalogItem | null>(
    null,
  )
  const [archiving, setArchiving] = useState(false)

  const openCreate = () => {
    setFormTarget(null)
    setName('')
    setFormError(null)
    setFormOpen(true)
  }

  const openRename = (item: MinistryCatalogItem) => {
    setFormTarget(item)
    setName(item.name)
    setFormError(null)
    setFormOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      if (formTarget) {
        await renameMinistry(formTarget.id, name)
      } else {
        await createMinistry(name)
      }
      setFormOpen(false)
      catalog.reload()
      toast({
        title: formTarget ? 'Ministry renamed' : 'Ministry added',
        variant: 'success',
      })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveToggle = async () => {
    if (!archiveTarget) return
    const archived = !archiveTarget.archivedAt
    setArchiving(true)
    try {
      await setMinistryArchived(archiveTarget.id, archived)
      setArchiveTarget(null)
      catalog.reload()
      toast({
        title: archived ? 'Ministry archived' : 'Ministry restored',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Could not update ministry',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setArchiving(false)
    }
  }

  const items = catalog.status === 'success' ? catalog.data : []

  return (
    <>
      <Header
        title="Ministries"
        subtitle="The standard ministry list used across member records."
        onMenuClick={openMenu}
      />
      <Page className="space-y-5">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-navy-700">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              className="size-4 rounded border-cream-400 text-navy-900 focus:ring-navy-500"
            />
            Show archived
          </label>
          <Button icon={<Plus className="size-4" />} onClick={openCreate}>
            Add ministry
          </Button>
        </Card>

        {catalog.status === 'loading' && (
          <Card className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </Card>
        )}

        {catalog.status === 'error' && (
          <Card>
            <p className="p-6 text-sm text-red-600">{catalog.error}</p>
          </Card>
        )}

        {catalog.status === 'success' && items.length === 0 && (
          <Card>
            <EmptyState
              icon={Network}
              title="No ministries yet"
              description="Add the ministries this church serves in."
              action={<Button onClick={openCreate}>Add ministry</Button>}
            />
          </Card>
        )}

        {items.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Ministry list</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-cream-200">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 px-6 py-3.5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-navy-500">
                    <Network className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy-900">
                    {item.name}
                  </span>
                  {item.archivedAt && <Badge tone="neutral">Archived</Badge>}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openRename(item)}
                      aria-label={`Rename ${item.name}`}
                      className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(item)}
                      aria-label={
                        item.archivedAt
                          ? `Restore ${item.name}`
                          : `Archive ${item.name}`
                      }
                      className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
                    >
                      {item.archivedAt ? (
                        <ArchiveRestore className="size-4" />
                      ) : (
                        <Archive className="size-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Page>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={formTarget ? 'Rename ministry' : 'Add a ministry'}
        description={
          formTarget
            ? 'Member records keep their existing tags; only the catalogue label changes.'
            : 'Add a ministry to the standard list offered on member forms.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="ministry-form" loading={saving}>
              {formTarget ? 'Save name' : 'Add ministry'}
            </Button>
          </>
        }
      >
        <form id="ministry-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Ministry name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={formError ?? undefined}
            autoFocus
            required
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={
          archiveTarget?.archivedAt ? 'Restore this ministry?' : 'Archive this ministry?'
        }
        description={
          archiveTarget ? (
            archiveTarget.archivedAt ? (
              <>
                <span className="font-medium text-navy-800">
                  {archiveTarget.name}
                </span>{' '}
                will return to the standard list offered on member forms.
              </>
            ) : (
              <>
                <span className="font-medium text-navy-800">
                  {archiveTarget.name}
                </span>{' '}
                will be hidden from the standard list. Members already tagged
                with it keep their tag.
              </>
            )
          ) : null
        }
        confirmLabel={archiveTarget?.archivedAt ? 'Restore' : 'Archive'}
        loading={archiving}
        onConfirm={handleArchiveToggle}
        onClose={() => setArchiveTarget(null)}
      />
    </>
  )
}
