import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

/**
 * Native platform bootstrap
 * =========================
 *
 * Runs once after the React tree mounts and applies the native-only tweaks
 * that keep the web UI feeling native on Android:
 *
 *  - hides the splash screen once the app is ready to paint;
 *  - styles the status bar (dark icons over the light app chrome);
 *  - resizes the WebView when the soft keyboard appears so focused fields —
 *    sign-in, profile and member forms — stay visible.
 *
 * Every call is a no-op on the web build, so the same code ships everywhere.
 */
export function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    SplashScreen.hide().catch(() => undefined)
    StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined)
    Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => undefined)
  }, [])

  return null
}
