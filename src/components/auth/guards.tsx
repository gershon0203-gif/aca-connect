import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { MailWarning } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { useAuth } from '@/context/auth-context'
import { userHasAccess } from '@/lib/roles'
import type { AppShellContext } from '@/components/layout/app-shell'
import type { UserRole } from '@/types'

/** Full-page loader shown while a real session is being restored. */
function SessionLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream-100">
      <div className="flex flex-col items-center gap-3 text-navy-500">
        <BrandMark size="xl" className="animate-pulse" />
        <p className="text-sm">Restoring your session…</p>
      </div>
    </div>
  )
}

/**
 * Shown to an account that has signed in but has NOT been granted a role yet.
 * Access is only ever granted by a super_admin invitation/link, so a fresh
 * sign-up lands here with no ability to do anything.
 */
function PendingAccess() {
  const { user, signOut } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream-100 px-6 text-center">
      <BrandMark size="xl" />
      <span className="mt-4 flex size-12 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
        <MailWarning className="size-6" />
      </span>
      <h1 className="font-display mt-4 text-2xl font-semibold text-navy-900">
        Access pending approval
      </h1>
      <p className="mt-2 max-w-md text-sm text-navy-500">
        Your account ({user?.email}) is signed in but has not been granted
        access to ACA Connect yet. An administrator must invite or approve you
        before you can view or change any records.
      </p>
      <button
        type="button"
        onClick={signOut}
        className="mt-6 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-800"
      >
        Sign out
      </button>
    </div>
  )
}

/** Redirects unauthenticated visitors to the sign-in screen. */
export function RequireAuth() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <SessionLoader />

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!userHasAccess(user)) return <PendingAccess />

  return <Outlet />
}

/** Restricts a route to specific roles, showing a friendly 403 otherwise. */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user, isLoading } = useAuth()
  // This guard is rendered inside `AppLayout`, which passes shell controls down
  // through `<Outlet context>`. Re-emit that context so nested routes keep
  // access to `useAppShell()` — a bare `<Outlet />` would drop it.
  const shell = useOutletContext<AppShellContext>()

  if (isLoading) return <SessionLoader />

  if (!user?.role || !roles.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="font-display text-2xl font-semibold text-navy-900">
          Access restricted
        </p>
        <p className="mt-2 max-w-sm text-sm text-navy-500">
          Your account role does not have permission to view this page. Contact
          a platform administrator if you believe this is a mistake.
        </p>
      </div>
    )
  }
  return <Outlet context={shell} />
}
