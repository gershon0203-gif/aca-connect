import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-lg bg-navy-100/70',
        className,
      )}
      {...props}
    />
  )
}

/** A skeleton that mirrors the member card layout while data loads. */
export function MemberCardSkeleton() {
  return (
    <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  )
}

/** Rows for the member data table while data loads. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-cream-200">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 px-5 py-4"
        >
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-3 w-24 sm:block" />
          <Skeleton className="hidden h-6 w-16 rounded-full md:block" />
        </div>
      ))}
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-soft">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-20" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  )
}
