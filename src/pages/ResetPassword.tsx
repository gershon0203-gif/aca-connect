import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/BrandMark'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/context/toast-context'

export default function ResetPasswordPage() {
  const { updatePassword, signOut, isDemoMode, user, isLoading } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  // In a live project the recovery link establishes a session, arriving here
  // signed in. With no session (after restoration completes) the link is
  // missing, expired or already used.
  const restoring = !isDemoMode && isLoading
  const linkInvalid = !isDemoMode && !isLoading && !user

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (password.length < 8) {
      next.password = 'Use at least 8 characters.'
    }
    if (confirm !== password) {
      next.confirm = 'Passwords do not match.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await updatePassword(password)
      toast({
        title: 'Password updated',
        description: 'Sign in again with your new password.',
        variant: 'success',
      })
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      toast({
        title: 'Could not update password',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream-100 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="font-display font-semibold text-navy-900">
              ACA Connect
            </p>
            <p className="text-xs text-navy-500">Pozhichalur Ministries</p>
          </div>
        </div>

        {isDemoMode ? (
          <div className="rounded-2xl border border-gold-200 bg-gold-50 p-6">
            <h1 className="font-display text-xl font-semibold text-navy-900">
              Not available in demo mode
            </h1>
            <p className="mt-2 text-sm text-navy-600">
              Password reset needs a live Supabase project. Configure
              credentials to enable real account recovery.
            </p>
            <Link to="/login" className="mt-5 inline-block">
              <Button variant="secondary">Back to sign in</Button>
            </Link>
          </div>
        ) : restoring ? (
          <div className="rounded-2xl border border-cream-300 bg-white p-6 text-center shadow-soft">
            <p className="text-sm text-navy-500">Verifying your reset link…</p>
          </div>
        ) : linkInvalid ? (
          <div className="rounded-2xl border border-cream-300 bg-white p-6 shadow-soft">
            <h1 className="font-display text-xl font-semibold text-navy-900">
              Reset link invalid or expired
            </h1>
            <p className="mt-2 text-sm text-navy-500">
              Request a fresh password-reset link and try again.
            </p>
            <Link to="/forgot-password" className="mt-5 inline-block">
              <Button>Request a new link</Button>
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold text-navy-900">
              Choose a new password
            </h1>
            <p className="mt-1 text-sm text-navy-500">
              Pick something strong you have not used before.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
              <PasswordInput
                label="New password"
                autoComplete="new-password"
                placeholder="••••••••"
                leadingIcon={<Lock className="size-4.5" />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={errors.password}
                hint="At least 8 characters."
                required
              />
              <PasswordInput
                label="Confirm password"
                autoComplete="new-password"
                placeholder="••••••••"
                leadingIcon={<KeyRound className="size-4.5" />}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                error={errors.confirm}
                required
              />
              <Button type="submit" size="lg" fullWidth loading={submitting}>
                {submitting ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
