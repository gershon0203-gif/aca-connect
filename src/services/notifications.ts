import { getSupabaseClient, isDemoMode, RPC, TABLES } from '@/lib/supabase'
import { delay } from './latency'
import * as demo from './demo-store'
import type { AppNotification, NotificationType } from '@/types'

/**
 * In-app notification centre
 * ==========================
 *
 * Row Level Security guarantees a member can read only their own notifications
 * and can change only `is_read`. Notifications are never inserted from the
 * client: the attendance/prayer reminder RPCs create them server-side.
 */

export const NOTIFICATIONS_CHANGED_EVENT = 'aca-notifications-changed'

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

function announceChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
  }
}

interface NotificationRow {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  is_read: boolean
  destination: string | null
  reference_id: string | null
  created_at: string
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
}

function mapNotification(
  row: NotificationRow,
  recipient?: ProfileRow,
): AppNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    recipientName: recipient?.full_name?.trim() || undefined,
    recipientEmail: recipient?.email?.trim() || undefined,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.is_read,
    destination: row.destination,
    referenceId: row.reference_id,
    createdAt: row.created_at,
  }
}

/** The signed-in user's own inbox, newest first. */
export async function listMyNotifications(
  userId: string,
): Promise<AppNotification[]> {
  if (!isLive()) return delay(demo.listDemoNotifications(userId))
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase
    .from(TABLES.notifications)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as NotificationRow[]).map((row) => mapNotification(row))
}

export async function unreadNotificationCount(
  userId: string | null | undefined,
): Promise<number> {
  if (!userId) return 0
  if (!isLive()) return delay(demo.countDemoUnreadNotifications(userId))
  const supabase = getSupabaseClient()!
  const { count, error } = await supabase
    .from(TABLES.notifications)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!isLive()) {
    demo.markDemoNotificationRead(id)
    announceChange()
    return delay(undefined)
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase
    .from(TABLES.notifications)
    .update({ is_read: true })
    .eq('id', id)
  if (error) throw new Error(error.message)
  announceChange()
}

export async function markAllNotificationsRead(
  userId: string,
): Promise<number> {
  if (!isLive()) {
    const count = demo.markAllDemoNotificationsRead(userId)
    announceChange()
    return delay(count)
  }
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.rpc(RPC.markAllNotificationsRead)
  if (error) throw new Error(error.message)
  announceChange()
  return Number(data ?? 0)
}

/**
 * Delivery history for the super admin: every notification with the resolved
 * recipient name/email. Members can never reach this because RLS filters their
 * select to their own rows.
 */
export async function listNotificationHistory(): Promise<AppNotification[]> {
  if (!isLive()) return delay(demo.listDemoNotificationHistory())
  const supabase = getSupabaseClient()!
  const [notificationsResult, profilesResult] = await Promise.all([
    supabase
      .from(TABLES.notifications)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from(TABLES.profiles).select('id, full_name, email'),
  ])
  if (notificationsResult.error) throw new Error(notificationsResult.error.message)
  if (profilesResult.error) throw new Error(profilesResult.error.message)

  const profiles = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [
      String(profile.id),
      profile,
    ]),
  )
  return ((notificationsResult.data ?? []) as NotificationRow[]).map((row) =>
    mapNotification(row, profiles.get(String(row.user_id))),
  )
}
