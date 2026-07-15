import { useEffect, useRef, useState } from 'react'
import './StartScreen.css'

export const START_DISPLAY_MS = 900
export const START_FADE_MS = 300
export const START_TOTAL_MS = START_DISPLAY_MS + START_FADE_MS

export function StartScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), START_DISPLAY_MS)
    const doneTimer = setTimeout(() => onDoneRef.current(), START_TOTAL_MS)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [])

  return (
    <div className={`start-screen${fading ? ' fading' : ''}`}>
      <h1>Catmagochi</h1>
      <p className="start-boot">
        booting<span className="start-cursor">_</span>
      </p>
    </div>
  )
}
