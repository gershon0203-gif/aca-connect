import { useState, type FormEvent } from 'react'
import { Copy, MailPlus, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Select } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/context/toast-context'
import { useAsync } from '@/hooks/useAsync'
import { listUsers, setUserRole } from '@/services/data'
import {
  createInvitation,
  invitationAcceptUrl,
  listInvitations,
  reissueInvitation,
  revokeInvitation,
} from '@/services/invitations'
import { formatRelative } from '@/lib/format'
import { ROLE_LABELS, roleLabel } from '@/lib/roles'
import type { AppUser, Invitation, UserRole } from '@/types'

const ROLE_TONE: Record<UserRole, 'navy' | 'gold' | 'neutral'> = {
  super_admin: 'gold',
  member: 'neutral',
}

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'member', label: 'Member — own record only' },
  { value: 'super_admin', label: 'Super admin — full access' },
]

const STATUS_TONE = {
  active: 'success',
  invited: 'warning',
  suspended: 'danger',
} as const

const INVITATION_STATUS_TONE: Record<
  Invitation['status'],
  'success' | 'warning' | 'danger' | 'neutral'
> = {
  accepted: 'success',
  pending: 'warning',
  revoked: 'danger',
  expired: 'neutral',
}

export default function AdminUsersPage() {
  const { openMenu } = useAppShell()
  const { toast } = useToast()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | undefined>()
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [reissueFor, setReissueFor] = useState<Invitation | null>(null)
  const [reissuing, setReissuing] = useState(false)
  const [reissueError, setReissueError] = useState<string | undefined>()
  const [reissueLink, setReissueLink] = useState<string | null>(null)

  const users = useAsync(() => listUsers(), [])
  const invitations = useAsync(() => listInvitations(), [])

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const role = String(form.get('role') ?? 'member') as UserRole
    const memberCode = String(form.get('memberCode') ?? '').trim()

    if (!email) {
      setInviteError('Enter an email address.')
      return
    }

    setInviting(true)
    setInviteError(undefined)
    try {
      const invitation = await createInvitation({
        email,
        role,
        memberCode: memberCode || null,
      })
      setCreatedLink(invitationAcceptUrl(invitation.token))
      invitations.reload()
      toast({ title: 'Invitation created', variant: 'success' })
    } catch (error) {
      setInviteError(
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (user: AppUser, role: UserRole) => {
    if (role !== 'super_admin' && role !== 'member') return
    if (user.role === role) return
    setBusyUserId(user.id)
    try {
      await setUserRole(user.id, role)
      users.reload()
      toast({
        title: 'Role updated',
        description: `${user.name} is now ${ROLE_LABELS[role]}.`,
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Could not update role',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setBusyUserId(null)
    }
  }

  const handleRevoke = async (invitation: Invitation) => {
    try {
      await revokeInvitation(invitation.id)
      invitations.reload()
      toast({ title: 'Invitation revoked', variant: 'success' })
    } catch (error) {
      toast({
        title: 'Could not revoke invitation',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    }
  }

  const handleReissue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reissueFor) return
    const email = String(
      new FormData(event.currentTarget).get('email') ?? '',
    ).trim()
    setReissuing(true)
    setReissueError(undefined)
    try {
      const fresh = await reissueInvitation(reissueFor.id, email)
      invitations.reload()
      setReissueLink(invitationAcceptUrl(fresh.token))
      toast({ title: 'Invitation reissued', variant: 'success' })
    } catch (error) {
      setReissueError(
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setReissuing(false)
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

  const columns: Array<Column<AppUser>> = [
    {
      key: 'name',
      header: 'User',
      render: (user) => (
        <div className="flex items-center gap-3">
          <Avatar
            firstName={user.name.split(' ')[0]}
            lastName={user.name.split(' ').slice(1).join(' ')}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-navy-900">{user.name}</p>
            <p className="truncate text-xs text-navy-400">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (user) => (
        <Badge tone={user.role ? ROLE_TONE[user.role] : 'neutral'}>
          {roleLabel(user.role)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (
        <Badge tone={STATUS_TONE[user.status]} className="capitalize">
          {user.status}
        </Badge>
      ),
    },
    {
      key: 'assign',
      header: 'Assign role',
      render: (user) => (
        <div className="w-52">
          <Select
            label="Role"
            value={user.role ?? ''}
            disabled={busyUserId === user.id}
            options={[
              ...(user.role ? [] : [{ value: '', label: 'No access' }]),
              ...ROLE_OPTIONS,
            ]}
            onChange={(event) =>
              handleRoleChange(user, event.target.value as UserRole)
            }
          />
        </div>
      ),
    },
  ]

  const invitationColumns: Array<Column<Invitation>> = [
    {
      key: 'email',
      header: 'Email',
      render: (inv) => <span className="text-navy-800">{inv.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (inv) => <Badge tone={ROLE_TONE[inv.role]}>{roleLabel(inv.role)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (inv) => (
        <Badge tone={INVITATION_STATUS_TONE[inv.status]} className="capitalize">
          {inv.status}
        </Badge>
      ),
    },
    {
      key: 'member',
      header: 'Links member',
      render: (inv) => (
        <span className="font-mono text-xs text-navy-600">
          {inv.memberCode ?? '—'}
        </span>
      ),
    },
    {
      key: 'expires',
      header: 'Expires',
      render: (inv) => (
        <span className="text-navy-500">{formatRelative(inv.expiresAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (inv) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy className="size-4" />}
            onClick={() => copyLink(invitationAcceptUrl(inv.token))}
          >
            Copy link
          </Button>
          {inv.status !== 'accepted' && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="size-4" />}
              onClick={() => {
                setReissueLink(null)
                setReissueError(undefined)
                setReissueFor(inv)
              }}
            >
              Reissue
            </Button>
          )}
          {inv.status === 'pending' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => handleRevoke(inv)}
            >
              Revoke
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <Header
        title="Admin · Users & access"
        subtitle="Assign roles and invite people — super admin only."
        onMenuClick={openMenu}
        onAddMember={() => setInviteOpen(true)}
      />
      <Page className="space-y-6">
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-navy-900">Access control</p>
              <p className="text-sm text-navy-500">
                Super admins manage church records and accounts. Members see
                only their own record and portal.
              </p>
            </div>
          </div>
          <Button
            icon={<UserPlus className="size-4" />}
            onClick={() => {
              setCreatedLink(null)
              setInviteError(undefined)
              setInviteOpen(true)
            }}
          >
            Invite user
          </Button>
        </Card>

        <Card className="overflow-hidden">
          {users.status === 'loading' && <TableSkeleton rows={4} />}
          {users.status === 'error' && (
            <EmptyState
              icon={Users}
              title="Could not load users"
              description={users.error}
              action={<Button onClick={users.reload}>Try again</Button>}
            />
          )}
          {users.status === 'success' && (
            <DataTable
              columns={columns}
              rows={users.data}
              getRowId={(user) => user.id}
              caption="Platform users"
            />
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-cream-200 text-navy-600">
                <MailPlus className="size-5" />
              </span>
              <div>
                <CardTitle>Invitations</CardTitle>
                <p className="text-sm text-navy-500">
                  Pending invitations grant a role (and optionally link a member
                  record) when accepted.
                </p>
              </div>
            </div>
          </CardHeader>
          {invitations.status === 'loading' && <TableSkeleton rows={2} />}
          {invitations.status === 'success' && invitations.data.length === 0 && (
            <p className="px-6 pb-6 text-sm text-navy-400">
              No invitations yet.
            </p>
          )}
          {invitations.status === 'success' && invitations.data.length > 0 && (
            <DataTable
              columns={invitationColumns}
              rows={invitations.data}
              getRowId={(inv) => inv.id}
              caption="Invitations"
            />
          )}
        </Card>
      </Page>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a user"
        description="They receive a role when they accept the link."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              {createdLink ? 'Done' : 'Cancel'}
            </Button>
            {!createdLink && (
              <Button type="submit" form="invite-user-form" loading={inviting}>
                Create invitation
              </Button>
            )}
          </>
        }
      >
        {createdLink ? (
          <div className="space-y-3">
            <p className="text-sm text-navy-600">
              Share this link with the invitee. It is valid for 7 days.
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
          <form id="invite-user-form" onSubmit={handleInvite} className="space-y-4">
            <Input
              name="email"
              label="Email address"
              type="email"
              placeholder="name@acapozhichalur.org"
              required
            />
            <Select
              name="role"
              label="Role"
              defaultValue="member"
              options={ROLE_OPTIONS}
            />
            <Input
              name="memberCode"
              label="Link to member record (optional)"
              placeholder="ACA-0001"
              hint="Links this account to a member record on acceptance."
            />
            {inviteError && (
              <p className="text-sm text-red-600">{inviteError}</p>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(reissueFor)}
        onClose={() => {
          setReissueFor(null)
          setReissueError(undefined)
          setReissueLink(null)
        }}
        title="Reissue invitation"
        description="Use this when an invitation was sent to the wrong address or the person changed their email. The old link is revoked immediately."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReissueFor(null)
                setReissueError(undefined)
                setReissueLink(null)
              }}
            >
              {reissueLink ? 'Done' : 'Cancel'}
            </Button>
            {!reissueLink && (
              <Button type="submit" form="reissue-form" loading={reissuing}>
                Reissue
              </Button>
            )}
          </>
        }
      >
        {reissueLink ? (
          <div className="space-y-3">
            <p className="text-sm text-navy-600">
              The previous invitation is now revoked. Share this new link — it
              cannot be combined with the old one.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-cream-100 p-3 font-mono text-xs text-navy-700">
                {reissueLink}
              </code>
              <Button
                variant="secondary"
                size="sm"
                icon={<Copy className="size-4" />}
                onClick={() => copyLink(reissueLink)}
              >
                Copy
              </Button>
            </div>
          </div>
        ) : (
          <form id="reissue-form" onSubmit={handleReissue} className="space-y-4">
            <Input
              name="email"
              type="email"
              label="Correct email address"
              defaultValue={reissueFor?.email ?? ''}
              leadingIcon={<MailPlus className="size-4.5" />}
              hint="The invitee must sign in with this exact address to accept."
              required
            />
            {reissueError && <p className="text-sm text-red-600">{reissueError}</p>}
          </form>
        )}
      </Modal>
    </>
  )
}
