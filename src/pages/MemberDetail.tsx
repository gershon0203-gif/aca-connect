import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Briefcase,
  Cake,
  CalendarDays,
  Contact,
  Copy,
  Droplets,
  Home,
  Mail,
  MailPlus,
  Network,
  Pencil,
  Phone,
  Sparkles,
  Trash2,
  Unlink,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { MemberForm } from '@/components/members/MemberForm'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/FormField'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAuth } from '@/context/auth-context'
import { useMemberFields } from '@/context/member-fields-context'
import { useAsync } from '@/hooks/useAsync'
import { isStaffRole, isSuperAdminRole } from '@/lib/roles'
import { listMinistries } from '@/services/data'
import { listMinistryCatalog } from '@/services/ministries'
import { adminUnlinkMember } from '@/services/auth'
import { createInvitation, invitationAcceptUrl } from '@/services/invitations'
import {
  deleteMember,
  getMember,
  listMembers,
  updateMember,
  updateMemberSelf,
} from '@/services/members'
import {
  addMemberRelationship,
  listFamilies,
  listMemberRelationships,
  listSpouseCouples,
  removeMemberRelationship,
  saveMemberMarriage,
} from '@/services/families'
import { RelationshipEditor } from '@/components/families/RelationshipEditor'
import type { RelationshipDraft } from '@/components/families/RelationshipEditor'
import type { MemberFormMarriage } from '@/components/members/MemberForm'
import { describeRelationship } from '@/lib/family-relationships'
import type {
  Member,
  MemberInput,
  MemberRelationship,
  SpouseCouple,
} from '@/types'
import { calculateAge, formatDate, fullName } from '@/lib/format'

const MARITAL_LABEL: Record<Member['maritalStatus'], string> = {
  single: 'Single',
  married: 'Married',
  widowed: 'Widowed',
  widower: 'Widower',
}

const BAPTISM_LABEL: Record<Member['baptismStatus'], string> = {
  baptised: 'Baptised',
  'not-baptised': 'Not baptised',
  unknown: 'Unknown',
}

/** The spouse link + wedding date for `memberCode`, when the records show one. */
function findSpouseDefault(
  couples: SpouseCouple[],
  memberCode: string,
): MemberFormMarriage | undefined {
  for (const couple of couples) {
    const [a, b] = couple.members
    const anniversaryDate = couple.date ?? ''
    if (a.memberCode === memberCode) {
      return { spouseCode: b.memberCode, anniversaryDate }
    }
    if (b.memberCode === memberCode) {
      return { spouseCode: a.memberCode, anniversaryDate }
    }
  }
  return undefined
}

export default function MemberDetailPage() {
  const { id = '' } = useParams()
  const { openMenu } = useAppShell()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()
  const { settings } = useMemberFields()

  // Staff/super_admin may edit any record; a member may edit ONLY their own and
  // only approved contact fields. The database enforces the same rules.
  const canManage = isStaffRole(user?.role)
  const canSelfEdit = user?.role === 'member'
  const canAdmin = isSuperAdminRole(user?.role)

  const [editOpen, setEditOpen] = useState(false)
  const [selfEditOpen, setSelfEditOpen] = useState(false)
  const [selfSaving, setSelfSaving] = useState(false)
  const [selfError, setSelfError] = useState<string | undefined>()
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | undefined>()
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [relOpen, setRelOpen] = useState(false)
  const [removeRelTarget, setRemoveRelTarget] =
    useState<MemberRelationship | null>(null)
  const [removingRel, setRemovingRel] = useState(false)

  const member = useAsync(() => getMember(id), [id])
  const families = useAsync(() => listFamilies(), [])
  const directory = useAsync(() => listMembers(), [])
  const ministries = useAsync(() => listMinistries(), [])
  const ministryCatalog = useAsync(() => listMinistryCatalog(), [])
  const relationships = useAsync(
    () => (canManage ? listMemberRelationships(id) : Promise.resolve([])),
    [id, canManage],
  )
  const spouseCouples = useAsync(
    () =>
      canManage
        ? listSpouseCouples()
        : Promise.resolve({ available: true, couples: [] }),
    [canManage],
  )

  const anniversaryByRelationship = useMemo(() => {
    const map = new Map<string, string>()
    if (spouseCouples.status === 'success') {
      for (const couple of spouseCouples.data.couples) {
        if (couple.date) map.set(couple.relationshipId, couple.date)
      }
    }
    return map
  }, [spouseCouples])

  /** Current spouse + wedding date for this member, used to pre-fill the form. */
  const marriageDefaults =
    spouseCouples.status === 'success'
      ? findSpouseDefault(spouseCouples.data.couples, id)
      : undefined

  const familyName = useMemo(() => {
    if (member.status !== 'success' || !member.data?.familyId) return undefined
    if (families.status !== 'success') return undefined
    return families.data.find((f) => f.id === member.data?.familyId)?.name
  }, [member, families])

  const directoryMembers =
    directory.status === 'success' ? directory.data : []
  const existingIds = new Set(directoryMembers.map((m) => m.id))

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

  const visible = (key: keyof typeof settings) =>
    settings[key]?.visible !== false

  const handleUpdate = async (
    input: MemberInput,
    marriage: MemberFormMarriage,
  ) => {
    const updated = await updateMember(id, input)
    let marriageWarning: string | null = null
    try {
      await saveMemberMarriage(id, marriage)
    } catch (error) {
      marriageWarning =
        error instanceof Error
          ? error.message
          : 'The spouse link or anniversary could not be saved.'
    }
    setEditOpen(false)
    member.reload()
    relationships.reload()
    spouseCouples.reload()
    toast(
      marriageWarning
        ? {
            title: 'Member updated, but marriage details were not saved',
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

  const handleSelfSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSelfSaving(true)
    setSelfError(undefined)
    try {
      await updateMemberSelf(id, {
        email: String(form.get('email') ?? ''),
        phone: String(form.get('phone') ?? ''),
        address: String(form.get('address') ?? ''),
        city: String(form.get('city') ?? ''),
      })
      setSelfEditOpen(false)
      member.reload()
      toast({ title: 'Your details were updated', variant: 'success' })
    } catch (error) {
      setSelfError(
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setSelfSaving(false)
    }
  }

  const handleDelete = async () => {
    setRemoving(true)
    try {
      await deleteMember(id)
      toast({
        title: 'Member removed',
        description: 'The member was removed from the directory.',
        variant: 'success',
      })
      navigate('/members')
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

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    if (!email) {
      setInviteError('Enter an email address.')
      return
    }
    setInviting(true)
    setInviteError(undefined)
    try {
      const invitation = await createInvitation({
        email,
        role: 'member',
        memberCode: id,
      })
      setCreatedLink(invitationAcceptUrl(invitation.token))
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setInviting(false)
    }
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      await adminUnlinkMember(id)
      setUnlinkOpen(false)
      member.reload()
      toast({
        title: 'Account unlinked',
        description: 'The portal account is no longer linked to this record.',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Could not unlink account',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setUnlinking(false)
    }
  }

  const handleAddRelationship = async (draft: RelationshipDraft) => {
    await addMemberRelationship({
      memberCode: id,
      relatedCode: draft.relatedCode,
      type: draft.type,
      label: draft.label,
    })
    setRelOpen(false)
    relationships.reload()
    toast({ title: 'Relationship added', variant: 'success' })
  }

  const handleRemoveRelationship = async () => {
    if (!removeRelTarget) return
    setRemovingRel(true)
    try {
      await removeMemberRelationship(removeRelTarget.id)
      setRemoveRelTarget(null)
      relationships.reload()
      toast({ title: 'Relationship removed', variant: 'success' })
    } catch (error) {
      toast({
        title: 'Could not remove relationship',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setRemovingRel(false)
    }
  }

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: 'Link copied', variant: 'success' })
    } catch {
      toast({ title: 'Copy failed — select the link manually', variant: 'error' })
    }
  }

  const record = member.status === 'success' ? member.data : null
  const relationshipItems =
    relationships.status === 'success' ? relationships.data : []

  return (
    <>
      <Header
        title={
          record ? fullName(record.firstName, record.lastName) : 'Member profile'
        }
        subtitle="Full member record"
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        {canManage && (
          <button
            type="button"
            onClick={() => navigate('/members')}
            className="inline-flex items-center gap-2 text-sm font-medium text-navy-500 transition hover:text-navy-900"
          >
            <ArrowLeft className="size-4" />
            Back to members
          </button>
        )}

        {member.status === 'loading' && <DetailSkeleton />}

        {member.status === 'error' && (
          <Card>
            <EmptyState
              icon={UserRound}
              title="Could not load member"
              description={member.error}
              action={<Button onClick={member.reload}>Try again</Button>}
            />
          </Card>
        )}

        {member.status === 'success' && !record && (
          <Card>
            <EmptyState
              icon={UserRound}
              title="Member not found"
              description={`No record matches the ID ${id}. It may have been removed.`}
              action={
                <Button variant="secondary" onClick={() => navigate('/members')}>
                  Back to members
                </Button>
              }
            />
          </Card>
        )}

        {record && (
          <>
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
                <Avatar
                  firstName={record.firstName}
                  lastName={record.lastName}
                  src={record.avatarUrl}
                  size="xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-semibold text-navy-900">
                      {fullName(record.firstName, record.lastName)}
                    </h2>
                    <StatusBadge status={record.status} />
                    {record.userId && <Badge tone="navy">Portal linked</Badge>}
                    {visible('baptismStatus') && (
                      <Badge
                        tone={
                          record.baptismStatus === 'baptised'
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {BAPTISM_LABEL[record.baptismStatus]}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-navy-500">
                    <span className="capitalize">
                      {record.role.replace('-', ' ')}
                    </span>{' '}
                    · <span className="font-mono">{record.id}</span>
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {canManage && (
                      <Button
                        size="sm"
                        icon={<Pencil className="size-4" />}
                        onClick={() => setEditOpen(true)}
                      >
                        Edit details
                      </Button>
                    )}
                    {canAdmin && !record.userId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<MailPlus className="size-4" />}
                        onClick={() => {
                          setCreatedLink(null)
                          setInviteError(undefined)
                          setInviteOpen(true)
                        }}
                      >
                        Invite to portal
                      </Button>
                    )}
                    {canAdmin && record.userId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Unlink className="size-4" />}
                        onClick={() => setUnlinkOpen(true)}
                      >
                        Unlink account
                      </Button>
                    )}
                    {canSelfEdit && (
                      <Button
                        size="sm"
                        icon={<Pencil className="size-4" />}
                        onClick={() => setSelfEditOpen(true)}
                      >
                        Update my details
                      </Button>
                    )}
                    <a
                      href={`tel:${record.phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-cream-300 bg-white px-3.5 py-2 text-sm font-medium text-navy-800 transition hover:border-navy-300"
                    >
                      <Contact className="size-4" />
                      Call
                    </a>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="size-4" />}
                        onClick={() => setRemoveOpen(true)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Personal & contact details</CardTitle>
                </CardHeader>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-5 p-6 sm:grid-cols-2">
                  {visible('email') && (
                    <DetailItem
                      icon={<Mail className="size-4.5" />}
                      label="Email"
                      value={record.email || '—'}
                    />
                  )}
                  {visible('phone') && (
                    <DetailItem
                      icon={<Phone className="size-4.5" />}
                      label="Phone"
                      value={record.phone || '—'}
                    />
                  )}
                  {visible('address') && (
                    <DetailItem
                      icon={<Home className="size-4.5" />}
                      label="Address"
                      value={
                        [record.address, visible('city') ? record.city : '']
                          .filter(Boolean)
                          .join(', ') || '—'
                      }
                    />
                  )}
                  {visible('dateOfBirth') && (
                    <DetailItem
                      icon={<Cake className="size-4.5" />}
                      label="Date of birth"
                      value={
                        record.dateOfBirth
                          ? `${formatDate(record.dateOfBirth)} · ${calculateAge(record.dateOfBirth)} yrs`
                          : '—'
                      }
                    />
                  )}
                  {visible('gender') && (
                    <DetailItem
                      icon={<UserRound className="size-4.5" />}
                      label="Gender"
                      value={record.gender === 'male' ? 'Male' : 'Female'}
                    />
                  )}
                  {visible('maritalStatus') && (
                    <DetailItem
                      icon={<Briefcase className="size-4.5" />}
                      label="Marital status"
                      value={MARITAL_LABEL[record.maritalStatus]}
                    />
                  )}
                  {visible('joinedAt') && (
                    <DetailItem
                      icon={<CalendarDays className="size-4.5" />}
                      label="Membership date"
                      value={formatDate(record.joinedAt)}
                    />
                  )}
                  {visible('familyId') && (
                    <DetailItem
                      icon={<Users className="size-4.5" />}
                      label="Family"
                      value={
                        record.familyId && canManage ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/families/${record.familyId}`)
                            }
                            className="text-left font-medium text-navy-700 underline decoration-cream-400 underline-offset-2 transition hover:text-navy-900"
                          >
                            {familyName ?? record.familyId}
                          </button>
                        ) : (
                          familyName ?? 'Not linked to a family'
                        )
                      }
                    />
                  )}
                  {visible('baptismStatus') && (
                    <DetailItem
                      icon={<Droplets className="size-4.5" />}
                      label="Baptism status"
                      value={BAPTISM_LABEL[record.baptismStatus]}
                    />
                  )}
                  {visible('role') && (
                    <DetailItem
                      icon={<Briefcase className="size-4.5" />}
                      label="Role"
                      value={
                        record.role.charAt(0).toUpperCase() +
                        record.role.slice(1).replace('-', ' ')
                      }
                    />
                  )}
                  {visible('rightNow') && (
                    <DetailItem
                      icon={<Sparkles className="size-4.5" />}
                      label="Right Now"
                      value={record.rightNow || '—'}
                    />
                  )}
                </dl>
              </Card>

              <div className="space-y-6">
                {visible('ministries') && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Ministries</CardTitle>
                    </CardHeader>
                    <div className="flex flex-wrap gap-2 p-6">
                      {record.ministries.length > 0 ? (
                        record.ministries.map((ministry) => (
                          <Badge key={ministry} tone="navy">
                            {ministry}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-sm text-navy-400">
                          Not serving in a ministry yet.
                        </p>
                      )}
                    </div>
                  </Card>
                )}

                {canManage && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle>Relationships</CardTitle>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<UserPlus className="size-4" />}
                          onClick={() => setRelOpen(true)}
                          disabled={directory.status !== 'success'}
                        >
                          Add
                        </Button>
                      </div>
                    </CardHeader>

                    {relationships.status === 'loading' && (
                      <div className="space-y-3 p-6">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    )}

                    {relationships.status === 'error' && (
                      <p className="p-6 text-sm text-red-600">
                        {relationships.error}
                      </p>
                    )}

                    {relationships.status === 'success' &&
                      relationshipItems.length === 0 && (
                        <p className="p-6 text-sm text-navy-400">
                          No relationships recorded for this member yet.
                        </p>
                      )}

                    {relationships.status === 'success' &&
                      relationshipItems.length > 0 && (
                        <ul className="divide-y divide-cream-200">
                          {relationshipItems.map((rel) => (
                            <li
                              key={rel.id}
                              className="flex items-center gap-3 px-6 py-3.5"
                            >
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-navy-500">
                                <Network className="size-4.5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate(`/members/${rel.memberCode}`)
                                  }
                                  className="max-w-full truncate text-left text-sm font-medium text-navy-900 transition hover:text-navy-600"
                                >
                                  {rel.memberName}
                                </button>
                                <p className="text-xs text-navy-400">
                                  {describeRelationship(
                                    rel.type,
                                    rel.subjectIsViewed,
                                    rel.label,
                                  )}
                                </p>
                                {rel.type === 'spouse' &&
                                  anniversaryByRelationship.has(rel.id) && (
                                    <p className="text-xs text-gold-700">
                                      Anniversary{' '}
                                      {formatDate(
                                        `${anniversaryByRelationship.get(rel.id)}T00:00:00`,
                                      )}
                                    </p>
                                  )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setRemoveRelTarget(rel)}
                                aria-label={`Remove relationship with ${rel.memberName}`}
                                className="rounded-lg p-2 text-navy-400 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                  </Card>
                )}

                {visible('notes') && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Pastoral notes</CardTitle>
                    </CardHeader>
                    <p className="p-6 text-sm text-navy-600">
                      {record.notes || 'No notes recorded for this member.'}
                    </p>
                  </Card>
                )}
              </div>
            </div>

            <Modal
              open={editOpen}
              onClose={() => setEditOpen(false)}
              title="Edit member"
              description={`Updating ${record.id}`}
              size="lg"
            >
              <MemberForm
                mode="edit"
                initial={record}
                suggestedId={record.id}
                families={families.status === 'success' ? families.data : []}
                ministries={ministryNames}
                settings={settings}
                existingIds={existingIds}
                spouseOptions={directoryMembers.filter(
                  (m) => m.id !== record.id,
                )}
                marriageDefaults={marriageDefaults}
                onCancel={() => setEditOpen(false)}
                onSubmit={handleUpdate}
              />
            </Modal>

            <Modal
              open={selfEditOpen}
              onClose={() => {
                setSelfEditOpen(false)
                setSelfError(undefined)
              }}
              title="Update my details"
              description="You can edit your own contact details. Other fields are managed by church staff."
              footer={
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelfEditOpen(false)
                      setSelfError(undefined)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" form="self-edit-form" loading={selfSaving}>
                    Save changes
                  </Button>
                </>
              }
            >
              <form
                id="self-edit-form"
                onSubmit={handleSelfSave}
                className="space-y-4"
              >
                <Input
                  name="email"
                  type="email"
                  label="Email address"
                  defaultValue={record.email}
                  leadingIcon={<Mail className="size-4.5" />}
                />
                <Input
                  name="phone"
                  type="tel"
                  label="Phone number"
                  defaultValue={record.phone}
                  leadingIcon={<Phone className="size-4.5" />}
                />
                <Input
                  name="address"
                  label="Address"
                  defaultValue={record.address}
                  leadingIcon={<Home className="size-4.5" />}
                />
                <Input name="city" label="City" defaultValue={record.city} />
                {selfError && (
                  <p className="text-sm text-red-600">{selfError}</p>
                )}
              </form>
            </Modal>

            <Modal
              open={inviteOpen}
              onClose={() => setInviteOpen(false)}
              title="Invite to member portal"
              description={`Links an account to ${record.id} once the invitation is accepted.`}
              footer={
                <>
                  <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                    {createdLink ? 'Done' : 'Cancel'}
                  </Button>
                  {!createdLink && (
                    <Button type="submit" form="member-invite-form" loading={inviting}>
                      Create invitation
                    </Button>
                  )}
                </>
              }
            >
              {createdLink ? (
                <div className="space-y-3">
                  <p className="text-sm text-navy-600">
                    Share this link with the invitee. It expires in 7 days and
                    can only be used once.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-cream-100 p-3 font-mono text-xs text-navy-700">
                      {createdLink}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Copy className="size-4" />}
                      onClick={() => copyLink(createdLink)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              ) : (
                <form id="member-invite-form" onSubmit={handleInvite} className="space-y-4">
                  <Input
                    name="email"
                    type="email"
                    label="Email address"
                    defaultValue={record.email}
                    leadingIcon={<Mail className="size-4.5" />}
                    hint="Prefilled from the member record. The invitee must sign in with this exact address."
                    required
                  />
                  {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
                </form>
              )}
            </Modal>

            <Modal
              open={relOpen}
              onClose={() => setRelOpen(false)}
              title="Add a relationship"
              description={`Record how ${fullName(record.firstName, record.lastName)} is related to another member.`}
            >
              <RelationshipEditor
                member={record}
                members={directoryMembers}
                exclude={relationshipItems.map((rel) => rel.memberCode)}
                onCancel={() => setRelOpen(false)}
                onSubmit={handleAddRelationship}
              />
            </Modal>

            <ConfirmDialog
              open={Boolean(removeRelTarget)}
              title="Remove this relationship?"
              description={
                removeRelTarget ? (
                  <>
                    The relationship with{' '}
                    <span className="font-medium text-navy-800">
                      {removeRelTarget.memberName}
                    </span>{' '}
                    will be removed from both members. This cannot be undone.
                  </>
                ) : null
              }
              confirmLabel="Remove relationship"
              loading={removingRel}
              onConfirm={handleRemoveRelationship}
              onClose={() => setRemoveRelTarget(null)}
            />

            <ConfirmDialog
              open={unlinkOpen}
              title="Unlink this account?"
              description={
                <>
                  The portal account linked to this member record will be
                  detached. It keeps its sign-in but loses access to{' '}
                  {record.id} until re-invited. You can then issue a fresh
                  invitation.
                </>
              }
              confirmLabel="Unlink account"
              loading={unlinking}
              onConfirm={handleUnlink}
              onClose={() => setUnlinkOpen(false)}
            />

            <ConfirmDialog
              open={removeOpen}
              title="Remove this member?"
              description={
                <>
                  <span className="font-medium text-navy-800">
                    {fullName(record.firstName, record.lastName)}
                  </span>{' '}
                  ({record.id}) will be permanently removed from the directory.
                  This cannot be undone.
                </>
              }
              confirmLabel="Remove member"
              loading={removing}
              onConfirm={handleDelete}
              onClose={() => setRemoveOpen(false)}
            />
          </>
        )}
      </Page>
    </>
  )
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-navy-500">
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium tracking-wide text-navy-400 uppercase">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm break-words text-navy-800">{value}</dd>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="flex gap-5 p-6">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-64" />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="space-y-4 p-6 lg:col-span-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
        <Card className="space-y-4 p-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      </div>
    </div>
  )
}
