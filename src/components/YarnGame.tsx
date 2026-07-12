import { useEffect, useRef, useState } from 'react'
import './AsciiCat.css'
import './YarnGame.css'

const ROUNDS = 3
const TRACK_SIZE = 5
const MIN_DELAY_MS = 500
const MAX_DELAY_MS = 1400
const ACTIVE_WINDOW_MS = 700
const RESULT_PAUSE_MS = 600
const SUMMARY_MS = 1600

type Phase = 'waiting' | 'active' | 'hit' | 'miss' | 'summary'

const SUMMARY_TEXT = ['MISSED ALL... 0/3', 'OK... 1/3', 'NICE! 2/3', 'PURRFECT! 3/3']

export function YarnGame({ onComplete }: { onComplete: (hits: number) => void }) {
  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState<Phase>('waiting')
  const [yarnIndex, setYarnIndex] = useState(-1)
  const hitsRef = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const advance = () => {
    const resultTimer = setTimeout(() => {
      if (round + 1 >= ROUNDS) {
        setPhase('summary')
        const doneTimer = setTimeout(() => onComplete(hitsRef.current), SUMMARY_MS)
        timers.current.push(doneTimer)
      } else {
        setRound((r) => r + 1)
      }
    }, RESULT_PAUSE_MS)
    timers.current.push(resultTimer)
  }

  useEffect(() => {
    clearTimers()
    setPhase('waiting')
    setYarnIndex(-1)

    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)
    const showTimer = setTimeout(() => {
      setYarnIndex(Math.floor(Math.random() * TRACK_SIZE))
      setPhase('active')
      const missTimer = setTimeout(() => {
        setPhase('miss')
        setYarnIndex(-1)
        advance()
      }, ACTIVE_WINDOW_MS)
      timers.current.push(missTimer)
    }, delay)
    timers.current.push(showTimer)

    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  useEffect(() => () => clearTimers(), [])

  const handleTap = () => {
    if (phase !== 'active') return
    clearTimers()
    setPhase('hit')
    setYarnIndex(-1)
    hitsRef.current += 1
    advance()
  }

  const track = Array.from({ length: TRACK_SIZE }, (_, i) => (i === yarnIndex ? 'o' : '.')).join(' ')

  const status =
    phase === 'waiting' ? 'get ready...' :
    phase === 'active' ? 'TAP NOW!' :
    phase === 'hit' ? 'caught!' :
    phase === 'miss' ? 'missed...' :
    SUMMARY_TEXT[hitsRef.current]

  return (
    <div className="ascii-stage">
      <div
        className="ascii-screen yarn-game"
        role="button"
        tabIndex={0}
        aria-label="Catch the yarn"
        onClick={handleTap}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleTap()
          }
        }}
      >
        {phase === 'summary' ? (
          <pre className="yarn-summary">{status}</pre>
        ) : (
          <>
            <div className="yarn-round">ROUND {round + 1}/{ROUNDS}</div>
            <pre className="yarn-track">{track}</pre>
            <div className="yarn-status">{status}</div>
          </>
        )}
      </div>
    </div>
  )
}
