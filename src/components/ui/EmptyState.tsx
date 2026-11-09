import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-cream-200 text-navy-400">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-navy-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-navy-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
