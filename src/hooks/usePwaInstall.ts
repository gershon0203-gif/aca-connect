import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Progressive Web App install helpers.
 *
 * Chromium browsers fire `beforeinstallprompt`, which we defer and replay when
 * the user presses our own "Install app" button. Browsers that never fire it
 * (iOS Safari, Firefox, desktop Safari) are detected so the UI can fall back to
 * clear manual instructions instead.
 */

/** The non-standard Chromium install event. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt: () => Promise<void>
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

/** True when the page is already running as an installed app. */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches
  // iOS Safari exposes navigator.standalone instead of display-mode.
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true
  return Boolean(standalone || iosStandalone)
}

/** Best-effort detection of an iOS browser (where no install prompt exists). */
function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const appleMobile = /iphone|ipad|ipod/i.test(ua)
  // iPadOS 13+ reports as desktop Safari but has a touch screen.
  const ipadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return appleMobile || ipadOs
}

export interface PwaInstallState {
  /** A native install prompt is available (Chromium). */
  canPrompt: boolean
  /** The app is already installed / running standalone. */
  isInstalled: boolean
  /** Likely an iOS browser, where only manual "Add to Home Screen" works. */
  isIos: boolean
  /** Trigger the native prompt. Returns the user's choice. */
  promptInstall: () => Promise<InstallOutcome>
}

export function usePwaInstall(): PwaInstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(detectStandalone)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferred(null)
      setInstalled(true)
    }
    const media = window.matchMedia('(display-mode: standalone)')
    const onDisplayChange = () => setInstalled(detectStandalone())

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    media.addEventListener('change', onDisplayChange)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      media.removeEventListener('change', onDisplayChange)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferred) return 'unavailable'
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // A prompt can only be used once.
    setDeferred(null)
    return outcome
  }, [deferred])

  return useMemo(
    () => ({
      canPrompt: Boolean(deferred),
      isInstalled: installed,
      isIos: detectIos(),
      promptInstall,
    }),
    [deferred, installed, promptInstall],
  )
}
