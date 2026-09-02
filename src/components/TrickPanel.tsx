import { useState } from 'react'
import { StatBar } from './StatBar'
import { useTricks, todayKey } from '../hooks/useTricks'
import { TRICK_POINTS, type Trick } from '../data/tricks'
import {
  APPROACHES,
  APPROACH_OUTCOME,
  LESSON_MOOD_LABEL,
  MOOD_INTRO,
  fillLine,
  lessonMoodForDay,
  rollOutcome,
  type Approach,
} from '../data/lessons'
import './AsciiCat.css'
import './TrickPanel.css'

// How often she actually does a trick you ask her to perform. Deliberately
// short of certain: a cat that always obeys is a machine, and the refusal
// lines are the funniest thing in the feature.
const PERFORM_SUCCESS_CHANCE = 0.75

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

type View = 'lesson' | 'result' | 'showoff'

// Replaces AsciiCat in the shared panel slot while [PLAY] is open, the same
// way NudgePicker did -- hence the shared `.ascii-screen` chrome.
export function TrickPanel({
  name,
  onLessonDone,
  onPerform,
  onClose,
}: {
  name: string
  onLessonDone: () => void
  onPerform: () => void
  onClose: () => void
}) {
  const { lessonAvailable, currentTrick, progress, learnedTricks, totalTricks, recordLesson } = useTricks()
  // Read once on open, not per render: the lesson's mood must not change
  // underneath the choice being made.
  const [mood] = useState(() => lessonMoodForDay(todayKey()))
  const [intro] = useState(() => pick(MOOD_INTRO[lessonMoodForDay(todayKey())]))
  const [view, setView] = useState<View>(lessonAvailable ? 'lesson' : 'showoff')
  const [resultLine, setResultLine] = useState('')
  const [justLearned, setJustLearned] = useState<Trick | null>(null)
  const [performLine, setPerformLine] = useState<string | null>(null)

  const fill = (line: string, trick: string) => fillLine(line, { name, trick })

  const takeLesson = (approach: Approach) => {
    if (!currentTrick) return
    const outcome = rollOutcome(mood, approach, Math.random())
    setResultLine(fill(pick(APPROACH_OUTCOME[approach][outcome]), currentTrick.name))
    setJustLearned(recordLesson(outcome))
    setView('result')
    onLessonDone()
  }

  const performTrick = (trick: Trick) => {
    const succeeded = Math.random() < PERFORM_SUCCESS_CHANCE
    setPerformLine(fill(pick(succeeded ? trick.success : trick.refusal), trick.name))
    onPerform()
  }

  if (view === 'lesson' && currentTrick) {
    return (
      <div className="ascii-stage">
        <div className="ascii-screen trick-panel">
          <div className="trick-header">TEACHING: {currentTrick.name}</div>
          <p className="trick-mood">
            {name} {LESSON_MOOD_LABEL[mood]}.
          </p>
          <p className="trick-intro">{intro}</p>
          <div className="trick-options">
            {APPROACHES.map((approach) => (
              <button key={approach.id} className="trick-option" onClick={() => takeLesson(approach.id)}>
                {approach.label}
              </button>
            ))}
          </div>
          <button className="trick-back" onClick={onClose}>
            [ BACK ]
          </button>
        </div>
      </div>
    )
  }

  if (view === 'result') {
    return (
      <div className="ascii-stage">
        <div className="ascii-screen trick-panel">
          <p className="trick-result">{resultLine}</p>
          {justLearned ? (
            <p className="trick-learned">SHE LEARNED {justLearned.name.toUpperCase()}!</p>
          ) : currentTrick ? (
            <StatBar
              code="LEARN"
              label={`Learning ${currentTrick.name}`}
              value={(progress / TRICK_POINTS) * 100}
            />
          ) : null}
          <button className="trick-option" onClick={() => setView('showoff')}>
            [ DONE ]
          </button>
        </div>
      </div>
    )
  }

  // Never a dead end: once the lesson is spent, the panel becomes a place to
  // ask for what she already knows, as often as you like.
  return (
    <div className="ascii-stage">
      <div className="ascii-screen trick-panel">
        <div className="trick-header">
          {learnedTricks.length > 0 ? `SHE KNOWS ${learnedTricks.length}/${totalTricks}` : 'NOT YET'}
        </div>
        {performLine && <p className="trick-result">{performLine}</p>}
        {learnedTricks.length > 0 ? (
          <div className="trick-options">
            {learnedTricks.map((trick) => (
              <button key={trick.id} className="trick-option" onClick={() => performTrick(trick)}>
                {trick.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="trick-intro">Nothing learned yet. Keep at it.</p>
        )}
        <p className="trick-next">
          {currentTrick ? 'next lesson: tomorrow' : `${name} knows every trick there is.`}
        </p>
        <button className="trick-back" onClick={onClose}>
          [ BACK ]
        </button>
      </div>
    </div>
  )
}
