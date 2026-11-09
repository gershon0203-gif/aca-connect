import {
  BarChart3,
  Bell,
  Cake,
  CalendarCheck2,
  ClipboardCheck,
  HandHeart,
  HeartHandshake,
  Home,
  House,
  LayoutDashboard,
  MessageSquare,
  CalendarDays,
  Newspaper,
  Network,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '@/types'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Roles allowed to see this item. Empty = everyone with app access. */
  roles?: UserRole[]
  /** Render under the "Administration" group. */
  group: 'main' | 'admin'
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, group: 'main' },
  {
    label: 'Attendance',
    to: '/attendance',
    icon: ClipboardCheck,
    roles: ['super_admin'],
    group: 'main',
  },
  {
    label: 'My Attendance',
    to: '/my-attendance',
    icon: CalendarCheck2,
    roles: ['member'],
    group: 'main',
  },
  {
    label: 'Prayers',
    to: '/prayers',
    icon: HandHeart,
    roles: ['super_admin'],
    group: 'main',
  },
  { label: 'Birthdays', to: '/birthdays', icon: Cake, group: 'main' },
  { label: 'Chat', to: '/chat', icon: MessageSquare, group: 'main' },
  { label: 'Events', to: '/events', icon: CalendarDays, group: 'main' },
  { label: 'Daily Hub', to: '/daily-hub', icon: Newspaper, group: 'main' },
  {
    label: 'Anniversaries',
    to: '/anniversaries',
    icon: HeartHandshake,
    roles: ['super_admin'],
    group: 'main',
  },
  {
    label: 'Members',
    to: '/members',
    icon: Users,
    roles: ['super_admin', 'member'],
    group: 'main',
  },
  {
    label: 'Families',
    to: '/families',
    icon: House,
    roles: ['super_admin'],
    group: 'main',
  },
  {
    label: 'Reports',
    to: '/reports',
    icon: BarChart3,
    roles: ['super_admin'],
    group: 'main',
  },
  {
    label: 'Ministries',
    to: '/ministries',
    icon: Network,
    roles: ['super_admin'],
    group: 'main',
  },
  {
    label: 'Notifications',
    to: '/notifications',
    icon: Bell,
    group: 'main',
  },
  { label: 'My Profile', to: '/my-profile', icon: UserCircle, group: 'main' },
  {
    label: 'My Family',
    to: '/my-family',
    icon: Home,
    roles: ['member'],
    group: 'main',
  },
  {
    label: 'Users',
    to: '/admin/users',
    icon: ShieldCheck,
    roles: ['super_admin'],
    group: 'admin',
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: Settings,
    roles: ['super_admin'],
    group: 'main',
  },
]

export function visibleNavItems(role: UserRole | null): NavItem[] {
  if (!role) return []
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role))
}

/**
 * A compact, role-aware set for the phone bottom bar. The sidebar/drawer still
 * lists every destination; this keeps the tab bar to a thumb-friendly five.
 */
const MOBILE_ORDER: Record<UserRole, string[]> = {
  super_admin: [
    '/dashboard',
    '/attendance',
    '/members',
    '/prayers',
    '/notifications',
  ],
  member: [
    '/dashboard',
    '/my-attendance',
    '/members',
    '/my-profile',
    '/notifications',
  ],
}

export function mobileNavItems(role: UserRole | null): NavItem[] {
  if (!role) return []
  const items = visibleNavItems(role)
  return MOBILE_ORDER[role]
    .map((path) => items.find((item) => item.to === path))
    .filter((item): item is NavItem => Boolean(item))
}
