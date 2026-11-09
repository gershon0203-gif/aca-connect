import { Capacitor } from '@capacitor/core'

/**
 * Platform helpers
 * ================
 *
 * `Capacitor.isNativePlatform()` is `false` in the normal web build and `true`
 * inside the Android/iOS shell, so native-only behaviour can be gated without
 * changing the web experience.
 */

/** True when running inside the native Capacitor shell (Android/iOS). */
export const isNativePlatform: boolean = Capacitor.isNativePlatform()

/** True when running inside the Electron desktop shell. */
export const isDesktopPlatform: boolean =
  typeof window !== 'undefined' &&
  !!(window as unknown as { electronAPI?: unknown }).electronAPI

/** The running platform: `android`, `ios`, `web` or `desktop`. */
export function currentPlatform(): string {
  if (isDesktopPlatform) return 'desktop'
  return Capacitor.getPlatform()
}

export function isAndroidPlatform(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export function isDesktopPlatformFn(): boolean {
  return isDesktopPlatform
}
