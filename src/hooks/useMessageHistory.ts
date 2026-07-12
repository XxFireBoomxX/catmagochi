import { useCallback, useState } from 'react'
import type { RelayMessage } from '../types'

const HISTORY_KEY = 'catmagochi-message-history-v1'
const MAX_HISTORY = 50

function loadHistory(): RelayMessage[] {
  const raw = localStorage.getItem(HISTORY_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as RelayMessage[]
  } catch {
    return []
  }
}

export function useMessageHistory() {
  const [history, setHistory] = useState<RelayMessage[]>(loadHistory)

  const record = useCallback((message: RelayMessage) => {
    setHistory((current) => {
      const next = [message, ...current].slice(0, MAX_HISTORY)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { history, record }
}
