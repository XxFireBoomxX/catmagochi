import type { RelayMessage } from '../types'
import './AsciiCat.css'
import './MessageView.css'

export function MessageView({ message, onDismiss }: { message: RelayMessage; onDismiss: () => void }) {
  return (
    <div className="ascii-stage">
      <div
        className="ascii-screen message-view"
        role="button"
        tabIndex={0}
        aria-label="Dismiss message"
        onClick={onDismiss}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onDismiss()
          }
        }}
      >
        <div className="message-header">{'<3'} FROM HOME</div>
        <p className="message-text">{message.text}</p>
        <div className="message-hint">-- tap to continue --</div>
      </div>
    </div>
  )
}
