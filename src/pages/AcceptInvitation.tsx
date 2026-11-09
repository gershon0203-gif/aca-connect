import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { useAuth } from '@/context/auth-context'
import { acceptInvitation } from '@/services/auth'
import { roleLabel } from '@/lib/roles'
import type { UserRole } from '@/types'

type State =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'success'; role: UserRole }
  | { status: 'error'; message: string }

/**
 * Public landing page for an invitation link (`/accept-invitation?token=…`).
 *
 * The signed-in account must match the invited email — the server validates
 * both the token and the email, so this page only forwards the token.
 */
export default function AcceptInvitationPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ status: 'idle' })
  const started = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !token || started.current) return
    started.current = true
    setState({ status: 'working' })
    acceptInvitation(token)
      .then(async (role) => {
        await refreshUser()
        setState({ status: 'success', role })
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Could not accept this invitation.',
        })
      })
  }, [isAuthenticated, token, refreshUser])

  const loginHref = `/login?redirect=${encodeURIComponent(
    `/accept-invitation?token=${token}`,
  )}`

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream-100 px-6 text-center">
      <BrandMark size="xl" />

      {!token && (
        <>
          <h1 className="font-display mt-4 text-2xl font-semibold text-navy-900">
            Invitation link required
          </h1>
          <p className="mt-2 max-w-md text-sm text-navy-500">
            This page needs an invitation link. Ask an administrator to send you
            a fresh one.
          </p>
        </>
      )}

      {token && !isLoading && !isAuthenticated && (
        <>
          <h1 className="font-display mt-4 text-2xl font-semibold text-navy-900">
            Sign in to accept
          </h1>
          <p className="mt-2 max-w-md text-sm text-navy-500">
            You need to be signed in with the email this invitation was issued
            to.
          </p>
          <Link
            to={loginHref}
            className="mt-6 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-800"
          >
            Sign in
          </Link>
        </>
      )}

      {state.status === 'working' && (
        <>
          <h1 className="font-display mt-4 text-2xl font-semibold text-navy-900">
            Accepting your invitation…
          </h1>
          <Loader2 className="mt-4 size-6 animate-spin text-navy-500" />
        </>
      )}

      {state.status === 'success' && (
        <>
          <span className="mt-4 text-green-600">
            <CheckCircle2 className="size-8" />
          </span>
          <h1 className="font-display mt-2 text-2xl font-semibold text-navy-900">
            You&rsquo;re all set
          </h1>
          <p className="mt-2 max-w-md text-sm text-navy-500">
            Your account now has the{' '}
            <strong>{roleLabel(state.role)}</strong> role
            {user?.memberCode ? ' and is linked to your member record' : ''}.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard', { replace: true })}
            className="mt-6 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-800"
          >
            Continue to dashboard
          </button>
        </>
      )}

      {state.status === 'error' && (
        <>
          <span className="mt-4 text-red-500">
            <ShieldAlert className="size-8" />
          </span>
          <h1 className="font-display mt-2 text-2xl font-semibold text-navy-900">
            Could not accept invitation
          </h1>
          <p className="mt-2 max-w-md text-sm text-navy-500">{state.message}</p>
          <Link
            to="/my-profile"
            className="mt-6 rounded-xl bg-navy-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-800"
          >
            Go to my profile
          </Link>
        </>
      )}
    </div>
  )
}
