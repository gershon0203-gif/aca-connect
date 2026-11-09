import { getSupabaseClient, isDemoMode, TABLES } from '@/lib/supabase'
import { delay, LATENCY } from './latency'
import * as demo from './demo-store'
import type { MinistryCatalogItem } from '@/types'

/**
 * Ministry catalogue data-access layer
 * ====================================
 *
 * The canonical list of ministries a member may serve in. It seeds the fixed
 * standard list (Worship, Children, Youth, Outreach, Others) and lets an
 * administrator add, rename or archive entries. It is NOT the source of the
 * per-member ministry tags — those stay on `members.ministries`, and the
 * catalogue simply keeps the choices tidy.
 *
 * Staff enforce writes server-side; everyone signed in may read the list so the
 * member form can offer the options.
 */

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

interface MinistryRow {
  id: string
  name: string
  sort_order: number
  archived_at: string | null
}

function mapRow(row: MinistryRow): MinistryCatalogItem {
  return {
    id: String(row.id),
    name: String(row.name),
    sortOrder: Number(row.sort_order ?? 0),
    archivedAt: row.archived_at ?? null,
  }
}

/** A friendly message for the duplicate-name unique constraint. */
function friendlyWriteError(message: string): string {
  if (/duplicate key|already exists|ministries_name_key/i.test(message)) {
    return 'A ministry with that name already exists.'
  }
  return message
}

export async function listMinistryCatalog(
  options: { includeArchived?: boolean } = {},
): Promise<MinistryCatalogItem[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    let request = supabase
      .from(TABLES.ministries)
      .select('id, name, sort_order, archived_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (!options.includeArchived) request = request.is('archived_at', null)

    const { data, error } = await request
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => mapRow(row as unknown as MinistryRow))
  }

  return delay(demo.listDemoMinistries(options.includeArchived ?? false))
}

export async function createMinistry(name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('Enter a ministry name.')

  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { error } = await supabase
      .from(TABLES.ministries)
      .insert({ name: clean })
    if (error) throw new Error(friendlyWriteError(error.message))
    return
  }

  const ok = await delay(demo.insertDemoMinistry(clean), LATENCY)
  if (!ok) throw new Error('A ministry with that name already exists.')
}

export async function renameMinistry(id: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('Enter a ministry name.')

  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.ministries)
      .update({ name: clean })
      .eq('id', id)
      .select('id')
    if (error) throw new Error(friendlyWriteError(error.message))
    if (!data || data.length === 0) throw new Error('That ministry was not found.')
    return
  }

  const ok = await delay(demo.replaceDemoMinistry(id, clean), LATENCY)
  if (!ok) throw new Error('A ministry with that name already exists.')
}

export async function setMinistryArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.ministries)
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('That ministry was not found.')
    return
  }

  const ok = await delay(demo.setDemoMinistryArchived(id, archived), LATENCY)
  if (!ok) throw new Error('That ministry was not found.')
}
