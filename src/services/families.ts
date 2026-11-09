import { getSupabaseClient, isDemoMode, RPC, TABLES } from '@/lib/supabase'
import { signAvatarUrls } from './storage'
import { delay, LATENCY } from './latency'
import * as demo from './demo-store'
import type {
  AnniversaryParty,
  Family,
  FamilyDetail,
  FamilyInput,
  FamilyMemberLink,
  MemberRelationship,
  MemberRelationshipType,
  SpouseCouple,
} from '@/types'

/**
 * Household & relationship data-access layer
 * ==========================================
 *
 * Everything the family screens do goes through here. In live mode the calls
 * are scoped by Row Level Security: households and relationships are staff-only
 * to write, and a member can only ever read the relationships they appear on.
 * Writes that need server-side validation (code generation, one-primary-household,
 * cycle prevention) run through the SECURITY DEFINER RPCs in
 * `supabase/migrations/20260210000000_family_management.sql`.
 *
 * In demo mode the working copy lives in `./demo-store.ts` and mutates in place.
 */

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

/** Resolve a possibly-embedded to-one relationship to a plain object. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return (value[0] as T) ?? null
  return (value as T) ?? null
}

/* ------------------------------------------------------------------ */
/* Households                                                          */
/* ------------------------------------------------------------------ */

interface FamilyRow {
  code: string
  name: string
  address: string | null
  notes: string | null
  archived_at: string | null
  primary_contact_member_id: string | null
  family_members?: Array<{ count: number }> | null
  primary_contact?:
    | { member_code: string; first_name: string; last_name: string }
    | Array<{ member_code: string; first_name: string; last_name: string }>
    | null
}

function mapFamilyRow(row: FamilyRow): Family {
  const contact = one(row.primary_contact)
  return {
    id: String(row.code),
    name: String(row.name),
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    archivedAt: row.archived_at ?? null,
    primaryContactMemberCode: contact?.member_code ?? null,
    primaryContactName: contact
      ? `${contact.first_name} ${contact.last_name}`.trim()
      : null,
    memberCount: row.family_members?.[0]?.count ?? 0,
  }
}

/**
 * List households. By default archived households are included so existing
 * member records keep resolving their household name; pass `activeOnly` for the
 * admin list when the "show archived" toggle is off.
 */
export async function listFamilies(options: {
  activeOnly?: boolean
} = {}): Promise<Family[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    let request = supabase
      .from(TABLES.families)
      .select(
        'code, name, address, notes, archived_at, primary_contact_member_id, ' +
          'family_members(count), ' +
          'primary_contact:members!families_primary_contact_member_id_fkey(member_code, first_name, last_name)',
      )
      .order('name', { ascending: true })
    if (options.activeOnly) request = request.is('archived_at', null)

    const { data, error } = await request
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => mapFamilyRow(row as unknown as FamilyRow))
  }

  const families = demo.listDemoFamilies()
  return delay(
    options.activeOnly ? families.filter((f) => !f.archivedAt) : families,
  )
}

export async function getFamily(code: string): Promise<FamilyDetail | null> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.families)
      .select(
        'code, name, address, notes, archived_at, ' +
          'primary_contact:members!families_primary_contact_member_id_fkey(member_code), ' +
          'family_members(is_primary, members(member_code, first_name, last_name, avatar_url))',
      )
      .eq('code', code)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const row = data as unknown as {
      code: string
      name: string
      address: string | null
      notes: string | null
      archived_at: string | null
      primary_contact:
        | { member_code: string }
        | Array<{ member_code: string }>
        | null
      family_members:
        | Array<{
            is_primary: boolean
            members:
              | {
                  member_code: string
                  first_name: string
                  last_name: string
                  avatar_url: string | null
                }
              | Array<{
                  member_code: string
                  first_name: string
                  last_name: string
                  avatar_url: string | null
                }>
              | null
          }>
        | null
    }

    const links = (row.family_members ?? [])
      .map((link) => {
        const m = one(link.members)
        if (!m) return null
        return {
          memberCode: String(m.member_code),
          firstName: String(m.first_name),
          lastName: String(m.last_name),
          avatarUrl: m.avatar_url ?? null,
          isPrimary: Boolean(link.is_primary),
        } satisfies FamilyMemberLink
      })
      .filter((m): m is FamilyMemberLink => m !== null)
      .sort((a, b) =>
        `${a.lastName}${a.firstName}`.localeCompare(
          `${b.lastName}${b.firstName}`,
        ),
      )

    const signed = await signAvatarUrls(links.map((l) => l.avatarUrl))
    const members = links.map((l) => ({
      ...l,
      avatarUrl: l.avatarUrl ? (signed[l.avatarUrl] ?? null) : null,
    }))

    return {
      id: String(row.code),
      name: String(row.name),
      address: row.address ?? undefined,
      notes: row.notes ?? undefined,
      archivedAt: row.archived_at ?? null,
      primaryContactMemberCode: one(row.primary_contact)?.member_code ?? null,
      members,
    }
  }

  return delay(demo.findDemoFamily(code))
}

export async function createFamily(input: FamilyInput): Promise<FamilyDetail> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase.rpc(RPC.createFamily, {
      p_name: input.name.trim(),
      p_address: input.address.trim() || null,
      p_notes: input.notes.trim() || null,
    })
    if (error) throw new Error(error.message)
    const code = String((data as { code: string } | null)?.code ?? '')
    if (!code) throw new Error('The household was created but its code was missing.')
    const created = await getFamily(code)
    if (!created) throw new Error('The household was created but could not be read back.')
    return created
  }

  return delay(demo.insertDemoFamily(input), LATENCY)
}

export async function updateFamily(
  code: string,
  input: FamilyInput,
): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.families)
      .update({
        name: input.name.trim(),
        address: input.address.trim() || null,
        notes: input.notes.trim() || null,
      })
      .eq('code', code)
      .select('code')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error(`Household ${code} was not found.`)
    }
    return
  }

  const ok = await delay(demo.replaceDemoFamily(code, input), LATENCY)
  if (!ok) throw new Error(`Household ${code} was not found.`)
}

/** Soft-archive or restore a household. Members keep their household link. */
export async function setFamilyArchived(
  code: string,
  archived: boolean,
): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.families)
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('code', code)
      .select('code')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error(`Household ${code} was not found.`)
    }
    return
  }

  const ok = await delay(demo.setDemoFamilyArchived(code, archived), LATENCY)
  if (!ok) throw new Error(`Household ${code} was not found.`)
}

export async function deleteFamily(code: string): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { data, error } = await supabase
      .from(TABLES.families)
      .delete()
      .eq('code', code)
      .select('code')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error(`Household ${code} was not found.`)
    }
    return
  }

  const ok = await delay(demo.removeDemoFamily(code), LATENCY)
  if (!ok) throw new Error(`Household ${code} was not found.`)
}

export async function addFamilyMember(
  code: string,
  memberCode: string,
  isPrimary: boolean,
): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { error } = await supabase.rpc(RPC.familyAddMember, {
      p_family_code: code,
      p_member_code: memberCode,
      p_is_primary: isPrimary,
    })
    if (error) throw new Error(error.message)
    return
  }

  const ok = await delay(
    demo.addDemoFamilyMember(code, memberCode, isPrimary),
    LATENCY,
  )
  if (!ok) throw new Error(`Could not add ${memberCode} to ${code}.`)
}

export async function removeFamilyMember(
  code: string,
  memberCode: string,
): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { error } = await supabase.rpc(RPC.familyRemoveMember, {
      p_family_code: code,
      p_member_code: memberCode,
    })
    if (error) throw new Error(error.message)
    return
  }

  const ok = await delay(
    demo.removeDemoFamilyMember(code, memberCode),
    LATENCY,
  )
  if (!ok) throw new Error(`${memberCode} is not part of ${code}.`)
}

/** Set (or clear, with a null code) the family's primary contact. */
export async function setFamilyPrimaryContact(
  code: string,
  memberCode: string | null,
): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { error } = await supabase.rpc(RPC.familySetPrimaryContact, {
      p_family_code: code,
      p_member_code: memberCode,
    })
    if (error) throw new Error(error.message)
    return
  }

  const ok = await delay(
    demo.setDemoFamilyPrimaryContact(code, memberCode),
    LATENCY,
  )
  if (!ok) {
    throw new Error('The chosen member is not part of this household.')
  }
}

/* ------------------------------------------------------------------ */
/* Relationships                                                       */
/* ------------------------------------------------------------------ */

interface RelationshipRow {
  id: string
  relationship_type: MemberRelationshipType
  label: string | null
  member:
    | { member_code: string; first_name: string; last_name: string }
    | Array<{ member_code: string; first_name: string; last_name: string }>
    | null
  related:
    | { member_code: string; first_name: string; last_name: string }
    | Array<{ member_code: string; first_name: string; last_name: string }>
    | null
}

const RELATIONSHIP_SELECT =
  'id, relationship_type, label, ' +
  'member:members!member_relationships_member_fk(member_code, first_name, last_name), ' +
  'related:members!member_relationships_related_fk(member_code, first_name, last_name)'

function mapRelationshipRow(
  row: RelationshipRow,
  viewedCode: string,
): MemberRelationship | null {
  const subject = one(row.member)
  const related = one(row.related)
  if (!subject || !related) return null
  const subjectIsViewed = subject.member_code === viewedCode
  const relatedIsViewed = related.member_code === viewedCode
  if (!subjectIsViewed && !relatedIsViewed) return null
  const other = subjectIsViewed ? related : subject
  return {
    id: String(row.id),
    type: row.relationship_type,
    label: row.label ?? null,
    memberCode: other.member_code,
    memberName: `${other.first_name} ${other.last_name}`.trim(),
    subjectIsViewed,
  } satisfies MemberRelationship
}

/** Every relationship the given member appears on (staff view). */
export async function listMemberRelationships(
  memberCode: string,
): Promise<MemberRelationship[]> {
  if (isLive()) {
    const supabase = getSupabaseClient()!

    // Resolve the member's UUID, then filter on the base FK columns — this
    // avoids relying on embedded-path filters in the `or` clause.
    const { data: memberRow, error: memberError } = await supabase
      .from(TABLES.members)
      .select('id')
      .eq('member_code', memberCode)
      .maybeSingle()
    if (memberError) throw new Error(memberError.message)
    if (!memberRow) return []
    const memberId = (memberRow as { id: string }).id

    const { data, error } = await supabase
      .from(TABLES.memberRelationships)
      .select(RELATIONSHIP_SELECT)
      .or(`member_id.eq.${memberId},related_member_id.eq.${memberId}`)
    if (error) throw new Error(error.message)
    return (data ?? [])
      .map((row) => mapRelationshipRow(row as unknown as RelationshipRow, memberCode))
      .filter((r): r is MemberRelationship => r !== null)
      .sort((a, b) => a.memberName.localeCompare(b.memberName))
  }

  return delay(demo.listDemoRelationships(memberCode))
}

/**
 * Record a typed relationship. `memberCode` is the subject: for `parent` and
 * `guardian` they are the senior party; for `other` they are the describing
 * party. Cycles and duplicate pairs are rejected server-side.
 */
export async function addMemberRelationship(input: {
  memberCode: string
  relatedCode: string
  type: MemberRelationshipType
  label?: string | null
}): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { error } = await supabase.rpc(RPC.addMemberRelationship, {
      p_member_code: input.memberCode,
      p_related_code: input.relatedCode,
      p_type: input.type,
      p_label: input.label ?? null,
    })
    if (error) throw new Error(error.message)
    return
  }

  const ok = await delay(
    demo.addDemoRelationship(
      input.memberCode,
      input.relatedCode,
      input.type,
      input.label ?? null,
    ),
    LATENCY,
  )
  if (!ok) {
    throw new Error('These two members already have a relationship recorded.')
  }
}

export async function removeMemberRelationship(id: string): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { error } = await supabase.rpc(RPC.removeMemberRelationship, {
      p_id: id,
    })
    if (error) throw new Error(error.message)
    return
  }

  const ok = await delay(demo.removeDemoRelationship(id), LATENCY)
  if (!ok) throw new Error('That relationship was not found.')
}

/* ------------------------------------------------------------------ */
/* Wedding anniversaries                                               */
/* ------------------------------------------------------------------ */

/**
 * Result of reading the spouse couples. `available` is `false` when the
 * optional anniversary schema (migration 20260210000100) has not been applied
 * yet — the spouses are still listed, but no wedding date can be read or set,
 * so the UI explains that the feature is not enabled instead of hard-failing.
 */
export interface SpouseCoupleResult {
  available: boolean
  couples: SpouseCouple[]
}

const SPOUSE_EMBEDS =
  'member:members!member_relationships_member_fk(member_code, first_name, last_name), ' +
  'related:members!member_relationships_related_fk(member_code, first_name, last_name)'

const ANNIVERSARY_SELECT = `id, anniversary_date, ${SPOUSE_EMBEDS}`

interface SpouseRow {
  id: string
  anniversary_date?: string | null
  member: AnniversaryParty | AnniversaryParty[] | null
  related: AnniversaryParty | AnniversaryParty[] | null
}

function party(party: AnniversaryParty | AnniversaryParty[] | null): AnniversaryParty | null {
  const resolved = one(party)
  if (!resolved) return null
  const raw = resolved as unknown as Record<string, unknown>
  return {
    memberCode: String(raw.member_code ?? raw.memberCode ?? ''),
    firstName: String(raw.first_name ?? raw.firstName ?? ''),
    lastName: String(raw.last_name ?? raw.lastName ?? ''),
  }
}

/** True when a PostgREST error means the anniversary column does not exist yet. */
function isMissingAnniversarySchema(message: string, code?: string): boolean {
  return (
    code === '42703' ||
    /anniversary_date/i.test(message) ||
    /column .* does not exist/i.test(message)
  )
}

/**
 * Every spouse couple, with its wedding date when recorded. Staff-only in
 * effect: RLS returns only relationships the caller may read, and ordinary
 * members are denied organisation-wide reads.
 */
export async function listSpouseCouples(): Promise<SpouseCoupleResult> {
  if (isLive()) {
    const supabase = getSupabaseClient()!

    let available = true
    let { data, error } = await supabase
      .from(TABLES.memberRelationships)
      .select(ANNIVERSARY_SELECT)
      .eq('relationship_type', 'spouse')

    if (error && isMissingAnniversarySchema(error.message, error.code)) {
      available = false
      const retry = await supabase
        .from(TABLES.memberRelationships)
        .select(`id, ${SPOUSE_EMBEDS}`)
        .eq('relationship_type', 'spouse')
      data = retry.data as typeof data
      error = retry.error
    }
    if (error) throw new Error(error.message)

    const couples: SpouseCouple[] = []
    for (const raw of (data ?? []) as unknown as SpouseRow[]) {
      const a = party(raw.member)
      const b = party(raw.related)
      if (!a || !b) continue
      const date = available && raw.anniversary_date
        ? raw.anniversary_date.slice(0, 10)
        : null
      couples.push({ relationshipId: String(raw.id), date, members: [a, b] })
    }
    couples.sort((x, y) =>
      (x.date ?? '9999').localeCompare(y.date ?? '9999'),
    )
    return { available, couples }
  }

  return delay({ available: true, couples: demo.listDemoSpouseCouples() })
}

/**
 * Set (or clear with `null`) a couple's wedding anniversary. Staff-only server
 * side; rejects non-spouse rows and future dates.
 */
export async function setSpouseAnniversary(
  relationshipId: string,
  date: string | null,
): Promise<void> {
  if (isLive()) {
    const supabase = getSupabaseClient()!
    const { error } = await supabase.rpc(RPC.setSpouseAnniversary, {
      p_relationship_id: relationshipId,
      p_date: date,
    })
    if (error) throw new Error(error.message)
    return
  }

  const ok = await delay(demo.setDemoSpouseAnniversary(relationshipId, date), LATENCY)
  if (!ok) throw new Error('That couple was not found.')
}

/** Marriage details captured by the member form. */
export interface MemberMarriageInput {
  /** The chosen spouse's member code, or `''` when none was chosen. */
  spouseCode: string
  /** Wedding date (`YYYY-MM-DD`) or `''` to leave/clear it. */
  anniversaryDate: string
}

/**
 * Persist a member's marriage details after the member row itself is saved:
 * link the chosen spouse (creating the symmetric spouse relationship, or
 * re-linking when the spouse changed) and set — or clear — the couple's wedding
 * anniversary.
 *
 * Leaving the spouse blank is deliberately NOT a removal: spouses are unlinked
 * from the Relationships section on the member profile, where the action and its
 * confirmation are explicit. It only means "no change".
 */
export async function saveMemberMarriage(
  memberCode: string,
  input: MemberMarriageInput,
): Promise<void> {
  const spouseCode = input.spouseCode.trim()
  const date = input.anniversaryDate.trim() || null

  let relationships = await listMemberRelationships(memberCode)
  let spouseRel = relationships.find((r) => r.type === 'spouse') ?? null

  if (
    spouseCode &&
    spouseCode !== memberCode &&
    spouseRel?.memberCode !== spouseCode
  ) {
    if (spouseRel) {
      await removeMemberRelationship(spouseRel.id)
      spouseRel = null
    }
    await addMemberRelationship({
      memberCode,
      relatedCode: spouseCode,
      type: 'spouse',
    })
    relationships = await listMemberRelationships(memberCode)
    spouseRel = relationships.find((r) => r.type === 'spouse') ?? null
  }

  if (spouseRel) {
    await setSpouseAnniversary(spouseRel.id, date)
  }
}
