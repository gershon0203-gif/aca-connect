import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { demoCredentials } from '@/lib/demo-data'
import { isDemoMode as isDemoModeFlag } from '@/lib/supabase'
import * as authService from '@/services/auth'
import { registerDeviceToken, unregisterDeviceToken } from '@/services/push'
import type { AppUser } from '@/types'
import { AuthContext } from './auth-context'

/**
 * Auth provider
 * =============
 *
 * Two modes, one interface:
 *   * Demo mode (default) — a single clearly-labelled demo account, stored in
 *     localStorage. No network calls.
 *   * Supabase mode — real sessions via `supabase.auth`, with the profile and
 *     role loaded from the database and restored on refresh.
 *
 * `isLoading` is `true` only while a real session is being restored, so guards
 * can avoid a flash of the sign-in screen on a hard refresh.
 */

const STORAGE_KEY = 'aca-connect.demo-session'

const demoAdmin: AppUser = {
  id: 'USR-001',
  name: 'Rev. Christopher Jeyaraj',
  email: demoCredentials.email,
  role: 'super_admin',
  status: 'active',
  lastActiveAt: new Date().toISOString(),
  avatarUrl: null,
}

function readStoredSession(): AppUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AppUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() =>
    isDemoModeFlag ? readStoredSession() : null,
  )
  const [isLoading, setIsLoading] = useState(!isDemoModeFlag)

  useEffect(() => {
    // Demo mode needs no session restoration; `isLoading` is already false.
    if (isDemoModeFlag) return

    let active = true

    authService
      .restoreSession()
      .then((restored) => {
        if (active) {
          setUser(restored)
          // Register the device for push notifications only when a real
          // session was restored (members only; silent failure if push is
          // unavailable or no member record). Never prompt a signed-out
          // visitor for notification permission.
          if (restored) registerDeviceToken().catch(() => {})
        }
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    const unsubscribe = authService.subscribeToAuthChanges((userId) => {
      if (!active) return
      if (!userId) {
        setUser(null)
        return
      }
      authService
        .restoreSession()
        .then((restored) => {
          if (active) {
            setUser(restored)
            // A session may become active after email confirmation; register
            // this device then too (best effort, never blocks the UI).
            if (restored) registerDeviceToken().catch(() => {})
          }
        })
        .catch(() => {
          /* keep the previous user; a later event will correct it */
        })
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (isDemoModeFlag) {
      await new Promise((resolve) => setTimeout(resolve, 650))
      if (
        email.trim().toLowerCase() !== demoCredentials.email ||
        password !== demoCredentials.password
      ) {
        throw new Error(
          'Those details do not match the demo account. Check the hint below.',
        )
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(demoAdmin))
      setUser(demoAdmin)
      return
    }
    const authed = await authService.signInWithPassword(email, password)
    setUser(authed)
    // Register the device for push notifications (members only; silent failure
    // if the account has no linked member record or push is unavailable).
    await registerDeviceToken().catch(() => {})
  }, [])

  const register = useCallback(
    async (fullName: string, email: string, password: string) => {
      if (isDemoModeFlag) {
        throw new Error(
          'Creating an account needs a live Supabase project. Configure credentials to enable registration.',
        )
      }
      // Return the user to the sign-in screen after they confirm their email.
      const emailRedirectTo = `${window.location.origin}/login`
      const result = await authService.signUpWithPassword(
        fullName,
        email,
        password,
        emailRedirectTo,
      )
      // When email confirmation is disabled project-wide, signUp returns a
      // session immediately and the account already has the `member` role
      // (granted by the handle_new_user trigger). When email confirmation is
      // on, no session is returned and the user must confirm their email first.
      if (!result.needsEmailVerification) {
        const restored = await authService.restoreSession()
        setUser(restored)
      }
      return result
    },
    [],
  )

  const signOut = useCallback(async () => {
    if (isDemoModeFlag) {
      localStorage.removeItem(STORAGE_KEY)
      setUser(null)
      return
    }
    try {
      // Deactivate this device's push token before signing out. The service
      // keeps the last registered token in storage, so no native getToken()
      // call (which does not exist in Capacitor v8) is needed.
      try {
        await unregisterDeviceToken()
      } catch {
        // Best effort only
      }
      await authService.signOutUser()
    } finally {
      setUser(null)
    }
  }, [])
  const requestPasswordReset = useCallback(async (email: string) => {
    if (isDemoModeFlag) {
      throw new Error(
        'Password reset needs a live Supabase project. Configure credentials to enable it.',
      )
    }
    const redirectTo = `${window.location.origin}/reset-password`
    await authService.requestPasswordReset(email, redirectTo)
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    if (isDemoModeFlag) {
      throw new Error(
        'Changing the password needs a live Supabase project. Configure credentials to enable it.',
      )
    }
    await authService.updatePassword(password)
  }, [])

  const refreshUser = useCallback(async () => {
    if (isDemoModeFlag) return
    const restored = await authService.restoreSession()
    setUser(restored)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      isDemoMode: isDemoModeFlag,
      signIn,
      register,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshUser,
    }),
    [
      user,
      isLoading,
      signIn,
      register,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshUser,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
