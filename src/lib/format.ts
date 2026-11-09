/**
 * Date / number formatting helpers. Kept dependency-free and defensive so
 * demo data with sparse fields never crashes a render.
 */

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** "3 days ago" style relative label, falling back to a date when old. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  const diff = Date.now() - date.getTime()
  const minutes = Math.round(diff / 60000)
  if (Math.abs(minutes) < 1) return 'just now'
  if (Math.abs(minutes) < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  if (Math.abs(days) < 7) return `${days}d ago`

  return formatDate(value)
}

export function getInitials(first: string, last?: string): string {
  const a = first?.trim()?.[0] ?? ''
  const b = last?.trim()?.[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

export function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim()
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

/** Human friendly age from a date-of-birth string. */
export function calculateAge(dob: string | null): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const diff = Date.now() - birth.getTime()
  const age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  return age >= 0 && age < 130 ? age : null
}
