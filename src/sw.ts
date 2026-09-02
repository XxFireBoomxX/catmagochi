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
  // Distinct per message so consecutive notes stack and each one alerts;
  // absent for update/attention, which coalesce by type deliberately.
  tag?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { type: 'message' }
  try {
    if (event.data) payload = event.data.json()
  } catch {
    // ignore malformed push payloads
  }

  // `renotify` is a Service Worker notification option: TypeScript's DOM lib
  // only types the Notification constructor's narrower subset, so it isn't on
  // NotificationOptions. It's valid here, and requires `tag` -- which is
  // always set below.
  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: payload.tag ?? payload.type,
    // Only meaningful when a tag repeats (update/attention): re-alert rather
    // than swapping the text in silently.
    renotify: true,
    data: payload,
  }

  event.waitUntil(self.registration.showNotification(payload.title ?? 'Catmagochi', options))
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
