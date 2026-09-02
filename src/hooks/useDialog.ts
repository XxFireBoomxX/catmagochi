import { useEffect, useRef } from 'react'

// Everything natively keyboard-reachable that this app actually renders in a
// panel. Deliberately narrow: the overlays only ever contain buttons today.
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

// Shared behaviour for the two full-card overlays (Menu, StatsWindow). They
// sit on top of the game card, but the card underneath stayed fully
// keyboard-reachable: Tab walked out of the panel onto FEED/PLAY/CLEAN and
// Enter fired them through an overlay you couldn't see past, with no Escape
// to get out and no focus ring to show where you were.
//
// `focusKey` re-runs the focus-in step when the panel swaps its own contents
// (Menu's root/history/update/settings views) -- otherwise focus is left on a
// button that no longer exists and falls back to <body>, outside the trap.
export function useDialog(open: boolean, onClose: () => void, focusKey?: unknown) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    // Captured before focus moves into the panel, so closing hands it back to
    // whatever opened the overlay rather than dumping the user at <body>.
    const restoreTo = document.activeElement as HTMLElement | null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !panel.contains(active)
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreTo?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [open, focusKey])

  return panelRef
}
