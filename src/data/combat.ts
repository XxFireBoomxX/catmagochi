import { FLEE_CHANCE, FLEE_THRESHOLD, enemyById, type Enemy } from './enemies'
import { skillById } from './skills'

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
  log: string[]
  outcome: 'ongoing' | 'won' | 'lost' | 'fled'
}

function roll(rng: () => number, [min, max]: [number, number]): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

export function startCombat(enemyId: string, catMaxHp: number): CombatState {
  const enemy = enemyById(enemyId)
  return {
    enemyId,
    enemyHp: enemy?.maxHp ?? 1,
    catHp: catMaxHp,
    catMaxHp,
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
  const skill = skillById(skillId)
  const enemy = enemyById(state.enemyId)
  if (!skill || !enemy) return state
  // Still on cooldown: not a legal move, so the turn is not spent.
  if ((state.cooldowns[skill.id] ?? 0) > 0) return state

  const log: string[] = []
  let { enemyHp, catHp, sharpenTurns, guarding, enemyStunTurns, enemyWindingUp } = state
  const cooldowns = { ...state.cooldowns }

  // --- the cat's turn ---
  if (skill.damage) {
    const bonus = sharpenTurns > 0 ? SHARPEN_BONUS : 0
    const dealt = roll(rng, skill.damage) + bonus
    enemyHp = Math.max(0, enemyHp - dealt)
    log.push(`${skill.name} hits for ${dealt}.`)
  } else if (skill.effect === 'sharpen') {
    sharpenTurns = SHARPEN_TURNS + 1 // +1: the tick at the end of this turn
    log.push('claws sharpened.')
  } else if (skill.effect === 'guard') {
    guarding = true
    log.push('ears flat, braced for the next hit.')
  } else if (skill.effect === 'stun') {
    enemyStunTurns = 1
    log.push(`the ${enemy.name} flinches back.`)
  }
  if (skill.cooldown > 0) cooldowns[skill.id] = skill.cooldown + 1 // +1: ticked below

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
      catHp = Math.max(0, catHp - incoming)
      log.push(`the ${enemy.name} hits back for ${incoming}.`)
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
    log,
    outcome: 'ongoing',
  }
}
