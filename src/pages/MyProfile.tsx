import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Camera,
  CheckCircle2,
  IdCard,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Page } from '@/components/layout/Page'
import { useAppShell } from '@/components/layout/app-shell'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/context/toast-context'
import { updateProfile } from '@/services/auth'
import { getMember, updateMemberSelf } from '@/services/members'
import { getMyAnniversary, getMyRelationships } from '@/services/portal'
import { removeAvatar, uploadAvatar } from '@/services/storage'
import { useAsync } from '@/hooks/useAsync'
import { formatDateTime, formatDate, fullName } from '@/lib/format'
import { roleLabel } from '@/lib/roles'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export default function MyProfilePage() {
  const { openMenu } = useAppShell()
  const { user, isDemoMode, updatePassword, refreshUser, signOut } = useAuth()
  const { toast } = useToast()

  const [firstName, ...rest] = (user?.name ?? 'Guest User').split(' ')
  const lastName = rest.join(' ')

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | undefined>()
  const [changingPassword, setChangingPassword] = useState(false)
  const [selfEditOpen, setSelfEditOpen] = useState(false)
  const [selfSaving, setSelfSaving] = useState(false)
  const [selfError, setSelfError] = useState<string | undefined>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // The member record this account is linked to (verified once linkage exists).
  const record = useAsync(
    () => (user?.memberCode ? getMember(user.memberCode) : Promise.resolve(null)),
    [user?.memberCode],
  )
  const memberRecord = record.status === 'success' ? record.data : null

  // Typed relationships the signed-in member appears on (spouse, parent, etc.).
  const relationships = useAsync(
    () => (user?.memberCode ? getMyRelationships() : Promise.resolve([])),
    [user?.memberCode],
  )
  const memberRelationships =
    relationships.status === 'success' ? relationships.data : []

  // The signed-in member's own wedding anniversary (partner name + date).
  const anniversary = useAsync(
    () => (user?.memberCode ? getMyAnniversary() : Promise.resolve(null)),
    [user?.memberCode],
  )
  const memberAnniversary =
    anniversary.status === 'success' ? anniversary.data : null

  /** Find the linked spouse (if any) from the member's relationships. */
  const spouseRel = memberRelationships.find(
    (rel) => rel.type === 'spouse',
  )
  const spouse = spouseRel
    ? {
        memberCode: spouseRel.memberCode,
        name: `${spouseRel.firstName} ${spouseRel.lastName}`.trim(),
      }
    : null

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user) return
    const form = new FormData(event.currentTarget)
    const nextFirst = String(form.get('firstName') ?? '').trim()
    const nextLast = String(form.get('lastName') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim()

    if (isDemoMode) {
      toast({
        title: 'Demo only — profile not saved',
        description: 'Profile updates persist once Supabase is connected.',
        variant: 'info',
      })
      return
    }

    setSaving(true)
    try {
      await updateProfile(user.id, {
        fullName: `${nextFirst} ${nextLast}`.trim(),
        phone,
      })
      await refreshUser()
      toast({ title: 'Profile updated', variant: 'success' })
    } catch (error) {
      toast({
        title: 'Could not save profile',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !user) return

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Choose an image file',
        description: 'PNG, JPEG, WebP or GIF.',
        variant: 'error',
      })
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast({
        title: 'Photo too large',
        description: 'Maximum size is 5 MB.',
        variant: 'error',
      })
      return
    }
    if (isDemoMode) {
      toast({
        title: 'Demo only — photo not uploaded',
        description: 'Photo storage needs a live Supabase project.',
        variant: 'info',
      })
      return
    }

    setUploading(true)
    const previousPath = user.avatarUrl ?? null
    try {
      const path = await uploadAvatar(user.id, file)
      await updateProfile(user.id, { avatarUrl: path })
      if (previousPath) await removeAvatar(previousPath).catch(() => {})
      await refreshUser()
      toast({ title: 'Photo updated', variant: 'success' })
    } catch (error) {
      toast({
        title: 'Could not upload photo',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setUploading(false)
    }
  }

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 8) {
      setPasswordError('Use at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }
    setPasswordError(undefined)
    setChangingPassword(true)
    try {
      await updatePassword(newPassword)
      setPasswordOpen(false)
      setNewPassword('')
      setConfirmPassword('')
      toast({ title: 'Password updated', variant: 'success' })
    } catch (error) {
      toast({
        title: 'Could not update password',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setChangingPassword(false)
    }
  }

  const handleSelfSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user?.memberCode) return
    const form = new FormData(event.currentTarget)
    setSelfSaving(true)
    setSelfError(undefined)
    try {
      await updateMemberSelf(user.memberCode, {
        email: String(form.get('email') ?? ''),
        phone: String(form.get('phone') ?? ''),
        address: String(form.get('address') ?? ''),
        city: String(form.get('city') ?? ''),
      })
      setSelfEditOpen(false)
      record.reload()
      toast({ title: 'Your details were updated', variant: 'success' })
    } catch (error) {
      setSelfError(error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setSelfSaving(false)
    }
  }

  return (
    <>
      <Header
        title="My profile"
        subtitle="Your account and contact preferences."
        onMenuClick={openMenu}
      />
      <Page className="space-y-6">
        {!user?.memberCode && (
          <Card className="border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-amber-900">
                  Your church profile is incomplete
                </p>
                <p className="text-sm text-amber-800">
                  Submit your details to complete your profile and link it to your
                  account.
                </p>
              </div>
              <Link
                to="/members?add=1"
                className="inline-flex items-center justify-center rounded-xl bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
              >
                Complete profile
              </Link>
            </div>
          </Card>
        )}
        <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <div className="relative">
            <Avatar
              firstName={firstName}
              lastName={lastName}
              src={user?.avatarUrl ?? undefined}
              size="xl"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border border-cream-300 bg-white text-navy-600 shadow-soft transition hover:bg-cream-100 disabled:opacity-60"
              aria-label="Change profile photo"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-navy-900">
                {user?.name ?? 'Guest User'}
              </h2>
              <Badge tone="gold">
                <ShieldCheck className="size-3.5" />
                {roleLabel(user?.role)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-navy-500">{user?.email}</p>
            <p className="mt-0.5 text-xs text-navy-400">
              Last active {formatDateTime(user?.lastActiveAt)}
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Personal information</CardTitle>
                <p className="text-sm text-navy-500">
                  Keep your contact details up to date.
                </p>
              </div>
            </CardHeader>
            <form onSubmit={handleSave} className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  name="firstName"
                  label="First name"
                  defaultValue={firstName}
                  leadingIcon={<User className="size-4.5" />}
                />
                <Input name="lastName" label="Last name" defaultValue={lastName} />
              </div>
              <Input
                label="Email address"
                type="email"
                defaultValue={user?.email ?? ''}
                leadingIcon={<Mail className="size-4.5" />}
                hint="Used to sign in. Contact an admin to change it."
                disabled
              />
              <Input
                name="phone"
                label="Phone number"
                type="tel"
                placeholder="+91 …"
                leadingIcon={<Smartphone className="size-4.5" />}
              />
              <Textarea
                label="About"
                placeholder="A short note about your role in the ministry…"
              />
              <div className="flex justify-end">
                <Button type="submit" loading={saving}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
              <dl className="divide-y divide-cream-200">
                <AccountRow label="Role" value={roleLabel(user?.role)} />
                <AccountRow label="Status" value={user?.status ?? '—'} />
                <AccountRow label="User ID" value={user?.id ?? '—'} mono />
              </dl>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My church record</CardTitle>
              </CardHeader>
              <div className="space-y-3 p-6">
                {!user?.memberCode ? (
                  <>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="size-5 text-amber-500" />
                      <span className="font-medium text-navy-900">
                        Not verified yet
                      </span>
                    </div>
                    <p className="text-sm text-navy-500">
                      Your account is not linked to a member record. Until an
                      administrator completes the invitation and linkage, your
                      profile is not verified and no member data is shown.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-5 text-green-600" />
                      <span className="font-medium text-navy-900">Verified</span>
                      <Badge tone="success">Linked</Badge>
                    </div>
                    {record.status === 'loading' && (
                      <p className="text-sm text-navy-400">
                        Loading your record…
                      </p>
                    )}
                    {memberRecord && (
                      <>
                        {/* Identity */}
                        <div className="space-y-3">
                          <p className="mb-2 text-xs font-semibold tracking-wide text-navy-400 uppercase">
                            Identity
                          </p>
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Name</dt>
                              <dd className="font-medium text-navy-900">
                                {fullName(
                                  memberRecord.firstName,
                                  memberRecord.lastName,
                                )}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Member ID</dt>
                              <dd className="font-mono text-navy-800">
                                {memberRecord.id}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Gender</dt>
                              <dd className="text-navy-800">
                                {memberRecord.gender
                                  .charAt(0)
                                  .toUpperCase() +
                                memberRecord.gender.slice(1)}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Date of birth</dt>
                              <dd className="text-navy-800">
                                {memberRecord.dateOfBirth
                                  ? formatDate(memberRecord.dateOfBirth)
                                  : 'Not provided'}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Marital status</dt>
                              <dd className="text-navy-800 capitalize">
                                {memberRecord.maritalStatus}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Baptism status</dt>
                              <dd className="text-navy-800 capitalize">
                                {memberRecord.baptismStatus}
                              </dd>
                            </div>
                            {memberRecord.avatarUrl && (
                              <div className="flex justify-between gap-4">
                                <dt className="text-navy-500">Profile photo</dt>
                                <dd className="flex items-center gap-2">
                                  <img
                                    src={memberRecord.avatarUrl}
                                    alt="Profile photo"
                                    className="size-8 rounded-full object-cover border border-cream-200"
                                  />
                                  <span className="text-navy-800">Uploaded</span>
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        {/* Contact */}
                        <div className="mt-4 space-y-3">
                          <p className="mb-2 text-xs font-semibold tracking-wide text-navy-400 uppercase">
                            Contact
                          </p>
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Email</dt>
                              <dd className="text-navy-800">
                                {memberRecord.email || 'Not provided'}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Phone</dt>
                              <dd className="text-navy-800">
                                {memberRecord.phone || 'Not provided'}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Address</dt>
                              <dd className="text-navy-800">
                                {memberRecord.address || 'Not provided'}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">City</dt>
                              <dd className="text-navy-800">
                                {memberRecord.city || 'Not provided'}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* Household */}
                        <div className="mt-4 space-y-3">
                          <p className="mb-2 text-xs font-semibold tracking-wide text-navy-400 uppercase">
                            Household
                          </p>
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Family</dt>
                              <dd className="text-navy-800">
                                {memberRecord.familyId || 'Not provided'}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* Church life */}
                        <div className="mt-4 space-y-3">
                          <p className="mb-2 text-xs font-semibold tracking-wide text-navy-400 uppercase">
                            Church life
                          </p>
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Membership date</dt>
                              <dd className="text-navy-800">
                                {memberRecord.joinedAt
                                  ? formatDate(memberRecord.joinedAt)
                                  : 'Not provided'}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Membership status</dt>
                              <dd className="text-navy-800 capitalize">
                                {memberRecord.status}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Role</dt>
                              <dd className="text-navy-800 capitalize">
                                {memberRecord.role}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Ministries</dt>
                              <dd className="text-navy-800">
                                {memberRecord.ministries.length > 0
                                  ? memberRecord.ministries.join(', ')
                                  : 'Not provided'}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Right now</dt>
                              <dd className="text-navy-800">
                                {memberRecord.rightNow || 'Not provided'}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* Marriage */}
                        <div className="mt-4 space-y-3">
                          <p className="mb-2 text-xs font-semibold tracking-wide text-navy-400 uppercase">
                            Marriage
                          </p>
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Spouse</dt>
                              <dd className="text-navy-800">
                                {spouse?.name || 'Not provided'}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Wedding anniversary</dt>
                              <dd className="text-navy-800">
                                {memberAnniversary?.anniversaryDate
                                  ? formatDate(memberAnniversary.anniversaryDate)
                                  : 'Not provided'}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* Pastoral */}
                        <div className="mt-4 space-y-3">
                          <p className="mb-2 text-xs font-semibold tracking-wide text-navy-400 uppercase">
                            Pastoral
                          </p>
                          <dl className="space-y-1.5 text-sm">
                            <div className="flex justify-between gap-4">
                              <dt className="text-navy-500">Notes</dt>
                              <dd className="text-navy-800">
                                {memberRecord.notes || 'Not provided'}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </>
                    )}
                    <div className="flex flex-col gap-2 pt-1">
                      <Button
                        variant="secondary"
                        fullWidth
                        className="justify-start"
                        icon={<Pencil className="size-4" />}
                        onClick={() => {
                          setSelfError(undefined)
                          setSelfEditOpen(true)
                        }}
                      >
                        Edit my details
                      </Button>
                      <Link
                        to={`/members/${user.memberCode}`}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-800"
                      >
                        <IdCard className="size-4" />
                        View my record
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security & preferences</CardTitle>
              </CardHeader>
              <div className="space-y-2 p-4">
                <Button
                  variant="secondary"
                  fullWidth
                  className="justify-start"
                  icon={<KeyRound className="size-4" />}
                  onClick={() => setPasswordOpen(true)}
                >
                  Change password
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  className="justify-start"
                  icon={<Bell className="size-4" />}
                  onClick={() =>
                    toast({
                      title: 'Coming soon',
                      description: 'Notification settings are not built yet.',
                      variant: 'info',
                    })
                  }
                >
                  Notification preferences
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  className="justify-start text-red-600 hover:bg-red-50"
                  icon={<LogOut className="size-4" />}
                  onClick={signOut}
                >
                  Sign out
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </Page>

      <Modal
        open={selfEditOpen}
        onClose={() => {
          setSelfEditOpen(false)
          setSelfError(undefined)
        }}
        title="Edit my details"
        description="You can update your own contact details. Other fields are managed by church staff."
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
            <Button type="submit" form="profile-self-edit-form" loading={selfSaving}>
              Save changes
            </Button>
          </>
        }
      >
        <form
          id="profile-self-edit-form"
          onSubmit={handleSelfSave}
          className="space-y-4"
        >
          <Input
            name="email"
            type="email"
            label="Email address"
            defaultValue={memberRecord?.email ?? ''}
            leadingIcon={<Mail className="size-4.5" />}
          />
          <Input
            name="phone"
            type="tel"
            label="Phone number"
            defaultValue={memberRecord?.phone ?? ''}
            leadingIcon={<Smartphone className="size-4.5" />}
          />
          <Input
            name="address"
            label="Address"
            defaultValue={memberRecord?.address ?? ''}
          />
          <Input name="city" label="City" defaultValue={memberRecord?.city ?? ''} />
          {selfError && <p className="text-sm text-red-600">{selfError}</p>}
        </form>
      </Modal>

      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title="Change password"
        description={
          isDemoMode
            ? 'Demo mode — connect Supabase to change your password.'
            : 'Choose a new password for your account.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="change-password-form"
              loading={changingPassword}
            >
              Update password
            </Button>
          </>
        }
      >
        <form
          id="change-password-form"
          onSubmit={handlePasswordChange}
          className="space-y-4"
        >
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            error={passwordError}
            hint="At least 8 characters."
            required
          />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </form>
      </Modal>
    </>
  )
}

function AccountRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3">
      <dt className="text-sm text-navy-500">{label}</dt>
      <dd
        className={
          'text-sm font-medium text-navy-900 capitalize ' +
          (mono ? 'font-mono' : '')
        }
      >
        {value}
      </dd>
    </div>
  )
}
