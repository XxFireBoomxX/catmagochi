import { describe, expect, it } from 'vitest'
import { startCombat, takeTurn } from './combat'
import { maxHpForLevel, skillsForLevel } from './progression'

// Balance guards. These play thousands of real fights against the real engine
// and assert the shape of the difficulty curve -- that a starting cat can
// clear the easy enemies, that the boss is genuinely a wall at level 1, and
// that levelling actually fixes that. Tuning an enemy's numbers without
// meaning to shows up here rather than in a fight that is no longer fun.
const RUNS = 2000

// A plausible player: pounce whenever it is off cooldown, otherwise swipe.
function play(enemyId: string, level: number): number {
  const hp = maxHpForLevel(level)
  const skills = skillsForLevel(level)
  let wins = 0
  for (let i = 0; i < RUNS; i++) {
    let s = startCombat(enemyId, hp)
    let turns = 0
    while (s.outcome === 'ongoing' && turns < 200) {
      const pounce = skills.find((k) => k.id === 'pounce' && (s.cooldowns[k.id] ?? 0) === 0)
      s = takeTurn(s, pounce ? pounce.id : 'swipe', Math.random)
      turns++
    }
    if (s.outcome === 'won') wins++
  }
  return wins / RUNS
}

describe('difficulty curve', () => {
  it('lets a brand new cat clear the weakest enemy nearly always', () => {
    const rate = play('crumb-beetle', 1)
    expect(rate, `level 1 vs crumb beetle won ${(rate * 100).toFixed(0)}%`).toBeGreaterThan(0.9)
  })

  it('makes the grasshopper a real threat at level 1 without being hopeless', () => {
    const rate = play('grasshopper', 1)
    expect(rate, `level 1 vs grasshopper won ${(rate * 100).toFixed(0)}%`).toBeGreaterThan(0.05)
    expect(rate, `level 1 vs grasshopper won ${(rate * 100).toFixed(0)}%`).toBeLessThan(0.7)
  })

  it('makes the boss a wall for a level 1 cat', () => {
    const rate = play('pantry-rat', 1)
    expect(rate, `level 1 vs boss won ${(rate * 100).toFixed(0)}%`).toBeLessThan(0.15)
  })

  // The whole point of levelling: the wall stops being a wall.
  it('lets a levelled cat take the boss more often than not', () => {
    const rate = play('pantry-rat', 6)
    expect(rate, `level 6 vs boss won ${(rate * 100).toFixed(0)}%`).toBeGreaterThan(0.5)
  })

  it('makes a fully levelled cat comfortable against everything that stands and fights', () => {
    for (const id of ['crumb-beetle', 'grasshopper', 'pantry-rat']) {
      const rate = play(id, 9)
      expect(rate, `level 9 vs ${id} won ${(rate * 100).toFixed(0)}%`).toBeGreaterThan(0.8)
    }
  })

  // The mouse is deliberately the one that gets away sometimes -- that is its
  // whole identity, and a flee still pays half xp, so the fight is never
  // wasted. The bar here is "usually caught", not "always".
  it('lets the mouse escape a levelled cat now and then, but not usually', () => {
    const rate = play('house-mouse', 9)
    expect(rate, `level 9 vs house-mouse won ${(rate * 100).toFixed(0)}%`).toBeGreaterThan(0.6)
    expect(rate, `level 9 vs house-mouse won ${(rate * 100).toFixed(0)}%`).toBeLessThan(0.95)
  })
})
