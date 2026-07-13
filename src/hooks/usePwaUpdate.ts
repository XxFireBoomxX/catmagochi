import { useCallback, useState } from 'react'

export type PwaUpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'updating' | 'error' | 'unsupported'

export function usePwaUpdate() {
  const [status, setStatus] = useState<PwaUpdateStatus>('idle')

  const checkForUpdate = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }
    setStatus('checking')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) {
        setStatus('unsupported')
        return
      }
      await registration.update()
      setStatus(registration.installing || registration.waiting ? 'updating' : 'up-to-date')
    } catch {
      setStatus('error')
    }
  }, [])

  return { status, checkForUpdate }
}
