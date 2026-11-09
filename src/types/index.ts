/**
 * Shared domain types for ACA Connect.
 *
 * NOTE: These types describe the intended data model. The app currently
 * renders clearly-labelled DEMO data (see `src/lib/demo-data.ts`) and does
 * not persist anything to a backend.
 */

export type MemberStatus = 'active' | 'inactive' | 'new' | 'transferred'

export type Gender = 'male' | 'female'

export type MaritalStatus = 'single' | 'married' | 'widowed' | 'widower'

export type MinistryRole =
  | 'member'
  | 'ministry-leader'
  | 'deacon'
  | 'elder'
  | 'pastor'

export type BaptismStatus = 'baptised' | 'not-baptised' | 'unknown'

/** A household / family grouping members can belong to. */
export interface Family {
  id: string
  name: string
  address?: string
  notes?: string
  /** Derived count of members currently linked to this family. */
  memberCount?: number
  /** The member code designated as the household's primary contact. */
  primaryContactMemberCode?: string | null
  /** Resolved display name of the primary contact, when known. */
  primaryContactName?: string | null
  /** ISO timestamp when the household was archived, or `null` when active. */
  archivedAt?: string | null
}

/** Editable fields used when creating or updating a household. */
export interface FamilyInput {
  name: string
  address: string
  notes: string
}

/** The typed ways two members can be related. */
export type MemberRelationshipType =
  | 'spouse'
  | 'parent'
  | 'sibling'
  | 'guardian'
  | 'other'

/** A member linked to a household, with their primary-contact flag. */
export interface FamilyMemberLink {
  memberCode: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  isPrimary: boolean
}

/** A household with its resolved member list. */
export interface FamilyDetail {
  id: string
  name: string
  address?: string
  notes?: string
  archivedAt: string | null
  primaryContactMemberCode: string | null
  members: FamilyMemberLink[]
}

/**
 * A typed relationship as seen from one member's record.
 * `subjectIsViewed` is `true` when the member being viewed is the subject side
 * of the stored relationship (the parent/guardian); it is always `false` for
 * the symmetric `spouse`/`sibling` types.
 */
export interface MemberRelationship {
  id: string
  type: MemberRelationshipType
  /** Descriptor for the `other` type, otherwise `null`. */
  label: string | null
  /** The related member's code. */
  memberCode: string
  /** The related member's display name. */
  memberName: string
  subjectIsViewed: boolean
}

/** A relationship as returned to the signed-in member's own portal. */
export interface MyRelationship {
  memberCode: string
  firstName: string
  lastName: string
  type: MemberRelationshipType
  label: string | null
  subjectIsMe: boolean
}

/** One side of a wedding-anniversary couple. */
export interface AnniversaryParty {
  memberCode: string
  firstName: string
  lastName: string
}

/** A spouse couple; `date` is the wedding date (`YYYY-MM-DD`) or `null`. */
export interface SpouseCouple {
  /** The `member_relationships` row id. */
  relationshipId: string
  date: string | null
  members: [AnniversaryParty, AnniversaryParty]
}

/** The signed-in member's own anniversary, as returned to their portal. */
export interface MyAnniversary {
  partnerFirstName: string
  partnerLastName: string
  anniversaryDate: string
}

/** A member of the congregation. */
export interface Member {
  /** Unique, human-readable member ID (e.g. `ACA-0001`). */
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  gender: Gender
  dateOfBirth: string | null
  maritalStatus: MaritalStatus
  address: string
  city: string
  /** Membership date. */
  joinedAt: string
  status: MemberStatus
  role: MinistryRole
  ministries: string[]
  /**
   * The member's current ministry or status ("Right Now"), or `null` when not
   * recorded. A single value chosen from the ministry catalogue + statuses.
   */
  rightNow?: string | null
  /** Owning family, or `null` when the member is not linked to a household. */
  familyId: string | null
  baptismStatus: BaptismStatus
  /** Initials-safe avatar URL (signed) or storage path; null when no photo. */
  avatarUrl: string | null
  /**
   * The auth account explicitly linked to this member record, or `null`.
   * Managed by admins; not editable from the member form.
   */
  userId?: string | null
  notes?: string
}

/**
 * The writable shape used by member forms and the data-access layer.
 * Every value is a plain string (or list) so it maps directly onto HTML inputs
 * and can be validated before it reaches Supabase.
 */
export interface MemberInput {
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
  status: MemberStatus
  role: MinistryRole
  ministries: string[]
  rightNow: string
  familyId: string | null
  baptismStatus: BaptismStatus
  avatarUrl: string | null
  notes: string
}

/** A platform user (auth account). */
export interface AppUser {
  id: string
  name: string
  email: string
  /**
   * The role an administrator has granted this account, or `null` when the
   * account has not yet been authorised (it can do nothing until it is).
   */
  role: UserRole | null
  status: 'active' | 'invited' | 'suspended'
  lastActiveAt: string | null
  /** Signed avatar URL for the account, or `null`. */
  avatarUrl?: string | null
  /** The member record this account is linked to, or `null`. */
  memberCode?: string | null
}

/**
 * The application has exactly two permission levels:
 *   * `super_admin` — the only role that may manage church data and accounts.
 *   * `member`      — personal access to their own record and portal.
 *
 * The database enum still contains the legacy `staff` value (no rows use it),
 * so old data stays readable; the application no longer grants or renders it.
 */
export type UserRole = 'super_admin' | 'member'

export interface AuthSession {
  user: AppUser
  expiresAt: number
}

/** An administrator-issued invitation that grants a role and optionally links
 * an existing member record when accepted. */
export interface Invitation {
  id: string
  /** Opaque token embedded in the accept link. */
  token: string
  email: string
  role: UserRole
  memberCode: string | null
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  invitedBy: string | null
  expiresAt: string
  createdAt: string
}

/** A relative shown in the member portal's "My Family" view. */
export interface MyFamilyMember {
  memberCode: string
  firstName: string
  lastName: string
  relationship: string | null
  isSelf: boolean
}

/** A household the signed-in member belongs to, with a limited peer list. */
export interface MyFamily {
  familyCode: string
  familyName: string
  isPrimary: boolean
  members: MyFamilyMember[]
}

/** A quick stat rendered on the dashboard. */
export interface Stat {
  id: string
  label: string
  value: string
  delta: number
  hint: string
}

/** A single entry in the recent activity feed. */
export interface ActivityItem {
  id: string
  actor: string
  action: string
  target: string
  at: string
}

export interface Ministry {
  id: string
  name: string
  memberCount: number
  leader: string
}

/** An entry in the canonical ministry catalogue (see `public.ministries`). */
export interface MinistryCatalogItem {
  id: string
  name: string
  sortOrder: number
  /** ISO timestamp when archived, or `null` while active. */
  archivedAt: string | null
}

/* ------------------------------------------------------------------ */
/* Attendance                                                          */
/* ------------------------------------------------------------------ */

export type AttendanceStatus = 'present' | 'absent'

export type AttendanceSessionStatus = 'draft' | 'completed' | 'cancelled'

/** A church service / meeting for which attendance is recorded. */
export interface AttendanceSession {
  id: string
  /** Calendar day (`YYYY-MM-DD`). */
  date: string
  serviceName: string
  status: AttendanceSessionStatus
  notes?: string
  /** How many members currently have a recorded status. */
  recordedCount: number
  presentCount: number
  absentCount: number
  createdAt: string
  updatedAt: string
}

/** One member's row on an attendance sheet. `status` is `null` when unrecorded. */
export interface AttendanceMemberRow {
  /** The member record UUID (used by the save RPC). */
  memberId: string
  memberCode: string
  firstName: string
  lastName: string
  status: AttendanceStatus | null
  /** Whether an auth account is linked (used by reminder eligibility). */
  hasAccount: boolean
}

export interface AttendanceSessionDetail {
  session: AttendanceSession
  rows: AttendanceMemberRow[]
}

/** One attendance entry in the signed-in member's own report. */
export interface MyAttendanceRecord {
  sessionId: string
  date: string
  serviceName: string
  status: AttendanceStatus
}

/** The signed-in member's attendance summary. */
export interface MyAttendanceSummary {
  totalSessions: number
  present: number
  absent: number
  /** Present / total recorded sessions × 100, rounded to one decimal. */
  percentage: number
  records: MyAttendanceRecord[]
}

/* ------------------------------------------------------------------ */
/* Prayer                                                              */
/* ------------------------------------------------------------------ */

export interface PrayerCategory {
  id: string
  name: string
  description: string
  archivedAt: string | null
  itemCount: number
}

export interface PrayerItem {
  id: string
  categoryId: string
  categoryName: string
  title: string
  description: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export type NotificationType = 'attendance_reminder' | 'prayer_reminder' | 'chat_message'

export interface AppNotification {
  id: string
  userId: string
  /** Resolved recipient details — only populated for the super admin history. */
  recipientName?: string
  recipientEmail?: string
  type: NotificationType
  title: string
  message: string
  isRead: boolean
  destination: string | null
  referenceId: string | null
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

export type ChatChannel = 'group' | 'private'

export interface ChatMessage {
  id: string
  channel: ChatChannel
  senderId: string
  senderName: string
  recipientId: string | null
  body: string
  replyTo: string | null
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Church events & daily hub                                           */
/* ------------------------------------------------------------------ */

export interface ChurchEvent {
  id: string
  title: string
  description: string
  eventDate: string
  eventTime: string | null
  location: string | null
  createdBy: string | null
  createdAt: string
}

export interface DailyHubPost {
  id: string
  title: string
  content: string
  postDate: string
  createdBy: string | null
  createdAt: string
}

/** Generic async loading state used by data-fetching hooks. */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string }
