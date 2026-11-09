import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/BrandMark'
import { Input } from '@/components/ui/FormField'
import { useAuth } from '@/context/auth-context'

export default function ForgotPasswordPage() {
  const { requestPasswordReset, isDemoMode } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    setError(undefined)
    setSubmitting(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.')
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
              Check your inbox
            </h1>
            <p className="mt-2 text-sm text-navy-500">
              If an account exists for{' '}
              <span className="font-medium text-navy-800">{email}</span>, a
              password-reset link is on its way. The link expires shortly for
              your security.
            </p>
            <Link to="/login" className="mt-5 inline-block">
              <Button variant="secondary" icon={<ArrowLeft className="size-4" />}>
                Back to sign in
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold text-navy-900">
              Reset your password
            </h1>
            <p className="mt-1 text-sm text-navy-500">
              Enter your email and we will send you a secure reset link.
            </p>

            {isDemoMode && (
              <p className="mt-4 rounded-xl border border-gold-200 bg-gold-50 p-3 text-xs text-gold-800">
                Demo mode — password reset needs a live Supabase project. This
                form will fail until credentials are configured.
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                leadingIcon={<Mail className="size-4.5" />}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={error}
                required
              />
              <Button type="submit" size="lg" fullWidth loading={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
              </Button>
            </form>

            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-navy-600 hover:text-navy-900"
            >
              <ArrowLeft className="size-4" />
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
