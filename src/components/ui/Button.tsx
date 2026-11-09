import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-navy-900 text-cream-50 hover:bg-navy-800 active:bg-navy-950 shadow-soft',
  secondary:
    'bg-white text-navy-800 border border-cream-300 hover:border-navy-300 hover:bg-cream-50',
  ghost: 'text-navy-600 hover:bg-cream-200 hover:text-navy-900',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  gold: 'bg-gold-500 text-navy-950 hover:bg-gold-400 active:bg-gold-600',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
