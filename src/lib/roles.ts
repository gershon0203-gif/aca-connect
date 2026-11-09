import type { AppUser, UserRole } from '@/types'

/**
 * Client-side mirror of the server-side authorization model.
 *
 * These helpers only shape the UI (what to render, which routes to expose).
 * They are NOT the security boundary — Supabase Row Level Security and the
 * SECURITY DEFINER helpers in `supabase/migrations` are. A user who edits
 * routes or calls the API directly is still stopped by the database.
 */

/**
 * Roles that may manage church records. The final permission model has exactly
 * two roles, so the management tier is now `super_admin` only.
 */
export const MANAGER_ROLES: readonly UserRole[] = ['super_admin']

/** @deprecated Use {@link MANAGER_ROLES}; kept as an alias for existing imports. */
export const STAFF_ROLES: readonly UserRole[] = MANAGER_ROLES

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super admin',
  member: 'Member',
}

export function isSuperAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'super_admin'
}

/**
 * Whether the role may manage church data.
 *
 * Named for historical reasons; in the two-role model only `super_admin`
 * qualifies. The `staff` role is no longer granted by the application.
 */
export function isStaffRole(role: UserRole | null | undefined): boolean {
  return isSuperAdminRole(role)
}

/** The account is active AND has been granted a role by an administrator. */
export function userHasAccess(user: AppUser | null | undefined): boolean {
  return Boolean(user && user.role && user.status === 'active')
}

export function roleLabel(role: UserRole | null | undefined): string {
  return role ? ROLE_LABELS[role] : 'Pending access'
}
