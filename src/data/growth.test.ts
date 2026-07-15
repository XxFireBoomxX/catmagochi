import { describe, expect, it } from 'vitest'
import { deriveStage, growthProgress, GROW_MESSAGE, GROWTH_THRESHOLDS, STAGE_LABEL } from './growth'
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

describe('growthProgress', () => {
  it('tracks progress toward young while a kitten', () => {
    expect(growthProgress(0)).toEqual({ stage: 'kitten', nextStage: 'young', current: 0, needed: 40, percent: 0 })
    expect(growthProgress(20)).toEqual({ stage: 'kitten', nextStage: 'young', current: 20, needed: 40, percent: 50 })
  })

  it('tracks progress toward adult while young, relative to the young threshold (not raw growth)', () => {
    expect(growthProgress(40)).toEqual({ stage: 'young', nextStage: 'adult', current: 0, needed: 80, percent: 0 })
    expect(growthProgress(80)).toEqual({ stage: 'young', nextStage: 'adult', current: 40, needed: 80, percent: 50 })
  })

  it('reports 100% and no next stage once adult', () => {
    expect(growthProgress(120)).toEqual({ stage: 'adult', nextStage: null, current: 0, needed: 0, percent: 100 })
    expect(growthProgress(500)).toEqual({ stage: 'adult', nextStage: null, current: 0, needed: 0, percent: 100 })
  })

  it('never reports over 100% even exactly at a threshold boundary', () => {
    expect(growthProgress(GROWTH_THRESHOLDS.young).percent).toBeLessThanOrEqual(100)
    expect(growthProgress(GROWTH_THRESHOLDS.adult).percent).toBeLessThanOrEqual(100)
  })
})
