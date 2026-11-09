import { memberFieldDef, type MemberFieldSettings } from '@/config/member-fields'
import type { MemberFieldKey } from '@/config/member-fields'
import type { MemberInput } from '@/types'

/**
 * Client-side validation for member forms.
 *
 * The rules mirror what the data layer enforces server-side, so the user gets
 * immediate feedback while the service stays the final authority on uniqueness
 * (see `isMemberIdAvailable` in `src/services/members.ts`).
 */

export type MemberFormErrors = Partial<Record<MemberFieldKey, string>>

export interface ValidationOptions {
  /** Every member ID already in use (excluding the record being edited). */
  existingIds: Iterable<string>
  /** The ID of the record being edited, so its own ID isn't flagged. */
  currentId?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+]?[\d\s\-().]{7,}$/

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === ''
}

export function isValidDate(value: string): boolean {
  if (isBlank(value)) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value.slice(0, 10)
}

export function isFutureDate(value: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return value.slice(0, 10) > today
}

export function validateMemberInput(
  input: MemberInput,
  settings: MemberFieldSettings,
  options: ValidationOptions,
): MemberFormErrors {
  const errors: MemberFormErrors = {}

  /** Require a value when the field is flagged required in settings. */
  const requireField = (key: MemberFieldKey, value: string | null) => {
    if (settings[key]?.required && isBlank(value)) {
      errors[key] = `${memberFieldDef(key).label} is required.`
    }
  }

  // Identity
  requireField('firstName', input.firstName)
  requireField('lastName', input.lastName)

  // Member ID — always required, always unique, always well-formed.
  const id = input.id.trim()
  if (!id) {
    errors.id = 'Member ID is required.'
  } else {
    const normalized = id.toUpperCase()
    const duplicate = Array.from(options.existingIds).some(
      (existing) =>
        existing.trim().toUpperCase() === normalized &&
        existing.trim().toUpperCase() !== options.currentId?.trim().toUpperCase(),
    )
    if (duplicate) {
      errors.id = `Member ID ${id} is already in use.`
    }
  }

  requireField('gender', input.gender)
  requireField('phone', input.phone)
  requireField('address', input.address)
  requireField('ministries', input.ministries.length ? 'yes' : '')

  // Email — only validated when a value is present and the field is shown.
  if (!isBlank(input.email) && settings.email?.visible && !EMAIL_RE.test(input.email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  // Phone — loose international-friendly check when a value is present.
  if (!isBlank(input.phone) && !PHONE_RE.test(input.phone.trim())) {
    errors.phone = 'Enter a valid phone number.'
  }

  // Date of birth — optional but must be a real, non-future date.
  if (!isBlank(input.dateOfBirth)) {
    if (!isValidDate(input.dateOfBirth)) {
      errors.dateOfBirth = 'Enter a valid date of birth.'
    } else if (isFutureDate(input.dateOfBirth)) {
      errors.dateOfBirth = 'Date of birth cannot be in the future.'
    }
  } else if (settings.dateOfBirth?.required) {
    errors.dateOfBirth = 'Date of birth is required.'
  }

  // Membership date — required and must not be in the future.
  requireField('joinedAt', input.joinedAt)
  if (!isBlank(input.joinedAt)) {
    if (!isValidDate(input.joinedAt)) {
      errors.joinedAt = 'Enter a valid membership date.'
    } else if (isFutureDate(input.joinedAt)) {
      errors.joinedAt = 'Membership date cannot be in the future.'
    }
  }

  return errors
}

/** Merge a field error with a form-level summary, if any. */
export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0
}
