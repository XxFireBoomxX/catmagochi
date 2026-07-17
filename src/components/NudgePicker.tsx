import { useState } from 'react'
import { NUDGE_OPTIONS } from '../data/nudges'
import './AsciiCat.css'
import './NudgePicker.css'

const INTRO_SEEN_KEY = 'catmagochi-nudge-intro-seen-v1'

export function NudgePicker({ onSend, onCancel }: { onSend: (text: string) => void; onCancel: () => void }) {
  const [showIntro] = useState(() => !localStorage.getItem(INTRO_SEEN_KEY))

  const close = (action: () => void) => {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
    action()
  }

  return (
    <div className="ascii-stage">
      <div className="ascii-screen nudge-picker">
        <div className="nudge-header">SEND A NUDGE</div>
        {showIntro && <div className="nudge-intro">Send a quick note instead of a game.</div>}
        <div className="nudge-options">
          {NUDGE_OPTIONS.map((text) => (
            <button key={text} className="nudge-option" onClick={() => close(() => onSend(text))}>
              {text}
            </button>
          ))}
        </div>
        <button className="nudge-cancel" onClick={() => close(onCancel)}>
          [ CANCEL ]
        </button>
      </div>
    </div>
  )
}
