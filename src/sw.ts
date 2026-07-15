/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)

interface PushPayload {
  type: string
  title?: string
  body?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { type: 'message' }
  try {
    if (event.data) payload = event.data.json()
  } catch {
    // ignore malformed push payloads
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Catmagochi', {
      body: payload.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: payload.type,
      data: payload,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    }),
  )
})
