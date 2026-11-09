import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/format'

interface AvatarProps {
  firstName: string
  lastName?: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-20 text-xl',
} as const

export function Avatar({
  firstName,
  lastName,
  src,
  size = 'md',
  className,
}: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-800 font-semibold text-cream-100 ring-1 ring-navy-900/5',
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        getInitials(firstName, lastName)
      )}
    </span>
  )
}
