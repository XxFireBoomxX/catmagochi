import { describe, expect, it } from 'vitest'
import { deriveStage, GROW_MESSAGE, GROWTH_THRESHOLDS, STAGE_LABEL } from './growth'
import type { Stage } from '../types'

describe('deriveStage', () => {
  it('is kitten below the young threshold', () => {
    expect(deriveStage(0)).toBe('kitten')
    expect(deriveStage(GROWTH_THRESHOLDS.young - 1)).toBe('kitten')
  })

  it('is young at and above the young threshold, below adult', () => {
    expect(deriveStage(GROWTH_THRESHOLDS.young)).toBe('young')
    expect(deriveStage(GROWTH_THRESHOLDS.adult - 1)).toBe('young')
  })

  it('is adult at and above the adult threshold', () => {
    expect(deriveStage(GROWTH_THRESHOLDS.adult)).toBe('adult')
    expect(deriveStage(GROWTH_THRESHOLDS.adult + 1000)).toBe('adult')
  })

  it('handles negative growth as kitten', () => {
    expect(deriveStage(-5)).toBe('kitten')
  })
})

describe('STAGE_LABEL', () => {
  it('has a label for every stage', () => {
    const stages: Stage[] = ['kitten', 'young', 'adult']
    for (const stage of stages) {
      expect(typeof STAGE_LABEL[stage]).toBe('string')
      expect(STAGE_LABEL[stage].length).toBeGreaterThan(0)
    }
  })
})

describe('GROW_MESSAGE', () => {
  it('has no message for the initial kitten stage', () => {
    expect(GROW_MESSAGE.kitten).toBeUndefined()
  })

  it('has messages for young and adult transitions', () => {
    expect(GROW_MESSAGE.young).toContain('YOUNG CAT')
    expect(GROW_MESSAGE.adult).toContain('ADULT CAT')
  })
})
