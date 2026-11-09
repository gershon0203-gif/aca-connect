import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/** Routes where the Android back button should exit the app instead of going back. */
const ROOT_ROUTES = new Set(['/', '/dashboard', '/login'])

/**
 * Wires the Android hardware/gesture back button to SPA history: navigate back
 * when there is somewhere to return to, otherwise leave the app. No-ops on web.
 */
export function AndroidBackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = useRef(location.pathname)

  useEffect(() => {
    pathname.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let remove: (() => void) | undefined
    let disposed = false

    CapacitorApp.addListener('backButton', () => {
      if (ROOT_ROUTES.has(pathname.current)) {
        CapacitorApp.exitApp()
        return
      }
      navigate(-1)
    })
      .then((handle) => {
        if (disposed) handle.remove()
        else remove = () => handle.remove()
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      remove?.()
    }
  }, [navigate])

  return null
}
