import { useEffect, useRef, useState } from 'react'
import type { ActionCueType, Mood, Stage } from '../types'
import { buildFrame, IDLE_FRAME_COUNT } from '../data/asciiCat'
import './AsciiCat.css'

const EFFECT: Partial<Record<Mood, string>> = {
  happy: '*',
  hungry: '?',
  sad: ';;',
  dirty: '~',
  tired: '-.-',
}

// Floating glyph shown briefly over the cat right after each action button,
// same slot/timing as the pet-reaction heart below.
const ACTION_EFFECT: Record<ActionCueType, string> = {
  feed: 'nom nom',
  clean: '*scrub*',
  sleep: 'zzz',
  wake: 'o.o',
}

const BLINK_OPEN_MS = 2200
const BLINK_JITTER_MS = 800
const BLINK_CLOSED_MS = 200
const REACT_MS = 900
const IDLE_INTERVAL_MS = 900
const AMBIENT_POP_MIN_MS = 2200
const AMBIENT_POP_JITTER_MS = 1800

export function AsciiCat({
  mood,
  name,
  stage,
  onPet,
  actionCue,
}: {
  mood: Mood
  name: string
  stage: Stage
  onPet: () => boolean
  actionCue: { type: ActionCueType } | null
}) {
  const [frame, setFrame] = useState<0 | 1>(0)
  const [idleFrame, setIdleFrame] = useState(0)
  const [cueGlyph, setCueGlyph] = useState<string | null>(null)
  const [glyphPop, setGlyphPop] = useState<{ text: string; top: string; left: string; key: number } | null>(null)
  const reactTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const glyphKey = useRef(0)
  // Mirrors cueGlyph's truthiness, but as a ref so the ambient-popping effect
  // below can check it without a same-commit staleness race: on mount, every
  // effect fires once regardless of deps, so if this were read from cueGlyph
  // state instead, the ambient effect could run with the pre-update value
  // from before showCue's setCueGlyph had actually applied.
  const cueActiveRef = useRef(false)

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

  useEffect(() => {
    if (IDLE_FRAME_COUNT[stage] <= 1) return
    const id = setInterval(() => setIdleFrame((f) => f + 1), IDLE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [stage])

  useEffect(() => () => clearTimeout(reactTimer.current), [])

  // Pops the glyph at a fresh random spot every time it's called -- a new
  // key forces AsciiCat.css's one-shot float-up animation to restart from
  // the DOM rather than just re-triggering in place.
  const popGlyph = (text: string) => {
    glyphKey.current += 1
    setGlyphPop({
      text,
      top: `${-10 + Math.random() * 20}%`,
      left: `${10 + Math.random() * 60}%`,
      key: glyphKey.current,
    })
  }

  const showCue = (glyph: string) => {
    cueActiveRef.current = true
    setCueGlyph(glyph)
    popGlyph(glyph)
    clearTimeout(reactTimer.current)
    reactTimer.current = setTimeout(() => {
      cueActiveRef.current = false
      setCueGlyph(null)
      // Resume the ambient glyph immediately rather than waiting for the
      // next jittered ambient tick -- or clear the display outright for a
      // mood with no ambient glyph of its own.
      const ambientGlyph = EFFECT[mood]
      if (ambientGlyph) popGlyph(ambientGlyph)
      else setGlyphPop(null)
    }, REACT_MS)
  }

  useEffect(() => {
    if (!actionCue) return
    showCue(ACTION_EFFECT[actionCue.type])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionCue])

  const handlePet = () => {
    if (onPet()) showCue('<3')
  }

  // The ambient mood glyph re-pops at a new random spot on a jittered loop,
  // same "appear somewhere new, fade, repeat" feel as the floating mood
  // caption in App.tsx -- rather than sitting at one spot and looping the
  // float animation in place forever. Runs continuously (restarting only on
  // mood change) and checks cueActiveRef at pop-time so it can't stomp on a
  // cue that's currently showing.
  useEffect(() => {
    const ambientGlyph = EFFECT[mood]

    let ambientTimer: ReturnType<typeof setTimeout>
    const scheduleNextPop = () => {
      const delay = AMBIENT_POP_MIN_MS + Math.random() * AMBIENT_POP_JITTER_MS
      ambientTimer = setTimeout(() => {
        if (!cueActiveRef.current) popGlyph(ambientGlyph!)
        scheduleNextPop()
      }, delay)
    }

    if (!cueActiveRef.current) {
      if (ambientGlyph) popGlyph(ambientGlyph)
      else setGlyphPop(null)
    }
    if (ambientGlyph) scheduleNextPop()

    return () => clearTimeout(ambientTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood])

  return (
    <div className="ascii-stage">
      {glyphPop && (
        <div key={glyphPop.key} className="cat-effect" style={{ top: glyphPop.top, left: glyphPop.left, right: 'auto' }}>
          {glyphPop.text}
        </div>
      )}
      <div
        className={`ascii-screen${cueGlyph ? ' reacting' : ''}`}
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
        <pre key={mood} className={`cat-sprite stage-${stage}`}>{buildFrame(mood, frame, stage, idleFrame)}</pre>
      </div>
    </div>
  )
}
