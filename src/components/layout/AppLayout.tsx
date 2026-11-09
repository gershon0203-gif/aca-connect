import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import type { AppShellContext } from './app-shell'

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const openMenu = useCallback(() => setDrawerOpen(true), [])
  const closeMenu = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen, closeMenu])

  return (
    <div className="min-h-dvh bg-cream-100">
      {/* Desktop sidebar */}
      <Sidebar className="fixed inset-y-0 left-0 hidden w-64 lg:flex" />

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-navy-950/50"
            onClick={closeMenu}
            aria-hidden="true"
          />
          <Sidebar
            className="animate-fade-in absolute inset-y-0 left-0 w-72 shadow-lifted"
            onNavigate={closeMenu}
            onClose={closeMenu}
          />
        </div>
      )}

      <div className="lg:pl-64">
        <Outlet context={{ openMenu } satisfies AppShellContext} />
      </div>

      <MobileNav />
    </div>
  )
}
