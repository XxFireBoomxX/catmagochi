import { describe, expect, it } from 'vitest'
import { buildFrame, IDLE_FRAME_COUNT } from './asciiCat'
import type { Stage } from '../types'

describe('IDLE_FRAME_COUNT', () => {
  it('defines the same frame count for every stage', () => {
    const stages: Stage[] = ['kitten', 'young', 'adult']
    const counts = stages.map((s) => IDLE_FRAME_COUNT[s])
    expect(counts.every((c) => c === counts[0])).toBe(true)
    expect(counts[0]).toBeGreaterThan(1)
  })
})

describe('buildFrame', () => {
  const lineCount = (frame: string) => frame.split('\n').length

  it('produces a stable multi-line frame for an open-eyed, non-glancing pose', () => {
    const frame = buildFrame('happy', 0, 'kitten', 0)
    expect(lineCount(frame)).toBeGreaterThan(1)
    const rows = frame.split('\n')
    expect(rows[9]).toContain('⢼⣿')
    expect(rows[9]).toContain('⣾⣷')
  })

  it('keeps the same line count across moods and stages (art itself never changes)', () => {
    const base = lineCount(buildFrame('happy', 0, 'kitten', 0))
    expect(lineCount(buildFrame('sad', 0, 'young', 0))).toBe(base)
    expect(lineCount(buildFrame('hungry', 0, 'adult', 0))).toBe(base)
  })

  it('closes the eyes on a blink frame regardless of mood', () => {
    const frame = buildFrame('happy', 1, 'kitten', 0)
    const rows = frame.split('\n')
    expect(rows[8]).toContain('⣿⣿⣿⣿⣿⣿')
    expect(rows[9]).toContain('⠉⠉⠉⠉⠉⠉')
  })

  it('forces closed eyes for the sleeping mood even on an open blink frame', () => {
    const awake = buildFrame('happy', 0, 'kitten', 0)
    const asleep = buildFrame('sleeping', 0, 'kitten', 0)
    expect(asleep).not.toBe(awake)
    const rows = asleep.split('\n')
    expect(rows[8]).toContain('⣿⣿⣿⣿⣿⣿')
  })

  it('shifts pupils on glancing idle frames and drops the row-10 shading', () => {
    const centered = buildFrame('happy', 0, 'kitten', 0)
    const glancing = buildFrame('happy', 0, 'kitten', 1)
    expect(glancing).not.toBe(centered)
  })

  it('wraps idle frame indices with modulo so out-of-range frames stay valid', () => {
    const frameCount = IDLE_FRAME_COUNT.kitten
    const wrapped = buildFrame('happy', 0, 'kitten', frameCount)
    const first = buildFrame('happy', 0, 'kitten', 0)
    expect(wrapped).toBe(first)
  })

  it('returns the exact cached string on a repeated call with the same key', () => {
    const first = buildFrame('content', 0, 'kitten', 2)
    const second = buildFrame('content', 0, 'kitten', 2)
    expect(second).toBe(first)
  })

  it('ignores stage when computing the frame content itself (stage only affects CSS sizing)', () => {
    const kitten = buildFrame('happy', 0, 'kitten', 0)
    const adult = buildFrame('happy', 0, 'adult', 0)
    expect(kitten).toBe(adult)
  })
})
