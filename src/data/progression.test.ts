import { describe, expect, it } from 'vitest'
import { applyXp, damageBonusForLevel, maxHpForLevel, skillsForLevel, xpToNext } from './progression'
import { SKILLS } from './skills'

describe('xpToNext', () => {
  it('costs 100 to leave level 1 and rises by 50 a level', () => {
    expect(xpToNext(1)).toBe(100)
    expect(xpToNext(2)).toBe(150)
    expect(xpToNext(3)).toBe(200)
  })

  it('always asks for more than the level before', () => {
    for (let level = 1; level < 20; level++) {
      expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level))
    }
  })
})

describe('maxHpForLevel', () => {
  it('starts at 10 and climbs steeply enough for the deeper zones', () => {
    expect(maxHpForLevel(1)).toBe(10)
    expect(maxHpForLevel(4)).toBe(28)
    expect(maxHpForLevel(12)).toBe(76)
  })
})

describe('damageBonusForLevel', () => {
  // Skill damage is fixed, so this is the cat's only offensive growth.
  it('gives a new cat nothing, so level 1 plays exactly as it always did', () => {
    expect(damageBonusForLevel(1)).toBe(0)
  })

  it('climbs with the level', () => {
    expect(damageBonusForLevel(4)).toBeGreaterThan(damageBonusForLevel(1))
    expect(damageBonusForLevel(12)).toBeGreaterThan(damageBonusForLevel(8))
  })

  it('never goes backwards', () => {
    for (let level = 1; level < 30; level++) {
      expect(damageBonusForLevel(level + 1)).toBeGreaterThanOrEqual(damageBonusForLevel(level))
    }
  })

  it('clamps rather than going negative below level 1', () => {
    expect(damageBonusForLevel(0)).toBe(0)
    expect(damageBonusForLevel(-5)).toBe(0)
  })
})

describe('skillsForLevel', () => {
  it('offers only the starter at level 1', () => {
    expect(skillsForLevel(1)).toHaveLength(1)
  })

  it('offers every skill at a high enough level', () => {
    const max = Math.max(...SKILLS.map((s) => s.unlockLevel))
    expect(skillsForLevel(max)).toHaveLength(SKILLS.length)
  })

  it('never offers a skill the cat has not reached', () => {
    for (const s of skillsForLevel(5)) expect(s.unlockLevel).toBeLessThanOrEqual(5)
  })

  it('only ever adds skills as the level rises', () => {
    for (let level = 1; level < 12; level++) {
      expect(skillsForLevel(level + 1).length).toBeGreaterThanOrEqual(skillsForLevel(level).length)
    }
  })
})

describe('applyXp', () => {
  it('accumulates without levelling when under the threshold', () => {
    expect(applyXp(1, 10, 30)).toEqual({ level: 1, xp: 40, levelsGained: 0 })
  })

  it('levels up and carries the remainder', () => {
    expect(applyXp(1, 90, 20)).toEqual({ level: 2, xp: 10, levelsGained: 1 })
  })

  // A boss can be worth more than a whole level.
  it('crosses two levels in one award', () => {
    const result = applyXp(1, 0, 260)
    expect(result.level).toBe(3)
    expect(result.levelsGained).toBe(2)
    expect(result.xp).toBe(10)
  })

  it('lands exactly on a level boundary without banking a phantom level', () => {
    expect(applyXp(1, 0, 100)).toEqual({ level: 2, xp: 0, levelsGained: 1 })
  })

  it('ignores a non-positive award', () => {
    expect(applyXp(2, 30, 0)).toEqual({ level: 2, xp: 30, levelsGained: 0 })
    expect(applyXp(2, 30, -50)).toEqual({ level: 2, xp: 30, levelsGained: 0 })
  })
})
