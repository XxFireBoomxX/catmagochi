import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsciiCat } from './AsciiCat'
import { buildFrame } from '../data/asciiCat'

describe('AsciiCat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the open-eyed idle frame on mount', () => {
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
    const pre = document.querySelector('.cat-sprite')!
    expect(pre.textContent).toBe(buildFrame('happy', 0, 'kitten', 0))
    expect(pre).toHaveClass('stage-kitten')
  })

  it('shows the mood effect glyph for moods that have one', () => {
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
    expect(document.querySelector('.cat-effect')?.textContent).toBe('*')
  })

  it('shows no effect glyph for moods without one (e.g. content)', () => {
    render(<AsciiCat mood="content" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
    expect(document.querySelector('.cat-effect')).toBeNull()
  })

  it('calls onPet when the screen is clicked', () => {
    const onPet = vi.fn().mockReturnValue(true)
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} actionCue={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
    expect(onPet).toHaveBeenCalledTimes(1)
  })

  it('shows the heart reaction glyph after a successful pet, then reverts', () => {
    const onPet = vi.fn().mockReturnValue(true)
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} actionCue={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
    expect(document.querySelector('.cat-effect')?.textContent).toBe('<3')
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(document.querySelector('.cat-effect')?.textContent).toBe('*')
  })

  it('does not react when onPet reports the pet did not apply (e.g. cooldown)', () => {
    const onPet = vi.fn().mockReturnValue(false)
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} actionCue={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
    expect(document.querySelector('.cat-effect')?.textContent).toBe('*')
  })

  it('triggers pet on Enter and Space keys, not other keys', () => {
    const onPet = vi.fn().mockReturnValue(true)
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} actionCue={null} />)
    const el = screen.getByRole('button', { name: 'Pet Mochi' })
    fireEvent.keyDown(el, { key: 'Enter' })
    fireEvent.keyDown(el, { key: ' ' })
    fireEvent.keyDown(el, { key: 'a' })
    expect(onPet).toHaveBeenCalledTimes(2)
  })

  it('closes the eyes during a blink and reopens after', () => {
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
    const pre = () => document.querySelector('.cat-sprite')!
    expect(pre().textContent).not.toContain('⠉⠉⠉⠉⠉⠉')
    act(() => {
      vi.advanceTimersByTime(2_200) // BLINK_OPEN_MS with 0 jitter
    })
    expect(pre().textContent).toContain('⠉⠉⠉⠉⠉⠉')
    act(() => {
      vi.advanceTimersByTime(200) // BLINK_CLOSED_MS
    })
    expect(pre().textContent).not.toContain('⠉⠉⠉⠉⠉⠉')
  })

  it('wanders the idle pupils over time while awake', () => {
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
    const initial = document.querySelector('.cat-sprite')!.textContent
    act(() => {
      vi.advanceTimersByTime(900) // IDLE_INTERVAL_MS
    })
    const afterOneTick = document.querySelector('.cat-sprite')!.textContent
    expect(afterOneTick).not.toBe(initial)
    expect(afterOneTick).toBe(buildFrame('happy', 0, 'kitten', 1))
  })

  it('resets the blink cycle when the mood changes', () => {
    const { rerender } = render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
    act(() => {
      vi.advanceTimersByTime(2_200)
    })
    expect(document.querySelector('.cat-sprite')!.textContent).toContain('⠉⠉⠉⠉⠉⠉')
    rerender(<AsciiCat mood="sad" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
    // mood change resets to the open frame immediately
    expect(document.querySelector('.cat-sprite')!.textContent).not.toContain('⠉⠉⠉⠉⠉⠉')
  })

  it('cleans up all timers on unmount without throwing', () => {
    const { unmount } = render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
    unmount()
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
    }).not.toThrow()
  })

  describe('actionCue', () => {
    it('shows the matching glyph and bounce class when an action cue arrives', () => {
      const { rerender } = render(
        <AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />,
      )
      rerender(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: 'feed' }} />)
      expect(document.querySelector('.cat-effect')?.textContent).toBe('nom nom')
      expect(document.querySelector('.ascii-screen')).toHaveClass('reacting')
    })

    it('reverts to the mood glyph after the cue expires', () => {
      render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: 'clean' }} />)
      expect(document.querySelector('.cat-effect')?.textContent).toBe('*scrub*')
      act(() => {
        vi.advanceTimersByTime(900)
      })
      expect(document.querySelector('.cat-effect')?.textContent).toBe('*')
      expect(document.querySelector('.ascii-screen')).not.toHaveClass('reacting')
    })

    it('hides the effect entirely once a cue expires for a mood with no ambient glyph', () => {
      render(<AsciiCat mood="content" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: 'clean' }} />)
      expect(document.querySelector('.cat-effect')?.textContent).toBe('*scrub*')
      act(() => {
        vi.advanceTimersByTime(900)
      })
      expect(document.querySelector('.cat-effect')).toBeNull()
    })

    it('positions a cue glyph at a randomized, bounded spot', () => {
      render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: 'feed' }} />)
      const el = document.querySelector('.cat-effect') as HTMLElement
      expect(el.style.right).toBe('auto')
      const top = Number.parseFloat(el.style.top)
      const left = Number.parseFloat(el.style.left)
      expect(top).toBeGreaterThanOrEqual(-10)
      expect(top).toBeLessThanOrEqual(10)
      expect(left).toBeGreaterThanOrEqual(10)
      expect(left).toBeLessThanOrEqual(70)
    })

    it('also gives the ambient idle mood glyph a randomized position, not just cue glyphs', () => {
      render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
      const el = document.querySelector('.cat-effect') as HTMLElement
      expect(el.textContent).toBe('*')
      expect(el.style.right).toBe('auto')
      expect(el.style.top).not.toBe('')
      expect(el.style.left).not.toBe('')
    })

    it('periodically re-pops the ambient glyph on its own, not just once', () => {
      render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
      const first = document.querySelector('.cat-effect') as HTMLElement
      const firstTop = first.style.top
      act(() => {
        // AMBIENT_POP_MIN_MS (2200) with 0 jitter (Math.random mocked to 0)
        vi.advanceTimersByTime(2_200)
      })
      const second = document.querySelector('.cat-effect') as HTMLElement
      expect(second.textContent).toBe('*')
      expect(second).not.toBe(first) // new key -> remounted node
      expect(second.style.top).toBe(firstTop) // same formula, same mocked Math.random -> same value, just a fresh pop
    })

    it('does not let a periodic ambient tick clobber a cue that starts right before it fires', () => {
      const { rerender } = render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={null} />)
      act(() => {
        vi.advanceTimersByTime(2_199) // just before the ambient tick at 2200ms
      })
      rerender(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: 'feed' }} />)
      act(() => {
        vi.advanceTimersByTime(1) // now the ambient tick fires
      })
      expect(document.querySelector('.cat-effect')?.textContent).toBe('nom nom')
    })

    it('gets a fresh position when a cue expires and reverts to the ambient glyph', () => {
      render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: 'feed' }} />)
      act(() => {
        vi.advanceTimersByTime(900)
      })
      const el = document.querySelector('.cat-effect') as HTMLElement
      expect(el.textContent).toBe('*')
      expect(el.style.top).not.toBe('')
      expect(el.style.left).not.toBe('')
    })

    it('shows the right glyph for each action cue type', () => {
      const cases: [string, string][] = [
        ['feed', 'nom nom'],
        ['clean', '*scrub*'],
        ['sleep', 'zzz'],
        ['wake', 'o.o'],
      ]
      for (const [type, glyph] of cases) {
        const { unmount } = render(
          <AsciiCat mood="content" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: type as never }} />,
        )
        expect(document.querySelector('.cat-effect')?.textContent).toBe(glyph)
        unmount()
      }
    })

    it('re-triggers on a fresh object even for the same type, resetting the timer', () => {
      // A bare string prop wouldn't re-fire the effect on a repeat identical
      // value (React's Object.is check treats it as "no change") -- this is
      // why App.tsx always constructs a new { type } object per trigger.
      const { rerender } = render(
        <AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: 'feed' }} />,
      )
      act(() => {
        vi.advanceTimersByTime(600)
      })
      rerender(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} actionCue={{ type: 'feed' }} />)
      act(() => {
        vi.advanceTimersByTime(600) // 1200ms total since the first trigger, but only 600ms since the re-trigger
      })
      expect(document.querySelector('.cat-effect')?.textContent).toBe('nom nom')
      act(() => {
        vi.advanceTimersByTime(300) // now 900ms since the re-trigger
      })
      expect(document.querySelector('.cat-effect')?.textContent).toBe('*')
    })

    it('a pet-triggered heart takes priority display-wise over a stale action cue timer', () => {
      const onPet = vi.fn().mockReturnValue(true)
      render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} actionCue={{ type: 'feed' }} />)
      expect(document.querySelector('.cat-effect')?.textContent).toBe('nom nom')
      fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
      expect(document.querySelector('.cat-effect')?.textContent).toBe('<3')
    })
  })
})
