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
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} />)
    const pre = document.querySelector('.cat-sprite')!
    expect(pre.textContent).toBe(buildFrame('happy', 0, 'kitten', 0))
    expect(pre).toHaveClass('stage-kitten')
  })

  it('shows the mood effect glyph for moods that have one', () => {
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} />)
    expect(document.querySelector('.cat-effect')?.textContent).toBe('*')
  })

  it('shows no effect glyph for moods without one (e.g. content)', () => {
    render(<AsciiCat mood="content" name="Mochi" stage="kitten" onPet={() => true} />)
    expect(document.querySelector('.cat-effect')).toBeNull()
  })

  it('calls onPet when the screen is clicked', () => {
    const onPet = vi.fn().mockReturnValue(true)
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
    expect(onPet).toHaveBeenCalledTimes(1)
  })

  it('shows the heart reaction glyph after a successful pet, then reverts', () => {
    const onPet = vi.fn().mockReturnValue(true)
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
    expect(document.querySelector('.cat-effect')?.textContent).toBe('<3')
    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(document.querySelector('.cat-effect')?.textContent).toBe('*')
  })

  it('does not react when onPet reports the pet did not apply (e.g. cooldown)', () => {
    const onPet = vi.fn().mockReturnValue(false)
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
    expect(document.querySelector('.cat-effect')?.textContent).toBe('*')
  })

  it('triggers pet on Enter and Space keys, not other keys', () => {
    const onPet = vi.fn().mockReturnValue(true)
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={onPet} />)
    const el = screen.getByRole('button', { name: 'Pet Mochi' })
    fireEvent.keyDown(el, { key: 'Enter' })
    fireEvent.keyDown(el, { key: ' ' })
    fireEvent.keyDown(el, { key: 'a' })
    expect(onPet).toHaveBeenCalledTimes(2)
  })

  it('closes the eyes during a blink and reopens after', () => {
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} />)
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
    render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} />)
    const initial = document.querySelector('.cat-sprite')!.textContent
    act(() => {
      vi.advanceTimersByTime(900) // IDLE_INTERVAL_MS
    })
    const afterOneTick = document.querySelector('.cat-sprite')!.textContent
    expect(afterOneTick).not.toBe(initial)
    expect(afterOneTick).toBe(buildFrame('happy', 0, 'kitten', 1))
  })

  it('resets the blink cycle when the mood changes', () => {
    const { rerender } = render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} />)
    act(() => {
      vi.advanceTimersByTime(2_200)
    })
    expect(document.querySelector('.cat-sprite')!.textContent).toContain('⠉⠉⠉⠉⠉⠉')
    rerender(<AsciiCat mood="sad" name="Mochi" stage="kitten" onPet={() => true} />)
    // mood change resets to the open frame immediately
    expect(document.querySelector('.cat-sprite')!.textContent).not.toContain('⠉⠉⠉⠉⠉⠉')
  })

  it('cleans up all timers on unmount without throwing', () => {
    const { unmount } = render(<AsciiCat mood="happy" name="Mochi" stage="kitten" onPet={() => true} />)
    unmount()
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
    }).not.toThrow()
  })
})
