import {
  demoFamilies,
  demoMembers,
  demoMinistries,
  demoRelationships,
  type DemoRelationshipSeed,
} from '@/lib/demo-data'
import type {
  AppNotification,
  AttendanceMemberRow,
  AttendanceSession,
  AttendanceSessionDetail,
  AttendanceStatus,
  Family,
  FamilyDetail,
  FamilyInput,
  FamilyMemberLink,
  Member,
  MemberInput,
  MemberRelationship,
  MemberRelationshipType,
  MinistryCatalogItem,
  MyAttendanceSummary,
  AnniversaryParty,
  PrayerCategory,
  PrayerItem,
  SpouseCouple,
} from '@/types'

/**
 * ⚠️ DEMO STORE — isolated from production data.
 *
 * This is an in-memory working copy of `src/lib/demo-data.ts`. It exists so the
 * Add / Edit / Remove actions in the interface behave honestly during
 * development: writes really do mutate the working copy, the list really does
 * reflect them, and the detail route really does open the edited record.
 *
 * What it is NOT:
 *  - It is never connected to Supabase or any network call.
 *  - It is never merged into, or written back to, production records.
 *  - It does not survive a page reload.
 *
 * When the app is configured with real Supabase credentials, `isDemoMode`
 * becomes `false`, this module is bypassed entirely by `src/services/*.ts`, and
 * writes go to the real database instead.
 */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

let uid = 0
function nextDemoId(prefix: string): string {
  uid += 1
  return `${prefix}-${Date.now().toString(36)}-${uid}`
}

/** The working copies. Re-seeded from the demo data on module load. */
let memberRows: Member[] = clone(demoMembers)
let familyRows: Family[] = clone(demoFamilies)

interface DemoRelationshipRow {
  id: string
  memberCode: string
  relatedCode: string
  type: MemberRelationshipType
  label: string | null
  anniversaryDate: string | null
}

let relationshipRows: DemoRelationshipRow[] = (demoRelationships as
  DemoRelationshipSeed[]).map((seed) => ({
  id: nextDemoId('rel'),
  memberCode: seed.memberCode,
  relatedCode: seed.relatedCode,
  type: seed.type,
  label: seed.label ?? null,
  anniversaryDate: seed.anniversaryDate ?? null,
}))

/** Canonical ministry catalogue working copy (demo only). */
let ministryRows: MinistryCatalogItem[] = demoMinistries.map((seed, index) => ({
  id: seed.id,
  name: seed.name,
  sortOrder: (index + 1) * 10,
  archivedAt: null,
}))

/** Number of records currently in the demo working copy. */
export function demoMemberCount(): number {
  return memberRows.length
}

export function listDemoMembers(): Member[] {
  return clone(memberRows)
}

export function findDemoMember(id: string): Member | null {
  const found = memberRows.find((row) => row.id === id)
  return found ? clone(found) : null
}

export function insertDemoMember(input: MemberInput): Member {
  const record: Member = {
    ...input,
    notes: input.notes || undefined,
  }
  memberRows = [record, ...memberRows]
  return clone(record)
}

export function replaceDemoMember(
  id: string,
  input: MemberInput,
): Member | null {
  const index = memberRows.findIndex((row) => row.id === id)
  if (index === -1) return null
  const record: Member = {
    ...input,
    notes: input.notes || undefined,
  }
  memberRows = memberRows.map((row, i) => (i === index ? record : row))
  return clone(record)
}

export function removeDemoMember(id: string): boolean {
  const before = memberRows.length
  memberRows = memberRows.filter((row) => row.id !== id)
  relationshipRows = relationshipRows.filter(
    (r) => r.memberCode !== id && r.relatedCode !== id,
  )
  return memberRows.length < before
}

/* ------------------------------------------------------------------ */
/* Families                                                            */
/* ------------------------------------------------------------------ */

function memberName(code: string): string | null {
  const member = memberRows.find((row) => row.id === code)
  return member ? `${member.firstName} ${member.lastName}`.trim() : null
}

function decorateFamily(family: Family): Family {
  const count = memberRows.filter((m) => m.familyId === family.id).length
  const contactCode = family.primaryContactMemberCode ?? null
  return {
    ...clone(family),
    memberCount: count,
    primaryContactMemberCode: contactCode,
    primaryContactName: contactCode ? memberName(contactCode) : null,
  }
}

export function listDemoFamilies(): Family[] {
  return familyRows.map(decorateFamily)
}

export function findDemoFamily(code: string): FamilyDetail | null {
  const family = familyRows.find((row) => row.id === code)
  if (!family) return null
  const members: FamilyMemberLink[] = memberRows
    .filter((m) => m.familyId === code)
    .map((m) => ({
      memberCode: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      avatarUrl: m.avatarUrl,
      isPrimary: true,
    }))
    .sort((a, b) =>
      `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
    )
  return {
    id: family.id,
    name: family.name,
    address: family.address,
    notes: family.notes,
    archivedAt: family.archivedAt ?? null,
    primaryContactMemberCode: family.primaryContactMemberCode ?? null,
    members,
  }
}

function nextFamilyCode(): string {
  let max = 0
  for (const row of familyRows) {
    const match = /^FAM-(\d+)$/.exec(row.id)
    if (match) max = Math.max(max, Number.parseInt(match[1], 10))
  }
  return `FAM-${String(max + 1).padStart(3, '0')}`
}

export function insertDemoFamily(input: FamilyInput): FamilyDetail {
  const family: Family = {
    id: nextFamilyCode(),
    name: input.name.trim(),
    address: input.address.trim() || undefined,
    notes: input.notes.trim() || undefined,
    archivedAt: null,
    primaryContactMemberCode: null,
  }
  familyRows = [family, ...familyRows]
  return findDemoFamily(family.id)!
}

export function replaceDemoFamily(code: string, input: FamilyInput): boolean {
  const index = familyRows.findIndex((row) => row.id === code)
  if (index === -1) return false
  familyRows = familyRows.map((row, i) =>
    i === index
      ? {
          ...row,
          name: input.name.trim(),
          address: input.address.trim() || undefined,
          notes: input.notes.trim() || undefined,
        }
      : row,
  )
  return true
}

export function setDemoFamilyArchived(code: string, archived: boolean): boolean {
  const index = familyRows.findIndex((row) => row.id === code)
  if (index === -1) return false
  familyRows = familyRows.map((row, i) =>
    i === index ? { ...row, archivedAt: archived ? new Date().toISOString() : null } : row,
  )
  return true
}

export function removeDemoFamily(code: string): boolean {
  const before = familyRows.length
  familyRows = familyRows.filter((row) => row.id !== code)
  if (familyRows.length === before) return false
  memberRows = memberRows.map((m) =>
    m.familyId === code ? { ...m, familyId: null } : m,
  )
  return true
}

export function addDemoFamilyMember(
  code: string,
  memberCode: string,
  isPrimary: boolean,
): boolean {
  const member = memberRows.find((row) => row.id === memberCode)
  if (!member) return false
  if (!familyRows.some((row) => row.id === code)) return false
  if (isPrimary) {
    memberRows = memberRows.map((m) =>
      m.id === memberCode ? { ...m, familyId: code } : m,
    )
  }
  return true
}

export function removeDemoFamilyMember(
  code: string,
  memberCode: string,
): boolean {
  let touched = false
  memberRows = memberRows.map((m) => {
    if (m.id === memberCode && m.familyId === code) {
      touched = true
      return { ...m, familyId: null }
    }
    return m
  })
  familyRows = familyRows.map((row) =>
    row.id === code && row.primaryContactMemberCode === memberCode
      ? { ...row, primaryContactMemberCode: null }
      : row,
  )
  return touched
}

export function setDemoFamilyPrimaryContact(
  code: string,
  memberCode: string | null,
): boolean {
  const index = familyRows.findIndex((row) => row.id === code)
  if (index === -1) return false
  if (memberCode && !memberRows.some((m) => m.id === memberCode && m.familyId === code)) {
    return false
  }
  familyRows = familyRows.map((row, i) =>
    i === index ? { ...row, primaryContactMemberCode: memberCode } : row,
  )
  return true
}

/* ------------------------------------------------------------------ */
/* Relationships                                                       */
/* ------------------------------------------------------------------ */

export function listDemoRelationships(memberCode: string): MemberRelationship[] {
  return relationshipRows
    .filter((r) => r.memberCode === memberCode || r.relatedCode === memberCode)
    .map((r) => {
      const subjectIsViewed = r.memberCode === memberCode
      const otherCode = subjectIsViewed ? r.relatedCode : r.memberCode
      return {
        id: r.id,
        type: r.type,
        label: r.label,
        memberCode: otherCode,
        memberName: memberName(otherCode) ?? otherCode,
        subjectIsViewed,
      } satisfies MemberRelationship
    })
    .sort((a, b) => a.memberName.localeCompare(b.memberName))
}

export function addDemoRelationship(
  memberCode: string,
  relatedCode: string,
  type: MemberRelationshipType,
  label: string | null,
): boolean {
  if (memberCode === relatedCode) return false
  if (!memberRows.some((m) => m.id === memberCode)) return false
  if (!memberRows.some((m) => m.id === relatedCode)) return false
  const exists = relationshipRows.some(
    (r) =>
      (r.memberCode === memberCode && r.relatedCode === relatedCode) ||
      (r.memberCode === relatedCode && r.relatedCode === memberCode),
  )
  if (exists) return false
  relationshipRows = [
    ...relationshipRows,
    {
      id: nextDemoId('rel'),
      memberCode,
      relatedCode,
      type,
      label: type === 'other' ? (label?.trim() || null) : null,
      anniversaryDate: null,
    },
  ]
  return true
}

export function removeDemoRelationship(id: string): boolean {
  const before = relationshipRows.length
  relationshipRows = relationshipRows.filter((r) => r.id !== id)
  return relationshipRows.length < before
}

/* ------------------------------------------------------------------ */
/* Anniversaries                                                       */
/* ------------------------------------------------------------------ */

function partyFor(code: string): AnniversaryParty | null {
  const member = memberRows.find((row) => row.id === code)
  if (!member) return null
  return {
    memberCode: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
  }
}

export function listDemoSpouseCouples(): SpouseCouple[] {
  const couples: SpouseCouple[] = []
  for (const row of relationshipRows) {
    if (row.type !== 'spouse') continue
    const a = partyFor(row.memberCode)
    const b = partyFor(row.relatedCode)
    if (!a || !b) continue
    couples.push({
      relationshipId: row.id,
      date: row.anniversaryDate,
      members: [a, b],
    })
  }
  return couples.sort((x, y) =>
    (x.date ?? '9999').localeCompare(y.date ?? '9999'),
  )
}

export function setDemoSpouseAnniversary(
  relationshipId: string,
  date: string | null,
): boolean {
  const row = relationshipRows.find((r) => r.id === relationshipId)
  if (!row || row.type !== 'spouse') return false
  relationshipRows = relationshipRows.map((r) =>
    r.id === relationshipId ? { ...r, anniversaryDate: date } : r,
  )
  return true
}

/* ------------------------------------------------------------------ */
/* Ministry catalogue                                                  */
/* ------------------------------------------------------------------ */

export function listDemoMinistries(
  includeArchived: boolean,
): MinistryCatalogItem[] {
  return clone(
    ministryRows
      .filter((row) => includeArchived || !row.archivedAt)
      .sort((a, b) =>
        a.sortOrder !== b.sortOrder
          ? a.sortOrder - b.sortOrder
          : a.name.localeCompare(b.name),
      ),
  )
}

export function insertDemoMinistry(name: string): boolean {
  const clean = name.trim()
  if (!clean) return false
  if (ministryRows.some((row) => row.name.toLowerCase() === clean.toLowerCase())) {
    return false
  }
  const maxSort = ministryRows.reduce((max, row) => Math.max(max, row.sortOrder), 0)
  ministryRows = [
    ...ministryRows,
    {
      id: `MIN-${String(ministryRows.length + 1).padStart(2, '0')}`,
      name: clean,
      sortOrder: maxSort + 10,
      archivedAt: null,
    },
  ]
  return true
}

export function replaceDemoMinistry(id: string, name: string): boolean {
  const clean = name.trim()
  if (!clean) return false
  const index = ministryRows.findIndex((row) => row.id === id)
  if (index === -1) return false
  if (
    ministryRows.some(
      (row) => row.id !== id && row.name.toLowerCase() === clean.toLowerCase(),
    )
  ) {
    return false
  }
  ministryRows = ministryRows.map((row, i) =>
    i === index ? { ...row, name: clean } : row,
  )
  return true
}

export function setDemoMinistryArchived(id: string, archived: boolean): boolean {
  const index = ministryRows.findIndex((row) => row.id === id)
  if (index === -1) return false
  ministryRows = ministryRows.map((row, i) =>
    i === index
      ? { ...row, archivedAt: archived ? new Date().toISOString() : null }
      : row,
  )
  return true
}

/* ------------------------------------------------------------------ */
/* Attendance (demo)                                                   */
/* ------------------------------------------------------------------ */

interface DemoAttendanceSessionRow {
  id: string
  date: string
  serviceName: string
  status: 'draft' | 'completed' | 'cancelled'
  notes?: string
  createdAt: string
  updatedAt: string
}

interface DemoAttendanceRecordRow {
  id: string
  sessionId: string
  /** Demo members use their human code as the id. */
  memberId: string
  status: AttendanceStatus
}

let attendanceSessionRows: DemoAttendanceSessionRow[] = []
let attendanceRecordRows: DemoAttendanceRecordRow[] = []

function attendanceSummary(row: DemoAttendanceSessionRow): AttendanceSession {
  const records = attendanceRecordRows.filter((r) => r.sessionId === row.id)
  return {
    id: row.id,
    date: row.date,
    serviceName: row.serviceName,
    status: row.status,
    notes: row.notes,
    recordedCount: records.length,
    presentCount: records.filter((r) => r.status === 'present').length,
    absentCount: records.filter((r) => r.status === 'absent').length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function listDemoAttendanceSessions(): AttendanceSession[] {
  return [...attendanceSessionRows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(attendanceSummary)
}

export function findDemoAttendanceSession(
  id: string,
): AttendanceSessionDetail | null {
  const row = attendanceSessionRows.find((s) => s.id === id)
  if (!row) return null
  const records = attendanceRecordRows.filter((r) => r.sessionId === id)
  const rows: AttendanceMemberRow[] = memberRows
    .filter((m) => m.status === 'active')
    .map((m) => ({
      memberId: m.id,
      memberCode: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      status: records.find((r) => r.memberId === m.id)?.status ?? null,
      hasAccount: Boolean(m.userId),
    }))
    .sort((a, b) =>
      `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
    )
  return { session: attendanceSummary(row), rows }
}

export function createDemoAttendanceSession(
  date: string,
  serviceName: string,
): string {
  const clean = serviceName.trim()
  if (!date || !clean) throw new Error('Date and service name are required')
  const exists = attendanceSessionRows.some(
    (row) =>
      row.date === date && row.serviceName.toLowerCase() === clean.toLowerCase(),
  )
  if (exists) {
    throw new Error('A session for this service and date already exists')
  }
  const now = new Date().toISOString()
  const id = nextDemoId('att')
  attendanceSessionRows = [
    ...attendanceSessionRows,
    {
      id,
      date,
      serviceName: clean,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    },
  ]
  return id
}

export function saveDemoAttendance(
  sessionId: string,
  records: Array<{ memberId: string; status: AttendanceStatus }>,
): number {
  const session = attendanceSessionRows.find((s) => s.id === sessionId)
  if (!session || session.status === 'cancelled') {
    throw new Error('Attendance session not found or cancelled')
  }
  const valid = records.filter((r) => memberRows.some((m) => m.id === r.memberId))
  attendanceRecordRows = [
    ...attendanceRecordRows.filter((r) => r.sessionId !== sessionId),
    ...valid.map((r) => ({
      id: nextDemoId('arec'),
      sessionId,
      memberId: r.memberId,
      status: r.status,
    })),
  ]
  session.updatedAt = new Date().toISOString()
  return valid.length
}

export function finalizeDemoAttendance(sessionId: string): void {
  const session = attendanceSessionRows.find((s) => s.id === sessionId)
  if (!session || session.status === 'cancelled') {
    throw new Error('Attendance session not found or cancelled')
  }
  if (!attendanceRecordRows.some((r) => r.sessionId === sessionId)) {
    throw new Error('Record at least one member before completing the session')
  }
  session.status = 'completed'
  session.updatedAt = new Date().toISOString()
}

/** Demo members have no linked sign-in accounts, so there is nobody to notify. */
export function sendDemoAttendanceReminders(): number {
  return 0
}

export function countDemoAttendanceReminders(): number {
  return 0
}

/** Demo mode has no signed-in member account linked to a member record. */
export function getDemoMyAttendance(): MyAttendanceSummary {
  return {
    totalSessions: 0,
    present: 0,
    absent: 0,
    percentage: 0,
    records: [],
  }
}

/* ------------------------------------------------------------------ */
/* Prayer management (demo — intentionally empty)                      */
/* ------------------------------------------------------------------ */

interface DemoPrayerCategoryRow {
  id: string
  name: string
  description: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

interface DemoPrayerItemRow {
  id: string
  categoryId: string
  title: string
  description: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

// No prayer categories or prayer content are seeded: real church content is
// added by the administrator rather than invented here.
let prayerCategoryRows: DemoPrayerCategoryRow[] = []
let prayerItemRows: DemoPrayerItemRow[] = []

export function listDemoPrayerCategories(
  includeArchived: boolean,
): PrayerCategory[] {
  return prayerCategoryRows
    .filter((row) => includeArchived || row.archivedAt === null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      archivedAt: row.archivedAt,
      itemCount: prayerItemRows.filter(
        (item) => item.categoryId === row.id && item.status === 'active',
      ).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function insertDemoPrayerCategory(
  name: string,
  description: string,
): boolean {
  const clean = name.trim()
  if (!clean) return false
  if (
    prayerCategoryRows.some(
      (row) =>
        row.archivedAt === null && row.name.toLowerCase() === clean.toLowerCase(),
    )
  ) {
    return false
  }
  const now = new Date().toISOString()
  prayerCategoryRows = [
    ...prayerCategoryRows,
    {
      id: nextDemoId('pcat'),
      name: clean,
      description: description.trim(),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]
  return true
}

export function updateDemoPrayerCategory(
  id: string,
  name: string,
  description: string,
): boolean {
  const clean = name.trim()
  if (!clean) return false
  if (
    prayerCategoryRows.some(
      (row) =>
        row.id !== id &&
        row.archivedAt === null &&
        row.name.toLowerCase() === clean.toLowerCase(),
    )
  ) {
    return false
  }
  let touched = false
  prayerCategoryRows = prayerCategoryRows.map((row) => {
    if (row.id !== id) return row
    touched = true
    return {
      ...row,
      name: clean,
      description: description.trim(),
      updatedAt: new Date().toISOString(),
    }
  })
  return touched
}

export function setDemoPrayerCategoryArchived(
  id: string,
  archived: boolean,
): boolean {
  let touched = false
  prayerCategoryRows = prayerCategoryRows.map((row) => {
    if (row.id !== id) return row
    touched = true
    return {
      ...row,
      archivedAt: archived ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }
  })
  return touched
}

export function listDemoPrayerItems(
  categoryId: string | null,
  includeArchived: boolean,
): PrayerItem[] {
  return prayerItemRows
    .filter((row) => !categoryId || row.categoryId === categoryId)
    .filter((row) => includeArchived || row.status === 'active')
    .map((row) => ({
      id: row.id,
      categoryId: row.categoryId,
      categoryName:
        prayerCategoryRows.find((cat) => cat.id === row.categoryId)?.name ?? '',
      title: row.title,
      description: row.description,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export function insertDemoPrayerItem(input: {
  categoryId: string
  title: string
  description: string
}): boolean {
  const title = input.title.trim()
  if (!title) return false
  if (!prayerCategoryRows.some((row) => row.id === input.categoryId)) return false
  const now = new Date().toISOString()
  prayerItemRows = [
    ...prayerItemRows,
    {
      id: nextDemoId('pitem'),
      categoryId: input.categoryId,
      title,
      description: input.description.trim(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ]
  return true
}

export function updateDemoPrayerItem(
  id: string,
  input: { categoryId: string; title: string; description: string },
): boolean {
  const title = input.title.trim()
  if (!title) return false
  if (!prayerCategoryRows.some((row) => row.id === input.categoryId)) return false
  let touched = false
  prayerItemRows = prayerItemRows.map((row) => {
    if (row.id !== id) return row
    touched = true
    return {
      ...row,
      categoryId: input.categoryId,
      title,
      description: input.description.trim(),
      updatedAt: new Date().toISOString(),
    }
  })
  return touched
}

export function setDemoPrayerItemArchived(id: string, archived: boolean): boolean {
  let touched = false
  prayerItemRows = prayerItemRows.map((row) => {
    if (row.id !== id) return row
    touched = true
    return {
      ...row,
      status: archived ? 'archived' : 'active',
      updatedAt: new Date().toISOString(),
    }
  })
  return touched
}

/** No demo member accounts are linked, so a prayer reminder reaches nobody. */
export function sendDemoPrayerReminder(): number {
  return 0
}

/* ------------------------------------------------------------------ */
/* Notifications (demo)                                                */
/* ------------------------------------------------------------------ */

let notificationRows: AppNotification[] = []

export function listDemoNotifications(userId: string): AppNotification[] {
  return notificationRows
    .filter((row) => row.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function countDemoUnreadNotifications(userId: string): number {
  return notificationRows.filter((row) => row.userId === userId && !row.isRead)
    .length
}

export function markDemoNotificationRead(id: string): boolean {
  let touched = false
  notificationRows = notificationRows.map((row) => {
    if (row.id !== id) return row
    touched = true
    return { ...row, isRead: true }
  })
  return touched
}

export function markAllDemoNotificationsRead(userId: string): number {
  let count = 0
  notificationRows = notificationRows.map((row) => {
    if (row.userId !== userId || row.isRead) return row
    count += 1
    return { ...row, isRead: true }
  })
  return count
}

export function listDemoNotificationHistory(): AppNotification[] {
  return [...notificationRows].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}
