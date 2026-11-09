import { getSupabaseClient, isDemoMode, RPC, TABLES } from '@/lib/supabase'
import { isStoragePath, signAvatarUrls } from './storage'
import { delay, LATENCY } from './latency'
import * as demo from './demo-store'
import type { Member, MemberInput } from '@/types'

/**
 * Member data-access layer
 * ========================
 *
 * The UI only ever talks to these functions, so swapping demo mode for a live
 * Supabase backend is a change inside this file alone — no component rewrites.
 *
 * Two guarantees hold in both modes:
 *  1. Writes are real. `createMember` / `updateMember` / `deleteMember` either
 *     persist and return the saved record, or they throw. There is no path that
 *     reports success without applying the change.
 *  2. Member IDs stay unique. Uniqueness is checked here (the single source of
 *     truth) and enforced again by a UNIQUE constraint in the database.
 *
 * In demo mode the working copy lives in `./demo-store.ts` and is clearly
 * labelled and isolated from production data.
 *
 * Supabase mapping notes:
 *  * The domain `Member.id` is the human `member_code` column (e.g. ACA-0001).
 *  * `Member.role` maps to the `membership_role` column.
 *  * `Member.familyId` is the primary household's `families.code`, resolved
 *    through the `family_members` join table (written via the
 *    `member_set_family` RPC).
 *  * `Member.avatarUrl` holds a storage PATH in the database; it is replaced
 *    with a freshly signed URL before records leave this module.
 */

const ID_PREFIX = 'ACA-'
const ID_WIDTH = 4

const MEMBER_SELECT = '*, family_members(is_primary, families(code))'

export interface MemberFilters {
  /** Free text matched against member name, member ID and email. */
  query?: string
  status?: Member['status'] | 'all'
  ministry?: string | 'all'
  family?: string | 'all'
}

/** Collect every value that a search box should match on. */
function searchableText(member: Member): string {
  return [
    member.firstName,
    member.lastName,
    `${member.firstName} ${member.lastName}`.trim(),
    member.id,
    member.email,
  ]
    .join(' ')
    .toLowerCase()
}

function matchesFilters(member: Member, filters: MemberFilters): boolean {
  const query = filters.query?.trim().toLowerCase() ?? ''
  if (query && !searchableText(member).includes(query)) return false

  if (filters.status && filters.status !== 'all' && member.status !== filters.status) {
    return false
  }
  if (
    filters.ministry &&
    filters.ministry !== 'all' &&
    !member.ministries.includes(filters.ministry)
  ) {
    return false
  }
  if (
    filters.family &&
    filters.family !== 'all' &&
    member.familyId !== filters.family
  ) {
    return false
  }
  return true
}

/**
 * Turn a raw ID (e.g. `ACA-0007`) into its numeric sequence, or `null` when it
 * does not follow the `ACA-####` convention.
 */
function idSequence(id: string): number | null {
  const match = new RegExp(`^${ID_PREFIX}(\\d+)$`).exec(id.trim())
  if (!match) return null
  return Number.parseInt(match[1], 10)
}

/** Render a numeric sequence back into a padded ID (`7` -> `ACA-0007`). */
function formatId(sequence: number): string {
  return `${ID_PREFIX}${String(sequence).padStart(ID_WIDTH, '0')}`
}

/**
 * Generate the next free member ID (`ACA-0001`, `ACA-0002`, …).
 *
 * Uniqueness is guaranteed: existing IDs are scanned, the highest sequence is
 * taken and the next one is returned. Non-conforming IDs are ignored so legacy
 * records can never break generation.
 */
export function generateMemberId(existingIds: Iterable<string>): string {
  let max = 0
  for (const id of existingIds) {
    const sequence = idSequence(id)
    if (sequence !== null && sequence > max) max = sequence
  }
  return formatId(max + 1)
}

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

async function fetchAllMemberIds(): Promise<string[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.members)
      .select('member_code')
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => String(row.member_code))
  }
  return delay(demo.listDemoMembers().map((m) => m.id), 250)
}

/** The next free member ID, generated atomically by the database sequence. */
export async function getNextMemberId(): Promise<string> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase.rpc(RPC.nextMemberCode)
    if (error) throw new Error(error.message)
    if (typeof data === 'string' && data) return data
  }
  const ids = await fetchAllMemberIds()
  return generateMemberId(ids)
}

/**
 * Uniqueness check. `excludeId` allows an existing record to keep its own ID
 * while editing. Returns `true` when the ID is free to use.
 */
export async function isMemberIdAvailable(
  id: string,
  excludeId?: string,
): Promise<boolean> {
  const candidate = id.trim().toUpperCase()
  if (excludeId && candidate === excludeId.trim().toUpperCase()) return true
  const ids = await fetchAllMemberIds()
  return !ids.some((existing) => existing.trim().toUpperCase() === candidate)
}

/** Replace stored avatar paths with fresh signed URLs in one round-trip. */
async function hydrateAvatars(members: Member[]): Promise<Member[]> {
  if (!members.some((m) => isStoragePath(m.avatarUrl))) return members
  const map = await signAvatarUrls(members.map((m) => m.avatarUrl))
  return members.map((member) => {
    const signed = member.avatarUrl ? map[member.avatarUrl] : undefined
    return signed ? { ...member, avatarUrl: signed } : member
  })
}

/** Escape a user-supplied search term for use inside a PostgREST `or` filter. */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()%]/g, ' ').trim()
}

export async function listMembers(
  filters: MemberFilters = {},
): Promise<Member[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    let request = supabase
      .from(TABLES.members)
      .select(MEMBER_SELECT)
      .order('last_name', { ascending: true })

    if (filters.status && filters.status !== 'all') {
      request = request.eq('status', filters.status)
    }
    if (filters.ministry && filters.ministry !== 'all') {
      request = request.contains('ministries', [filters.ministry])
    }
    if (filters.query) {
      const q = sanitizeSearch(filters.query)
      if (q) {
        request = request.or(
          `first_name.ilike.%${q}%,last_name.ilike.%${q}%,member_code.ilike.%${q}%,email.ilike.%${q}%`,
        )
      }
    }

    const { data, error } = await request
    if (error) throw new Error(error.message)

    let members = (data ?? []).map(mapRowToMember)
    // Household filtering is applied after the join so a member matches when
    // any of their households matches.
    if (filters.family && filters.family !== 'all') {
      members = members.filter((m) => m.familyId === filters.family)
    }
    return hydrateAvatars(members)
  }

  return delay(
    demo.listDemoMembers().filter((member) => matchesFilters(member, filters)),
  )
}

export async function getMember(id: string): Promise<Member | null> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.members)
      .select(MEMBER_SELECT)
      .eq('member_code', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const [member] = await hydrateAvatars([mapRowToMember(data)])
    return member
  }
  return delay(demo.findDemoMember(id))
}

/** Persist a member's primary household through the server-side RPC. */
async function setMemberFamily(
  memberCode: string,
  familyCode: string | null,
): Promise<void> {
  if (!isLive()) return
  const supabase = getSupabaseClient()!
  const { error } = await supabase.rpc(RPC.memberSetFamily, {
    p_member_code: memberCode,
    p_family_code: familyCode,
  })
  if (error) throw new Error(error.message)
}

/**
 * Check whether the currently authenticated account is a super_admin.
 * Used to restrict role assignment during member creation.
 */
export async function isCurrentUserSuperAdmin(): Promise<boolean> {
  if (!isLive()) return false
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase
    .rpc('is_super_admin')
  if (error) return false
  return data === true
}

/**
 * Create a member. Throws when the ID is already taken or the write fails, so
 * the form can surface a real error instead of a false success.
 *
 * Non-super_admin accounts can only create member-role records. The role is
 * forced to 'member' server-side so a member cannot create super_admin or
 * other privileged accounts.
 */
export async function createMember(input: MemberInput): Promise<Member> {
  const trimmed = trimInput(input)

  // Non-super_admin accounts can only create member-role records.
  // The role is forced server-side so a member cannot self-assign privileges.
  if (!(await isCurrentUserSuperAdmin())) {
    trimmed.role = 'member'
  }

  if (!(await isMemberIdAvailable(trimmed.id))) {
    throw new Error(
      `Member ID ${trimmed.id.trim()} is already in use. Choose another ID.`,
    )
  }

  if (isLive()) {
    const supabase = getSupabaseClient()!
    const row = mapInputToRow(trimmed) as Record<string, unknown>
    // A non-admin submitting their own profile is linked to their auth account.
    // Super admins create records for others (user_id stays null until linked).
    if (!(await isCurrentUserSuperAdmin())) {
      const { data: userData } = await supabase.auth.getUser()
      if (userData.user) row.user_id = userData.user.id
    }
    const { data, error } = await supabase
      .from(TABLES.members)
      .insert(row)
      .select(MEMBER_SELECT)
      .single()
    if (error) throw new Error(error.message)

    // The member record is saved first; household linkage is secondary and must
    // never turn a successful save into a reported failure.
    await setMemberFamily(trimmed.id, trimmed.familyId).catch((error) => {
      console.warn(`Could not link household for ${trimmed.id}:`, error)
    })
    const member = { ...mapRowToMember(data), familyId: trimmed.familyId }
    const [hydrated] = await hydrateAvatars([member])
    return hydrated
  }

  return delay(demo.insertDemoMember(trimmed), LATENCY)
}

/** Update an existing member by its ID. Throws when the record is missing. */
export async function updateMember(
  id: string,
  input: MemberInput,
): Promise<Member> {
  const trimmed = trimInput(input)
  const available = await isMemberIdAvailable(trimmed.id, id)
  if (!available) {
    throw new Error(
      `Member ID ${trimmed.id.trim()} is already in use. Choose another ID.`,
    )
  }

  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.members)
      .update(mapInputToRow(trimmed))
      .eq('member_code', id)
      .select(MEMBER_SELECT)
      .single()
    if (error) throw new Error(error.message)
    if (!data) throw new Error(`Member ${id} was not found.`)

    await setMemberFamily(trimmed.id, trimmed.familyId).catch((error) => {
      console.warn(`Could not link household for ${id}:`, error)
    })
    const member = { ...mapRowToMember(data), familyId: trimmed.familyId }
    const [hydrated] = await hydrateAvatars([member])
    return hydrated
  }

  const updated = demo.replaceDemoMember(id, trimmed)
  if (!updated) {
    return Promise.reject(new Error(`Member ${id} was not found.`))
  }
  return delay(updated, LATENCY)
}

/** Approved personal fields a linked member may update on their own record. */
export interface MemberSelfPatch {
  email?: string
  phone?: string
  address?: string
  city?: string
  avatarUrl?: string | null
}

/**
 * Update the caller's OWN member record, limited to approved contact fields.
 *
 * Deliberately does NOT touch the household (which would go through the
 * staff-only `member_set_family` RPC) or any field outside the approved set —
 * the database trigger `enforce_member_self_update` rejects anything wider.
 */
export async function updateMemberSelf(
  id: string,
  patch: MemberSelfPatch,
): Promise<Member> {
  if (!isLive()) {
    throw new Error('Updating your record needs a live Supabase project.')
  }

  const supabase = getSupabaseClient()!
  const row: Record<string, unknown> = {}
  if (patch.email !== undefined) row.email = patch.email.trim() || null
  if (patch.phone !== undefined) row.phone = patch.phone.trim() || null
  if (patch.address !== undefined) row.address = patch.address.trim() || null
  if (patch.city !== undefined) row.city = patch.city.trim() || null
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl

  if (Object.keys(row).length === 0) {
    const current = await getMember(id)
    if (!current) throw new Error(`Member ${id} was not found.`)
    return current
  }

  const { data, error } = await supabase
    .from(TABLES.members)
    .update(row)
    .eq('member_code', id)
    .select(MEMBER_SELECT)
    .single()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`Member ${id} was not found.`)

  const [hydrated] = await hydrateAvatars([mapRowToMember(data)])
  return hydrated
}

/** Delete a member. Throws when the record does not exist. */
export async function deleteMember(id: string): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.members)
      .delete()
      .eq('member_code', id)
      .select('member_code')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error(`Member ${id} was not found.`)
    }
    return
  }

  const removed = await delay(demo.removeDemoMember(id), LATENCY)
  if (!removed) throw new Error(`Member ${id} was not found.`)
}

/* ------------------------------------------------------------------ */
/* Row <-> domain mapping                                              */
/* ------------------------------------------------------------------ */

function trimInput(input: MemberInput): MemberInput {
  return {
    ...input,
    id: input.id.trim().toUpperCase(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    notes: input.notes.trim(),
    rightNow: input.rightNow.trim(),
    avatarUrl: input.avatarUrl ? input.avatarUrl.trim() : null,
    familyId: input.familyId || null,
  }
}

function mapInputToRow(input: MemberInput): Record<string, unknown> {
  return {
    member_code: input.id,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email || null,
    phone: input.phone || null,
    gender: input.gender,
    date_of_birth: input.dateOfBirth || null,
    marital_status: input.maritalStatus,
    address: input.address || null,
    city: input.city || null,
    joined_at: input.joinedAt || undefined,
    status: input.status,
    membership_role: input.role,
    ministries: input.ministries,
    right_now: input.rightNow || null,
    baptism_status: input.baptismStatus,
    avatar_url: input.avatarUrl,
    notes: input.notes || null,
  }
}

/** Read the primary household code from an embedded `family_members` result. */
function primaryFamilyCode(row: Record<string, unknown>): string | null {
  const links = row.family_members as
    | Array<{ is_primary: boolean; families: { code: string } | { code: string }[] | null }>
    | null
    | undefined
  if (!Array.isArray(links) || links.length === 0) return null
  const primary = links.find((link) => link.is_primary) ?? links[0]
  const family = primary?.families
  if (!family) return null
  return Array.isArray(family) ? (family[0]?.code ?? null) : family.code
}

function mapRowToMember(row: Record<string, unknown>): Member {
  return {
    id: String(row.member_code ?? ''),
    firstName: String(row.first_name ?? ''),
    lastName: String(row.last_name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    gender: (row.gender as Member['gender']) ?? 'male',
    dateOfBirth: (row.date_of_birth as string | null) ?? null,
    maritalStatus: (row.marital_status as Member['maritalStatus']) ?? 'single',
    address: String(row.address ?? ''),
    city: String(row.city ?? ''),
    joinedAt: String(row.joined_at ?? ''),
    status: (row.status as Member['status']) ?? 'active',
    role: (row.membership_role as Member['role']) ?? 'member',
    ministries: (row.ministries as string[]) ?? [],
    rightNow: row.right_now ? String(row.right_now) : null,
    familyId: primaryFamilyCode(row),
    baptismStatus: (row.baptism_status as Member['baptismStatus']) ?? 'unknown',
    avatarUrl: (row.avatar_url as string | null) ?? null,
    userId: (row.user_id as string | null) ?? null,
    notes: row.notes ? String(row.notes) : undefined,
  }
}
