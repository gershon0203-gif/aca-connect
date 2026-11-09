import { getSupabaseClient, isDemoMode, TABLES } from '@/lib/supabase'

import { delay } from './latency'
import * as demo from './demo-store'
import type { PrayerCategory, PrayerItem } from '@/types'

/**
 * Prayer management data access
 * =============================
 *
 * No prayer categories or prayer content are seeded by this application — the
 * administrator supplies the real church content. Writes are super-admin only,
 * enforced by Row Level Security; reminders are sent by a SECURITY DEFINER RPC
 * which re-checks the trusted role and refuses archived prayers.
 */

export const DEFAULT_PRAYER_REMINDER =
  'This is a gentle reminder to keep our church prayer requests in your prayers. ' +
  'God bless you!'

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

interface CategoryRow {
  id: string
  name: string
  description: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
  prayer_items?: Array<{ id?: string; status?: 'active' | 'archived' }>
}

interface ItemRow {
  id: string
  category_id: string
  title: string
  description: string | null
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
  prayer_categories?: { name?: string } | null
}

function mapCategory(row: CategoryRow): PrayerCategory {
  // Count only active prayers, matching the "active prayer" label in the UI.
  const items = Array.isArray(row.prayer_items) ? row.prayer_items : []
  return {
    id: String(row.id),
    name: row.name,
    description: row.description ?? '',
    archivedAt: row.archived_at,
    itemCount: items.filter((item) => item.status === 'active').length,
  }
}

function mapItem(row: ItemRow): PrayerItem {
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    categoryName: row.prayer_categories?.name ?? '',
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listPrayerCategories(
  includeArchived = false,
): Promise<PrayerCategory[]> {
  if (!isLive()) return delay(demo.listDemoPrayerCategories(includeArchived))
  const supabase = getSupabaseClient()!
  let query = supabase
    .from(TABLES.prayerCategories)
    .select(
      'id, name, description, archived_at, created_at, updated_at, prayer_items(id, status)',
    )
    .order('name', { ascending: true })
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as CategoryRow[]).map(mapCategory)
}

export async function createPrayerCategory(
  name: string,
  description: string,
): Promise<void> {
  if (!isLive()) {
    const ok = demo.insertDemoPrayerCategory(name, description)
    if (!ok) throw new Error('That category name is already in use.')
    return delay(undefined)
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase
    .from(TABLES.prayerCategories)
    .insert({ name: name.trim(), description: description.trim() || null })
  if (error) {
    if (error.code === '23505') {
      throw new Error('That category name is already in use.')
    }
    throw new Error(error.message)
  }
}

export async function updatePrayerCategory(
  id: string,
  name: string,
  description: string,
): Promise<void> {
  if (!isLive()) {
    const ok = demo.updateDemoPrayerCategory(id, name, description)
    if (!ok) throw new Error('Could not update that category.')
    return delay(undefined)
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase
    .from(TABLES.prayerCategories)
    .update({ name: name.trim(), description: description.trim() || null })
    .eq('id', id)
  if (error) {
    if (error.code === '23505') {
      throw new Error('That category name is already in use.')
    }
    throw new Error(error.message)
  }
}

export async function setPrayerCategoryArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  if (!isLive()) {
    const ok = demo.setDemoPrayerCategoryArchived(id, archived)
    if (!ok) throw new Error('Could not archive that category.')
    return delay(undefined)
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase
    .from(TABLES.prayerCategories)
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listPrayerItems(
  categoryId: string | null = null,
  includeArchived = false,
): Promise<PrayerItem[]> {
  if (!isLive()) {
    return delay(demo.listDemoPrayerItems(categoryId, includeArchived))
  }
  const supabase = getSupabaseClient()!
  let query = supabase
    .from(TABLES.prayerItems)
    .select(
      'id, category_id, title, description, status, created_at, updated_at, prayer_categories(name)',
    )
    .order('title', { ascending: true })
  if (categoryId) query = query.eq('category_id', categoryId)
  if (!includeArchived) query = query.eq('status', 'active')
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as ItemRow[]).map(mapItem)
}

export async function createPrayerItem(input: {
  categoryId: string
  title: string
  description: string
}): Promise<void> {
  if (!isLive()) {
    const ok = demo.insertDemoPrayerItem(input)
    if (!ok) throw new Error('Choose a category and enter a prayer title.')
    return delay(undefined)
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase.from(TABLES.prayerItems).insert({
    category_id: input.categoryId,
    title: input.title.trim(),
    description: input.description.trim() || null,
  })
  if (error) throw new Error(error.message)
}

export async function updatePrayerItem(
  id: string,
  input: { categoryId: string; title: string; description: string },
): Promise<void> {
  if (!isLive()) {
    const ok = demo.updateDemoPrayerItem(id, input)
    if (!ok) throw new Error('Could not update that prayer.')
    return delay(undefined)
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase
    .from(TABLES.prayerItems)
    .update({
      category_id: input.categoryId,
      title: input.title.trim(),
      description: input.description.trim() || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setPrayerItemArchived(
  id: string,
  archived: boolean,
): Promise<void> {
  if (!isLive()) {
    const ok = demo.setDemoPrayerItemArchived(id, archived)
    if (!ok) throw new Error('Could not archive that prayer.')
    return delay(undefined)
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase
    .from(TABLES.prayerItems)
    .update({ status: archived ? 'archived' : 'active' })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** How many reminders already exist for a prayer (duplicate-send warning). */
export async function countPrayerReminders(itemId: string): Promise<number> {
  if (!isLive()) return delay(0)
  const supabase = getSupabaseClient()!
  const { count, error } = await supabase
    .from(TABLES.notifications)
    .select('id', { count: 'exact', head: true })
    .eq('type', 'prayer_reminder')
    .eq('reference_id', itemId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

/**
 * Send prayer reminders (in-app + push) to every eligible active, approved
 * member. The Edge Function re-checks the caller's role and de-duplicates
 * per (member, prayer). It creates in-app notifications via the existing RPC
 * AND sends FCM push notifications to each recipient's registered devices.
 */
export async function sendPrayerReminder(
  itemId: string,
  title: string,
  message: string,
): Promise<{
  sent: number
  failed: number
  alreadySent: number
  recipients: number
  skipped?: string
}> {
  if (!isLive()) {
    return delay({
      sent: demo.sendDemoPrayerReminder(),
      failed: 0,
      alreadySent: 0,
      recipients: 0,
    })
  }
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      notification_type: 'prayer_reminder',
      prayer_item_id: itemId,
      title,
      message,
    },
  })
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as any).context
      if (ctx && typeof ctx.text === 'function') {
        const body = await ctx.text()
        try {
          const parsed = JSON.parse(body)
          if (parsed?.error) detail = parsed.error
          else if (body) detail = body
        } catch {
          if (body) detail = body
        }
      }
    } catch {
      /* keep original message */
    }
    throw new Error(detail)
  }
  return {
    sent: Number((data as any)?.sent ?? 0),
    failed: Number((data as any)?.failed ?? 0),
    alreadySent: Number((data as any)?.already_sent ?? 0),
    recipients: Number((data as any)?.recipients ?? 0),
    skipped: (data as any)?.skipped,
  }
}
