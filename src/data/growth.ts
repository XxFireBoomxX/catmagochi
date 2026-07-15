import type { Stage } from '../types'

export const GROWTH_THRESHOLDS = { young: 40, adult: 120 }

export function deriveStage(growth: number): Stage {
  if (growth < GROWTH_THRESHOLDS.young) return 'kitten'
  if (growth < GROWTH_THRESHOLDS.adult) return 'young'
  return 'adult'
}

export const STAGE_LABEL: Record<Stage, string> = {
  kitten: 'KITTEN',
  young: 'YOUNG CAT',
  adult: 'ADULT CAT',
}

export const GROW_MESSAGE: Partial<Record<Stage, string>> = {
  young: 'GREW INTO A YOUNG CAT!',
  adult: 'GREW INTO AN ADULT CAT!',
}

export interface GrowthProgress {
  stage: Stage
  nextStage: Stage | null
  current: number
  needed: number
  percent: number
}

// Progress *within the current stage's band*, not raw growth/threshold --
// e.g. a young cat just past the young threshold should read as ~0%
// progress toward adult, not >100% against the young threshold it already
// cleared.
export function growthProgress(growth: number): GrowthProgress {
  const stage = deriveStage(growth)
  if (stage === 'kitten') {
    const needed = GROWTH_THRESHOLDS.young
    return { stage, nextStage: 'young', current: growth, needed, percent: Math.min(100, (growth / needed) * 100) }
  }
  if (stage === 'young') {
    const start = GROWTH_THRESHOLDS.young
    const needed = GROWTH_THRESHOLDS.adult - start
    const current = growth - start
    return { stage, nextStage: 'adult', current, needed, percent: Math.min(100, (current / needed) * 100) }
  }
  return { stage, nextStage: null, current: 0, needed: 0, percent: 100 }
}
