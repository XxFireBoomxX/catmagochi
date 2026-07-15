/// <reference types="vitest/config" />
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
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // server/ has its own suite run via `node --test` (see server/README.md)
    exclude: ['**/node_modules/**', 'server/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/sw.ts',
        'src/vite-env.d.ts',
        'src/test/**',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
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
      // injectManifest (not generateSW) because push notifications need a
      // custom `push`/`notificationclick` handler — see src/sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
