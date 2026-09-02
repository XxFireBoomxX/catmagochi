import { useEffect, useRef, useState } from 'react'
import type { NotificationSettings } from './useNotificationSettings'
import { getDeviceId } from '../data/deviceId'

const RELAY_URL: string | undefined = import.meta.env.VITE_RELAY_URL
const RELAY_TOKEN: string | undefined = import.meta.env.VITE_RELAY_TOKEN
const VAPID_PUBLIC_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY

// useMessages talks to the relay over ws(s)://, but /push/subscribe is a
// plain HTTP(S) POST -- same host, different scheme.
const HTTP_RELAY_URL = RELAY_URL?.replace(/^ws/, 'http')

// 'rejected' is distinct from 'error': the relay refused this subscription
// outright (an endpoint that isn't a known push service), so retrying or
// checking your connection will never help.
export type PushStatus =
  | 'idle'
  | 'unsupported'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed'
  | 'rejected'
  | 'error'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function usePushSubscription(settings: NotificationSettings) {
  const [status, setStatus] = useState<PushStatus>('idle')
  const syncing = useRef(false)

  useEffect(() => {
    if (!HTTP_RELAY_URL || !RELAY_TOKEN || !VAPID_PUBLIC_KEY) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported')
      return
    }
    if (syncing.current) return
    syncing.current = true

    const sync = async () => {
      try {
        if (!settings.global) {
          const registration = await navigator.serviceWorker.ready
          const subscription = await registration.pushManager.getSubscription()
          if (subscription) {
            await fetch(`${HTTP_RELAY_URL}/push/unsubscribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: RELAY_TOKEN, endpoint: subscription.endpoint }),
            })
            await subscription.unsubscribe()
          }
          setStatus('unsubscribed')
          return
        }

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setStatus('denied')
          return
        }

        const registration = await navigator.serviceWorker.ready
        let subscription = await registration.pushManager.getSubscription()
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
        }

        const res = await fetch(`${HTTP_RELAY_URL}/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: RELAY_TOKEN,
            subscription: subscription.toJSON(),
            types: { message: settings.message, update: settings.update },
            // Lets the relay skip pushing a note back to the device that
            // sent it -- the in-app echo is already suppressed, so without
            // this you get a notification that opens to nothing.
            device: getDeviceId(),
          }),
        })
        // Without this the relay's rejection was discarded and we reported
        // success: the toggle read [ON] and push simply never worked, with
        // nothing shown to the user and nothing logged.
        if (!res.ok) {
          setStatus('rejected')
          return
        }
        setStatus('subscribed')
      } catch {
        setStatus('error')
      } finally {
        syncing.current = false
      }
    }

    sync()
  }, [settings.global, settings.message, settings.update])

  return { status }
}
