import { cn } from '@/lib/utils'

/**
 * The church brand mark.
 *
 * Renders the original ACA logo (`public/aca-logo.png`) so the same artwork
 * appears on every auth screen and in the app shell. The logo is shown on a
 * white tile so it reads clearly on both the navy brand panel and the light
 * canvas.
 */

const MARK_SIZES = {
  sm: 'size-9',
  md: 'size-10',
  lg: 'size-11',
  xl: 'size-14',
} as const

interface BrandMarkProps {
  size?: keyof typeof MARK_SIZES
  className?: string
}

export function BrandMark({ size = 'md', className }: BrandMarkProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-navy-900/10',
        MARK_SIZES[size],
        className,
      )}
    >
      <img
        src="/aca-logo.png"
        alt="ACA Pozhichalur Ministries"
        className="size-full object-contain"
        draggable={false}
      />
    </span>
  )
}
