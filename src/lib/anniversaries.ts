import type { SpouseCouple } from '@/types'
import { fullName } from './format'
import {
  daysBetween,
  daysInMonth,
  firstWeekdayOfMonth,
  nextOccurrence,
  startOfDay,
} from './birthdays'

/**
 * Anniversary date maths.
 * =======================
 *
 * Pure, dependency-free helpers for the Anniversary Calendar. A wedding date is
 * a calendar day (year = the year married); the "next occurrence" resolves to a
 * local midnight on/after a reference day so a December anniversary correctly
 * rolls into the following year. 29 February weddings clamp to 28 February in
 * non-leap years (matching the birthday calendar) so the entry never vanishes.
 *
 * Nothing here decides *who* may be seen — the data-access layer and Row Level
 * Security enforce that; these helpers only do arithmetic.
 */

export interface AnniversaryParts {
  year: number
  month: number
  day: number
}

export interface AnniversaryEntry {
  couple: SpouseCouple
  /** The resolved wedding date (`YYYY-MM-DD`, never null for an entry). */
  date: string
  /** The year the couple married. */
  sinceYear: number
  /** Anniversary month, 0-indexed (0 = January). */
  month: number
  /** Day of month (1-31). */
  day: number
  /** Local midnight of the next occurrence on/after the reference day. */
  next: Date
  /** Number of years married on `next`. */
  years: number
  /** Whole days from the reference day until `next` (0 = today). */
  daysAway: number
}

/**
 * Parse a stored anniversary date (`YYYY-MM-DD`) into calendar parts. Returns
 * `null` for missing or malformed values so the UI can skip them safely.
 */
export function parseAnniversary(
  value: string | null | undefined,
): AnniversaryParts | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  if (year < 1900 || year > 3000) return null
  return { year, month, day }
}

/** Build the upcoming-anniversary list soonest-first, ties broken by name. */
export function buildAnniversaryEntries(
  couples: SpouseCouple[],
  from: Date = new Date(),
): AnniversaryEntry[] {
  const base = startOfDay(from)
  const entries: AnniversaryEntry[] = []

  for (const couple of couples) {
    const parsed = parseAnniversary(couple.date)
    if (!parsed) continue

    const next = nextOccurrence(parsed.month, parsed.day, base)
    const years = next.getFullYear() - parsed.year

    entries.push({
      couple,
      date: couple.date as string,
      sinceYear: parsed.year,
      month: parsed.month,
      day: parsed.day,
      next,
      years: years >= 0 ? years : 0,
      daysAway: daysBetween(base, next),
    })
  }

  entries.sort(
    (a, b) => a.daysAway - b.daysAway || coupleName(a).localeCompare(coupleName(b)),
  )

  return entries
}

/** Entries whose anniversary falls in the given calendar month, ordered by day. */
export function anniversaryEntriesInMonth(
  entries: AnniversaryEntry[],
  month: number,
): AnniversaryEntry[] {
  return entries
    .filter((entry) => entry.month === month)
    .sort((a, b) => a.day - b.day)
}

/** Stable display label for a couple ("A & B"), used for sorting and titles. */
export function coupleName(entry: AnniversaryEntry): string {
  const [a, b] = entry.couple.members
  return `${a.lastName} & ${b.lastName}`.trim()
}

/** Display label for a couple ("First Last & First Last"). */
export function coupleLabel(couple: SpouseCouple): string {
  const [a, b] = couple.members
  return `${fullName(a.firstName, a.lastName)} & ${fullName(b.firstName, b.lastName)}`
}

export { daysInMonth, firstWeekdayOfMonth, startOfDay }
