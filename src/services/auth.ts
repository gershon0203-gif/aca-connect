import { getSupabaseClient, TABLES, RPC } from '@/lib/supabase'
import { signAvatarUrl } from './storage'
import type { AppUser, UserRole } from '@/types'

/**
 * Authentication service
 * =======================
 *
 * Thin wrapper around `supabase.auth` plus the profile/role rows that make up
 * an `AppUser`. The AuthContext consumes these functions and falls back to the
 * demo provider when Supabase is not configured.
 */

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

interface RoleRow {
  role: string
  status: AppUser['status']
}

/**
 * Only the two granted roles open the app. The enum still contains a legacy
 * `staff` value (no rows use it); if one ever appeared it stays inert rather
 * than inheriting admin access or crashing role-aware navigation.
 */
function normalizeRole(role: string | null | undefined): UserRole | null {
  return role === 'super_admin' || role === 'member' ? role : null
}

/** Turn raw Supabase auth errors into messages a church volunteer understands. */
function friendlyAuthError(message: string): string {
  const normalised = message.toLowerCase()
  if (normalised.includes('invalid login credentials')) {
    return 'Those details do not match an account. Check your email and password.'
  }
  if (normalised.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.'
  }
  if (normalised.includes('password should be')) {
    return 'Choose a stronger password (at least 8 characters).'
  }
  if (normalised.includes('already registered') || normalised.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (normalised.includes('signup is disabled') || normalised.includes('signups not allowed')) {
    return 'New sign-ups are currently disabled. Please contact the church office.'
  }
  if (normalised.includes('unable to validate email')) {
    return 'Enter a valid email address.'
  }
  if (normalised.includes('rate limit') || normalised.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (normalised.includes('failed to fetch') || normalised.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return message
}

/**
 * Load the application user (profile + role) for an authenticated account.
 * Throws when the account has no role row — the caller decides how to react.
 */
export async function loadAppUser(
  userId: string,
  fallbackEmail: string,
): Promise<AppUser> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')

  const [profileResult, roleResult, memberResult] = await Promise.all([
    supabase
      .from(TABLES.profiles)
      .select('id, full_name, email, avatar_url')
      .eq('id', userId)
      .maybeSingle<ProfileRow>(),
    supabase
      .from(TABLES.userRoles)
      .select('role, status')
      .eq('user_id', userId)
      .maybeSingle<RoleRow>(),
    supabase
      .from(TABLES.members)
      .select('member_code')
      .eq('user_id', userId)
      .maybeSingle<{ member_code: string }>(),
  ])

  if (profileResult.error) throw new Error(profileResult.error.message)
  if (roleResult.error) throw new Error(roleResult.error.message)

  const profile = profileResult.data
  const role = roleResult.data
  const memberCode = memberResult.data?.member_code ?? null

  const avatarUrl = await signAvatarUrl(profile?.avatar_url ?? null)

  return {
    id: userId,
    name: profile?.full_name?.trim() || fallbackEmail.split('@')[0] || 'Member',
    email: profile?.email?.trim() || fallbackEmail,
    role: normalizeRole(role?.role),
    status: role?.status ?? 'suspended',
    lastActiveAt: new Date().toISOString(),
    avatarUrl,
    memberCode,
  }
}

export interface SignUpResult {
  /**
   * `true` when Supabase requires the account to confirm its email before it
   * can sign in (the recommended configuration). `false` only when email
   * confirmation is disabled project-wide and a session was issued immediately.
   */
  needsEmailVerification: boolean
}

/**
 * Create a new auth account.
 *
 * Provisioning is automatic: the database `handle_new_user` trigger creates a
 * profile row AND grants the `member` role, so a brand-new account can sign in
 * immediately (when email confirmation is disabled project-wide). The client
 * can never grant itself a role — the role is hardcoded server-side.
 */
export async function signUpWithPassword(
  fullName: string,
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<SignUpResult> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName.trim() },
      emailRedirectTo,
    },
  })
  if (error) throw new Error(friendlyAuthError(error.message))

  // When email confirmation is disabled project-wide, signUp returns a session
  // immediately and the account already has the `member` role (granted by the
  // handle_new_user trigger). When email confirmation is on, no session is
  // returned and the user must confirm their email before signing in.
  return { needsEmailVerification: !data.session }
}

/** Sign in with email + password and return the ready-to-use app user. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AppUser> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw new Error(friendlyAuthError(error.message))
  if (!data.user) throw new Error('Sign-in did not return a user.')

  return loadAppUser(data.user.id, data.user.email ?? email)
}

/** Clear the local session. Safe to call even when already signed out. */
export async function signOutUser(): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

/** Email a password-recovery link that returns to `redirectTo`. */
export async function requestPasswordReset(
  email: string,
  redirectTo: string,
): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  })
  if (error) throw new Error(friendlyAuthError(error.message))
}

/** Set a new password for the currently authenticated (recovery) session. */
export async function updatePassword(password: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(friendlyAuthError(error.message))
}

export interface ProfileUpdate {
  fullName?: string
  phone?: string
  /** Storage path, or `null` to clear the picture. */
  avatarUrl?: string | null
}

/** Update the signed-in account's profile row. */
export async function updateProfile(
  userId: string,
  patch: ProfileUpdate,
): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')

  const row: Record<string, unknown> = {}
  if (patch.fullName !== undefined) row.full_name = patch.fullName.trim()
  if (patch.phone !== undefined) row.phone = patch.phone.trim() || null
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl
  if (Object.keys(row).length === 0) return

  const { error } = await supabase
    .from(TABLES.profiles)
    .update(row)
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

/** Resolve the app user for an existing session, or `null` when signed out. */
export async function restoreSession(): Promise<AppUser | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(error.message)
  const session = data.session
  if (!session?.user) return null
  return loadAppUser(session.user.id, session.user.email ?? '')
}

/**
 * Redeem an invitation for the signed-in user. The invitation token, the
 * invited email and the granted role are all validated server-side — the client
 * only supplies the opaque token. Returns the granted role.
 */
export async function acceptInvitation(token: string): Promise<UserRole> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc(RPC.acceptInvitation, {
    p_token: token,
  })
  if (error) throw new Error(error.message)
  return data as UserRole
}

/** super_admin only: link an existing account (by email) to a member record. */
export async function adminLinkMember(
  memberCode: string,
  email: string,
): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc(RPC.adminLinkMember, {
    p_member_code: memberCode,
    p_email: email,
  })
  if (error) throw new Error(error.message)
}

/** super_admin only: detach the account linked to a member record. */
export async function adminUnlinkMember(memberCode: string): Promise<void> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.rpc(RPC.adminUnlinkMember, {
    p_member_code: memberCode,
  })
  if (error) throw new Error(error.message)
}

/** Subscribe to Supabase auth changes. Returns an unsubscribe function. */
export function subscribeToAuthChanges(
  handler: (userId: string | null) => void,
): () => void {
  const supabase = getSupabaseClient()
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // Supabase warns against awaiting other auth/supabase calls directly inside
    // this callback, so defer the handler to the next tick.
    const userId = session?.user?.id ?? null
    if (event === 'SIGNED_OUT') {
      handler(null)
      return
    }
    if (
      event === 'SIGNED_IN' ||
      event === 'TOKEN_REFRESHED' ||
      event === 'USER_UPDATED' ||
      event === 'INITIAL_SESSION'
    ) {
      setTimeout(() => handler(userId), 0)
    }
  })
  return () => data.subscription.unsubscribe()
}
