import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Network, type ConnectionStatus } from '@capacitor/network'
import { NetworkContext } from './network-context'

/**
 * Connectivity provider
 * =====================
 *
 * Tracks whether the device is online. Capacitor's Network plugin works on
 * native Android *and* web, and we also listen to the browser's online/offline
 * events as a belt-and-braces fallback. Nothing is cached here — data always
 * comes from the backend, so going offline simply informs the user.
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(() => ({
    connected: typeof navigator === 'undefined' ? true : navigator.onLine,
    connectionType: 'unknown',
  }))

  const recheck = useCallback(() => {
    Network.getStatus()
      .then(setStatus)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let alive = true
    let listener: { remove: () => void } | undefined

    Network.getStatus()
      .then((next) => {
        if (alive) setStatus(next)
      })
      .catch(() => undefined)

    Network.addListener('networkStatusChange', (next) => {
      if (alive) setStatus(next)
    })
      .then((handle) => {
        listener = handle
      })
      .catch(() => undefined)

    const goOnline = () => setStatus((prev) => ({ ...prev, connected: true }))
    const goOffline = () => setStatus((prev) => ({ ...prev, connected: false }))
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      alive = false
      listener?.remove()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <NetworkContext.Provider
      value={{
        online: status.connected,
        connectionType: status.connectionType ?? 'unknown',
        recheck,
      }}
    >
      {children}
    </NetworkContext.Provider>
  )
}
