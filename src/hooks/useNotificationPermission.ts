import { useEffect, useRef, useState } from 'react'

// Whether the browser will let us show a notification at all.
// 'unsupported' means the API isn't there; the rest mirror the platform's own
// permission values.
export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

function currentPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

// Owns the OS permission prompt, and nothing else.
//
// This used to live inside usePushSubscription, which returns early when the
// relay/VAPID env vars aren't set. That made the prompt -- and therefore every
// notification, including the *local* "cat needs attention" one that needs no
// server at all -- silently conditional on relay configuration. Turning the
// setting on appeared to work and then nothing ever happened.
//
// Permission is a browser concern; push delivery is a relay concern. They are
// separate hooks now because they are separate problems.
export function useNotificationPermission(enabled: boolean): NotificationPermissionState {
  const [permission, setPermission] = useState<NotificationPermissionState>(currentPermission)
  // Browsers only prompt once per origin; asking again after an answer is
  // silently rejected, so there is no point spending a call on it.
  const asked = useRef(false)

  useEffect(() => {
    if (!enabled) return
    if (typeof Notification === 'undefined') {
      setPermission('unsupported')
      return
    }
    if (Notification.permission !== 'default') {
      setPermission(Notification.permission)
      return
    }
    if (asked.current) return
    asked.current = true

    let cancelled = false
    Notification.requestPermission()
      .then((result) => {
        if (!cancelled) setPermission(result)
      })
      .catch(() => {
        // Some browsers reject rather than resolving 'denied'. Either way we
        // simply never got permission; leave the state as it was.
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return permission
}
