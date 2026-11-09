import { NavLink } from 'react-router-dom'
import { LogOut, X } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { visibleNavItems } from '@/config/navigation'
import { cn } from '@/lib/utils'
import { DEMO_NOTICE } from '@/lib/demo-data'
import { roleLabel } from '@/lib/roles'
import { useAuth } from '@/context/auth-context'
import { Avatar } from '@/components/ui/Avatar'

interface SidebarProps {
  /** Called after a nav link is activated (used to close the mobile drawer). */
  onNavigate?: () => void
  /** Render the close button — only shown inside the mobile drawer. */
  onClose?: () => void
  className?: string
}

export function Sidebar({ onNavigate, onClose, className }: SidebarProps) {
  const { user, signOut } = useAuth()
  const items = visibleNavItems(user?.role ?? null)
  const main = items.filter((item) => item.group === 'main')
  const admin = items.filter((item) => item.group === 'admin')
  const [firstName, ...rest] = (user?.name ?? 'Guest').split(' ')
  const lastName = rest.join(' ')

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-navy-950 text-cream-100',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-5">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="font-display text-base leading-tight font-semibold text-white">
              ACA Connect
            </p>
            <p className="text-[11px] tracking-wide text-navy-300 uppercase">
              Pozhichalur Ministries
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-navy-300 transition hover:bg-navy-900 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav
        className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-3"
        aria-label="Primary"
      >
        <NavGroup title="Overview" items={main} onNavigate={onNavigate} />
        {admin.length > 0 && (
          <NavGroup title="Administration" items={admin} onNavigate={onNavigate} />
        )}
      </nav>

      <div className="border-t border-navy-800 p-4">
        <div className="mb-3 rounded-xl bg-navy-900 px-3 py-2 text-[11px] leading-snug text-navy-300">
          {DEMO_NOTICE}
        </div>
        <div className="flex items-center gap-3">
          <Avatar firstName={firstName} lastName={lastName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user?.name ?? 'Guest'}
            </p>
            <p className="truncate text-xs text-navy-300 capitalize">
              {roleLabel(user?.role)}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg p-2 text-navy-300 transition hover:bg-navy-900 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

interface NavGroupProps {
  title: string
  items: ReturnType<typeof visibleNavItems>
  onNavigate?: () => void
}

function NavGroup({ title, items, onNavigate }: NavGroupProps) {
  return (
    <div>
      <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-navy-400 uppercase">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-navy-800 text-white shadow-sm'
                    : 'text-navy-200 hover:bg-navy-900 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={cn(
                      'size-4.5',
                      isActive ? 'text-gold-400' : 'text-navy-400',
                    )}
                  />
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
