import { describe, expect, it } from 'vitest'
import { startCombat, takeTurn } from './combat'
import { damageBonusForLevel, maxHpForLevel, skillsForLevel } from './progression'
import { ZONES } from './zones'

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

// A trinket that changes nothing measurable is a bug the numbers should catch.
describe('trinkets earn their slot', () => {
  function winRate(enemyId: string, level: number, trinket?: string): number {
    const hp = maxHpForLevel(level)
    const skills = skillsForLevel(level)
    let wins = 0
    for (let i = 0; i < RUNS; i++) {
      let s = startCombat(enemyId, hp, trinket, [], damageBonusForLevel(level))
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

  // Measured against the garden boss at the level that opens the garden --
  // a fight the curve deliberately leaves in doubt. Earlier levels saturate.
  it('makes the boss measurably easier with a rat tooth on', () => {
    const bare = winRate('magpie', 4)
    const armed = winRate('magpie', 4, 'rat-tooth')
    expect(armed, `bare ${(bare * 100).toFixed(0)}% vs rat-tooth ${(armed * 100).toFixed(0)}%`).toBeGreaterThan(bare)
  })

  it('makes the boss measurably easier with a bent whisker on', () => {
    const bare = winRate('magpie', 4)
    const armed = winRate('magpie', 4, 'bent-whisker')
    expect(armed, `bare ${(bare * 100).toFixed(0)}% vs bent-whisker ${(armed * 100).toFixed(0)}%`).toBeGreaterThan(bare)
  })
})

// --- slice 4: the whole ladder ---

// Every zone's boss should be a wall at the level that opens the zone, and
// beatable a few levels later. Neither a cliff nor a formality.
describe('every zone boss is a step, not a cliff or a formality', () => {
  function winRate(enemyId: string, level: number, trinket?: string): number {
    const hp = maxHpForLevel(level)
    const skills = skillsForLevel(level)
    let wins = 0
    for (let i = 0; i < RUNS; i++) {
      let s = startCombat(enemyId, hp, trinket, [], damageBonusForLevel(level))
      let turns = 0
      while (s.outcome === 'ongoing' && turns < 300) {
        const pounce = skills.find((k) => k.id === 'pounce' && (s.cooldowns[k.id] ?? 0) === 0)
        s = takeTurn(s, pounce ? pounce.id : 'swipe', Math.random)
        turns++
      }
      if (s.outcome === 'won') wins++
    }
    return wins / RUNS
  }

  it.each(ZONES.map((z) => [z.name, z.boss, z.unlockLevel] as const))(
    '%s: its boss is hard on arrival and beatable later',
    (name, boss, unlockLevel) => {
      const onArrival = winRate(boss, unlockLevel)
      const laterLevel = unlockLevel + 4
      const later = winRate(boss, laterLevel)
      expect(
        onArrival,
        `${name} boss at lvl ${unlockLevel} won ${(onArrival * 100).toFixed(0)}%`,
      ).toBeLessThan(0.5)
      expect(
        later,
        `${name} boss at lvl ${laterLevel} won ${(later * 100).toFixed(0)}%`,
      ).toBeGreaterThan(onArrival)
    },
  )

  // "Survived" rather than "killed": a fleeing enemy getting away is the
  // encounter going fine, and counting only kills measures the wrong thing --
  // the same trap the house mouse sprang earlier.
  function survivalRate(enemyId: string, level: number): number {
    const hp = maxHpForLevel(level)
    const skills = skillsForLevel(level)
    let survived = 0
    for (let i = 0; i < RUNS; i++) {
      let s = startCombat(enemyId, hp, undefined, [], damageBonusForLevel(level))
      let turns = 0
      while (s.outcome === 'ongoing' && turns < 300) {
        const pounce = skills.find((k) => k.id === 'pounce' && (s.cooldowns[k.id] ?? 0) === 0)
        s = takeTurn(s, pounce ? pounce.id : 'swipe', Math.random)
        turns++
      }
      if (s.outcome === 'won' || s.outcome === 'fled') survived++
    }
    return survived / RUNS
  }

  it.each(ZONES.map((z) => [z.name, z.encounters] as const))(
    '%s: its regulars are survivable on arrival',
    (name, encounters) => {
      const zone = ZONES.find((z) => z.name === name)!
      for (const id of encounters) {
        const rate = survivalRate(id, zone.unlockLevel)
        expect(
          rate,
          `${name}: ${id} at lvl ${zone.unlockLevel} survived ${(rate * 100).toFixed(0)}%`,
        ).toBeGreaterThan(0.3)
      }
    },
  )
})
