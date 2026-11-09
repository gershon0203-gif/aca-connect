import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration
 * =======================
 *
 * Wraps the existing React + Vite web app in a native Android shell. The web
 * build output (`dist`) is copied into the Android project on `cap sync`, so
 * the same UI, routes, validation and Supabase integration are reused as-is.
 *
 * Only the public anon key is ever bundled into the app. Row Level Security on
 * the backend remains the authorization boundary — see `supabase/migrations`.
 */
const config: CapacitorConfig = {
  appId: 'org.acapozhichalur.connect',
  appName: 'ACA Connect Pozhichalur',
  webDir: 'dist',
  android: {
    // Never allow the WebView to load insecure (http) content.
    allowMixedContent: false,
  },
  server: {
    // Modern default: serve the bundle from a secure https://localhost origin
    // so Supabase auth, cookies and storage all behave like the web build.
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#0d1626',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    Keyboard: {
      // Resize the native WebView when the soft keyboard appears so focused
      // form fields stay visible (important for safe member/entry forms).
      resize: 'native',
      resizeOnFullScreen: true,
      style: 'DARK',
    },
    StatusBar: {
      // Dark icons over the light (cream) app header on Android 15+ edge-to-edge.
      style: 'DARK',
    },
    PushNotifications: {
      // Presentation options for foreground notifications on Android.
      // Sound, badge and alert are requested; Android channels control the
      // actual audible behaviour via notification channels defined natively.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
