import { useEffect, useState } from 'react'
import type { RelayMessage } from '../types'
import './Menu.css'

type MenuView = 'root' | 'history'

const MENU_ITEMS: { label: string; view: MenuView }[] = [
  { label: 'MESSAGE HISTORY', view: 'history' },
]

function formatTime(sentAt: number): string {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const d = new Date(sentAt)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${months[d.getMonth()]} ${d.getDate()} ${hh}:${mm}`
}

export function Menu({ open, history, onClose }: { open: boolean; history: RelayMessage[]; onClose: () => void }) {
  const [view, setView] = useState<MenuView>('root')

  useEffect(() => {
    if (open) setView('root')
  }, [open])

  if (!open) return null

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
      </div>
    </div>
  )
}
