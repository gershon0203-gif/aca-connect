import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isDemoMode } from './env'

/**
 * Supabase client
 * ===============
 *
 * The client is created lazily and only when a real backend is configured, so
 * an empty checkout boots cleanly on demo data.
 *
 * Configure a real backend with a `.env.local`:
 *
 *   VITE_SUPABASE_URL=https://<project>.supabase.co
 *   VITE_SUPABASE_ANON_KEY=<anon-key>
 *   VITE_USE_DEMO_DATA=false
 *
 * Only the public anon key ever reaches the browser. Row Level Security (see
 * `supabase/migrations/*_rls.sql`) is what actually protects the data.
 */

export { isDemoMode }

let client: SupabaseClient | null = null

/**
 * Returns the shared Supabase client, or `null` when the project has not been
 * configured yet (demo mode). Callers must guard against `null`.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (env.isDemoMode || !env.hasCredentials) return null
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

/** Table names used across the app, kept in one place. */
export const TABLES = {
  profiles: 'profiles',
  userRoles: 'user_roles',
  families: 'families',
  members: 'members',
  ministries: 'ministries',
  familyMembers: 'family_members',
  memberRelationships: 'member_relationships',
  invitations: 'invitations',
  auditLogs: 'audit_logs',
  attendanceSessions: 'attendance_sessions',
  attendanceRecords: 'attendance_records',
  prayerCategories: 'prayer_categories',
  prayerItems: 'prayer_items',
  notifications: 'notifications',
  deviceTokens: 'device_tokens',
  pushSendLogs: 'push_send_logs',
} as const

/** Storage buckets. */
export const BUCKETS = {
  avatars: 'avatars',
} as const

/** Postgres functions exposed to the client. */
export const RPC = {
  memberSetFamily: 'member_set_family',
  acceptInvitation: 'accept_invitation',
  adminLinkMember: 'admin_link_member',
  adminUnlinkMember: 'admin_unlink_member',
  getMyFamily: 'get_my_family',
  reissueInvitation: 'reissue_invitation',
  createFamily: 'create_family',
  familyAddMember: 'family_add_member',
  familyRemoveMember: 'family_remove_member',
  familySetPrimaryContact: 'family_set_primary_contact',
  addMemberRelationship: 'add_member_relationship',
  removeMemberRelationship: 'remove_member_relationship',
  getMyRelationships: 'get_my_relationships',
  setSpouseAnniversary: 'set_spouse_anniversary',
  getMyAnniversary: 'get_my_anniversary',
  adminCreateAttendanceSession: 'admin_create_attendance_session',
  adminSaveAttendance: 'admin_save_attendance',
  adminFinalizeAttendance: 'admin_finalize_attendance',
  adminSendAttendanceReminders: 'admin_send_attendance_reminders',
  adminSendPrayerReminder: 'admin_send_prayer_reminder',
  markAllNotificationsRead: 'mark_all_notifications_read',
  memberRegisterDeviceToken: 'member_register_device_token',
  memberUnregisterDeviceToken: 'member_unregister_device_token',
  nextMemberCode: 'next_member_code',
} as const
