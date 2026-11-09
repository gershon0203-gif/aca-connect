import {
  demoMinistries,
  demoStats,
  demoActivity,
  demoUsers,
} from '@/lib/demo-data'
import { getSupabaseClient, isDemoMode, TABLES } from '@/lib/supabase'
import { signAvatarUrls } from './storage'
import { delay } from './latency'
import type { ActivityItem, AppUser, Ministry, Stat, UserRole } from '@/types'

/**
 * Non-member data access (ministries, dashboard stats, activity, platform
 * users). Member CRUD lives in `./members.ts`.
 *
 * Every function returns a Promise so screens can render real loading/skeleton
 * states. In demo mode results come from `src/lib/demo-data.ts` after a short
 * delay and are NOT persisted anywhere.
 *
 * Live mode derives most of this from the `members` table and the
 * `audit_logs` trail (there is no separate ministries table — ministries are
 * the distinct tags on member records).
 */

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

function fullName(first: string, last: string): string {
  return `${first} ${last}`.trim()
}

/** Prettify an email (or actor id) into a display name. */
function displayActor(actorEmail: string | null | undefined): string {
  if (!actorEmail) return 'System'
  const local = actorEmail.split('@')[0] ?? actorEmail
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export async function listMinistries(): Promise<Ministry[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.members)
      .select('first_name, last_name, ministries, membership_role')
    if (error) throw new Error(error.message)

    const grouped = new Map<
      string,
      { count: number; leader: string | null; leaderIsLeader: boolean }
    >()
    for (const row of data ?? []) {
      const names = (row.ministries as string[] | null) ?? []
      const role = String(row.membership_role ?? 'member')
      const name = fullName(
        String(row.first_name ?? ''),
        String(row.last_name ?? ''),
      )
      const isLeader =
        role === 'ministry-leader' || role === 'pastor' || role === 'elder'
      for (const ministryName of names) {
        const entry =
          grouped.get(ministryName) ??
          { count: 0, leader: null, leaderIsLeader: false }
        entry.count += 1
        if (!entry.leader || (isLeader && !entry.leaderIsLeader)) {
          entry.leader = name
          entry.leaderIsLeader = isLeader
        }
        grouped.set(ministryName, entry)
      }
    }

    return Array.from(grouped.entries())
      .map(([name, entry], index) => ({
        id: `MIN-${String(index + 1).padStart(2, '0')}`,
        name,
        memberCount: entry.count,
        leader: entry.leader ?? '—',
      }))
      .sort((a, b) => b.memberCount - a.memberCount)
  }
  return delay(demoMinistries)
}

export async function getDashboardStats(): Promise<Stat[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.members)
      .select('status, joined_at')
    if (error) throw new Error(error.message)

    const rows = data ?? []
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const total = rows.length
    const active = rows.filter((r) => r.status === 'active').length
    const inactive = rows.filter((r) => r.status === 'inactive').length
    const pending = rows.filter((r) => r.status === 'new').length
    const addedThisMonth = rows.filter(
      (r) => r.joined_at && new Date(String(r.joined_at)) >= monthStart,
    ).length
    const activePct = total > 0 ? Math.round((active / total) * 100) : 0
    const monthGrowth = total > 0 ? Math.round((addedThisMonth / total) * 1000) / 10 : 0

    return [
      {
        id: 'total',
        label: 'Total members',
        value: String(total),
        delta: monthGrowth,
        hint: `${addedThisMonth} added this month`,
      },
      {
        id: 'active',
        label: 'Active members',
        value: String(active),
        delta: 0,
        hint: `${activePct}% of all members`,
      },
      {
        id: 'pending',
        label: 'Pending approval',
        value: String(pending),
        delta: 0,
        hint: 'Awaiting approval',
      },
      {
        id: 'followup',
        label: 'Needs follow-up',
        value: String(inactive),
        delta: 0,
        hint: 'Inactive members',
      },
    ]
  }
  return delay(demoStats, 400)
}

function describeActivity(row: Record<string, unknown>): ActivityItem {
  const action = String(row.action ?? '')
  const target = String(row.entity_code ?? row.entity_id ?? '')
  let verb = action
  if (action === 'member.created') verb = 'added'
  else if (action === 'member.updated') verb = 'updated'
  else if (action === 'member.deleted') verb = 'removed'
  else if (action === 'family.created') verb = 'created household'
  else if (action === 'family.updated') verb = 'updated household'
  else if (action === 'family.deleted') verb = 'removed household'

  return {
    id: String(row.id),
    actor: displayActor(row.actor_email as string | null),
    action: verb,
    target,
    at: String(row.created_at),
  }
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.auditLogs)
      .select('id, actor_email, action, entity_code, entity_id, created_at')
      .order('created_at', { ascending: false })
      .limit(8)
    if (error) throw new Error(error.message)
    return (data ?? []).map(describeActivity)
  }
  return delay(demoActivity, 400)
}

export async function listUsers(): Promise<AppUser[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const [profilesResult, rolesResult] = await Promise.all([
      supabase
        .from(TABLES.profiles)
        .select('id, full_name, email, avatar_url'),
      supabase.from(TABLES.userRoles).select('user_id, role, status'),
    ])
    if (profilesResult.error) throw new Error(profilesResult.error.message)
    if (rolesResult.error) throw new Error(rolesResult.error.message)

    const roles = new Map<string, { role: UserRole; status: AppUser['status'] }>()
    for (const row of rolesResult.data ?? []) {
      roles.set(String(row.user_id), {
        role: row.role as UserRole,
        status: row.status as AppUser['status'],
      })
    }

    const avatarMap = await signAvatarUrls(
      (profilesResult.data ?? []).map((p) => p.avatar_url as string | null),
    )

    return (profilesResult.data ?? []).map((profile) => {
      const email = String(profile.email ?? '')
      const role = roles.get(String(profile.id))
      const stored = (profile.avatar_url as string | null) ?? null
      return {
        id: String(profile.id),
        name: String(profile.full_name ?? '').trim() || displayActor(email),
        email,
        role: role?.role ?? null,
        status: role?.status ?? 'suspended',
        lastActiveAt: null,
        avatarUrl: stored ? (avatarMap[stored] ?? null) : null,
      } satisfies AppUser
    })
  }
  return delay(demoUsers, 400)
}

/**
 * Grant or change a user's role. super_admin only — RLS rejects everyone else,
 * and the server never trusts a role supplied by any other caller.
 */
export async function setUserRole(
  userId: string,
  role: UserRole,
  status: AppUser['status'] = 'active',
): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase
    .from(TABLES.userRoles)
    .upsert({ user_id: userId, role, status }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

export { isDemoMode }
