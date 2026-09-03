import { useState } from 'react'
import { StatBar } from './StatBar'
import { useQuest } from '../hooks/useQuest'
import { startCombat, takeTurn, type CombatState } from '../data/combat'
import { enemyById } from '../data/enemies'
import { encounterFor, type Zone } from '../data/zones'
import { itemById } from '../data/items'
import { rollLoot } from '../data/loot'
import './AsciiCat.css'
import './QuestPanel.css'

type View = 'grounds' | 'fight' | 'result' | 'bag'

interface FightResult {
  outcome: CombatState['outcome']
  xpGained: number
  levelsGained: number
  // The item id this fight brought back, or null for nothing.
  loot: string | null
}

// Replaces AsciiCat in the shared panel slot while [PLAY] is open, the same
// way the panels before it did -- hence the shared `.ascii-screen` chrome.
//
// All the rules live in data/combat.ts; this only decides what to render and
// hands Math.random() to the engine.
export function QuestPanel({
  name,
  onWin,
  onClose,
}: {
  name: string
  onWin: (firstWinToday: boolean) => void
  onClose: () => void
}) {
  const { level, xp, xpNeeded, maxHp, skills, clearsFor, unlockedZones, bag, worn, addLoot, consume, wear, recordWin, recordLoss } =
    useQuest()
  const [view, setView] = useState<View>('grounds')
  const [zone, setZone] = useState<Zone | null>(null)
  const [combat, setCombat] = useState<CombatState | null>(null)
  const [result, setResult] = useState<FightResult | null>(null)

  // The carried consumables, expanded one entry per copy -- the engine tracks
  // them as a list so using one removes exactly one.
  const heldConsumables = Object.entries(bag).flatMap(([id, count]) =>
    itemById(id)?.kind === 'consumable' ? Array<string>(count).fill(id) : [],
  )

  const startFight = (target: Zone) => {
    const enemyId = encounterFor(target, clearsFor(target.id), Math.random())
    setZone(target)
    setCombat(startCombat(enemyId, maxHp, worn ?? undefined, heldConsumables))
    setResult(null)
    setView('fight')
  }

  const chooseSkill = (skillId: string) => {
    if (!combat || !zone) return
    const next = takeTurn(combat, skillId, Math.random)
    setCombat(next)
    if (next.outcome === 'ongoing') return

    // A fled enemy is worth half -- it got away, but the cat did the work.
    const enemy = enemyById(next.enemyId)
    const xpGained =
      next.outcome === 'won' ? enemy?.xp ?? 0 : next.outcome === 'fled' ? Math.floor((enemy?.xp ?? 0) / 2) : 0

    // Consumables are spent here, at the end, not when they were used --
    // quitting mid-fight must not duplicate an item.
    consume(next.used)

    if (next.outcome === 'won') {
      const loot = rollLoot(next.enemyId, Math.random())
      addLoot(loot)
      const { levelsGained, firstWinToday } = recordWin(zone.id, xpGained)
      setResult({ outcome: next.outcome, xpGained, levelsGained, loot })
      onWin(firstWinToday)
    } else {
      recordLoss()
      setResult({ outcome: next.outcome, xpGained: 0, levelsGained: 0, loot: null })
    }
    setView('result')
  }

  if (view === 'fight' && combat && zone) {
    const enemy = enemyById(combat.enemyId)
    const tell = combat.enemyWindingUp ? enemy?.tells.windup : enemy?.tells.idle
    return (
      <div className="ascii-stage">
        <div className="ascii-screen quest-panel">
          <div className="quest-enemy">
            <pre className="quest-enemy-art">{enemy?.art.join('\n')}</pre>
            <div className="quest-enemy-info">
              <div className="quest-header">{enemy?.name}</div>
              <StatBar code="HP" label={`${enemy?.name} health`} value={(combat.enemyHp / (enemy?.maxHp ?? 1)) * 100} />
              <p className="quest-tell">{tell}</p>
            </div>
          </div>
          <StatBar code="HP" label={`${name} health`} value={(combat.catHp / combat.catMaxHp) * 100} />
          {combat.sharpenTurns > 0 && <p className="quest-buff">claws sharp ({combat.sharpenTurns} turns)</p>}
          <div className="quest-log">
            {combat.log.map((line, i) => (
              <p key={`${combat.log.length}-${i}`}>{line}</p>
            ))}
          </div>
          <div className="quest-options">
            {skills.map((skill) => {
              const cooling = combat.cooldowns[skill.id] ?? 0
              return (
                <button
                  key={skill.id}
                  className="quest-option"
                  onClick={() => chooseSkill(skill.id)}
                  disabled={cooling > 0}
                >
                  <span className="quest-option-name">{skill.name}</span>
                  <span className="quest-option-hint">{cooling > 0 ? `${cooling} turns` : skill.hint}</span>
                </button>
              )
            })}
            {[...new Set(combat.held)].map((id) => {
              const item = itemById(id)!
              const count = combat.held.filter((held) => held === id).length
              return (
                <button key={id} className="quest-option" onClick={() => chooseSkill(id)}>
                  <span className="quest-option-name">
                    {item.name} x{count}
                  </span>
                  <span className="quest-option-hint">{item.hint}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (view === 'result' && result) {
    const headline =
      result.outcome === 'won' ? 'VICTORY' : result.outcome === 'fled' ? 'IT GOT AWAY' : 'DRIVEN OFF'
    return (
      <div className="ascii-stage">
        <div className="ascii-screen quest-panel">
          <div className="quest-header">{headline}</div>
          {result.xpGained > 0 && <p className="quest-xp">+{result.xpGained} xp</p>}
          {result.levelsGained > 0 && <p className="quest-levelup">{name} reached level {level}!</p>}
          {result.outcome === 'lost' && <p className="quest-tell">{name} shakes it off. Nothing lost but the fight.</p>}
          {result.outcome === 'won' &&
            (result.loot ? (
              <p className="quest-loot">brought back: {itemById(result.loot)?.name}</p>
            ) : (
              <p className="quest-tell">nothing but the satisfaction.</p>
            ))}
          <div className="quest-options">
            <button className="quest-option" onClick={() => zone && startFight(zone)}>
              <span className="quest-option-name">go again</span>
            </button>
            <button className="quest-option" onClick={() => setView('grounds')}>
              <span className="quest-option-name">back to the grounds</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'bag') {
    const entries = Object.entries(bag)
    return (
      <div className="ascii-stage">
        <div className="ascii-screen quest-panel">
          <div className="quest-header">BAG</div>
          {entries.length === 0 ? (
            <p className="quest-tell">nothing in here yet.</p>
          ) : (
            <div className="quest-options">
              {entries.map(([id, count]) => {
                const item = itemById(id)!
                const isWorn = worn === id
                return (
                  <button
                    key={id}
                    className="quest-option"
                    // Tapping a trinket wears it (or takes it off). Tapping a
                    // consumable does nothing here -- those are used in a fight.
                    onClick={() => item.kind === 'trinket' && wear(isWorn ? null : id)}
                  >
                    <span className="quest-option-name">
                      {item.name} x{count}
                    </span>
                    <span className="quest-option-hint">{isWorn ? 'worn' : item.hint}</span>
                  </button>
                )
              })}
            </div>
          )}
          <button className="quest-back" onClick={() => setView('grounds')}>
            [ BACK TO THE GROUNDS ]
          </button>
        </div>
      </div>
    )
  }

  const carriedCount = Object.values(bag).reduce((sum, n) => sum + n, 0)

  return (
    <div className="ascii-stage">
      <div className="ascii-screen quest-panel">
        <div className="quest-header">
          {name} &mdash; level {level}
        </div>
        <StatBar code="LVL" label={`Level ${level} progress`} value={(xp / xpNeeded) * 100} />
        <div className="quest-subheader">HUNTING GROUNDS</div>
        <div className="quest-options">
          {unlockedZones.map((z) => (
            <button key={z.id} className="quest-option" onClick={() => startFight(z)}>
              <span className="quest-option-name">{z.name}</span>
              <span className="quest-option-hint">
                {Math.min(clearsFor(z.id), z.length)}/{z.length}
                {clearsFor(z.id) >= z.length ? ' cleared' : ''}
              </span>
            </button>
          ))}
        </div>
        <button className="quest-option" onClick={() => setView('bag')}>
          <span className="quest-option-name">bag</span>
          <span className="quest-option-hint">{carriedCount > 0 ? `${carriedCount} carried` : 'empty'}</span>
        </button>
        {worn && <p className="quest-tell">wearing: {itemById(worn)?.name}</p>}
        <button className="quest-back" onClick={onClose}>
          [ BACK ]
        </button>
      </div>
    </div>
  )
}
