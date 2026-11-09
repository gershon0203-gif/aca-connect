/**
 * CSV export utilities.
 * =====================
 *
 * Dependency-free helpers for building spreadsheet-safe CSV text and triggering
 * a client-side download. Two safety properties matter here:
 *
 *  1. Correct escaping — values containing a comma, quote, newline or carriage
 *     return are wrapped in double quotes with embedded quotes doubled.
 *  2. Formula-injection protection — a value that would be interpreted as a
 *     formula by Excel / Sheets / LibreOffice (leading `=`, `+`, `-`, `@`, or a
 *     leading tab / carriage return) is prefixed with a single quote so it is
 *     treated as text. This is applied AFTER trimming any leading spaces that
 *     spreadsheet apps ignore.
 *
 * Exports are produced entirely in the browser from already-authorised data and
 * downloaded through a transient object URL that is revoked immediately — no
 * public URL is ever created and nothing is emailed anywhere.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/

/**
 * Make a single value safe for a CSV cell.
 * `null`/`undefined` become an empty cell.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = String(value)

  // Neutralise formula-leading characters. Leading spaces are ignored by
  // spreadsheet parsers, so test the value with those stripped.
  const withoutLeadingSpaces = text.replace(/^[ \u00a0]+/, '')
  if (FORMULA_PREFIX.test(withoutLeadingSpaces)) {
    text = `'${text}`
  }

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** Assemble a full CSV document from a header row and body rows. */
export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const lines: string[] = [headers.map(escapeCsvValue).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','))
  }
  // Trailing newline keeps POSIX tools and Excel happy.
  return `${lines.join('\r\n')}\r\n`
}

/** `2026-10-17` from a Date (local calendar day). */
function isoDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Build a clear, filesystem-safe filename: `aca-connect_<slug>_<date>.csv`.
 * The slug is lower-cased and stripped of anything but word characters.
 */
export function buildCsvFilename(
  reportSlug: string,
  date: Date = new Date(),
): string {
  const slug = reportSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `aca-connect_${slug || 'export'}_${isoDay(date)}.csv`
}

/**
 * Trigger a download of `csv` as `filename` using a transient blob URL.
 * Returns `false` in environments without the DOM download APIs.
 */
export function downloadCsv(filename: string, csv: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return false
  }
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.rel = 'noopener'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    return true
  } finally {
    // Revoke on the next tick so the click has committed.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
