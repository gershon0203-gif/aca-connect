import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream-100 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-navy-900 text-gold-400">
        <Compass className="size-7" />
      </span>
      <p className="font-display mt-5 text-3xl font-semibold text-navy-900">
        Page not found
      </p>
      <p className="mt-2 max-w-sm text-sm text-navy-500">
        The page you are looking for has moved or never existed.
      </p>
      <Link to="/dashboard" className="mt-6">
        <Button>Return to dashboard</Button>
      </Link>
    </div>
  )
}
