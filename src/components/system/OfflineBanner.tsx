import { RefreshCw, WifiOff } from 'lucide-react'
import { useNetwork } from '@/context/network-context'

/**
 * Slim connectivity notice shown above the app while the device is offline.
 *
 * Member records always come from the backend (never an insecure local cache),
 * so this only informs the user and offers a manual retry — it does not block
 * navigation, and it disappears automatically once the connection returns.
 */
export function OfflineBanner() {
  const { online, recheck } = useNetwork()
  if (online) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="safe-top flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gold-100 px-4 py-2 text-center text-sm text-gold-900"
    >
      <span className="inline-flex items-center gap-2">
        <WifiOff className="size-4 shrink-0" />
        You are offline. Some information may be out of date.
      </span>
      <button
        type="button"
        onClick={recheck}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-gold-800 underline underline-offset-2 hover:text-gold-900"
      >
        <RefreshCw className="size-3.5" />
        Retry
      </button>
    </div>
  )
}
