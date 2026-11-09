import { useState, type FormEvent } from 'react'
import {
  useLocation,
  useNavigate,
  useSearchParams,
  Navigate,
  Link,
} from 'react-router-dom'
import { Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BrandMark } from '@/components/BrandMark'
import { Input } from '@/components/ui/FormField'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { InstallAppButton } from '@/components/system/InstallAppButton'
import { useAuth } from '@/context/auth-context'
import { useToast } from '@/context/toast-context'
import { demoCredentials, DEMO_NOTICE } from '@/lib/demo-data'

interface LocationState {
  from?: { pathname: string }
}

export default function LoginPage() {
  const { isAuthenticated, signIn, isDemoMode } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const redirectTo =
    searchParams.get('redirect') ??
    (location.state as LocationState | null)?.from?.pathname ??
    '/dashboard'

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    if (!email.trim()) nextErrors.email = 'Enter your email address.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = 'Enter a valid email address.'
    if (!password) nextErrors.password = 'Enter your password.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await signIn(email, password)
      toast({
        title: 'Welcome back',
        description: isDemoMode
          ? 'You are signed in to the demo workspace.'
          : 'You are signed in.',
        variant: 'success',
      })
      navigate(redirectTo, { replace: true })
    } catch (error) {
      toast({
        title: 'Sign-in failed',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const fillDemo = () => {
    setEmail(demoCredentials.email)
    setPassword(demoCredentials.password)
    setErrors({})
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-navy-950 p-10 text-cream-100 lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <BrandMark size="lg" />
          <div>
            <p className="font-display text-lg font-semibold text-white">
              ACA Connect
            </p>
            <p className="text-xs tracking-wide text-navy-300 uppercase">
              Pozhichalur Ministries
            </p>
          </div>
        </div>

        <div className="max-w-md">
          <p className="text-xs font-semibold tracking-[0.2em] text-gold-400 uppercase">
            Member management
          </p>
          <h2 className="font-display mt-4 text-4xl leading-tight font-semibold text-white">
            Shepherd your congregation with clarity and care.
          </h2>
          <p className="mt-4 text-navy-200">
            A calm, dependable home for member records, ministries and pastoral
            follow-up — built for the leadership team of ACA Pozhichalur.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-navy-200">
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-gold-400" />
              Role-based access for admins and leaders
            </li>
            <li className="flex items-center gap-3">
              <Sparkles className="size-5 text-gold-400" />
              Designed for phone, tablet and desktop
            </li>
          </ul>
        </div>

        <p className="text-xs text-navy-400">
          “Let all things be done decently and in order.” — 1 Corinthians 14:40
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center bg-cream-100 px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <div>
              <p className="font-display font-semibold text-navy-900">
                ACA Connect
              </p>
              <p className="text-xs text-navy-500">Pozhichalur Ministries</p>
            </div>
          </div>

          <h1 className="font-display text-2xl font-semibold text-navy-900">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Welcome back. Enter your details to continue.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
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
              autoComplete="current-password"
              placeholder="••••••••"
              leadingIcon={<Lock className="size-4.5" />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password}
              required
            />
            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={submitting}
              className="mt-2"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <Link
              to="/forgot-password"
              className="font-medium text-navy-600 hover:text-navy-900"
            >
              Forgot your password?
            </Link>
            <Link
              to="/register"
              className="font-medium text-navy-600 hover:text-navy-900"
            >
              Create an account
            </Link>
          </div>

          <div className="mt-6 flex justify-center">
            <InstallAppButton showLabel />
          </div>

          {isDemoMode && (
            <div className="mt-6 rounded-xl border border-gold-200 bg-gold-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold tracking-wide text-gold-800 uppercase">
                  Demo access
                </p>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="text-xs font-semibold text-gold-700 underline underline-offset-2 hover:text-gold-800"
                >
                  Fill demo details
                </button>
              </div>
              <p className="mt-2 font-mono text-xs break-all text-navy-700">
                {demoCredentials.email}
              </p>
              <p className="font-mono text-xs text-navy-700">
                {demoCredentials.password}
              </p>
              <p className="mt-2 text-[11px] text-gold-800">{DEMO_NOTICE}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
