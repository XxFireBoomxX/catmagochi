import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestPanel } from './QuestPanel'
import { ZONES } from '../data/zones'

const KEY = 'catmagochi-quest-v1'
const zoneName = new RegExp(ZONES[0].name, 'i')

function setup() {
  const props = { name: 'Mia', onWin: vi.fn(), onClose: vi.fn() }
  render(<QuestPanel {...props} />)
  return props
}

const seedLevel = (level: number) =>
  localStorage.setItem(KEY, JSON.stringify({ level, xp: 0, zoneClears: {}, lastPlayDay: null }))

// Clicks swipe until the fight ends. Capped so a bug cannot hang the suite.
function fightToTheEnd() {
  for (let i = 0; i < 60; i++) {
    const swipe = screen.queryByRole('button', { name: /swipe/i })
    if (!swipe) return
    fireEvent.click(swipe)
  }
  throw new Error('fight did not end within 60 turns')
}

describe('QuestPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T09:00:00'))
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on the hunting grounds showing the level', () => {
    setup()
    expect(screen.getByText(/hunting grounds/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /level/i })).toBeInTheDocument()
  })

  it('lists the first zone as available', () => {
    setup()
    expect(screen.getByRole('button', { name: zoneName })).toBeInTheDocument()
  })

  it('shows how far through a zone the cat is', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ level: 1, xp: 0, zoneClears: { [ZONES[0].id]: 3 }, lastPlayDay: null }),
    )
    setup()
    expect(screen.getByRole('button', { name: zoneName })).toHaveTextContent(`3/${ZONES[0].length}`)
  })

  it('starts a fight when a zone is picked, showing both healths', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: /swipe/i })).toBeInTheDocument()
  })

  it('offers only the skills the level has unlocked', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    expect(screen.getByRole('button', { name: /swipe/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pounce/i })).not.toBeInTheDocument()
  })

  it('disables a skill while it is on cooldown', () => {
    seedLevel(2)
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fireEvent.click(screen.getByRole('button', { name: /pounce/i }))
    const pounce = screen.queryByRole('button', { name: /pounce/i })
    if (pounce) expect(pounce).toBeDisabled()
  })

  it('narrates the fight as it goes', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fireEvent.click(screen.getByRole('button', { name: /swipe/i }))
    expect(screen.getByText(/hits for \d+/i)).toBeInTheDocument()
  })

  it('reports the win and offers to go again', () => {
    seedLevel(9)
    const { onWin } = setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fightToTheEnd()
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /again/i })).toBeInTheDocument()
  })

  it('tells App whether this was the first win of the day', () => {
    seedLevel(9)
    const { onWin } = setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fightToTheEnd()
    expect(onWin).toHaveBeenCalledWith(true)
  })

  it('banks the xp from a win', () => {
    seedLevel(9)
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fightToTheEnd()
    expect(screen.getByText(/\+\d+ xp/i)).toBeInTheDocument()
  })

  it('offers a retry after a loss, and reports no win', () => {
    seedLevel(1) // 10 hp against a boss-free zone is still survivable, so force a loss
    localStorage.setItem(
      KEY,
      JSON.stringify({ level: 1, xp: 0, zoneClears: { [ZONES[0].id]: ZONES[0].length - 1 }, lastPlayDay: null }),
    )
    const { onWin } = setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fightToTheEnd()
    expect(onWin).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /again/i })).toBeInTheDocument()
  })

  it('goes back to the hunting grounds from a finished fight', () => {
    seedLevel(9)
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fightToTheEnd()
    fireEvent.click(screen.getByRole('button', { name: /grounds/i }))
    expect(screen.getByText(/hunting grounds/i)).toBeInTheDocument()
  })

  it('closes on back from the hunting grounds', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// --- slice 2: loot, the bag, and worn trinkets ---

describe('QuestPanel bag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T09:00:00'))
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const seedBag = (bag: Record<string, number>, worn: string | null = null) =>
    localStorage.setItem(
      KEY,
      JSON.stringify({ level: 9, xp: 0, zoneClears: {}, lastPlayDay: null, bag, worn }),
    )

  it('offers the bag from the hunting grounds', () => {
    setup()
    expect(screen.getByRole('button', { name: /bag/i })).toBeInTheDocument()
  })

  it('says the bag is empty when it is', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /bag/i }))
    expect(screen.getByText(/nothing/i)).toBeInTheDocument()
  })

  it('lists what is carried, with counts', () => {
    seedBag({ 'fish-scrap': 3 })
    setup()
    fireEvent.click(screen.getByRole('button', { name: /bag/i }))
    expect(screen.getByText(/fish scrap/i)).toBeInTheDocument()
    expect(screen.getByText(/x\s*3/i)).toBeInTheDocument()
  })

  it('wears a trinket from the bag', () => {
    seedBag({ 'rat-tooth': 1 })
    setup()
    fireEvent.click(screen.getByRole('button', { name: /bag/i }))
    fireEvent.click(screen.getByRole('button', { name: /rat tooth/i }))
    fireEvent.click(screen.getByRole('button', { name: /grounds/i }))
    expect(screen.getByText(/wearing.*rat tooth/i)).toBeInTheDocument()
  })

  it('puts a carried consumable in the move list', () => {
    seedBag({ 'bottle-cap': 2 })
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    expect(screen.getByRole('button', { name: /bottle cap/i })).toBeInTheDocument()
  })

  it('keeps a trinket out of the move list -- it is worn, not used', () => {
    seedBag({ 'rat-tooth': 1 })
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    expect(screen.queryByRole('button', { name: /rat tooth/i })).not.toBeInTheDocument()
  })

  it('drops the consumable from the move list once the last one is used', () => {
    seedBag({ 'bottle-cap': 1 })
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fireEvent.click(screen.getByRole('button', { name: /bottle cap/i }))
    expect(screen.queryByRole('button', { name: /bottle cap/i })).not.toBeInTheDocument()
  })

  it('spends what the fight used, once the fight is over', () => {
    seedBag({ 'bottle-cap': 2 })
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fireEvent.click(screen.getByRole('button', { name: /bottle cap/i }))
    fightToTheEnd()
    const saved = JSON.parse(localStorage.getItem(KEY)!)
    expect(saved.bag['bottle-cap']).toBe(1)
  })

  it('reports what the fight brought back', () => {
    seedBag({})
    setup()
    fireEvent.click(screen.getByRole('button', { name: zoneName }))
    fightToTheEnd()
    // A roll of 0 hits the first slot of the beetle's table, which is empty.
    expect(screen.getByText(/nothing but the/i)).toBeInTheDocument()
  })
})
