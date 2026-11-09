import { createContext, useContext } from 'react'

export interface NetworkContextValue {
  /** Whether the device currently has a usable network connection. */
  online: boolean
  /** Capacitor connection type: `wifi`, `cellular`, `none` or `unknown`. */
  connectionType: string
  /** Re-check connectivity on demand (used by the offline banner's Retry). */
  recheck: () => void
}

export const NetworkContext = createContext<NetworkContextValue>({
  online: true,
  connectionType: 'unknown',
  recheck: () => undefined,
})

/** Read connectivity state. Safe to call outside the provider (defaults online). */
export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext)
}
