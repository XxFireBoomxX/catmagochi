import { useCallback, useState } from 'react'

export interface NotificationSettings {
  global: boolean
  message: boolean
  attention: boolean
  update: boolean
}

const SETTINGS_KEY = 'catmagochi-notification-settings-v1'

// Opt-in by default -- never presume the user wants OS notification prompts
// without them explicitly turning this on in the menu.
const DEFAULT_SETTINGS: NotificationSettings = {
  global: false,
  message: true,
  attention: true,
  update: true,
}

function loadSettings(): NotificationSettings {
  const raw = localStorage.getItem(SETTINGS_KEY)
  if (!raw) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<NotificationSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings)

  const update = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { settings, update }
}
