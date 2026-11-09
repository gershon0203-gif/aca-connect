import { createContext, useContext } from 'react'
import type { AppUser } from '@/types'

export interface AuthContextValue {
  user: AppUser | null
  isAuthenticated: boolean
  /** `true` while an existing session is being restored on first load. */
  isLoading: boolean
  /** Whether the app is running on demo data (no Supabase configured). */
  isDemoMode: boolean
  signIn: (email: string, password: string) => Promise<void>
  /**
   * Create a new account (email verification via Supabase Auth). The account
   * is granted the `member` role automatically by the database trigger and can
   * sign in immediately when email confirmation is disabled project-wide.
   * Rejects in demo mode.
   */
  register: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<{ needsEmailVerification: boolean }>
  signOut: () => Promise<void>
  /** Email a password-recovery link. Rejects in demo mode. */
  requestPasswordReset: (email: string) => Promise<void>
  /** Set a new password for the current recovery session. Rejects in demo mode. */
  updatePassword: (password: string) => Promise<void>
  /** Re-load the current profile (e.g. after saving changes or a new photo). */
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
