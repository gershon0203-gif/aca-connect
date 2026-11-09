import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  consumePendingPushDestination,
  sanitizePushDestination,
} from '@/services/push'

/**
 * Handles notification taps.
 *
 * The native layer (Capacitor PushNotifications) dispatches `aca-push-tapped`
 * with a validated internal route. This component lives inside the HashRouter,
 * so it can navigate. It also consumes a destination captured during a cold
 * start, before React had mounted.
 */
export function PushNavigationHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    const pending = consumePendingPushDestination()
    if (pending) navigate(pending)

    const onTap = (event: Event) => {
      const detail = (event as CustomEvent<{ destination?: unknown }>).detail
      const destination = sanitizePushDestination(detail?.destination)
      if (!destination) return
      // Clear the stored copy so a remount cannot navigate a second time.
      consumePendingPushDestination()
      navigate(destination)
    }

    window.addEventListener('aca-push-tapped', onTap)
    return () => window.removeEventListener('aca-push-tapped', onTap)
  }, [navigate])

  return null
}
