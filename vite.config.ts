import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Do not auto-inject a registration script: the app registers through
      // `virtual:pwa-register/react` so it can offer a user-controlled update.
      injectRegister: false,
      // Wait for the user to confirm an update (safe update behaviour); the
      // running app is never swapped out from under a signed-in session.
      registerType: 'prompt',
      manifest: {
        id: '/',
        name: 'ACA Connect',
        short_name: 'ACA Connect',
        description: 'Member management for ACA Pozhichalur Ministries.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#0d1626',
        background_color: '#0d1626',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache only the app shell (build output + static icons). This never
        // includes API responses or church data — only same-origin static files.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2}'],
        // The full-size source logo is served for reference only and is not part
        // of the app shell — keep it out of the offline precache. The manifest
        // and its icons are added by the plugin itself, so skip the glob match
        // to avoid duplicate precache entries.
        globIgnores: ['**/aca-logo.png', '**/manifest.webmanifest', '**/pwa-*.png'],
        // Serve the SPA shell for navigations so deep links and refreshes work.
        navigateFallback: 'index.html',
        // Never serve the shell for backend/API paths, even if a host proxies
        // them under the same origin.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/auth\//,
          /^\/rest\//,
          /^\/storage\//,
          /^\/functions\//,
          /^\/realtime\//,
        ],
        cleanupOutdatedCaches: true,
        // Only public third-party font files are runtime-cached. Supabase and
        // any other backend traffic is intentionally NOT cached: those requests
        // are not intercepted, so member records and auth responses always hit
        // the network and are never written to a public cache.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Keep the dev server untouched; the service worker is a production
        // concern and would otherwise mask HMR behaviour.
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
