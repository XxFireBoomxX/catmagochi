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
