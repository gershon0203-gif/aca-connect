/**
 * Environment configuration
 * =========================
 *
 * The single place that reads `import.meta.env`, so the rest of the app never
 * has to know how Vite exposes variables.
 *
 * Demo mode is the safe default: unless a URL, an anon key AND
 * `VITE_USE_DEMO_DATA=false` are all present, the app runs on clearly-labelled
 * demo data and never touches the network.
 */

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
const appEnv = (import.meta.env.VITE_APP_ENV ?? 'development').trim()
const useDemoFlag = import.meta.env.VITE_USE_DEMO_DATA !== 'false'

const hasCredentials = Boolean(url && anonKey)

/**
 * `true` while the app should serve demo data.
 *
 * We never expose the service-role key here — only the public anon key is ever
 * bundled into the browser build.
 */
export const isDemoMode = useDemoFlag || !hasCredentials

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  appEnv,
  hasCredentials,
  isDemoMode,
} as const

/** Human-readable reason the app is in demo mode, for banners and docs. */
export function demoModeReason(): string | null {
  if (!isDemoMode) return null
  if (!hasCredentials) return 'Supabase credentials are not configured'
  return 'VITE_USE_DEMO_DATA is not set to "false"'
}
