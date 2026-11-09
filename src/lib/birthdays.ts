import type { Member } from '@/types'

/**
 * Birthday date maths.
 * ====================
 *
 * Pure, dependency-free helpers used by the Birthday Calendar. Dates of birth
 * are treated as calendar days (no time, no timezone drift) and the "next
 * occurrence" of a birthday is always resolved to a local midnight on/after a
 * reference day, so a birthday on 31 Dec correctly rolls to the following year.
 *
 * Nothing here decides *who* may be seen — that is entirely enforced by the
 * existing Row Level Security read (`members_select`): `listMembers()` only
 * ever returns rows the signed-in account is permitted to read.
 */

export interface BirthdayEntry {
  member: Member
  /** Birth month, 0-indexed (0 = January). */
  month: number
  /** Birth day of month (1-31). */
  day: number
  /** Local midnight of the next occurrence on/after the reference day. */
  next: Date
  /** Age the member turns on `next`, or `null` when the birth year is unusable. */
  turningAge: number | null
  /** Whole days from the reference day until `next` (0 = today). */
  daysAway: number
}

export interface BirthdayParts {
  year: number
  month: number
  day: number
}

/**
 * Parse a stored date of birth (`YYYY-MM-DD`, or any Date-parseable string)
 * into calendar parts. Returns `null` for missing or malformed values so the UI
 * can safely skip members without a usable date.
 */
export function parseBirthday(
  value: string | null | undefined,
): BirthdayParts | null {
  if (!value) return null
  const trimmed = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)

  let year: number
  let month: number
  let day: number

  if (match) {
    year = Number(match[1])
    month = Number(match[2]) - 1
    day = Number(match[3])
  } else {
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null
    year = parsed.getFullYear()
    month = parsed.getMonth()
    day = parsed.getDate()
  }

  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  if (year < 1900 || year > 3000) return null
  return { year, month, day }
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  return [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month]
}

/** Strip the time component so comparisons are calendar-day only. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * The day a birth day maps to in a given year. A 29 February birthday is
 * clamped to 28 February in non-leap years, which keeps the entry visible
 * instead of silently vanishing.
 */
function clampDay(month: number, day: number, year: number): number {
  return Math.min(day, daysInMonth(year, month))
}

/**
 * The next occurrence of a month/day on or after `from`.
 * Handles month and year rollover (e.g. a December birthday viewed in January).
 */
export function nextOccurrence(month: number, day: number, from: Date): Date {
  const base = startOfDay(from)
  const year = base.getFullYear()
  const candidate = new Date(year, month, clampDay(month, day, year))
  if (candidate.getTime() >= base.getTime()) return candidate
  const nextYear = year + 1
  return new Date(nextYear, month, clampDay(month, day, nextYear))
}

/** Whole calendar days between two dates (negative when `to` is in the past). */
export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY,
  )
}

/**
 * Build the birthday list for the given members, soonest first. Members without
 * a usable date of birth are omitted. Ties are broken alphabetically.
 */
export function buildBirthdayEntries(
  members: Member[],
  from: Date = new Date(),
): BirthdayEntry[] {
  const base = startOfDay(from)
  const entries: BirthdayEntry[] = []

  for (const member of members) {
    const parsed = parseBirthday(member.dateOfBirth)
    if (!parsed) continue

    const next = nextOccurrence(parsed.month, parsed.day, base)
    const age = next.getFullYear() - parsed.year

    entries.push({
      member,
      month: parsed.month,
      day: parsed.day,
      next,
      turningAge: age >= 0 && age < 130 ? age : null,
      daysAway: daysBetween(base, next),
    })
  }

  entries.sort(
    (a, b) =>
      a.daysAway - b.daysAway ||
      a.member.lastName.localeCompare(b.member.lastName) ||
      a.member.firstName.localeCompare(b.member.firstName),
  )

  return entries
}

/** Entries whose birthday falls in the given calendar month, ordered by day. */
export function entriesInMonth(
  entries: BirthdayEntry[],
  month: number,
): BirthdayEntry[] {
  return entries
    .filter((entry) => entry.month === month)
    .sort((a, b) => a.day - b.day)
}

/** Weekday (0 = Sunday) that the first of the month falls on. */
export function firstWeekdayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}
