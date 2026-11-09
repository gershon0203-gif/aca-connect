import { useCallback } from 'react'
import { Minimize, Maximize, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { isDesktopPlatform } from '@/lib/platform'

/**
 * Desktop window controls (minimize, maximize/restore, close).
 * Only rendered on the Electron desktop build; invisible on web and Android.
 */
export function DesktopWindowControls() {
  const handleMinimize = useCallback(() => {
    window.electronAPI?.minimize()
  }, [])

  const handleMaximize = useCallback(() => {
    window.electronAPI?.maximize()
  }, [])

  const handleClose = useCallback(() => {
    window.electronAPI?.close()
  }, [])

  if (!isDesktopPlatform) return null

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8"
        onClick={handleMinimize}
        aria-label="Minimize window"
      >
        <Minimize className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8"
        onClick={handleMaximize}
        aria-label="Maximize/restore window"
      >
        <Maximize className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 text-red-600 hover:bg-red-50"
        onClick={handleClose}
        aria-label="Close window"
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}

/**
 * Desktop notification prompt. Requests permission and shows a test banner
 * when on desktop; no-op on other platforms.
 */
export function DesktopNotificationBanner() {
  const requestPermission = useCallback(async () => {
    const perm = await window.electronAPI?.notificationPermission()
    if (perm !== 'granted') {
      // On desktop, Notification permission is requested at send time
      return
    }
  }, [])

  if (!isDesktopPlatform) return null

  return (
    <div className="fixed top-4 right-4 z-50 rounded-xl border border-navy-200 bg-navy-50 p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-blue-500" />
        <div>
          <p className="text-sm font-medium text-navy-900">
            Desktop notifications ready
          </p>
          <p className="text-xs text-navy-500">
            Attendance and prayer reminders will appear as Windows system
            notifications.
          </p>
        </div>
      </div>
      <div className="ml-auto mt-1">
        <Button variant="ghost" size="sm" onClick={requestPermission}>
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
