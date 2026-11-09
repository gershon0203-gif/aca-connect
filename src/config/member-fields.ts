/**
 * Configurable member fields
 * ==========================
 *
 * Church administrators can hide optional fields and toggle whether certain
 * fields are required. Sensitive fields (contact details, date of birth,
 * pastoral notes) are marked so they can be hidden for privacy.
 *
 * Settings are pure data: `resolveMemberFieldSettings` merges administrator
 * overrides over these defaults and both the member form and the member
 * profile read from the resolved result. Nothing here touches the backend.
 */

import type { MemberInput } from '@/types'

export type MemberFieldKey = keyof MemberInput

export type MemberFieldGroup =
  | 'identity'
  | 'contact'
  | 'household'
  | 'church'
  | 'pastoral'

export interface MemberFieldDefinition {
  key: MemberFieldKey
  label: string
  group: MemberFieldGroup
  /** Administrators may hide this field. Locked fields always show. */
  configurable: boolean
  defaultVisible: boolean
  /** Always required — cannot be turned off. */
  lockedRequired?: boolean
  /** Administrators may toggle whether this field is required. */
  requiredConfigurable?: boolean
  defaultRequired?: boolean
  /** Sensitive fields are recommended to keep private. */
  sensitive?: boolean
}

export const MEMBER_FIELD_DEFS: MemberFieldDefinition[] = [
  {
    key: 'firstName',
    label: 'First name',
    group: 'identity',
    configurable: false,
    defaultVisible: true,
    lockedRequired: true,
  },
  {
    key: 'lastName',
    label: 'Last name',
    group: 'identity',
    configurable: false,
    defaultVisible: true,
    lockedRequired: true,
  },
  {
    key: 'id',
    label: 'Member ID',
    group: 'identity',
    configurable: false,
    defaultVisible: true,
    lockedRequired: true,
  },
  {
    key: 'avatarUrl',
    label: 'Profile photo',
    group: 'identity',
    configurable: true,
    defaultVisible: true,
  },
  {
    key: 'dateOfBirth',
    label: 'Date of birth',
    group: 'identity',
    configurable: true,
    defaultVisible: true,
    requiredConfigurable: true,
    defaultRequired: false,
    sensitive: true,
  },
  {
    key: 'gender',
    label: 'Gender',
    group: 'identity',
    configurable: true,
    defaultVisible: true,
    requiredConfigurable: true,
    defaultRequired: true,
  },
  {
    key: 'maritalStatus',
    label: 'Marital status',
    group: 'identity',
    configurable: true,
    defaultVisible: false,
  },
  {
    key: 'phone',
    label: 'Phone',
    group: 'contact',
    configurable: true,
    defaultVisible: true,
    requiredConfigurable: true,
    defaultRequired: false,
    sensitive: true,
  },
  {
    key: 'email',
    label: 'Email',
    group: 'contact',
    configurable: true,
    defaultVisible: true,
    sensitive: true,
  },
  {
    key: 'address',
    label: 'Address',
    group: 'contact',
    configurable: true,
    defaultVisible: true,
    requiredConfigurable: true,
    defaultRequired: false,
    sensitive: true,
  },
  {
    key: 'city',
    label: 'City',
    group: 'contact',
    configurable: true,
    defaultVisible: true,
  },
  {
    key: 'familyId',
    label: 'Family',
    group: 'household',
    configurable: true,
    defaultVisible: true,
  },
  {
    key: 'joinedAt',
    label: 'Membership date',
    group: 'church',
    configurable: false,
    defaultVisible: true,
    lockedRequired: true,
  },
  {
    key: 'status',
    label: 'Membership status',
    group: 'church',
    configurable: false,
    defaultVisible: true,
    lockedRequired: true,
  },
  {
    key: 'baptismStatus',
    label: 'Baptism status',
    group: 'church',
    configurable: true,
    defaultVisible: true,
  },
  {
    key: 'ministries',
    label: 'Ministry',
    group: 'church',
    configurable: true,
    defaultVisible: true,
    requiredConfigurable: true,
    defaultRequired: false,
  },
  {
    key: 'rightNow',
    label: 'Right Now',
    group: 'church',
    configurable: true,
    defaultVisible: true,
  },
  {
    key: 'role',
    label: 'Role',
    group: 'church',
    configurable: true,
    defaultVisible: false,
  },
  {
    key: 'notes',
    label: 'Pastoral notes',
    group: 'pastoral',
    configurable: true,
    defaultVisible: false,
    sensitive: true,
  },
]

export const MEMBER_FIELD_GROUPS: Array<{
  id: MemberFieldGroup
  label: string
}> = [
  { id: 'identity', label: 'Identity' },
  { id: 'contact', label: 'Contact' },
  { id: 'household', label: 'Household' },
  { id: 'church', label: 'Church life' },
  { id: 'pastoral', label: 'Pastoral' },
]

const DEF_BY_KEY = new Map(MEMBER_FIELD_DEFS.map((def) => [def.key, def]))

export function memberFieldDef(key: MemberFieldKey): MemberFieldDefinition {
  const def = DEF_BY_KEY.get(key)
  if (!def) throw new Error(`Unknown member field: ${key}`)
  return def
}

export interface MemberFieldSetting {
  visible: boolean
  required: boolean
}

export type MemberFieldSettings = Record<MemberFieldKey, MemberFieldSetting>

export type MemberFieldOverrides = Partial<
  Record<MemberFieldKey, { visible?: boolean; required?: boolean }>
>

/**
 * Merge administrator overrides with the defaults above. Locked fields cannot
 * be hidden or made optional.
 */
export function resolveMemberFieldSettings(
  overrides: MemberFieldOverrides = {},
): MemberFieldSettings {
  const settings = {} as MemberFieldSettings
  for (const def of MEMBER_FIELD_DEFS) {
    const override = overrides[def.key]
    const visible = def.configurable
      ? (override?.visible ?? def.defaultVisible)
      : true
    const required = def.lockedRequired
      ? true
      : def.requiredConfigurable
        ? (override?.required ?? def.defaultRequired ?? false)
        : (def.defaultRequired ?? false)
    settings[def.key] = { visible, required }
  }
  return settings
}
