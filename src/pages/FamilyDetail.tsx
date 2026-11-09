import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Crown,
  House,
  MapPin,
  Pencil,
  StickyNote,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { FamilyForm } from '@/components/families/FamilyForm'
import {
  MemberLinker,
  type LinkableMember,
} from '@/components/families/MemberLinker'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Switch } from '@/components/ui/Switch'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import { listMembers } from '@/services/members'
import {
  addFamilyMember,
  deleteFamily,
  getFamily,
  removeFamilyMember,
  setFamilyArchived,
  setFamilyPrimaryContact,
  updateFamily,
} from '@/services/families'
import { fullName, pluralize } from '@/lib/format'
import type { FamilyInput } from '@/types'

export default function FamilyDetailPage() {
  const { code = '' } = useParams()
  const { openMenu } = useAppShell()
  const navigate = useNavigate()
  const { toast } = useToast()

  const family = useAsync(() => getFamily(code), [code])
  const directory = useAsync(() => listMembers(), [])

  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addMemberCode, setAddMemberCode] = useState<string | null>(null)
  const [addIsPrimary, setAddIsPrimary] = useState(true)
  const [addingMember, setAddingMember] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [removeMemberTarget, setRemoveMemberTarget] = useState<LinkableMember | null>(
    null,
  )
  const [removingMember, setRemovingMember] = useState(false)
  const [contactSaving, setContactSaving] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const directoryMembers = directory.status === 'success' ? directory.data : []
  const record = family.status === 'success' ? family.data : null

  const memberLinks: LinkableMember[] = useMemo(
    () =>
      (record?.members ?? []).map((m) => ({
        id: m.memberCode,
        firstName: m.firstName,
        lastName: m.lastName,
        avatarUrl: m.avatarUrl,
      })),
    [record],
  )

  const contactName = useMemo(() => {
    if (!record?.primaryContactMemberCode) return null
    const link = record.members.find(
      (m) => m.memberCode === record.primaryContactMemberCode,
    )
    return link ? fullName(link.firstName, link.lastName) : null
  }, [record])

  const reload = () => family.reload()

  const handleUpdate = async (input: FamilyInput) => {
    await updateFamily(code, input)
    setEditOpen(false)
    reload()
    toast({ title: 'Family updated', variant: 'success' })
  }

  const handleAddMember = async () => {
    if (!addMemberCode) {
      setAddError('Choose a member to add.')
      return
    }
    setAddingMember(true)
    setAddError(null)
    try {
      await addFamilyMember(code, addMemberCode, addIsPrimary)
      setAddOpen(false)
      setAddMemberCode(null)
      setAddIsPrimary(true)
      reload()
      toast({ title: 'Member added to family', variant: 'success' })
    } catch (error) {
      setAddError(error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setAddingMember(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!removeMemberTarget) return
    setRemovingMember(true)
    try {
      await removeFamilyMember(code, removeMemberTarget.id)
      setRemoveMemberTarget(null)
      reload()
      toast({ title: 'Member removed from family', variant: 'success' })
    } catch (error) {
      toast({
        title: 'Could not remove member',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setRemovingMember(false)
    }
  }

  const handleSetContact = async (memberCode: string | null) => {
    setContactSaving(true)
    try {
      await setFamilyPrimaryContact(code, memberCode)
      reload()
      toast({
        title: memberCode ? 'Primary contact updated' : 'Primary contact cleared',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Could not update the primary contact',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setContactSaving(false)
    }
  }

  const handleArchive = async () => {
    if (!record) return
    setBusy(true)
    try {
      const next = !record.archivedAt
      await setFamilyArchived(code, next)
      setArchiveOpen(false)
      reload()
      toast({
        title: next ? 'Family archived' : 'Family restored',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Could not update family',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    try {
      await deleteFamily(code)
      toast({ title: 'Family deleted', variant: 'success' })
      navigate('/families')
    } catch (error) {
      toast({
        title: 'Could not delete family',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
      setBusy(false)
    }
  }

  return (
    <>
      <Header
        title={record ? record.name : 'Family'}
        subtitle={record ? `Family ${record.id}` : 'Family details'}
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        <button
          type="button"
          onClick={() => navigate('/families')}
          className="inline-flex items-center gap-2 text-sm font-medium text-navy-500 transition hover:text-navy-900"
        >
          <ArrowLeft className="size-4" />
          Back to families
        </button>

        {family.status === 'loading' && <DetailSkeleton />}

        {family.status === 'error' && (
          <Card>
            <EmptyState
              icon={House}
              title="Could not load family"
              description={family.error}
              action={<Button onClick={reload}>Try again</Button>}
            />
          </Card>
        )}

        {family.status === 'success' && !record && (
          <Card>
            <EmptyState
              icon={House}
              title="Family not found"
              description={`No family matches the code ${code}. It may have been removed.`}
              action={
                <Button variant="secondary" onClick={() => navigate('/families')}>
                  Back to families
                </Button>
              }
            />
          </Card>
        )}

        {record && (
          <>
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
                <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-cream-200 text-navy-600">
                  <House className="size-8" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-semibold text-navy-900">
                      {record.name}
                    </h2>
                    {record.archivedAt && <Badge tone="neutral">Archived</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-sm text-navy-400">
                    {record.id}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      icon={<Pencil className="size-4" />}
                      onClick={() => setEditOpen(true)}
                    >
                      Edit details
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={
                        record.archivedAt ? (
                          <ArchiveRestore className="size-4" />
                        ) : (
                          <Archive className="size-4" />
                        )
                      }
                      onClick={() => setArchiveOpen(true)}
                    >
                      {record.archivedAt ? 'Restore' : 'Archive'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="size-4" />}
                      onClick={() => setDeleteOpen(true)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Family details</CardTitle>
                </CardHeader>
                <div className="space-y-4 p-6">
                  <DetailRow
                    icon={<MapPin className="size-4.5" />}
                    label="Address"
                    value={record.address || 'Not recorded'}
                  />
                  <DetailRow
                    icon={<StickyNote className="size-4.5" />}
                    label="Notes"
                    value={record.notes || 'No notes recorded'}
                  />
                  <DetailRow
                    icon={<Users className="size-4.5" />}
                    label="Members"
                    value={`${record.members.length} ${pluralize(record.members.length, 'member')}`}
                  />
                </div>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>Members</CardTitle>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<UserPlus className="size-4" />}
                      onClick={() => {
                        setAddMemberCode(null)
                        setAddIsPrimary(true)
                        setAddError(null)
                        setAddOpen(true)
                      }}
                      disabled={directory.status !== 'success'}
                    >
                      Add member
                    </Button>
                  </div>
                </CardHeader>

                <div className="border-b border-cream-200 px-6 py-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-800">
                      <Crown className="size-4 text-gold-600" />
                      Primary contact
                    </span>
                    <p className="text-xs text-navy-400">
                      {contactName
                        ? `${contactName} is the family's main contact.`
                        : 'No primary contact set for this family.'}
                    </p>
                    <div className="mt-1 max-w-sm">
                      <MemberLinker
                        members={memberLinks}
                        value={record.primaryContactMemberCode}
                        onChange={handleSetContact}
                        allowClear
                        disabled={contactSaving}
                        placeholder="Set a primary contact…"
                        aria-label="Set primary contact"
                      />
                    </div>
                  </div>
                </div>

                {record.members.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No members yet"
                    description="Add members to this family so they appear together."
                    action={
                      <Button
                        onClick={() => setAddOpen(true)}
                        disabled={directory.status !== 'success'}
                      >
                        Add member
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-cream-200">
                    {record.members.map((member) => {
                      const isContact =
                        member.memberCode === record.primaryContactMemberCode
                      return (
                        <li
                          key={member.memberCode}
                          className="flex items-center gap-3 px-6 py-3.5"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/members/${member.memberCode}`)
                            }
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <Avatar
                              firstName={member.firstName}
                              lastName={member.lastName}
                              src={member.avatarUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-navy-900">
                                {fullName(member.firstName, member.lastName)}
                              </p>
                              <p className="font-mono text-xs text-navy-400">
                                {member.memberCode}
                              </p>
                            </div>
                          </button>
                          <div className="flex items-center gap-1.5">
                            {isContact ? (
                              <Badge tone="gold">Contact</Badge>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetContact(member.memberCode)}
                                disabled={contactSaving}
                                className="rounded-lg p-2 text-navy-400 transition hover:bg-cream-200 hover:text-gold-700"
                                aria-label={`Make ${fullName(member.firstName, member.lastName)} the primary contact`}
                                title="Make primary contact"
                              >
                                <Crown className="size-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setRemoveMemberTarget({
                                  id: member.memberCode,
                                  firstName: member.firstName,
                                  lastName: member.lastName,
                                })
                              }
                              className="rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                              aria-label={`Remove ${fullName(member.firstName, member.lastName)} from the family`}
                              title="Remove from family"
                            >
                              <UserMinus className="size-4" />
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            </div>

            <Modal
              open={editOpen}
              onClose={() => setEditOpen(false)}
              title="Edit family"
              description={`Updating ${record.id}`}
            >
              <FamilyForm
                mode="edit"
                initial={record}
                onCancel={() => setEditOpen(false)}
                onSubmit={handleUpdate}
              />
            </Modal>

            <Modal
              open={addOpen}
              onClose={() => {
                setAddOpen(false)
                setAddError(null)
              }}
              title="Add a member to this family"
              description="Search the directory and choose who belongs here."
              footer={
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAddOpen(false)
                      setAddError(null)
                    }}
                    disabled={addingMember}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddMember}
                    loading={addingMember}
                    disabled={!addMemberCode}
                  >
                    Add member
                  </Button>
                </>
              }
            >
              <div className="space-y-4">
                <MemberLinker
                  members={directoryMembers}
                  value={addMemberCode}
                  onChange={setAddMemberCode}
                  exclude={record.members.map((m) => m.memberCode)}
                  disabled={addingMember}
                  aria-label="Choose a member to add"
                />
                <Switch
                  label="Primary family for this member"
                  description="Tick if this is the member's main family."
                  checked={addIsPrimary}
                  onChange={setAddIsPrimary}
                />
                {addError && (
                  <p className="text-sm text-red-600">{addError}</p>
                )}
              </div>
            </Modal>

            <ConfirmDialog
              open={Boolean(removeMemberTarget)}
              title="Remove from family?"
              description={
                removeMemberTarget ? (
                  <>
                    <span className="font-medium text-navy-800">
                      {fullName(
                        removeMemberTarget.firstName,
                        removeMemberTarget.lastName,
                      )}
                    </span>{' '}
                    will no longer be part of {record.name}. Their member record is
                    kept.
                  </>
                ) : null
              }
              confirmLabel="Remove from family"
              loading={removingMember}
              onConfirm={handleRemoveMember}
              onClose={() => setRemoveMemberTarget(null)}
            />

            <ConfirmDialog
              open={archiveOpen}
              title={record.archivedAt ? 'Restore this family?' : 'Archive this family?'}
              description={
                record.archivedAt
                  ? 'It will return to the active family list.'
                  : 'Archiving hides the family from the active list. Members keep their family link and nothing is deleted.'
              }
              confirmLabel={record.archivedAt ? 'Restore' : 'Archive'}
              tone={record.archivedAt ? 'primary' : 'danger'}
              loading={busy}
              onConfirm={handleArchive}
              onClose={() => setArchiveOpen(false)}
            />

            <ConfirmDialog
              open={deleteOpen}
              title="Delete this family?"
              description={
                <>
                  <span className="font-medium text-navy-800">{record.name}</span>{' '}
                  will be permanently deleted. Members keep their records but lose
                  this family link. This cannot be undone.
                </>
              }
              confirmLabel="Delete family"
              loading={busy}
              onConfirm={handleDelete}
              onClose={() => setDeleteOpen(false)}
            />
          </>
        )}
      </Page>
    </>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-navy-500">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-navy-400 uppercase">
          {label}
        </p>
        <p className="mt-0.5 text-sm break-words text-navy-800">{value}</p>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="flex gap-5 p-6">
        <Skeleton className="size-20 rounded-2xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-64" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="space-y-4 p-6">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
        <Card className="space-y-4 p-6 lg:col-span-2">
          <Skeleton className="h-6 w-24" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      </div>
    </div>
  )
}
