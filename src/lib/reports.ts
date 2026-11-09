import type { Family, Member } from '@/types'

/**
 * Report aggregation helpers.
 * ==================
 *
 * Pure functions that turn already-authorised member/household rows into the
 * counts the Reports page renders. Keeping them here (rather than inline in the
 * page) makes the arithmetic unit-testable and keeps the page a thin view.
 *
 * Two honesty rules drive the design:
 *   * A member who serves in several ministries is counted once per ministry,
 *     but the DISTINCT member total is reported separately — `ministryBreakdown`
 *     returns both `assignments` (sum of per-ministry counts) and
 *     `uniqueMembers`, so a multi-ministry member is never silently
 *     double-counted in a headline figure.
 *   * Missing or blank data is represented honestly (e.g. "No date of birth")
 *     rather than being invented.
 */

export interface Slice {
  label: string
  value: number
}

function tally(labels: Iterable<string>): Slice[] {
  const counts = new Map<string, number>()
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

const STATUS_LABELS: Record<Member['status'], string> = {
  active: 'Active',
  new: 'New',
  inactive: 'Inactive',
  transferred: 'Transferred',
}

const MARITAL_LABELS: Record<Member['maritalStatus'], string> = {
  single: 'Single',
  married: 'Married',
  widowed: 'Widowed',
  widower: 'Widower',
}

const BAPTISM_LABELS: Record<Member['baptismStatus'], string> = {
  baptised: 'Baptised',
  'not-baptised': 'Not baptised',
  unknown: 'Unknown',
}

export function statusBreakdown(members: Member[]): Slice[] {
  return tally(members.map((m) => STATUS_LABELS[m.status] ?? 'Unknown'))
}

export function genderBreakdown(members: Member[]): Slice[] {
  return tally(
    members.map((m) => (m.gender === 'male' ? 'Male' : 'Female')),
  )
}

export function maritalBreakdown(members: Member[]): Slice[] {
  return tally(
    members.map((m) => MARITAL_LABELS[m.maritalStatus] ?? 'Unknown'),
  )
}

export function baptismBreakdown(members: Member[]): Slice[] {
  return tally(
    members.map((m) => BAPTISM_LABELS[m.baptismStatus] ?? 'Unknown'),
  )
}

export interface MinistryReport {
  /** Per-ministry counts (a member appears once under each ministry they serve). */
  ministries: Slice[]
  /** Sum of per-ministry counts (a member in N ministries contributes N). */
  assignments: number
  /** Members serving in at least one ministry (counted once). */
  uniqueMembers: number
  /** Members with no ministry recorded. */
  unassigned: number
}

export function ministryBreakdown(members: Member[]): MinistryReport {
  const perMinistry = new Map<string, number>()
  const serving = new Set<string>()
  let assignments = 0

  for (const member of members) {
    const ministries = Array.from(new Set(member.ministries.filter(Boolean)))
    if (ministries.length > 0) serving.add(member.id)
    for (const name of ministries) {
      perMinistry.set(name, (perMinistry.get(name) ?? 0) + 1)
      assignments += 1
    }
  }

  const ministries = Array.from(perMinistry.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))

  return {
    ministries,
    assignments,
    uniqueMembers: serving.size,
    unassigned: members.length - serving.size,
  }
}

export interface FamilyReport {
  totalFamilies: number
  activeFamilies: number
  archivedFamilies: number
  /** Members linked to at least one household. */
  membersInFamilies: number
  /** Members with no household. */
  membersWithoutFamily: number
  /** Households ordered by linked-member count, largest first. */
  sizes: Array<{ code: string; name: string; memberCount: number }>
  /** Mean members per non-empty household (0 when none). */
  averageSize: number
}

export function familyReport(members: Member[], families: Family[]): FamilyReport {
  const counts = new Map<string, number>()
  for (const member of members) {
    if (member.familyId) {
      counts.set(member.familyId, (counts.get(member.familyId) ?? 0) + 1)
    }
  }

  const sizes = families
    .map((family) => ({
      code: family.id,
      name: family.name,
      memberCount: counts.get(family.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.memberCount - a.memberCount || a.name.localeCompare(b.name),
    )

  const linkedFamilies = sizes.filter((f) => f.memberCount > 0)
  const totalLinkedMembers = linkedFamilies.reduce(
    (sum, f) => sum + f.memberCount,
    0,
  )

  return {
    totalFamilies: families.length,
    activeFamilies: families.filter((f) => !f.archivedAt).length,
    archivedFamilies: families.filter((f) => f.archivedAt).length,
    membersInFamilies: members.filter((m) => Boolean(m.familyId)).length,
    membersWithoutFamily: members.filter((m) => !m.familyId).length,
    sizes,
    averageSize:
      linkedFamilies.length > 0
        ? Math.round((totalLinkedMembers / linkedFamilies.length) * 10) / 10
        : 0,
  }
}

/**
 * Members whose membership date falls within [from, to] inclusive. Values are
 * `YYYY-MM-DD`; an empty bound is open-ended. Members without a membership date
 * are never counted.
 */
export function joinedInRange(
  members: Member[],
  from?: string,
  to?: string,
): Member[] {
  return members
    .filter((m) => Boolean(m.joinedAt))
    .filter((m) => {
      const joined = m.joinedAt.slice(0, 10)
      if (from && joined < from) return false
      if (to && joined > to) return false
      return true
    })
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
}
