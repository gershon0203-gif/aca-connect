import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { CheckCircle2, Lock, Mail, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/FormField'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { BrandMark } from '@/components/BrandMark'
import { useAuth } from '@/context/auth-context'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

interface FieldErrors {
  fullName?: string
  email?: string
  password?: string
  confirm?: string
}

export default function RegisterPage() {
  const { register, isAuthenticated, isDemoMode } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const next: FieldErrors = {}
    if (!fullName.trim()) next.fullName = 'Enter your full name.'
    if (!email.trim()) next.email = 'Enter your email address.'
    else if (!EMAIL_RE.test(email.trim()))
      next.email = 'Enter a valid email address.'
    if (!password) next.password = 'Choose a password.'
    else if (password.length < MIN_PASSWORD)
      next.password = `Use at least ${MIN_PASSWORD} characters.`
    if (confirm !== password) next.confirm = 'Passwords do not match.'
    setErrors(next)
    setFormError(undefined)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      const result = await register(fullName, email, password)
      if (result.needsEmailVerification) {
        setSent(true)
      } else {
        // Email confirmation is disabled: the account already has the `member`
        // role (granted by the handle_new_user trigger) and can sign in.
        navigate('/dashboard', { replace: true })
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Please try again.',
      )
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

        {sent ? (
          <div className="rounded-2xl border border-cream-300 bg-white p-6 shadow-soft">
            <span className="flex size-11 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CheckCircle2 className="size-6" />
            </span>
            <h1 className="font-display mt-4 text-xl font-semibold text-navy-900">
              Verify your email
            </h1>
            <p className="mt-2 text-sm text-navy-500">
              We have sent a verification link to{' '}
              <span className="font-medium text-navy-800">{email.trim()}</span>.
              Open it to confirm your address, then sign in. An administrator
              will approve your access before you can view any records.
            </p>
            <Link to="/login" className="mt-5 inline-block">
              <Button variant="secondary">Back to sign in</Button>
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold text-navy-900">
              Create an account
            </h1>
            <p className="mt-1 text-sm text-navy-500">
              Register to request access. A church administrator approves every
              account before it can view records.
            </p>

            {isDemoMode && (
              <p className="mt-4 rounded-xl border border-gold-200 bg-gold-50 p-3 text-xs text-gold-800">
                Demo mode — registration needs a live Supabase project. This
                form will fail until credentials are configured.
              </p>
            )}

            {formError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
              <Input
                label="Full name"
                autoComplete="name"
                placeholder="Grace Thomas"
                leadingIcon={<UserRound className="size-4.5" />}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                error={errors.fullName}
                required
              />
              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                leadingIcon={<Mail className="size-4.5" />}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={errors.email}
                required
              />
              <PasswordInput
                label="Password"
                autoComplete="new-password"
                placeholder="••••••••"
                leadingIcon={<Lock className="size-4.5" />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={errors.password}
                hint={`At least ${MIN_PASSWORD} characters.`}
                required
              />
              <PasswordInput
                label="Confirm password"
                autoComplete="new-password"
                placeholder="••••••••"
                leadingIcon={<Lock className="size-4.5" />}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                error={errors.confirm}
                required
              />
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={submitting}
                className="mt-2"
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>

            <p className="mt-6 text-sm text-navy-500">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-navy-700 hover:text-navy-900"
              >
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
