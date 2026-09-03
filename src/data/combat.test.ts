import { describe, expect, it } from 'vitest'
import { SHARPEN_BONUS, SHARPEN_TURNS, startCombat, takeTurn } from './combat'
import { enemyById } from './enemies'

const rngMin = () => 0
const rngMax = () => 0.999

// Feeds a scripted sequence, repeating the last value once exhausted.
function scripted(values: number[]) {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe('startCombat', () => {
  it('starts both sides at full health with a clean slate', () => {
    const s = startCombat('crumb-beetle', 12)
    expect(s.catHp).toBe(12)
    expect(s.catMaxHp).toBe(12)
    expect(s.enemyHp).toBe(enemyById('crumb-beetle')!.maxHp)
    expect(s.outcome).toBe('ongoing')
    expect(s.sharpenTurns).toBe(0)
    expect(s.guarding).toBe(false)
    expect(s.enemyStunTurns).toBe(0)
    expect(s.cooldowns).toEqual({})
  })
})

describe('takeTurn', () => {
  it('does not mutate the state it is given', () => {
    const before = startCombat('crumb-beetle', 12)
    const snapshot = JSON.parse(JSON.stringify(before))
    takeTurn(before, 'swipe', rngMin)
    expect(before).toEqual(snapshot)
  })

  it('deals damage inside the skill range', () => {
    const start = startCombat('grasshopper', 12)
    expect(start.enemyHp - takeTurn(start, 'swipe', rngMin).enemyHp).toBe(2)
    expect(start.enemyHp - takeTurn(start, 'swipe', rngMax).enemyHp).toBe(4)
  })

  it('wins when the enemy runs out of health', () => {
    let s = startCombat('crumb-beetle', 40)
    while (s.outcome === 'ongoing') s = takeTurn(s, 'swipe', rngMax)
    expect(s.outcome).toBe('won')
    expect(s.enemyHp).toBe(0)
  })

  it('loses when the cat runs out of health', () => {
    let s = startCombat('pantry-rat', 3)
    while (s.outcome === 'ongoing') s = takeTurn(s, 'swipe', rngMax)
    expect(s.outcome).toBe('lost')
    expect(s.catHp).toBe(0)
  })

  it('never reports negative health on either side', () => {
    let s = startCombat('crumb-beetle', 3)
    for (let i = 0; i < 30 && s.outcome === 'ongoing'; i++) s = takeTurn(s, 'swipe', rngMax)
    expect(s.catHp).toBeGreaterThanOrEqual(0)
    expect(s.enemyHp).toBeGreaterThanOrEqual(0)
  })

  it('refuses an unknown skill without spending a turn', () => {
    const s = startCombat('crumb-beetle', 12)
    expect(takeTurn(s, 'nonsense', rngMin)).toBe(s)
  })

  it('ignores further turns once the fight is over', () => {
    let s = startCombat('crumb-beetle', 40)
    while (s.outcome === 'ongoing') s = takeTurn(s, 'swipe', rngMax)
    expect(takeTurn(s, 'swipe', rngMax)).toBe(s)
  })

  it('is deterministic for the same scripted rolls', () => {
    const run = () => {
      const rng = scripted([0.1, 0.6, 0.3, 0.9, 0.2])
      return takeTurn(takeTurn(startCombat('grasshopper', 20), 'swipe', rng), 'swipe', rng)
    }
    expect(run()).toEqual(run())
  })

  it('writes a plain-ASCII line to the log every turn', () => {
    const s = takeTurn(startCombat('crumb-beetle', 20), 'swipe', rngMin)
    expect(s.log.length).toBeGreaterThan(0)
    for (const line of s.log) expect(line).toMatch(/^[\x20-\x7E]*$/)
  })

  describe('cooldowns', () => {
    it('puts a skill on cooldown after use', () => {
      const s = takeTurn(startCombat('pantry-rat', 20), 'pounce', rngMin)
      expect(s.cooldowns.pounce).toBeGreaterThan(0)
    })

    it('refuses a skill still on cooldown, without spending the turn', () => {
      const first = takeTurn(startCombat('pantry-rat', 20), 'pounce', rngMin)
      expect(takeTurn(first, 'pounce', rngMin)).toBe(first)
    })

    it('frees the skill once the cooldown expires', () => {
      let s = takeTurn(startCombat('pantry-rat', 40), 'pounce', rngMin)
      const turns = s.cooldowns.pounce
      for (let i = 0; i < turns; i++) s = takeTurn(s, 'swipe', rngMin)
      expect(s.cooldowns.pounce ?? 0).toBe(0)
    })

    it('leaves a zero-cooldown skill always available', () => {
      let s = startCombat('pantry-rat', 40)
      for (let i = 0; i < 3; i++) s = takeTurn(s, 'swipe', rngMin)
      expect(s.cooldowns.swipe ?? 0).toBe(0)
    })
  })

  describe('sharpen claws', () => {
    it('adds a flat bonus to the next attack', () => {
      const base = startCombat('pantry-rat', 40)
      const plain = base.enemyHp - takeTurn(base, 'swipe', rngMin).enemyHp
      const sharpened = takeTurn(base, 'sharpen', rngMin)
      const boosted = sharpened.enemyHp - takeTurn(sharpened, 'swipe', rngMin).enemyHp
      expect(boosted).toBe(plain + SHARPEN_BONUS)
    })

    it('deals no damage on the turn it is used', () => {
      const base = startCombat('pantry-rat', 40)
      expect(takeTurn(base, 'sharpen', rngMin).enemyHp).toBe(base.enemyHp)
    })

    it('lasts exactly the advertised number of turns', () => {
      let s = takeTurn(startCombat('pantry-rat', 60), 'sharpen', rngMin)
      expect(s.sharpenTurns).toBe(SHARPEN_TURNS)
      for (let i = 0; i < SHARPEN_TURNS; i++) s = takeTurn(s, 'swipe', rngMin)
      expect(s.sharpenTurns).toBe(0)
    })
  })

  describe('flatten ears', () => {
    it('negates exactly one incoming hit', () => {
      const guarded = takeTurn(startCombat('crumb-beetle', 20), 'guard', rngMax)
      expect(guarded.catHp).toBe(20)
      expect(guarded.guarding).toBe(false) // spent on the enemy's turn
      expect(takeTurn(guarded, 'swipe', rngMax).catHp).toBeLessThan(20)
    })
  })

  describe('hiss', () => {
    it('costs the enemy its turn', () => {
      const stunned = takeTurn(startCombat('crumb-beetle', 20), 'hiss', rngMax)
      expect(stunned.catHp).toBe(20)
    })

    it('only costs it one turn', () => {
      const stunned = takeTurn(startCombat('crumb-beetle', 20), 'hiss', rngMax)
      expect(takeTurn(stunned, 'swipe', rngMax).catHp).toBeLessThan(20)
    })
  })

  describe('behaviour', () => {
    it('has a plain enemy attack every turn', () => {
      const s = takeTurn(startCombat('crumb-beetle', 30), 'swipe', rngMin)
      expect(s.catHp).toBeLessThan(30)
    })

    it('has the grasshopper wind up before it strikes', () => {
      const first = takeTurn(startCombat('grasshopper', 30), 'swipe', rngMin)
      expect(first.catHp).toBe(30)
      expect(first.enemyWindingUp).toBe(true)
      expect(takeTurn(first, 'swipe', rngMin).catHp).toBeLessThan(30)
    })

    it('has the grasshopper hit hard when the wind-up lands', () => {
      const wound = takeTurn(startCombat('grasshopper', 30), 'swipe', rngMax)
      const struck = takeTurn(wound, 'swipe', rngMax)
      expect(wound.catHp - struck.catHp).toBeGreaterThanOrEqual(5)
    })

    // rngMin gives minimum damage and passes the flee roll, so the mouse is
    // worn down to the threshold and then takes its chance.
    it('lets a badly wounded mouse flee', () => {
      let s = startCombat('house-mouse', 60)
      while (s.outcome === 'ongoing') s = takeTurn(s, 'swipe', rngMin)
      expect(s.outcome).toBe('fled')
    })

    // Being cornered is not escaping: the roll happens on the enemy's turn,
    // so a failed roll leaves it there and gives the player another swing.
    it('keeps a cornered enemy in the fight when its flee roll fails', () => {
      // Per turn the engine rolls cat damage, then (once cornered) the flee
      // chance, then enemy damage. 0 is minimum damage; 0.9 fails the roll.
      const rng = scripted([0, 0, 0, 0, 0, 0, 0, 0.9, 0])
      let s = startCombat('house-mouse', 60)
      for (let i = 0; i < 4; i++) s = takeTurn(s, 'swipe', rng)
      expect(s.enemyHp).toBe(2) // below the threshold
      expect(s.outcome).toBe('ongoing')
    })

    it('does not let a healthy mouse flee', () => {
      const s = takeTurn(startCombat('house-mouse', 60), 'swipe', rngMin)
      expect(s.enemyHp).toBe(8)
      expect(s.outcome).toBe('ongoing')
    })

    // Not a flee rule -- the boss simply isn't a fleeing enemy. Named for
    // what it checks: the fight runs to a decision rather than an escape.
    it('fights the boss to a finish rather than letting it escape', () => {
      let s = startCombat('pantry-rat', 400)
      while (s.outcome === 'ongoing') s = takeTurn(s, 'swipe', rngMax)
      expect(s.outcome).toBe('won')
    })

    // The threshold rule: 10 HP mouse at 0.3, so it is only cornered at 2,
    // not at 4. rngMin also passes the flee roll, so it goes.
    it('holds at the flee threshold and bolts just below it', () => {
      let s = startCombat('house-mouse', 200)
      s = takeTurn(s, 'swipe', rngMin) // 10 -> 8
      s = takeTurn(s, 'swipe', rngMin) // 8 -> 6
      s = takeTurn(s, 'swipe', rngMin) // 6 -> 4  (0.4, holds)
      expect(s.enemyHp).toBe(4)
      expect(s.outcome).toBe('ongoing')
      s = takeTurn(s, 'swipe', rngMin) // 4 -> 2  (0.2, bolts)
      expect(s.enemyHp).toBe(2)
      expect(s.outcome).toBe('fled')
    })
  })
})

// --- slice 2: items in a fight ---

describe('consumables', () => {
  const held = ['fish-scrap', 'bottle-cap', 'catnip-leaf']

  it('spends the turn, so the enemy still acts', () => {
    const s = takeTurn(startCombat('crumb-beetle', 20, undefined, held), 'fish-scrap', rngMax)
    expect(s.catHp).toBeLessThan(20)
  })

  it('refuses an item the cat is not carrying, without spending the turn', () => {
    const s = startCombat('crumb-beetle', 20, undefined, [])
    expect(takeTurn(s, 'fish-scrap', rngMin)).toBe(s)
  })

  it('heals, but never above the starting health', () => {
    const s = startCombat('crumb-beetle', 20, undefined, held)
    const healedAtFull = takeTurn(s, 'fish-scrap', rngMin)
    expect(healedAtFull.catHp).toBeLessThanOrEqual(healedAtFull.catMaxHp)
  })

  it('heals a wounded cat', () => {
    let s = startCombat('grasshopper', 20, undefined, held)
    s = takeTurn(s, 'swipe', rngMax) // grasshopper winds up
    s = takeTurn(s, 'swipe', rngMax) // and lands a big hit
    const hurt = s.catHp
    expect(hurt).toBeLessThan(20)
    const healed = takeTurn(s, 'fish-scrap', rngMin)
    expect(healed.catHp).toBeGreaterThan(hurt)
  })

  it('throws a bottle cap for damage', () => {
    const s = startCombat('pantry-rat', 20, undefined, held)
    expect(takeTurn(s, 'bottle-cap', rngMin).enemyHp).toBeLessThan(s.enemyHp)
  })

  it('applies the sharpen buff from catnip', () => {
    const s = takeTurn(startCombat('pantry-rat', 20, undefined, held), 'catnip-leaf', rngMin)
    expect(s.sharpenTurns).toBeGreaterThan(0)
  })

  // Recorded so the panel can spend them from the bag on the way out, rather
  // than at use -- quitting mid-fight must not duplicate an item.
  it('records each use exactly once', () => {
    let s = startCombat('pantry-rat', 30, undefined, held)
    s = takeTurn(s, 'bottle-cap', rngMin)
    s = takeTurn(s, 'catnip-leaf', rngMin)
    expect(s.used).toEqual(['bottle-cap', 'catnip-leaf'])
  })

  it('lets the same item be used twice when two are carried', () => {
    let s = startCombat('pantry-rat', 30, undefined, ['bottle-cap', 'bottle-cap'])
    s = takeTurn(s, 'bottle-cap', rngMin)
    s = takeTurn(s, 'bottle-cap', rngMin)
    expect(s.used).toEqual(['bottle-cap', 'bottle-cap'])
  })

  it('refuses a third use when only two are carried', () => {
    let s = startCombat('pantry-rat', 30, undefined, ['bottle-cap', 'bottle-cap'])
    s = takeTurn(s, 'bottle-cap', rngMin)
    s = takeTurn(s, 'bottle-cap', rngMin)
    expect(takeTurn(s, 'bottle-cap', rngMin)).toBe(s)
  })
})

describe('trinkets', () => {
  it('adds max health before the fight starts', () => {
    const plain = startCombat('crumb-beetle', 20)
    const worn = startCombat('crumb-beetle', 20, 'bent-whisker')
    expect(worn.catMaxHp).toBe(plain.catMaxHp + 2)
    expect(worn.catHp).toBe(worn.catMaxHp)
  })

  it('adds damage to every attack', () => {
    const plain = startCombat('pantry-rat', 20)
    const worn = startCombat('pantry-rat', 20, 'rat-tooth')
    const plainDealt = plain.enemyHp - takeTurn(plain, 'swipe', rngMin).enemyHp
    const wornDealt = worn.enemyHp - takeTurn(worn, 'swipe', rngMin).enemyHp
    expect(wornDealt).toBe(plainDealt + 1)
  })

  // The beetle dies on the second swipe, so it never lands a second hit --
  // this needs an enemy that survives long enough to hit twice.
  it('softens only the first incoming hit', () => {
    const worn = startCombat('house-mouse', 20, 'beetle-shell')
    const first = takeTurn(worn, 'swipe', rngMax)
    const firstTaken = worn.catHp - first.catHp
    const second = takeTurn(first, 'swipe', rngMax)
    const secondTaken = first.catHp - second.catHp
    expect(secondTaken).toBe(firstTaken + 1)
  })

  it('ignores a trinket id that is not a trinket', () => {
    const plain = startCombat('crumb-beetle', 20)
    const bogus = startCombat('crumb-beetle', 20, 'fish-scrap')
    expect(bogus.catMaxHp).toBe(plain.catMaxHp)
  })
})
