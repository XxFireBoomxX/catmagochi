import type { Mood, PetSave, Stage } from '../types'
import { STAGE_LABEL } from '../data/growth'
import { useDialog } from '../hooks/useDialog'
import './Menu.css'
import './StatsWindow.css'

function daysAgo(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function StatsWindow({
  open,
  save,
  mood,
  stage,
  onClose,
}: {
  open: boolean
  save: PetSave
  mood: Mood
  stage: Stage
  onClose: () => void
}) {
  // Called before the early return: hooks can't be conditional, and the
  // overlay needs the same Escape/focus-trap behaviour as Menu.
  const panelRef = useDialog(open, onClose)

  if (!open) return null

  const rows: [string, string][] = [
    ['Stage', STAGE_LABEL[stage]],
    ['Mood', mood],
    ['Growth', String(save.growth)],
    ['Adopted', daysAgo(save.adoptedAt)],
    ['Fullness', `${Math.round(save.stats.fullness)}%`],
    ['Happiness', `${Math.round(save.stats.happiness)}%`],
    ['Energy', `${Math.round(save.stats.energy)}%`],
    ['Cleanliness', `${Math.round(save.stats.cleanliness)}%`],
    ['Times fed', String(save.totalFeeds)],
    ['Times played', String(save.totalPlays)],
    ['Times cleaned', String(save.totalCleans)],
    ['Times petted', String(save.totalPets)],
  ]

  return (
    <div className="menu-overlay">
      <div className="menu-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="stats-window-title">
        <div className="menu-title" id="stats-window-title">{save.name}'S STATS</div>
        <div className="stats-window-body">
          {rows.map(([label, value]) => (
            <div key={label} className="stats-row">
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
        <button className="menu-close" onClick={onClose}>[ CLOSE ]</button>
      </div>
    </div>
  )
}
