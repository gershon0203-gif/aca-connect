import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type CardProps = HTMLAttributes<HTMLDivElement>

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-cream-300 bg-white shadow-soft',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-base font-semibold text-navy-900', className)}
      {...props}
    />
  )
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-navy-500', className)} {...props} />
  )
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn('p-5', className)} {...props} />
}
