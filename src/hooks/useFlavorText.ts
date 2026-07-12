import { useEffect, useState } from 'react'
import type { Mood } from '../types'
import { FLAVOR_TEXT, GENERIC_FLAVOR, MOOD_LABEL } from '../data/flavorText'

const IDLE_CHECK_MIN_MS = 6_000
const IDLE_CHECK_JITTER_MS = 4_000
const FLAVOR_SHOW_MS = 3_500
const FLAVOR_CHANCE = 0.55

function randomOf<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function useFlavorText(mood: Mood): string {
  const [text, setText] = useState(MOOD_LABEL[mood])

  useEffect(() => {
    setText(MOOD_LABEL[mood])

    let idleTimer: ReturnType<typeof setTimeout>
    let revertTimer: ReturnType<typeof setTimeout>

    const scheduleIdleCheck = () => {
      const delay = IDLE_CHECK_MIN_MS + Math.random() * IDLE_CHECK_JITTER_MS
      idleTimer = setTimeout(() => {
        if (Math.random() < FLAVOR_CHANCE) {
          const pool = FLAVOR_TEXT[mood] ?? GENERIC_FLAVOR
          setText(randomOf(pool))
          revertTimer = setTimeout(() => {
            setText(MOOD_LABEL[mood])
            scheduleIdleCheck()
          }, FLAVOR_SHOW_MS)
        } else {
          scheduleIdleCheck()
        }
      }, delay)
    }

    scheduleIdleCheck()

    return () => {
      clearTimeout(idleTimer)
      clearTimeout(revertTimer)
    }
  }, [mood])

  return text
}
