import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Consistent page content wrapper: centred max-width, responsive padding and
 * extra bottom space so the mobile tab bar never covers content.
 */
export function Page({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <main
      className={cn(
        'mx-auto w-full max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:pt-7 lg:pb-12',
        className,
      )}
    >
      {children}
    </main>
  )
}
