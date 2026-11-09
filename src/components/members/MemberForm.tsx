import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Check, ImageOff, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/FormField'
import { cn } from '@/lib/utils'
import { isDemoMode } from '@/lib/supabase'
import {
  memberFieldDef,
  type MemberFieldKey,
  type MemberFieldSettings,
} from '@/config/member-fields'
import {
  hasErrors,
  isFutureDate,
  isValidDate,
  validateMemberInput,
  type MemberFormErrors,
} from '@/lib/member-validation'
import { MEMBER_STATUS_OPTIONS } from '@/lib/member-status'
import { fullName } from '@/lib/format'
import type {
  BaptismStatus,
  Family,
  Gender,
  MaritalStatus,
  Member,
  MemberInput,
  MemberStatus as Status,
  MinistryRole,
} from '@/types'

/** String-friendly working values used by the HTML inputs. */
interface FormValues {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  gender: Gender
  dateOfBirth: string
  maritalStatus: MaritalStatus
  address: string
  city: string
  joinedAt: string
  status: Status
  role: MinistryRole
  ministries: string[]
  rightNow: string
  familyId: string
  baptismStatus: BaptismStatus
  avatarUrl: string
  notes: string
  /** Marriage is kept on the spouse relationship, not the member row. */
  spouseCode: string
  anniversaryDate: string
}

/** Marriage details gathered by the form, persisted separately from the row. */
export interface MemberFormMarriage {
  spouseCode: string
  anniversaryDate: string
}

interface MarriageErrors {
  spouseCode?: string
  anniversaryDate?: string
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const MARITAL_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'widower', label: 'Widower' },
]

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'ministry-leader', label: 'Ministry leader' },
  { value: 'deacon', label: 'Deacon' },
  { value: 'elder', label: 'Elder' },
  { value: 'pastor', label: 'Pastor' },
]

const BAPTISM_OPTIONS = [
  { value: 'baptised', label: 'Baptised' },
  { value: 'not-baptised', label: 'Not baptised' },
  { value: 'unknown', label: 'Unknown / to confirm' },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function initialValues(
  member: Member | null | undefined,
  suggestedId: string,
  marriage?: MemberFormMarriage,
): FormValues {
  const spouseCode = marriage?.spouseCode ?? ''
  const anniversaryDate = marriage?.anniversaryDate ?? ''
  if (member) {
    return {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone,
      gender: member.gender,
      dateOfBirth: member.dateOfBirth ?? '',
      maritalStatus: member.maritalStatus,
      address: member.address,
      city: member.city,
      joinedAt: member.joinedAt,
      status: member.status,
      role: member.role,
      ministries: [...member.ministries],
      rightNow: member.rightNow ?? '',
      familyId: member.familyId ?? '',
      baptismStatus: member.baptismStatus,
      avatarUrl: member.avatarUrl ?? '',
      notes: member.notes ?? '',
      spouseCode,
      anniversaryDate,
    }
  }
  return {
    id: suggestedId,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: 'male',
    dateOfBirth: '',
    maritalStatus: 'single',
    address: '',
    city: '',
    joinedAt: today(),
    status: 'new',
    role: 'member',
    ministries: [],
    rightNow: '',
    familyId: '',
    baptismStatus: 'unknown',
    avatarUrl: '',
    notes: '',
    spouseCode,
    anniversaryDate,
  }
}

function toInput(values: FormValues): MemberInput {
  return {
    id: values.id,
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    phone: values.phone,
    gender: values.gender,
    dateOfBirth: values.dateOfBirth,
    maritalStatus: values.maritalStatus,
    address: values.address,
    city: values.city,
    joinedAt: values.joinedAt,
    status: values.status,
    role: values.role,
    ministries: values.ministries,
    rightNow: values.rightNow,
    familyId: values.familyId || null,
    baptismStatus: values.baptismStatus,
    avatarUrl: values.avatarUrl || null,
    notes: values.notes,
  }
}

interface MemberFormProps {
  mode: 'create' | 'edit'
  initial: Member | null
  suggestedId: string
  families: Family[]
  ministries: string[]
  settings: MemberFieldSettings
  existingIds: Set<string>
  /** Members who may be linked as this member's spouse (self excluded). */
  spouseOptions: Member[]
  /** Current spouse link + wedding date, pre-filled when editing. */
  marriageDefaults?: MemberFormMarriage
  onCancel: () => void
  /**
   * Performs the real write (data-access layer). Rejects with a message when
   * the write fails so the form can show the error instead of faking success.
   * `marriage` carries the optional spouse link + wedding date, which live on
   * the spouse relationship rather than the member row.
   */
  onSubmit: (
    input: MemberInput,
    marriage: MemberFormMarriage,
  ) => Promise<void>
}

export function MemberForm({
  mode,
  initial,
  suggestedId,
  families,
  ministries,
  settings,
  existingIds,
  spouseOptions,
  marriageDefaults,
  onCancel,
  onSubmit,
}: MemberFormProps) {
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(initial, suggestedId, marriageDefaults),
  )
  const [errors, setErrors] = useState<MemberFormErrors>({})
  const [marriageErrors, setMarriageErrors] = useState<MarriageErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const visible = (key: MemberFieldKey) => settings[key]?.visible !== false
  const required = (key: MemberFieldKey) => settings[key]?.required === true
  const err = (key: MemberFieldKey) => errors[key]

  const rightNowOptions = useMemo(
    () => [
      { value: '', label: 'Not set' },
      ...ministries.map((name) => ({ value: name, label: name })),
      ...MEMBER_STATUS_OPTIONS.map((option) => ({
        value: option.label,
        label: `Status — ${option.label}`,
      })),
    ],
    [ministries],
  )

  const spouseSelectOptions = useMemo(
    () =>
      spouseOptions.map((member) => ({
        value: member.id,
        label: `${fullName(member.firstName, member.lastName)} (${member.id})`,
      })),
    [spouseOptions],
  )

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key as MemberFieldKey]
      return next
    })
    setMarriageErrors((prev) => {
      if (key !== 'spouseCode' && key !== 'anniversaryDate') return prev
      const next = { ...prev }
      delete next[key as 'spouseCode' | 'anniversaryDate']
      return next
    })
  }

  const toggleMinistry = (name: string) => {
    setValues((prev) => ({
      ...prev,
      ministries: prev.ministries.includes(name)
        ? prev.ministries.filter((m) => m !== name)
        : [...prev.ministries, name],
    }))
  }

  function validateMarriage(current: FormValues): MarriageErrors {
    const problems: MarriageErrors = {}
    const date = current.anniversaryDate.trim()
    if (date) {
      if (!isValidDate(date)) {
        problems.anniversaryDate = 'Enter a valid wedding date.'
      } else if (isFutureDate(date)) {
        problems.anniversaryDate = 'An anniversary cannot be in the future.'
      }
    }
    const hasSpouse =
      Boolean(current.spouseCode) || Boolean(marriageDefaults?.spouseCode)
    if (date && !hasSpouse) {
      problems.anniversaryDate =
        'Link a spouse before recording a wedding anniversary.'
    }
    return problems
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = toInput(values)
    const nextErrors = validateMemberInput(input, settings, {
      existingIds,
      currentId: initial?.id,
    })
    const nextMarriageErrors = validateMarriage(values)
    setErrors(nextErrors)
    setMarriageErrors(nextMarriageErrors)
    if (hasErrors(nextErrors) || hasErrors(nextMarriageErrors)) {
      setSubmitError('Please correct the highlighted fields.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit(input, {
        spouseCode: values.spouseCode,
        anniversaryDate: values.anniversaryDate,
      })
      // The parent closes the form only on success.
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {submitError}
        </div>
      )}

      {/* Identity */}
      <Section title="Identity">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Member ID"
            value={values.id}
            onChange={(e) => set('id', e.target.value)}
            leadingIcon={<KeyRound className="size-4.5" />}
            hint="Auto-generated and must be unique."
            error={err('id')}
            required
            disabled={submitting}
          />
          <Input
            label="First name"
            value={values.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            error={err('firstName')}
            required
            disabled={submitting}
          />
          <Input
            label="Last name"
            value={values.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            error={err('lastName')}
            required
            disabled={submitting}
          />
          {visible('gender') && (
            <Select
              label={memberFieldDef('gender').label}
              value={values.gender}
              onChange={(e) => set('gender', e.target.value as Gender)}
              options={GENDER_OPTIONS}
              error={err('gender')}
              required={required('gender')}
              disabled={submitting}
            />
          )}
          {visible('dateOfBirth') && (
            <Input
              label={memberFieldDef('dateOfBirth').label}
              type="date"
              value={values.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              error={err('dateOfBirth')}
              required={required('dateOfBirth')}
              disabled={submitting}
            />
          )}
          {visible('maritalStatus') && (
            <Select
              label={memberFieldDef('maritalStatus').label}
              value={values.maritalStatus}
              onChange={(e) =>
                set('maritalStatus', e.target.value as MaritalStatus)
              }
              options={MARITAL_OPTIONS}
              error={err('maritalStatus')}
              disabled={submitting}
            />
          )}
        </div>

        {visible('avatarUrl') && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label={memberFieldDef('avatarUrl').label}
                type="url"
                placeholder="https://…"
                value={values.avatarUrl}
                onChange={(e) => set('avatarUrl', e.target.value)}
                error={err('avatarUrl')}
                hint="Paste an image URL. Uploads arrive with the backend."
                disabled={submitting}
              />
            </div>
            <span className="flex size-16 items-center justify-center overflow-hidden rounded-full border border-cream-300 bg-cream-100">
              {values.avatarUrl ? (
                <img
                  src={values.avatarUrl}
                  alt="Profile preview"
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-navy-300">
                  <ImageOff className="size-6" />
                </span>
              )}
            </span>
          </div>
        )}
      </Section>

      {/* Contact */}
      {(visible('phone') || visible('email') || visible('address') || visible('city')) && (
        <Section title="Contact">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visible('phone') && (
              <Input
                label={memberFieldDef('phone').label}
                type="tel"
                value={values.phone}
                onChange={(e) => set('phone', e.target.value)}
                error={err('phone')}
                required={required('phone')}
                disabled={submitting}
              />
            )}
            {visible('email') && (
              <Input
                label={memberFieldDef('email').label}
                type="email"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
                error={err('email')}
                disabled={submitting}
              />
            )}
            {visible('address') && (
              <Input
                label={memberFieldDef('address').label}
                value={values.address}
                onChange={(e) => set('address', e.target.value)}
                error={err('address')}
                required={required('address')}
                disabled={submitting}
              />
            )}
            {visible('city') && (
              <Input
                label={memberFieldDef('city').label}
                value={values.city}
                onChange={(e) => set('city', e.target.value)}
                error={err('city')}
                disabled={submitting}
              />
            )}
          </div>
        </Section>
      )}

      {/* Household */}
      {visible('familyId') && (
        <Section title="Household">
          <Select
            label={memberFieldDef('familyId').label}
            value={values.familyId}
            onChange={(e) => set('familyId', e.target.value)}
            options={families.map((family) => ({
              value: family.id,
              label: family.name,
            }))}
            placeholder="No family"
            error={err('familyId')}
            hint="Group members who belong to the same household."
            disabled={submitting}
          />
        </Section>
      )}

      {/* Church life */}
      <Section title="Church life">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={memberFieldDef('joinedAt').label}
            type="date"
            value={values.joinedAt}
            onChange={(e) => set('joinedAt', e.target.value)}
            error={err('joinedAt')}
            required
            disabled={submitting}
          />
          <Select
            label={memberFieldDef('status').label}
            value={values.status}
            onChange={(e) => set('status', e.target.value as Status)}
            options={MEMBER_STATUS_OPTIONS}
            error={err('status')}
            required
            disabled={submitting}
          />
          {visible('baptismStatus') && (
            <Select
              label={memberFieldDef('baptismStatus').label}
              value={values.baptismStatus}
              onChange={(e) =>
                set('baptismStatus', e.target.value as BaptismStatus)
              }
              options={BAPTISM_OPTIONS}
              error={err('baptismStatus')}
              disabled={submitting}
            />
          )}
          {visible('role') && (
            <Select
              label={memberFieldDef('role').label}
              value={values.role}
              onChange={(e) => set('role', e.target.value as MinistryRole)}
              options={ROLE_OPTIONS}
              error={err('role')}
              disabled={submitting}
            />
          )}
          {visible('rightNow') && (
            <Select
              label={memberFieldDef('rightNow').label}
              value={values.rightNow}
              onChange={(e) => set('rightNow', e.target.value)}
              options={rightNowOptions}
              error={err('rightNow')}
              hint="What this member is involved in right now."
              disabled={submitting}
            />
          )}
        </div>

        {visible('ministries') && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-navy-800">
              {memberFieldDef('ministries').label}
              {required('ministries') && (
                <span className="ml-0.5 text-red-500" aria-hidden="true">
                  *
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Ministries">
              {ministries.map((ministry) => {
                const active = values.ministries.includes(ministry)
                return (
                  <button
                    key={ministry}
                    type="button"
                    aria-pressed={active}
                    disabled={submitting}
                    onClick={() => toggleMinistry(ministry)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition',
                      active
                        ? 'border-navy-900 bg-navy-900 text-cream-50'
                        : 'border-cream-300 bg-white text-navy-600 hover:border-navy-300 hover:text-navy-900',
                    )}
                  >
                    {active && <Check className="size-3.5" />}
                    {ministry}
                  </button>
                )
              })}
            </div>
            {err('ministries') && (
              <p className="mt-1.5 text-xs font-medium text-red-600">
                {err('ministries')}
              </p>
            )}
          </div>
        )}
      </Section>

      {/* Marriage — stored on the spouse relationship, not the member row. */}
      <Section title="Marriage">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Spouse"
            value={values.spouseCode}
            onChange={(e) => set('spouseCode', e.target.value)}
            options={spouseSelectOptions}
            placeholder="No spouse linked"
            error={marriageErrors.spouseCode}
            hint="Link an existing member record as the spouse."
            disabled={submitting}
          />
          <Input
            label="Wedding anniversary"
            type="date"
            value={values.anniversaryDate}
            onChange={(e) => set('anniversaryDate', e.target.value)}
            error={marriageErrors.anniversaryDate}
            hint="Optional — shown on the profile and in anniversary lists."
            disabled={submitting}
          />
        </div>
      </Section>

      {/* Pastoral notes */}
      {visible('notes') && (
        <Section title="Pastoral">
          <Textarea
            label={memberFieldDef('notes').label}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            error={err('notes')}
            placeholder="Add a private note about this member…"
            disabled={submitting}
          />
        </Section>
      )}

      <div className="flex flex-col gap-3 border-t border-cream-200 pt-5">
        <p className="text-xs text-navy-400">
          {isDemoMode
            ? 'Demo workspace · this record is stored in memory for this session and is not a live church record.'
            : 'This record will be saved to the connected database.'}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {mode === 'create' ? 'Add member' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold tracking-wider text-navy-400 uppercase">
        {title}
      </p>
      {children}
    </div>
  )
}
