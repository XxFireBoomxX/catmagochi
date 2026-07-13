import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import './index.css'
import App from './App.tsx'

// Tells the native updater this bundle booted so it doesn't roll back to the
// previous one. Called synchronously, before rendering, per the plugin's own
// guidance ("call immediately... don't put it after network calls or heavy
// initialization"). Safe no-op when running as a plain web/PWA build.
CapacitorUpdater.notifyAppReady()

if (Capacitor.isNativePlatform()) {
  // A service worker controlling the origin fights with capacitor-updater's
  // own bundle-swapping (it serves its own precached assets regardless of
  // which bundle the updater has actually made active). Never register one
  // natively, and clean up any that an older build already registered.
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    for (const reg of regs) reg.unregister()
  })
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
