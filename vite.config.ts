import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered manually and only outside Capacitor native (see main.tsx) —
      // a service worker controlling the origin fights with capacitor-updater's
      // own bundle-swapping, silently serving stale precached assets over
      // whatever OTA bundle is actually supposed to be active.
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Catmagochi',
        short_name: 'Catmagochi',
        description: 'A virtual cat companion to feed, play with, and take care of.',
        theme_color: '#7c4dff',
        background_color: '#0b0614',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'favicon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'favicon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
