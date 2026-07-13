import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { RelayMessage } from '../types'
import { usePwaUpdate, type PwaUpdateStatus } from '../hooks/usePwaUpdate'
import { useNativeUpdate, type NativeUpdateStatus } from '../hooks/useNativeUpdate'
import './Menu.css'

type MenuView = 'root' | 'history' | 'update'

const MENU_ITEMS: { label: string; view: MenuView }[] = [
  { label: 'MESSAGE HISTORY', view: 'history' },
  { label: 'CHECK FOR UPDATES', view: 'update' },
]

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

export function Menu({ open, history, onClose }: { open: boolean; history: RelayMessage[]; onClose: () => void }) {
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
      </div>
    </div>
  )
}
