import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import {
  NOTIFICATIONS_CHANGED_EVENT,
  unreadNotificationCount,
} from '@/services/notifications'
import { cn } from '@/lib/utils'

/**
 * Header notification bell.
 *
 * Shows the signed-in user's unread count. The count is refreshed on mount, on
 * the app-wide notification event, when the window regains focus, and on a slow
 * poll so a reminder sent from another device appears without a reload.
 */
export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  const refresh = useCallback(() => {
    if (!user?.id) return
    unreadNotificationCount(user.id)
      .then((count) => setUnread(count))
      .catch(() => {
        /* A failed count must never break the header. */
      })
  }, [user])

  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    const onFocus = () => refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [refresh])

  if (!user) return null

  return (
    <button
      type="button"
      onClick={() => navigate('/notifications')}
      className="relative rounded-xl border border-cream-300 bg-white p-2.5 text-navy-700 transition hover:border-navy-300"
      aria-label={
        unread > 0
          ? `Notifications, ${unread} unread`
          : 'Notifications, no unread'
      }
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span
          className={cn(
            'absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-navy-950 ring-2 ring-cream-100',
          )}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}
