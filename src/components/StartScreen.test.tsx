import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartScreen, START_DISPLAY_MS, START_TOTAL_MS } from './StartScreen'

describe('StartScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the title and a booting line', () => {
    render(<StartScreen onDone={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Catmagochi' })).toBeInTheDocument()
    expect(screen.getByText('booting', { exact: false })).toBeInTheDocument()
  })

  it('is not fading immediately on mount', () => {
    render(<StartScreen onDone={() => {}} />)
    expect(document.querySelector('.start-screen')).not.toHaveClass('fading')
  })

  it('starts fading after the display duration, before onDone fires', () => {
    const onDone = vi.fn()
    render(<StartScreen onDone={onDone} />)
    act(() => {
      vi.advanceTimersByTime(START_DISPLAY_MS)
    })
    expect(document.querySelector('.start-screen')).toHaveClass('fading')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('calls onDone once the full display + fade duration elapses', () => {
    const onDone = vi.fn()
    render(<StartScreen onDone={onDone} />)
    act(() => {
      vi.advanceTimersByTime(START_TOTAL_MS)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('calls the latest onDone even if the prop identity changes after mount', () => {
    const firstOnDone = vi.fn()
    const secondOnDone = vi.fn()
    const { rerender } = render(<StartScreen onDone={firstOnDone} />)
    rerender(<StartScreen onDone={secondOnDone} />)
    act(() => {
      vi.advanceTimersByTime(START_TOTAL_MS)
    })
    expect(firstOnDone).not.toHaveBeenCalled()
    expect(secondOnDone).toHaveBeenCalledTimes(1)
  })

  it('clears its timers on unmount, never calling onDone', () => {
    const onDone = vi.fn()
    const { unmount } = render(<StartScreen onDone={onDone} />)
    unmount()
    act(() => {
      vi.advanceTimersByTime(START_TOTAL_MS)
    })
    expect(onDone).not.toHaveBeenCalled()
  })
})
