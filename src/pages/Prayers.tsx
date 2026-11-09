import { useState, type FormEvent } from 'react'
import {
  Archive,
  ArchiveRestore,
  BellRing,
  FolderPlus,
  HandHeart,
  Pencil,
  Plus,
  Send,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Select, Textarea } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import {
  countPrayerReminders,
  createPrayerCategory,
  createPrayerItem,
  DEFAULT_PRAYER_REMINDER,
  listPrayerCategories,
  listPrayerItems,
  sendPrayerReminder,
  setPrayerCategoryArchived,
  setPrayerItemArchived,
  updatePrayerCategory,
  updatePrayerItem,
} from '@/services/prayers'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PrayerCategory, PrayerItem } from '@/types'

/** Stable empty list so memo dependencies do not change while loading. */
const EMPTY_CATEGORIES: PrayerCategory[] = []

/**
 * Prayer management (super admin).
 *
 * Categories and prayers start empty on purpose — the administrator enters the
 * church's real prayer content; nothing is seeded or invented here. Reminders
 * are manual and create in-app notifications only.
 */
export default function PrayersPage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()

  const [includeArchived, setIncludeArchived] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const categories = useAsync(
    () => listPrayerCategories(includeArchived),
    [includeArchived],
  )
  const categoryList =
    categories.status === 'success' ? categories.data : EMPTY_CATEGORIES
  // Fall back to "all" when a filter no longer matches a visible category.
  const effectiveCategoryFilter =
    categoryFilter &&
    categoryList.some((category) => category.id === categoryFilter)
      ? categoryFilter
      : null
  const items = useAsync(
    () => listPrayerItems(effectiveCategoryFilter, includeArchived),
    [effectiveCategoryFilter, includeArchived],
  )

  const [categoryOpen, setCategoryOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<PrayerCategory | null>(
    null,
  )
  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [categoryError, setCategoryError] = useState<string | undefined>()
  const [savingCategory, setSavingCategory] = useState(false)

  const [itemOpen, setItemOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PrayerItem | null>(null)
  const [itemCategoryId, setItemCategoryId] = useState('')
  const [itemTitle, setItemTitle] = useState('')
  const [itemDescription, setItemDescription] = useState('')
  const [itemError, setItemError] = useState<string | undefined>()
  const [savingItem, setSavingItem] = useState(false)

  const [archiveTarget, setArchiveTarget] = useState<
    | { kind: 'category'; row: PrayerCategory }
    | { kind: 'item'; row: PrayerItem }
    | null
  >(null)
  const [archiving, setArchiving] = useState(false)

  const [reminderItem, setReminderItem] = useState<PrayerItem | null>(null)
  const [reminderTitle, setReminderTitle] = useState('')
  const [reminderMessage, setReminderMessage] = useState(DEFAULT_PRAYER_REMINDER)
  const [reminderError, setReminderError] = useState<string | undefined>()
  const [reminderCount, setReminderCount] = useState(0)
  const [sending, setSending] = useState(false)

  const activeCategoryOptions = categoryList
    .filter((category) => category.archivedAt === null)
    .map((category) => ({ value: category.id, label: category.name }))

  const refreshAll = () => {
    categories.reload()
    items.reload()
  }

  const openCreateCategory = () => {
    setEditingCategory(null)
    setCategoryName('')
    setCategoryDescription('')
    setCategoryError(undefined)
    setCategoryOpen(true)
  }

  const openEditCategory = (category: PrayerCategory) => {
    setEditingCategory(category)
    setCategoryName(category.name)
    setCategoryDescription(category.description)
    setCategoryError(undefined)
    setCategoryOpen(true)
  }

  const handleCategorySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!categoryName.trim()) {
      setCategoryError('Enter a category name.')
      return
    }
    setSavingCategory(true)
    setCategoryError(undefined)
    try {
      if (editingCategory) {
        await updatePrayerCategory(
          editingCategory.id,
          categoryName,
          categoryDescription,
        )
        toast({ title: 'Category updated', variant: 'success' })
      } else {
        await createPrayerCategory(categoryName, categoryDescription)
        toast({ title: 'Category created', variant: 'success' })
      }
      setCategoryOpen(false)
      refreshAll()
    } catch (error) {
      setCategoryError(
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setSavingCategory(false)
    }
  }

  const openCreateItem = () => {
    const firstCategory = activeCategoryOptions[0]?.value ?? ''
    setEditingItem(null)
    setItemCategoryId(firstCategory)
    setItemTitle('')
    setItemDescription('')
    setItemError(undefined)
    setItemOpen(true)
  }

  const openEditItem = (item: PrayerItem) => {
    setEditingItem(item)
    setItemCategoryId(item.categoryId)
    setItemTitle(item.title)
    setItemDescription(item.description)
    setItemError(undefined)
    setItemOpen(true)
  }

  const handleItemSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!itemCategoryId) {
      setItemError('Create a category first, then choose it here.')
      return
    }
    if (!itemTitle.trim()) {
      setItemError('Enter a prayer title.')
      return
    }
    setSavingItem(true)
    setItemError(undefined)
    const payload = {
      categoryId: itemCategoryId,
      title: itemTitle,
      description: itemDescription,
    }
    try {
      if (editingItem) {
        await updatePrayerItem(editingItem.id, payload)
        toast({ title: 'Prayer updated', variant: 'success' })
      } else {
        await createPrayerItem(payload)
        toast({ title: 'Prayer added', variant: 'success' })
      }
      setItemOpen(false)
      refreshAll()
    } catch (error) {
      setItemError(
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setSavingItem(false)
    }
  }

  const handleArchive = async () => {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      if (archiveTarget.kind === 'category') {
        await setPrayerCategoryArchived(
          archiveTarget.row.id,
          archiveTarget.row.archivedAt === null,
        )
      } else {
        await setPrayerItemArchived(
          archiveTarget.row.id,
          archiveTarget.row.status === 'active',
        )
      }
      toast({
        title:
          archiveTarget.kind === 'category'
            ? archiveTarget.row.archivedAt === null
              ? 'Category archived'
              : 'Category restored'
            : archiveTarget.row.status === 'active'
              ? 'Prayer archived'
              : 'Prayer restored',
        variant: 'success',
      })
      setArchiveTarget(null)
      refreshAll()
    } catch (error) {
      toast({
        title: 'Could not update the archive state',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setArchiving(false)
    }
  }

  const openReminder = async (item: PrayerItem) => {
    setReminderItem(item)
    setReminderTitle(`Prayer reminder — ${item.title}`)
    setReminderMessage(DEFAULT_PRAYER_REMINDER)
    setReminderError(undefined)
    setReminderCount(0)
    try {
      setReminderCount(await countPrayerReminders(item.id))
    } catch {
      setReminderCount(0)
    }
  }

  const handleSendReminder = async () => {
    if (!reminderItem) return
    if (!reminderTitle.trim() || !reminderMessage.trim()) {
      setReminderError('A title and message are both required.')
      return
    }
    setSending(true)
    setReminderError(undefined)
    try {
      const result = await sendPrayerReminder(
        reminderItem.id,
        reminderTitle,
        reminderMessage,
      )
      const { sent, failed, alreadySent, recipients, skipped } = result

      if (failed > 0) {
        setReminderError(
          `${failed} push notification${failed === 1 ? '' : 's'} failed to deliver. ` +
            `In-app reminder saved for ${recipients} member${
              recipients === 1 ? '' : 's'
            }. ${sent} device${sent === 1 ? '' : 's'} delivered` +
            `${alreadySent > 0 ? `, ${alreadySent} already delivered` : ''}. ` +
            'Pressing Send again will retry only the devices that have not received it.',
        )
        toast({
          title: `${failed} push notification${failed === 1 ? '' : 's'} failed`,
          description: `In-app reminder saved for ${recipients} member${
            recipients === 1 ? '' : 's'
          }.`,
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
        setReminderItem(null)
      } else {
        toast({
          title:
            sent > 0
              ? `${sent} reminder${sent === 1 ? '' : 's'} delivered`
              : alreadySent > 0
                ? 'Reminder already delivered'
                : 'No eligible recipients',
          description:
            recipients > 0
              ? `In-app reminder saved for ${recipients} member${
                  recipients === 1 ? '' : 's'
                }${sent > 0 ? ` · ${sent} device${sent === 1 ? '' : 's'} delivered` : ''}.`
              : 'No active member accounts are linked, so nothing was sent.',
          variant: recipients > 0 ? 'success' : 'info',
        })
        setReminderItem(null)
      }

      setReminderCount(await countPrayerReminders(reminderItem.id))
    } catch (error) {
      setReminderError(
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Header
        title="Prayers"
        subtitle="Organise prayer categories, requests and reminders."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
              <HandHeart className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-navy-900">Prayer register</p>
              <p className="text-sm text-navy-500">
                Add the church's real prayer content. Reminders are sent manually
                and appear in-app only.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<FolderPlus className="size-4" />}
              onClick={openCreateCategory}
            >
              New category
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={openCreateItem}
              disabled={activeCategoryOptions.length === 0}
            >
              New prayer
            </Button>
          </div>
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Switch
            label="Show archived"
            description="Archived categories and prayers stay editable and restorable."
            checked={includeArchived}
            onChange={setIncludeArchived}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-navy-400 uppercase">
              Filter
            </span>
            <button
              type="button"
              onClick={() => setCategoryFilter(null)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                effectiveCategoryFilter === null
                  ? 'border-navy-900 bg-navy-900 text-white'
                  : 'border-cream-300 bg-white text-navy-600 hover:border-navy-300',
              )}
            >
              All categories
            </button>
            {categoryList.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryFilter(category.id)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  effectiveCategoryFilter === category.id
                    ? 'border-navy-900 bg-navy-900 text-white'
                    : 'border-cream-300 bg-white text-navy-600 hover:border-navy-300',
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <Card className="overflow-hidden xl:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Categories</CardTitle>
                <p className="text-sm text-navy-500">
                  {categoryList.length} categor
                  {categoryList.length === 1 ? 'y' : 'ies'}
                </p>
              </div>
            </CardHeader>

            {categories.status === 'loading' && (
              <div className="space-y-3 p-5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            )}

            {categories.status === 'error' && (
              <EmptyState
                icon={HandHeart}
                title="Could not load categories"
                description={categories.error}
                action={<Button onClick={categories.reload}>Try again</Button>}
              />
            )}

            {categories.status === 'success' && categoryList.length === 0 && (
              <EmptyState
                icon={FolderPlus}
                title="No categories yet"
                description="Create a category to start organising the church's prayer requests."
                action={
                  <Button
                    icon={<FolderPlus className="size-4" />}
                    onClick={openCreateCategory}
                  >
                    New category
                  </Button>
                }
              />
            )}

            {categories.status === 'success' && categoryList.length > 0 && (
              <ul className="divide-y divide-cream-200">
                {categoryList.map((category) => (
                  <li
                    key={category.id}
                    className={cn(
                      'flex items-start gap-3 px-5 py-3.5 transition',
                      category.archivedAt && 'bg-cream-50/60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setCategoryFilter(category.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-navy-900">
                          {category.name}
                        </span>
                        {category.archivedAt && (
                          <Badge tone="neutral">Archived</Badge>
                        )}
                      </span>
                      {category.description && (
                        <span className="mt-0.5 block truncate text-xs text-navy-400">
                          {category.description}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-navy-400">
                        {category.itemCount} active prayer
                        {category.itemCount === 1 ? '' : 's'}
                      </span>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => openEditCategory(category)}
                        className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setArchiveTarget({ kind: 'category', row: category })
                        }
                        className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
                        aria-label={
                          category.archivedAt
                            ? `Restore ${category.name}`
                            : `Archive ${category.name}`
                        }
                      >
                        {category.archivedAt ? (
                          <ArchiveRestore className="size-4" />
                        ) : (
                          <Archive className="size-4" />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden xl:col-span-3">
            <CardHeader>
              <div>
                <CardTitle>Prayer requests</CardTitle>
                <p className="text-sm text-navy-500">
                  {items.status === 'success'
                    ? `${items.data.length} prayer${
                        items.data.length === 1 ? '' : 's'
                      } shown`
                    : 'Loading prayers…'}
                </p>
              </div>
            </CardHeader>

            {items.status === 'loading' && (
              <div className="space-y-3 p-5">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {items.status === 'error' && (
              <EmptyState
                icon={HandHeart}
                title="Could not load prayers"
                description={items.error}
                action={<Button onClick={items.reload}>Try again</Button>}
              />
            )}

            {items.status === 'success' && items.data.length === 0 && (
              <EmptyState
                icon={HandHeart}
                title={
                  activeCategoryOptions.length === 0
                    ? 'Create a category first'
                    : 'No prayers here yet'
                }
                description={
                  activeCategoryOptions.length === 0
                    ? 'Prayers are organised by category. Add one to begin.'
                    : 'Add a prayer request and it will appear here for reminders.'
                }
                action={
                  activeCategoryOptions.length === 0 ? (
                    <Button
                      icon={<FolderPlus className="size-4" />}
                      onClick={openCreateCategory}
                    >
                      New category
                    </Button>
                  ) : (
                    <Button
                      icon={<Plus className="size-4" />}
                      onClick={openCreateItem}
                    >
                      New prayer
                    </Button>
                  )
                }
              />
            )}

            {items.status === 'success' && items.data.length > 0 && (
              <ul className="divide-y divide-cream-200">
                {items.data.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      'flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between',
                      item.status === 'archived' && 'bg-cream-50/60',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-navy-900">
                          {item.title}
                        </p>
                        {item.categoryName && (
                          <Badge tone="navy">{item.categoryName}</Badge>
                        )}
                        {item.status === 'archived' && (
                          <Badge tone="neutral">Archived</Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-1 text-sm text-navy-500">
                          {item.description}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-navy-400">
                        Added {formatDate(item.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      {item.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => openReminder(item)}
                          className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
                          aria-label={`Send reminder for ${item.title}`}
                        >
                          <BellRing className="size-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditItem(item)}
                        className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
                        aria-label={`Edit ${item.title}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setArchiveTarget({ kind: 'item', row: item })
                        }
                        className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-navy-800"
                        aria-label={
                          item.status === 'active'
                            ? `Archive ${item.title}`
                            : `Restore ${item.title}`
                        }
                      >
                        {item.status === 'active' ? (
                          <Archive className="size-4" />
                        ) : (
                          <ArchiveRestore className="size-4" />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Page>

      <Modal
        open={categoryOpen}
        onClose={() => (savingCategory ? undefined : setCategoryOpen(false))}
        title={editingCategory ? 'Edit category' : 'New prayer category'}
        description="Categories group related prayer requests."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCategoryOpen(false)}
              disabled={savingCategory}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="prayer-category-form"
              loading={savingCategory}
            >
              {editingCategory ? 'Save changes' : 'Create category'}
            </Button>
          </>
        }
      >
        <form
          id="prayer-category-form"
          className="space-y-4"
          onSubmit={handleCategorySubmit}
        >
          <Input
            label="Category name"
            value={categoryName}
            maxLength={80}
            required
            onChange={(event) => setCategoryName(event.target.value)}
          />
          <Textarea
            label="Description"
            value={categoryDescription}
            hint="Optional. A short note about what belongs in this category."
            onChange={(event) => setCategoryDescription(event.target.value)}
            error={categoryError}
          />
        </form>
      </Modal>

      <Modal
        open={itemOpen}
        onClose={() => (savingItem ? undefined : setItemOpen(false))}
        title={editingItem ? 'Edit prayer' : 'New prayer'}
        description="This content is shown to the administrator only; reminders go out in-app."
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setItemOpen(false)}
              disabled={savingItem}
            >
              Cancel
            </Button>
            <Button type="submit" form="prayer-item-form" loading={savingItem}>
              {editingItem ? 'Save changes' : 'Add prayer'}
            </Button>
          </>
        }
      >
        <form
          id="prayer-item-form"
          className="space-y-4"
          onSubmit={handleItemSubmit}
        >
          <Select
            label="Category"
            placeholder="Choose a category"
            options={activeCategoryOptions}
            value={itemCategoryId}
            required
            onChange={(event) => setItemCategoryId(event.target.value)}
          />
          <Input
            label="Prayer title"
            value={itemTitle}
            maxLength={120}
            required
            onChange={(event) => setItemTitle(event.target.value)}
          />
          <Textarea
            label="Details"
            value={itemDescription}
            hint="Optional. Add the details the church should pray over."
            onChange={(event) => setItemDescription(event.target.value)}
            error={itemError}
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(reminderItem)}
        onClose={() => (sending ? undefined : setReminderItem(null))}
        title="Send prayer reminder"
        description="Every active member with a linked account receives this in their notifications."
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setReminderItem(null)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              icon={<Send className="size-4" />}
              onClick={handleSendReminder}
              loading={sending}
            >
              Send reminder
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {reminderCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              This prayer already has {reminderCount} sent reminder
              {reminderCount === 1 ? '' : 's'}. Sending again refreshes the same
              notification instead of creating duplicates.
            </div>
          )}
          <div className="rounded-xl border border-cream-300 bg-cream-50 px-4 py-3">
            <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
              Prayer
            </p>
            <p className="mt-1 text-sm font-medium text-navy-900">
              {reminderItem?.title}
            </p>
            {reminderItem?.categoryName && (
              <p className="text-xs text-navy-400">{reminderItem.categoryName}</p>
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
            error={reminderError}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={
          archiveTarget?.kind === 'category'
            ? archiveTarget.row.archivedAt
              ? 'Restore this category?'
              : 'Archive this category?'
            : archiveTarget?.row.status === 'active'
              ? 'Archive this prayer?'
              : 'Restore this prayer?'
        }
        description={
          archiveTarget?.kind === 'category'
            ? archiveTarget.row.archivedAt
              ? 'The category and its prayers will be visible again.'
              : 'Archived categories are hidden from members but stay editable and restorable.'
            : archiveTarget?.row.status === 'active'
              ? 'Archived prayers are hidden and cannot be sent as reminders until restored.'
              : 'The prayer will be visible and available for reminders again.'
        }
        confirmLabel={
          archiveTarget?.kind === 'category'
            ? archiveTarget.row.archivedAt
              ? 'Restore'
              : 'Archive'
            : archiveTarget?.row.status === 'active'
              ? 'Archive'
              : 'Restore'
        }
        tone="primary"
        loading={archiving}
        onConfirm={handleArchive}
        onClose={() => setArchiveTarget(null)}
      />
    </>
  )
}
