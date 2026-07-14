import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YarnGame } from './YarnGame'

function getEl() {
  return screen.getByRole('button', { name: 'Catch the yarn' })
}

describe('YarnGame', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in the waiting phase with no yarn visible', () => {
    render(<YarnGame onComplete={() => {}} />)
    expect(screen.getByText('get ready...')).toBeInTheDocument()
    expect(screen.getByText('ROUND 1/3')).toBeInTheDocument()
    expect(document.querySelector('.yarn-track')!.textContent).toBe('. . . . .')
  })

  it('shows the yarn and switches to TAP NOW! after the delay', () => {
    render(<YarnGame onComplete={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(500) // MIN_DELAY_MS with 0 jitter
    })
    expect(screen.getByText('TAP NOW!')).toBeInTheDocument()
    expect(document.querySelector('.yarn-track')!.textContent).toBe('o . . . .')
  })

  it('registers a hit when tapped during the active window', () => {
    render(<YarnGame onComplete={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.click(getEl())
    expect(screen.getByText('caught!')).toBeInTheDocument()
    expect(document.querySelector('.yarn-track')!.textContent).toBe('. . . . .')
  })

  it('ignores taps outside the active window', () => {
    render(<YarnGame onComplete={() => {}} />)
    fireEvent.click(getEl()) // still 'waiting', yarn not shown yet
    expect(screen.getByText('get ready...')).toBeInTheDocument()
  })

  it('registers a miss when the active window times out untapped', () => {
    render(<YarnGame onComplete={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    act(() => {
      vi.advanceTimersByTime(700) // ACTIVE_WINDOW_MS
    })
    expect(screen.getByText('missed...')).toBeInTheDocument()
  })

  it('advances to the next round after a hit', () => {
    render(<YarnGame onComplete={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.click(getEl())
    act(() => {
      vi.advanceTimersByTime(600) // RESULT_PAUSE_MS
    })
    expect(screen.getByText('ROUND 2/3')).toBeInTheDocument()
    expect(screen.getByText('get ready...')).toBeInTheDocument()
  })

  it('triggers a hit via keyboard Enter during the active window', () => {
    render(<YarnGame onComplete={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.keyDown(getEl(), { key: 'Enter' })
    expect(screen.getByText('caught!')).toBeInTheDocument()
  })

  it('ignores keys other than Enter/Space', () => {
    render(<YarnGame onComplete={() => {}} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.keyDown(getEl(), { key: 'a' })
    expect(screen.getByText('TAP NOW!')).toBeInTheDocument()
  })

  it('plays through all 3 rounds and reports the hit count via onComplete', () => {
    const onComplete = vi.fn()
    render(<YarnGame onComplete={onComplete} />)
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(500)
      })
      fireEvent.click(getEl())
      act(() => {
        vi.advanceTimersByTime(600)
      })
    }
    expect(screen.getByText('PURRFECT! 3/3')).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1_600) // SUMMARY_MS
    })
    expect(onComplete).toHaveBeenCalledWith(3)
  })

  it('reports a mixed hit/miss run correctly', () => {
    const onComplete = vi.fn()
    render(<YarnGame onComplete={onComplete} />)
    // round 1: hit
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.click(getEl())
    act(() => {
      vi.advanceTimersByTime(600)
    })
    // round 2: miss
    act(() => {
      vi.advanceTimersByTime(500)
    })
    act(() => {
      vi.advanceTimersByTime(700)
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    // round 3: hit
    act(() => {
      vi.advanceTimersByTime(500)
    })
    fireEvent.click(getEl())
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByText('NICE! 2/3')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1_600)
    })
    expect(onComplete).toHaveBeenCalledWith(2)
  })

  it('reports zero hits when every round is missed', () => {
    const onComplete = vi.fn()
    render(<YarnGame onComplete={onComplete} />)
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(500)
      })
      act(() => {
        vi.advanceTimersByTime(700)
      })
      act(() => {
        vi.advanceTimersByTime(600)
      })
    }
    expect(screen.getByText('MISSED ALL... 0/3')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1_600)
    })
    expect(onComplete).toHaveBeenCalledWith(0)
  })

  it('cleans up timers on unmount without throwing', () => {
    const { unmount } = render(<YarnGame onComplete={() => {}} />)
    unmount()
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
    }).not.toThrow()
  })
})
