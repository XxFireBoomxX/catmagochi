import { describe, expect, it } from 'vitest'
import { ACTION_FLAVOR, FLAVOR_TEXT, GENERIC_FLAVOR, MOOD_LABEL } from './flavorText'
import type { Mood } from '../types'

const ALL_MOODS: Mood[] = ['happy', 'content', 'hungry', 'tired', 'dirty', 'sad', 'sleeping']

describe('MOOD_LABEL', () => {
  it('has a non-empty label for every mood', () => {
    for (const mood of ALL_MOODS) {
      expect(typeof MOOD_LABEL[mood]).toBe('string')
      expect(MOOD_LABEL[mood].length).toBeGreaterThan(0)
    }
  })
})

describe('FLAVOR_TEXT', () => {
  it('only contains non-empty arrays for the moods that have flavor text', () => {
    for (const mood of Object.keys(FLAVOR_TEXT) as Mood[]) {
      const lines = FLAVOR_TEXT[mood]
      expect(Array.isArray(lines)).toBe(true)
      expect(lines!.length).toBeGreaterThan(0)
      for (const line of lines!) {
        expect(typeof line).toBe('string')
      }
    }
  })

  it('has no entry for content, matching the generic-fallback design', () => {
    expect(FLAVOR_TEXT.content).toBeUndefined()
  })
})

describe('GENERIC_FLAVOR', () => {
  it('is a non-empty array of strings usable as a fallback', () => {
    expect(GENERIC_FLAVOR.length).toBeGreaterThan(0)
    for (const line of GENERIC_FLAVOR) {
      expect(typeof line).toBe('string')
    }
  })
})

describe('ACTION_FLAVOR', () => {
  it('has a non-empty pool of strings for every action type', () => {
    const types = ['feed', 'clean', 'sleep', 'wake', 'pet'] as const
    for (const type of types) {
      const lines = ACTION_FLAVOR[type]
      expect(Array.isArray(lines)).toBe(true)
      expect(lines.length).toBeGreaterThan(0)
      for (const line of lines) {
        expect(typeof line).toBe('string')
      }
    }
  })
})
