import { FLEE_CHANCE, FLEE_THRESHOLD, enemyById, type Enemy } from './enemies'
import { skillById } from './skills'
import { itemById } from './items'

// Every rule of a fight, as pure functions. No React, no storage, no
// Math.random(): randomness arrives as an injected `rng`, so a whole fight
// replays exactly in a test and a bug can be reproduced from its rolls.
//
// takeTurn never mutates its argument -- it returns a new state, or the state
// it was given if the move was not legal.

export const SHARPEN_BONUS = 2
export const SHARPEN_TURNS = 3

export interface CombatState {
  enemyId: string
  enemyHp: number
  catHp: number
  catMaxHp: number
  // +SHARPEN_BONUS damage while above zero.
  sharpenTurns: number
  // Negates the next enemy hit, then clears.
  guarding: boolean
  enemyStunTurns: number
  // A windup enemy alternates: true means the next enemy turn is the strike.
  enemyWindingUp: boolean
  cooldowns: Record<string, number>
  // Consumables carried into this fight, minus the ones already spent. Items
  // are turns, so they are checked here the same way a cooldown is.
  held: string[]
  // What was used, in order. The panel spends these from the bag when the
  // fight ENDS, not at use: quitting mid-fight must not duplicate an item.
  used: string[]
  // Flat bonus from a worn trinket, added to every attack.
  bonusDamage: number
  // Reduces the next incoming hit, then clears. From a worn trinket.
  firstHitSoftener: number
  log: string[]
  outcome: 'ongoing' | 'won' | 'lost' | 'fled'
}

function roll(rng: () => number, [min, max]: [number, number]): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

export function startCombat(
  enemyId: string,
  catMaxHp: number,
  trinketId?: string,
  held: string[] = [],
): CombatState {
  const enemy = enemyById(enemyId)
  // Only an actual trinket applies -- a consumable id passed here is ignored
  // rather than silently granting a bonus it does not have.
  const trinket = trinketId ? itemById(trinketId) : undefined
  const worn = trinket?.kind === 'trinket' ? trinket : undefined
  const maxHp = catMaxHp + (worn?.bonusMaxHp ?? 0)
  return {
    enemyId,
    enemyHp: enemy?.maxHp ?? 1,
    catHp: maxHp,
    catMaxHp: maxHp,
    held: [...held],
    used: [],
    bonusDamage: worn?.bonusDamage ?? 0,
    firstHitSoftener: worn?.softensFirstHit ?? 0,
    sharpenTurns: 0,
    guarding: false,
    enemyStunTurns: 0,
    enemyWindingUp: false,
    cooldowns: {},
    log: [],
    outcome: 'ongoing',
  }
}

// Whether a fleeing enemy is hurt enough to be looking for a way out. Only
// 'flee' enemies ever are -- which is also why the kitchen boss fights to the
// end. Being cornered is not the same as escaping: the roll happens on the
// enemy's own turn, so the player always gets one more chance to finish it.
function isCornered(enemy: Enemy, enemyHp: number): boolean {
  if (enemy.behaviour !== 'flee') return false
  return enemyHp > 0 && enemyHp / enemy.maxHp < FLEE_THRESHOLD
}

export function takeTurn(state: CombatState, skillId: string, rng: () => number): CombatState {
  if (state.outcome !== 'ongoing') return state
  const enemy = enemyById(state.enemyId)
  if (!enemy) return state
  const skill = skillById(skillId)
  const item = itemById(skillId)
  // An action is either a skill the cat knows or a consumable it is carrying.
  // Anything else -- including a trinket, which is worn rather than used --
  // is not a legal move, so the turn is not spent.
  const usingItem = !skill && item?.kind === 'consumable' && state.held.includes(item.id)
  if (!skill && !usingItem) return state
  // Still on cooldown: also not a legal move.
  if (skill && (state.cooldowns[skill.id] ?? 0) > 0) return state

  const log: string[] = []
  let { enemyHp, catHp, sharpenTurns, guarding, enemyStunTurns, enemyWindingUp, firstHitSoftener } = state
  const cooldowns = { ...state.cooldowns }
  let held = state.held
  let used = state.used

  // --- the cat's turn ---
  if (usingItem && item) {
    // Removes one copy, not every copy -- carrying two means using two.
    const at = held.indexOf(item.id)
    held = [...held.slice(0, at), ...held.slice(at + 1)]
    used = [...used, item.id]
    if (item.heal) {
      const before = catHp
      catHp = Math.min(state.catMaxHp, catHp + item.heal)
      log.push(`${item.name}: ${catHp - before} hp back.`)
    }
    if (item.damage) {
      const dealt = roll(rng, item.damage) + state.bonusDamage
      enemyHp = Math.max(0, enemyHp - dealt)
      log.push(`${item.name} hits for ${dealt}.`)
    }
    if (item.sharpen) {
      sharpenTurns = SHARPEN_TURNS + 1
      log.push(`${item.name}: claws sharpened.`)
    }
  } else if (skill?.damage) {
    const bonus = sharpenTurns > 0 ? SHARPEN_BONUS : 0
    const dealt = roll(rng, skill.damage) + bonus + state.bonusDamage
    enemyHp = Math.max(0, enemyHp - dealt)
    log.push(`${skill.name} hits for ${dealt}.`)
  } else if (skill?.effect === 'sharpen') {
    sharpenTurns = SHARPEN_TURNS + 1 // +1: the tick at the end of this turn
    log.push('claws sharpened.')
  } else if (skill?.effect === 'guard') {
    guarding = true
    log.push('ears flat, braced for the next hit.')
  } else if (skill?.effect === 'stun') {
    enemyStunTurns = 1
    log.push(`the ${enemy.name} flinches back.`)
  }
  if (skill && skill.cooldown > 0) cooldowns[skill.id] = skill.cooldown + 1 // +1: ticked below

  if (enemyHp === 0) {
    return {
      ...state,
      enemyHp,
      catHp,
      sharpenTurns,
      guarding,
      enemyStunTurns,
      enemyWindingUp,
      cooldowns,
      held,
      used,
      firstHitSoftener,
      log: [...log, `the ${enemy.name} is beaten.`],
      outcome: 'won',
    }
  }

  // --- the enemy's turn ---
  if (enemyStunTurns > 0) {
    enemyStunTurns -= 1
    log.push(`the ${enemy.name} loses its turn.`)
  } else if (isCornered(enemy, enemyHp) && rng() < FLEE_CHANCE) {
    return {
      ...state,
      enemyHp,
      catHp,
      sharpenTurns,
      guarding,
      enemyStunTurns,
      enemyWindingUp,
      cooldowns,
      held,
      used,
      firstHitSoftener,
      log: [...log, `the ${enemy.name} bolts for cover.`],
      outcome: 'fled',
    }
  } else if (enemy.behaviour === 'windup' && !enemyWindingUp) {
    // Telegraphed: this turn is the wind-up, the next one lands.
    enemyWindingUp = true
    log.push(`the ${enemy.name} ${enemy.tells.windup}.`)
  } else {
    enemyWindingUp = false
    const incoming = roll(rng, enemy.damage)
    if (guarding) {
      guarding = false
      log.push(`you take the ${enemy.name}'s hit on flattened ears.`)
    } else {
      const softened = Math.max(0, incoming - firstHitSoftener)
      if (firstHitSoftener > 0) firstHitSoftener = 0
      catHp = Math.max(0, catHp - softened)
      log.push(`the ${enemy.name} hits back for ${softened}.`)
    }
  }

  if (catHp === 0) {
    return {
      ...state,
      enemyHp,
      catHp,
      sharpenTurns,
      guarding,
      enemyStunTurns,
      enemyWindingUp,
      cooldowns,
      held,
      used,
      firstHitSoftener,
      log: [...log, 'you back off, out of fight.'],
      outcome: 'lost',
    }
  }

  // --- end of round: buffs and cooldowns tick ---
  if (sharpenTurns > 0) sharpenTurns -= 1
  for (const id of Object.keys(cooldowns)) {
    cooldowns[id] -= 1
    if (cooldowns[id] <= 0) delete cooldowns[id]
  }

  return {
    ...state,
    enemyHp,
    catHp,
    sharpenTurns,
    guarding,
    enemyStunTurns,
    enemyWindingUp,
    cooldowns,
    held,
    used,
    firstHitSoftener,
    log,
    outcome: 'ongoing',
  }
}
