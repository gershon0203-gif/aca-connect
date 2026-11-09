import { getSupabaseClient, isDemoMode, RPC } from '@/lib/supabase'
import { delay } from './latency'
import type {
  MemberRelationshipType,
  MyAnniversary,
  MyFamily,
  MyRelationship,
} from '@/types'

/**
 * Member-portal data access
 * =========================
 *
 * The "My Family" view is served by the `get_my_family` RPC, and the typed
 * relationship list by `get_my_relationships`. Both run as the database owner
 * and return ONLY the caller's own data and a restricted field set for each
 * relative — never contact details or account linkage. There is no
 * client-supplied member id anywhere in these paths, so URL or state
 * manipulation cannot widen what is returned.
 */

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

function normalise(raw: unknown): MyFamily[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => {
    const row = entry as Record<string, unknown>
    const members = Array.isArray(row.members) ? row.members : []
    return {
      familyCode: String(row.familyCode ?? row.family_code ?? ''),
      familyName: String(row.familyName ?? row.family_name ?? ''),
      isPrimary: Boolean(row.isPrimary ?? row.is_primary),
      members: members.map((m) => {
        const rel = m as Record<string, unknown>
        return {
          memberCode: String(rel.memberCode ?? rel.member_code ?? ''),
          firstName: String(rel.firstName ?? rel.first_name ?? ''),
          lastName: String(rel.lastName ?? rel.last_name ?? ''),
          relationship:
            (rel.relationship as string | null | undefined) ?? null,
          isSelf: Boolean(rel.isSelf ?? rel.is_self),
        }
      }),
    }
  })
}

/** Households the signed-in member belongs to (authorized subset only). */
export async function getMyFamily(): Promise<MyFamily[]> {
  if (!isLive()) return delay([])
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.rpc(RPC.getMyFamily)
  if (error) throw new Error(error.message)
  return normalise(data)
}

function normaliseRelationships(raw: unknown): MyRelationship[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => {
    const row = entry as Record<string, unknown>
    return {
      memberCode: String(row.memberCode ?? row.member_code ?? ''),
      firstName: String(row.firstName ?? row.first_name ?? ''),
      lastName: String(row.lastName ?? row.last_name ?? ''),
      type: (row.relationshipType ??
        row.relationship_type ??
        row.type) as MemberRelationshipType,
      label: (row.label ?? null) as string | null,
      subjectIsMe: Boolean(row.subjectIsMe ?? row.subject_is_me),
    }
  })
}

/**
 * Typed relationships the signed-in member appears on (member-safe subset:
 * names, type, and label only).
 */
export async function getMyRelationships(): Promise<MyRelationship[]> {
  if (!isLive()) return delay([])
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.rpc(RPC.getMyRelationships)
  if (error) throw new Error(error.message)
  return normaliseRelationships(data)
}

/**
 * The signed-in member's own wedding anniversary (partner name + date), or
 * `null` when none is recorded or the anniversary schema is not yet applied.
 * Organisation-wide anniversary data is never reachable through this call.
 */
export async function getMyAnniversary(): Promise<MyAnniversary | null> {
  if (!isLive()) return delay(null)
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.rpc(RPC.getMyAnniversary)
  if (error) {
    // Column not deployed yet (or no member record) — treat as "none on file".
    return null
  }
  if (!data || Array.isArray(data)) return null
  const row = data as Record<string, unknown>
  const date = row.anniversaryDate ?? row.anniversary_date
  if (!date) return null
  return {
    partnerFirstName: String(row.partnerFirstName ?? row.partner_first_name ?? ''),
    partnerLastName: String(row.partnerLastName ?? row.partner_last_name ?? ''),
    anniversaryDate: String(date).slice(0, 10),
  }
}
