import { NavLink } from 'react-router-dom'
import { mobileNavItems } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/auth-context'

/**
 * Bottom tab bar for phones / Capacitor builds.
 * A compact five-tab mirror of the most-used destinations; the drawer keeps
 * the full navigation list.
 */
export function MobileNav() {
  const { user } = useAuth()
  const items = mobileNavItems(user?.role ?? null)

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-cream-300 bg-white/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition',
                  isActive
                    ? 'text-navy-900'
                    : 'text-navy-400 active:text-navy-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      'size-5.5',
                      isActive && 'text-navy-900',
                    )}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
