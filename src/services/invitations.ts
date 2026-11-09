import { getSupabaseClient, isDemoMode, RPC, TABLES } from '@/lib/supabase'
import { delay } from './latency'
import type { Invitation, UserRole } from '@/types'

/**
 * Invitation data-access layer.
 *
 * Invitations are readable/writable only by super_admins (enforced by RLS).
 * Acceptance happens through the `accept_invitation` RPC, which validates the
 * token, the invited email and the role server-side.
 */

interface InvitationRow {
  id: string
  token: string
  email: string
  role: UserRole
  member_code: string | null
  status: Invitation['status']
  invited_by: string | null
  expires_at: string
  created_at: string
}

const INVITATION_COLUMNS =
  'id, token, email, role, member_code, status, invited_by, expires_at, created_at'

function isLive(): boolean {
  return Boolean(getSupabaseClient()) && !isDemoMode
}

function mapRow(row: InvitationRow): Invitation {
  return {
    id: row.id,
    token: row.token,
    email: row.email,
    role: row.role,
    memberCode: row.member_code,
    status: row.status,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

export interface CreateInvitationInput {
  email: string
  role: UserRole
  memberCode?: string | null
}

export async function listInvitations(): Promise<Invitation[]> {
  if (!isLive()) return delay([])
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase
    .from(TABLES.invitations)
    .select(INVITATION_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data as InvitationRow[] | null) ?? []).map(mapRow)
}

/** Create an invitation. Returns the row (its `id` doubles as the token link). */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<Invitation> {
  if (!isLive()) {
    throw new Error('Invitations need a live Supabase project.')
  }
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase
    .from(TABLES.invitations)
    .insert({
      email: input.email.trim().toLowerCase(),
      role: input.role,
      member_code: input.memberCode?.trim() || null,
    })
    .select(INVITATION_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return mapRow(data as InvitationRow)
}

export async function revokeInvitation(id: string): Promise<void> {
  if (!isLive()) {
    throw new Error('Invitations need a live Supabase project.')
  }
  const supabase = getSupabaseClient()!
  const { error } = await supabase
    .from(TABLES.invitations)
    .update({ status: 'revoked' })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Recover a wrong invitation or a changed email: revoke the old one and issue a
 * fresh token for the corrected address. Returns the new invitation.
 */
export async function reissueInvitation(
  id: string,
  email: string,
): Promise<Invitation> {
  if (!isLive()) {
    throw new Error('Invitations need a live Supabase project.')
  }
  const supabase = getSupabaseClient()!
  const { data, error } = await supabase.rpc(RPC.reissueInvitation, {
    p_invitation_id: id,
    p_email: email,
  })
  if (error) throw new Error(error.message)
  return mapRow(data as InvitationRow)
}

/** Build a shareable accept link for an invitation. */
export function invitationAcceptUrl(token: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/accept-invitation?token=${encodeURIComponent(token)}`
}
