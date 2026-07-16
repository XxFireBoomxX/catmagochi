import { NUDGE_OPTIONS } from '../data/nudges'
import './AsciiCat.css'
import './NudgePicker.css'

export function NudgePicker({ onSend, onCancel }: { onSend: (text: string) => void; onCancel: () => void }) {
  return (
    <div className="ascii-stage">
      <div className="ascii-screen nudge-picker">
        <div className="nudge-header">SEND A NUDGE</div>
        <div className="nudge-options">
          {NUDGE_OPTIONS.map((text) => (
            <button key={text} className="nudge-option" onClick={() => onSend(text)}>
              {text}
            </button>
          ))}
        </div>
        <button className="nudge-cancel" onClick={onCancel}>
          [ CANCEL ]
        </button>
      </div>
    </div>
  )
}
