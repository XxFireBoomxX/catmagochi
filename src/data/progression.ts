import { SKILLS, type Skill } from './skills'

// Each level costs 50 more than the last, so early levels arrive quickly --
// which is when the skill unlocks are -- and later ones pace the zones.
export function xpToNext(level: number): number {
  return 100 + (level - 1) * 50
}

export function maxHpForLevel(level: number): number {
  return 10 + (level - 1) * 2
}

export function skillsForLevel(level: number): Skill[] {
  return SKILLS.filter((s) => s.unlockLevel <= level)
}

// Banks an XP award, rolling over as many levels as it covers -- a boss can
// be worth more than a whole level, so a single-step version would silently
// cap the reward.
export function applyXp(
  level: number,
  xp: number,
  gained: number,
): { level: number; xp: number; levelsGained: number } {
  if (gained <= 0) return { level, xp, levelsGained: 0 }
  let nextLevel = level
  let pool = xp + gained
  let levelsGained = 0
  while (pool >= xpToNext(nextLevel)) {
    pool -= xpToNext(nextLevel)
    nextLevel += 1
    levelsGained += 1
  }
  return { level: nextLevel, xp: pool, levelsGained }
}
