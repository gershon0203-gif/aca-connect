/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_APP_ENV?: 'development' | 'staging' | 'production'
  /** When "true", the app serves labelled demo data instead of live records. */
  readonly VITE_USE_DEMO_DATA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
