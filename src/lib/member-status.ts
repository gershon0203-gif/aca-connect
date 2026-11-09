import type { MemberStatus } from '@/types'

/**
 * Shared membership-status labels.
 *
 * The database enum value for an as-yet-unapproved member is `new`; in the UI
 * that state is presented as **Pending** so it reads clearly to volunteers
 * without a schema change.
 */
export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: 'Active',
  new: 'Pending',
  inactive: 'Inactive',
  transferred: 'Transferred',
}

export const MEMBER_STATUS_OPTIONS: Array<{
  value: MemberStatus
  label: string
}> = [
  { value: 'active', label: MEMBER_STATUS_LABELS.active },
  { value: 'new', label: MEMBER_STATUS_LABELS.new },
  { value: 'inactive', label: MEMBER_STATUS_LABELS.inactive },
  { value: 'transferred', label: MEMBER_STATUS_LABELS.transferred },
]
