import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { RelayMessage } from '../types'
import { usePwaUpdate, type PwaUpdateStatus } from '../hooks/usePwaUpdate'
import { useNativeUpdate, type NativeUpdateStatus } from '../hooks/useNativeUpdate'
import type { NotificationSettings } from '../hooks/useNotificationSettings'
import type { PushStatus } from '../hooks/usePushSubscription'
import './Menu.css'

type MenuView = 'root' | 'history' | 'update' | 'settings'

const MENU_ITEMS: { label: string; view: MenuView }[] = [
  { label: 'MESSAGE HISTORY', view: 'history' },
  { label: 'CHECK FOR UPDATES', view: 'update' },
  { label: 'SETTINGS', view: 'settings' },
]

const PUSH_STATUS_TEXT: Partial<Record<PushStatus, string>> = {
  unsupported: "Push notifications aren't supported on this browser/device.",
  denied: 'Notifications are blocked — enable them in your browser/OS settings.',
  error: "Couldn't set up notifications. Check your connection and try again.",
}

// Native (Capacitor APK): a GitHub-releases web-bundle OTA check.
// Browser/PWA: the Service Worker check — kept entirely separate hooks
// since they check fundamentally different things (see useNativeUpdate.ts
// vs usePwaUpdate.ts); Menu just picks which one applies.
const PWA_UPDATE_STATUS_TEXT: Record<PwaUpdateStatus, string> = {
  idle: '',
  checking: 'Checking for updates...',
  'up-to-date': "You're on the latest version.",
  updating: 'Update found and ready. Tap Reload to apply it.',
  error: "Couldn't check for updates. Make sure you're online.",
  unsupported: "Updates aren't available yet. Try again in a moment.",
}

const NATIVE_UPDATE_STATUS_TEXT: Record<NativeUpdateStatus, string> = {
  idle: '',
  checking: 'Checking for updates...',
  'up-to-date': "You're on the latest version.",
  downloading: 'Downloading update...',
  ready: 'Update downloaded and ready. Tap Reload to apply it.',
  error: "Couldn't check for updates. Make sure you're online.",
}

function formatTime(sentAt: number): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const d = new Date(sentAt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${months[d.getMonth()]} ${d.getDate()} ${hh}:${mm}`
}

export function Menu({
  open,
  history,
  onClose,
  notificationSettings,
  onUpdateNotificationSettings,
  pushStatus,
}: {
  open: boolean
  history: RelayMessage[]
  onClose: () => void
  notificationSettings: NotificationSettings
  onUpdateNotificationSettings: (patch: Partial<NotificationSettings>) => void
  pushStatus: PushStatus
}) {
  const [view, setView] = useState<MenuView>('root')
  const isNative = Capacitor.isNativePlatform()
  const pwaUpdate = usePwaUpdate()
  const nativeUpdate = useNativeUpdate()

  useEffect(() => {
    if (open) setView('root')
  }, [open])

  useEffect(() => {
    if (view !== 'update') return
    if (isNative) nativeUpdate.checkForUpdate()
    else pwaUpdate.checkForUpdate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  if (!open) return null

  const update = isNative
    ? {
        text: NATIVE_UPDATE_STATUS_TEXT[nativeUpdate.status],
        checking: nativeUpdate.status === 'checking' || nativeUpdate.status === 'downloading',
        ready: nativeUpdate.status === 'ready',
        onApply: nativeUpdate.applyUpdate,
        onRecheck: nativeUpdate.checkForUpdate,
      }
    : {
        text: PWA_UPDATE_STATUS_TEXT[pwaUpdate.status],
        checking: pwaUpdate.status === 'checking',
        ready: pwaUpdate.status === 'updating',
        onApply: () => window.location.reload(),
        onRecheck: pwaUpdate.checkForUpdate,
      }

  return (
    <div className="menu-overlay">
      <div className="menu-panel">
        {view === 'root' && (
          <>
            <div className="menu-title">MENU</div>
            <div className="menu-list">
              {MENU_ITEMS.map((item) => (
                <button key={item.view} className="menu-item" onClick={() => setView(item.view)}>
                  {item.label}
                </button>
              ))}
            </div>
            <button className="menu-close" onClick={onClose}>[ CLOSE ]</button>
          </>
        )}

        {view === 'history' && (
          <>
            <div className="menu-title">MESSAGE HISTORY</div>
            <div className="menu-history-list">
              {history.length === 0 ? (
                <p className="menu-empty">No messages yet.</p>
              ) : (
                history.map((m) => (
                  <div key={m.id} className="menu-history-item">
                    <div className="menu-history-time">{formatTime(m.sentAt)}</div>
                    <div className="menu-history-text">{m.text}</div>
                  </div>
                ))
              )}
            </div>
            <button className="menu-close" onClick={() => setView('root')}>[ BACK ]</button>
          </>
        )}

        {view === 'update' && (
          <>
            <div className="menu-title">APP UPDATE</div>
            <p className="menu-update-status">{update.text}</p>
            {update.ready ? (
              <button className="menu-item" onClick={update.onApply}>[ RELOAD NOW ]</button>
            ) : (
              <button className="menu-item" onClick={update.onRecheck} disabled={update.checking}>
                [ CHECK AGAIN ]
              </button>
            )}
            <button className="menu-close" onClick={() => setView('root')}>[ BACK ]</button>
          </>
        )}

        {view === 'settings' && (
          <>
            <div className="menu-title">SETTINGS</div>
            <div className="menu-settings-list">
              <div className="menu-settings-row">
                <span className="menu-settings-label">Notifications</span>
                <button
                  className={`menu-toggle${notificationSettings.global ? ' on' : ''}`}
                  onClick={() => onUpdateNotificationSettings({ global: !notificationSettings.global })}
                >
                  {notificationSettings.global ? '[ON]' : '[OFF]'}
                </button>
              </div>
              <div className="menu-settings-row menu-settings-sub">
                <span className="menu-settings-label">Messages</span>
                <button
                  className={`menu-toggle${notificationSettings.message ? ' on' : ''}`}
                  onClick={() => onUpdateNotificationSettings({ message: !notificationSettings.message })}
                  disabled={!notificationSettings.global}
                >
                  {notificationSettings.message ? '[ON]' : '[OFF]'}
                </button>
              </div>
              <div className="menu-settings-row menu-settings-sub">
                <span className="menu-settings-label">Cat needs attention</span>
                <button
                  className={`menu-toggle${notificationSettings.attention ? ' on' : ''}`}
                  onClick={() => onUpdateNotificationSettings({ attention: !notificationSettings.attention })}
                  disabled={!notificationSettings.global}
                >
                  {notificationSettings.attention ? '[ON]' : '[OFF]'}
                </button>
              </div>
              <div className="menu-settings-row menu-settings-sub">
                <span className="menu-settings-label">Update available</span>
                <button
                  className={`menu-toggle${notificationSettings.update ? ' on' : ''}`}
                  onClick={() => onUpdateNotificationSettings({ update: !notificationSettings.update })}
                  disabled={!notificationSettings.global}
                >
                  {notificationSettings.update ? '[ON]' : '[OFF]'}
                </button>
              </div>
            </div>
            <p className="menu-settings-note">
              "Cat needs attention" only fires while the app is open — the others work even when it's closed.
            </p>
            {PUSH_STATUS_TEXT[pushStatus] && <p className="menu-update-status">{PUSH_STATUS_TEXT[pushStatus]}</p>}
            <button className="menu-close" onClick={() => setView('root')}>[ BACK ]</button>
          </>
        )}
      </div>
    </div>
  )
}
