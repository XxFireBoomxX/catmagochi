import { useEffect, useRef, useState } from 'react'
import type { Mood, Stage } from '../types'
import { buildFrame } from '../data/asciiCat'
import './AsciiCat.css'

const EFFECT: Partial<Record<Mood, string>> = {
  happy: '*',
  hungry: '?',
  sad: ';;',
  dirty: '~',
  tired: '-.-',
}

const BLINK_OPEN_MS = 2200
const BLINK_JITTER_MS = 800
const BLINK_CLOSED_MS = 200
const REACT_MS = 900

export function AsciiCat({
  mood,
  name,
  stage,
  onPet,
}: {
  mood: Mood
  name: string
  stage: Stage
  onPet: () => boolean
}) {
  const [frame, setFrame] = useState<0 | 1>(0)
  const [reacting, setReacting] = useState(false)
  const reactTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setFrame(0)
    let openTimer: ReturnType<typeof setTimeout>
    let closeTimer: ReturnType<typeof setTimeout>

    const scheduleBlink = () => {
      const delay = BLINK_OPEN_MS + Math.random() * BLINK_JITTER_MS
      openTimer = setTimeout(() => {
        setFrame(1)
        closeTimer = setTimeout(() => {
          setFrame(0)
          scheduleBlink()
        }, BLINK_CLOSED_MS)
      }, delay)
    }

    scheduleBlink()
    return () => {
      clearTimeout(openTimer)
      clearTimeout(closeTimer)
    }
  }, [mood])

  useEffect(() => () => clearTimeout(reactTimer.current), [])

  const handlePet = () => {
    if (onPet()) {
      setReacting(true)
      clearTimeout(reactTimer.current)
      reactTimer.current = setTimeout(() => setReacting(false), REACT_MS)
    }
  }

  const effectGlyph = reacting ? '<3' : EFFECT[mood]

  return (
    <div className="ascii-stage">
      {effectGlyph && <div className="cat-effect">{effectGlyph}</div>}
      <div
        className={`ascii-screen${reacting ? ' reacting' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Pet ${name}`}
        onClick={handlePet}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handlePet()
          }
        }}
      >
        <pre key={mood}>{buildFrame(mood, frame, stage)}</pre>
      </div>
    </div>
  )
}
