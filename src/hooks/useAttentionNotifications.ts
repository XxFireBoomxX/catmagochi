import { useEffect, useRef } from 'react'
import type { PetStats } from '../types'
import type { NotificationSettings } from './useNotificationSettings'

const CRITICAL_THRESHOLD = 25
const MIN_NOTIFY_INTERVAL_MS = 30 * 60_000

type Reason = 'hungry' | 'tired' | 'dirty' | 'sad'

const REASON_TEXT: Record<Reason, string> = {
  hungry: 'is hungry! Time for a snack.',
  tired: 'is exhausted. Maybe let them sleep?',
  dirty: 'could use a bath.',
  sad: 'is feeling down. Some love would help.',
}

function criticalStat(stats: PetStats): Reason | null {
  if (stats.fullness < CRITICAL_THRESHOLD) return 'hungry'
  if (stats.energy < CRITICAL_THRESHOLD) return 'tired'
  if (stats.cleanliness < CRITICAL_THRESHOLD) return 'dirty'
  if (stats.happiness < CRITICAL_THRESHOLD) return 'sad'
  return null
}

// Local only -- pet state is device-local (see CLAUDE.md), so the server has
// no way to know the cat needs attention and can't push this one for real.
// Only fires while this tab/app is alive (foreground or recently
// backgrounded), never from a fully-closed app -- unlike the message/update
// types, which are real server push.
export function useAttentionNotifications(
  name: string | undefined,
  stats: PetStats | undefined,
  sleeping: boolean,
  settings: NotificationSettings,
) {
  const lastNotifyAt = useRef(0)

  useEffect(() => {
    if (!stats || !name || sleeping) return
    if (!settings.global || !settings.attention) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    // Notification itself is required; a service worker is not (see below).
    if (!('serviceWorker' in navigator)) return

    const reason = criticalStat(stats)
    if (!reason) return

    const now = Date.now()
    if (now - lastNotifyAt.current < MIN_NOTIFY_INTERVAL_MS) return
    lastNotifyAt.current = now

    const title = 'Catmagochi'
    const options: NotificationOptions = {
      body: `${name} ${REASON_TEXT[reason]}`,
      icon: '/favicon.svg',
      tag: 'attention',
    }

    // The service worker is preferred -- its notification survives the app
    // being backgrounded, which is most of when this one matters. But there
    // isn't always one: vite-plugin-pwa only emits a worker on build, so in
    // dev `ready` never resolves and this alert could neither fire nor be
    // tested locally. A page-level Notification needs no worker at all.
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (registration) registration.showNotification(title, options)
        else new Notification(title, options)
      })
      .catch(() => {
        // Registration lookup can throw where storage is blocked entirely.
      })
  }, [stats, name, sleeping, settings.global, settings.attention])
}
