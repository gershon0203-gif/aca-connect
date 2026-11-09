import { useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Registers the service worker and surfaces safe, user-controlled updates.
 *
 * The worker is registered with `registerType: 'prompt'`, so a new version is
 * downloaded and left waiting — it never replaces the running app mid-session.
 * The user chooses when to reload, which keeps a signed-in session stable.
 */
export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Check for a new version once an hour while the app stays open.
      window.setInterval(
        () => {
          if (navigator.onLine) void registration.update()
        },
        60 * 60 * 1000,
      )
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    const timer = window.setTimeout(() => setOfflineReady(false), 5000)
    return () => window.clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !offlineReady) return null

  const dismiss = () => {
    setNeedRefresh(false)
    setOfflineReady(false)
  }

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-20 z-[70] flex sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[22rem]">
      <div
        role="status"
        aria-live="polite"
        className="animate-fade-up pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-cream-300 bg-white p-4 shadow-lifted"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-900">
            {needRefresh
              ? 'A new version is available'
              : 'Ready to work offline'}
          </p>
          <p className="mt-0.5 text-sm text-navy-500">
            {needRefresh
              ? 'Reload to get the latest update. You will stay signed in.'
              : 'The app shell is saved for offline launches. Member data still needs a connection.'}
          </p>
          {needRefresh && (
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-cream-50 transition hover:bg-navy-800"
            >
              <RefreshCw className="size-3.5" />
              Reload
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="-m-1 rounded-lg p-1 text-navy-300 transition hover:bg-cream-200 hover:text-navy-700"
          aria-label="Dismiss update notice"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
