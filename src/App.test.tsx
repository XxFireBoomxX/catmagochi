import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { START_TOTAL_MS } from './components/StartScreen'
import type { CareEventType, PetSave, RelayMessage } from './types'
import { ZONES } from './data/zones'
import { collarFor, levelBand } from './data/appearance'

const SAVE_KEY = 'catmagochi-save-v1'
const NOW = new Date('2026-01-01T00:00:00.000Z').getTime()

let mockMessages: RelayMessage[] = []
const mockDismiss = vi.fn((id: string) => {
  mockMessages = mockMessages.filter((m) => m.id !== id)
})
// App no longer calls send() -- the nudge is gone -- but useMessages still
// exports it (kept for a future relay), so the mock mirrors the real shape.
const mockSend = vi.fn()
vi.mock('./hooks/useMessages', () => ({
  useMessages: () => ({ messages: mockMessages, dismiss: mockDismiss, send: mockSend }),
}))

vi.mock('./hooks/useFlavorText', () => ({
  useFlavorText: (mood: string) => `is ${mood} (mocked)`,
}))

// Mocked the same way useMessages is above -- real reconnect/backoff
// behavior is covered by useCareEvents.test.ts; here we only care about
// App wiring emit() to local actions and onEvent to applyRemoteEvent.
// Capturing onEvent lets tests simulate an event arriving from another
// device by just calling it directly, without a real WebSocket.
const mockEmit = vi.fn()
let capturedOnCareEvent: ((id: string, type: CareEventType) => boolean) | null = null
vi.mock('./hooks/useCareEvents', () => ({
  useCareEvents: (onEvent: (id: string, type: CareEventType) => boolean) => {
    capturedOnCareEvent = onEvent
    return { emit: mockEmit }
  },
}))

function seedSave(overrides: Partial<PetSave> = {}) {
  const save: PetSave = {
    name: 'Mochi',
    stats: { fullness: 80, happiness: 80, energy: 80, cleanliness: 80 },
    sleeping: false,
    lastUpdate: NOW,
    growth: 0,
    adoptedAt: NOW,
    totalFeeds: 0,
    totalPlays: 0,
    totalCleans: 0,
    totalPets: 0,
    ...overrides,
  }
  localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  return save
}

function getSave(): PetSave {
  return JSON.parse(localStorage.getItem(SAVE_KEY)!)
}

// Every test below cares about what's underneath the boot splash, not the
// splash itself (that's covered by its own describe block, and in full by
// StartScreen.test.tsx) -- so render past it by default.
function renderApp() {
  const result = render(<App />)
  act(() => {
    vi.advanceTimersByTime(START_TOTAL_MS)
  })
  return result
}

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockMessages = []
    mockDismiss.mockClear()
    mockSend.mockClear()
    mockEmit.mockClear()
    capturedOnCareEvent = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('start screen', () => {
    it('shows the boot screen first, before either the name screen or the game', () => {
      seedSave()
      render(<App />)
      expect(screen.getByRole('heading', { name: 'Catmagochi' })).toBeInTheDocument()
      expect(screen.queryByText('[FEED]')).not.toBeInTheDocument()
    })

    it('reveals the name screen once the boot duration elapses, when there is no save', () => {
      render(<App />)
      act(() => {
        vi.advanceTimersByTime(START_TOTAL_MS)
      })
      expect(screen.getByPlaceholderText("Kitten's name")).toBeInTheDocument()
    })

    it('reveals the game screen once the boot duration elapses, when a save exists', () => {
      seedSave()
      render(<App />)
      act(() => {
        vi.advanceTimersByTime(START_TOTAL_MS)
      })
      expect(screen.getByText('[FEED]')).toBeInTheDocument()
    })

    it('skips the boot screen entirely on a later open, once it has been seen', () => {
      localStorage.setItem('catmagochi-start-seen-v1', '1')
      seedSave()
      render(<App />)
      expect(screen.queryByRole('heading', { name: 'Catmagochi' })).not.toBeInTheDocument()
      expect(screen.getByText('[FEED]')).toBeInTheDocument()
    })

    it('marks the boot screen as seen once it completes', () => {
      render(<App />)
      act(() => {
        vi.advanceTimersByTime(START_TOTAL_MS)
      })
      expect(localStorage.getItem('catmagochi-start-seen-v1')).toBe('1')
    })
  })

  describe('adoption flow', () => {
    it('shows the name screen when there is no save yet', () => {
      renderApp()
      expect(screen.getByText('Catmagochi')).toBeInTheDocument()
      expect(screen.getByPlaceholderText("Kitten's name")).toBeInTheDocument()
    })

    it('creates a pet with the entered name and shows the game screen', () => {
      renderApp()
      fireEvent.change(screen.getByPlaceholderText("Kitten's name"), { target: { value: 'Tama' } })
      fireEvent.click(screen.getByText('[ ADOPT ]'))
      expect(screen.getByRole('heading', { name: 'Tama' })).toBeInTheDocument()
      expect(getSave().name).toBe('Tama')
    })

    it('falls back to the default name when submitted blank', () => {
      renderApp()
      fireEvent.click(screen.getByText('[ ADOPT ]'))
      expect(screen.getByRole('heading', { name: 'Cat' })).toBeInTheDocument()
    })
  })

  describe('main game screen', () => {
    it('shows the app version in the top-left corner', () => {
      seedSave()
      renderApp()
      expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument()
    })

    it('pops the mood caption up at a randomized, bounded position instead of a fixed spot', () => {
      seedSave()
      renderApp()
      const caption = screen.getByText('Mochi is happy (mocked)')
      expect(caption).toHaveAttribute('aria-live', 'polite')
      const top = Number.parseFloat(caption.style.top)
      const left = Number.parseFloat(caption.style.left)
      expect(top).toBeGreaterThanOrEqual(10)
      expect(top).toBeLessThanOrEqual(45)
      expect(left).toBeGreaterThanOrEqual(15)
      expect(left).toBeLessThanOrEqual(75)
    })

    it('replaces the popped caption (new DOM node) whenever the underlying text changes', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      seedSave()
      renderApp()
      const first = screen.getByText('Mochi is happy (mocked)')
      fireEvent.click(screen.getByText('[FEED]')) // 0 < ACTION_FLAVOR_CHANCE, bonus line triggers
      expect(screen.queryByText('Mochi is happy (mocked)')).not.toBeInTheDocument()
      const second = screen.getByText(/smacks its lips/)
      expect(second).not.toBe(first)
    })

    it('renders the stage badge and all four stat bars from the save', () => {
      seedSave()
      renderApp()
      expect(screen.getByText('[KITTEN]')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'Fullness' })).toHaveAttribute('aria-valuenow', '80')
      expect(screen.getByRole('progressbar', { name: 'Happiness' })).toHaveAttribute('aria-valuenow', '80')
      expect(screen.getByRole('progressbar', { name: 'Energy' })).toHaveAttribute('aria-valuenow', '80')
      expect(screen.getByRole('progressbar', { name: 'Cleanliness' })).toHaveAttribute('aria-valuenow', '80')
    })

    // The local pulse lists were hand-written per button and had drifted from
    // what applyCareEvent actually changes; the CARE_EVENT_STATS table used
    // for *remote* events was the correct one all along.
    it('feeding pulses happiness too, since feeding raises it', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[FEED]'))
      const fill = screen.getByRole('progressbar', { name: 'Happiness' }).querySelector('.stat-fill')
      expect(fill).toHaveClass('pulsing')
    })

    it('petting pulses the happiness bar', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
      const fill = screen.getByRole('progressbar', { name: 'Happiness' }).querySelector('.stat-fill')
      expect(fill).toHaveClass('pulsing')
    })

    it('feeding increases fullness and briefly pulses the fullness bar', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[FEED]'))
      expect(getSave().stats.fullness).toBe(100)
      const fill = screen.getByRole('progressbar', { name: 'Fullness' }).querySelector('.stat-fill')
      expect(fill).toHaveClass('pulsing')
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(fill).not.toHaveClass('pulsing')
    })

    it('cleaning increases cleanliness', () => {
      seedSave({ stats: { fullness: 80, happiness: 80, energy: 80, cleanliness: 40 } })
      renderApp()
      fireEvent.click(screen.getByText('[CLEAN]'))
      expect(getSave().stats.cleanliness).toBe(70)
    })

    it('sleep toggles to wake, and disables feed/play/clean while asleep', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[SLEEP]'))
      expect(getSave().sleeping).toBe(true)
      expect(screen.getByText('[WAKE]')).toBeInTheDocument()
      expect(screen.getByText('[FEED]')).toBeDisabled()
      expect(screen.getByText('[PLAY]')).toBeDisabled()
      expect(screen.getByText('[CLEAN]')).toBeDisabled()
      expect(screen.getByText('[WAKE]')).not.toBeDisabled()

      fireEvent.click(screen.getByText('[FEED]'))
      expect(getSave().stats.fullness).toBe(80) // unchanged, click didn't fire

      fireEvent.click(screen.getByText('[WAKE]'))
      expect(getSave().sleeping).toBe(false)
    })

    it('petting the cat increases happiness via the real AsciiCat integration', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
      expect(getSave().stats.happiness).toBe(83)
    })
  })

  describe('action juice (cues + bonus flavor)', () => {
    it('shows a feed-specific glyph on the cat after feeding', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[FEED]'))
      expect(document.querySelector('.cat-effect')?.textContent).toBe('nom nom')
    })

    it('shows a clean-specific glyph on the cat after cleaning', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[CLEAN]'))
      expect(document.querySelector('.cat-effect')?.textContent).toBe('*scrub*')
    })

    it('shows sleep/wake-specific glyphs on toggling sleep', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[SLEEP]'))
      expect(document.querySelector('.cat-effect')?.textContent).toBe('zzz')
      fireEvent.click(screen.getByText('[WAKE]'))
      expect(document.querySelector('.cat-effect')?.textContent).toBe('o.o')
    })

    it('occasionally replaces the mood caption with a bonus reaction line after an action, then reverts', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[FEED]'))
      expect(screen.getByText(/smacks its lips/)).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2_500)
      })
      expect(screen.queryByText(/smacks its lips/)).not.toBeInTheDocument()
      expect(screen.getByText('Mochi is happy (mocked)')).toBeInTheDocument()
    })

    it('does not show a bonus line when the random chance misses', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9)
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[FEED]'))
      expect(screen.getByText('Mochi is happy (mocked)')).toBeInTheDocument()
    })

    it('can also show a bonus line after a successful pet', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      seedSave()
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
      expect(screen.getByText(/leans into your hand/)).toBeInTheDocument()
    })

    it('does not show a bonus line for a pet that fails its cooldown', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      seedSave()
      renderApp()
      const catButton = screen.getByRole('button', { name: 'Pet Mochi' })
      fireEvent.click(catButton) // applies, growth +1
      fireEvent.click(catButton) // still on cooldown, no-op
      expect(getSave().growth).toBe(1)
    })
  })

  describe('play / the hunt', () => {
    const zoneName = new RegExp(ZONES[0].name, 'i')

    // These tests assert on winning, so the fight must not be left to chance:
    // a roll of 0 picks the weakest enemy and its lowest damage, which a
    // level-9 cat clears every time.
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
    })

    // Level 9 unlocks every skill and gives enough HP to reliably win.
    const seedHunter = () =>
      localStorage.setItem(
        'catmagochi-quest-v1',
        JSON.stringify({ level: 9, xp: 0, zoneClears: {}, lastPlayDay: null }),
      )

    // Clicks swipe until the fight resolves. Capped so a bug cannot hang.
    function fightToTheEnd() {
      for (let i = 0; i < 60; i++) {
        const swipe = screen.queryByRole('button', { name: /swipe/i })
        if (!swipe) return
        fireEvent.click(swipe)
      }
      throw new Error('fight did not end within 60 turns')
    }

    function winOneFight() {
      fireEvent.click(screen.getByText('[PLAY]'))
      fireEvent.click(screen.getByRole('button', { name: zoneName }))
      fightToTheEnd()
      fireEvent.click(screen.getByRole('button', { name: /grounds/i }))
      fireEvent.click(screen.getByRole('button', { name: /back/i }))
    }

    it('opens the hunting grounds in place of the cat, and disables other actions', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      expect(screen.getByText(/hunting grounds/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pet Mochi' })).not.toBeInTheDocument()
      expect(screen.getByText('[FEED]')).toBeDisabled()
      expect(screen.getByText('[CLEAN]')).toBeDisabled()
      expect(screen.getByText('[PLAY]')).toBeDisabled()
    })

    it('back closes the panel and restores the cat', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      fireEvent.click(screen.getByRole('button', { name: /back/i }))
      expect(screen.getByRole('button', { name: 'Pet Mochi' })).toBeInTheDocument()
      expect(screen.getByText('[FEED]')).not.toBeDisabled()
    })

    // Fighting is unlimited, so the care event has to be rationed instead --
    // otherwise it is an unlimited stat faucet.
    it('applies the play reward for the first win of the day only', () => {
      seedSave()
      seedHunter()
      renderApp()
      winOneFight()
      expect(getSave().totalPlays).toBe(1)
      winOneFight()
      expect(getSave().totalPlays).toBe(1)
    })

    it('emits exactly one play care event for the first win of the day', () => {
      seedSave()
      seedHunter()
      renderApp()
      winOneFight()
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(mockEmit.mock.calls[0][1]).toBe('play')
      winOneFight()
      expect(mockEmit).toHaveBeenCalledTimes(1)
    })
  })

  describe('incoming messages', () => {
    it('shows the message panel instead of the cat when a message is queued', () => {
      seedSave()
      mockMessages = [{ id: 'm1', text: 'hi from home', sentAt: NOW }]
      renderApp()
      expect(screen.getByText('hi from home')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pet Mochi' })).not.toBeInTheDocument()
      expect(screen.getByText('[FEED]')).toBeDisabled()
    })

    it('does not let an incoming message interrupt an open hunt', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      expect(screen.getByText(/hunting grounds/i)).toBeInTheDocument()

      // Queue a message while the picker is open and force a re-render via
      // usePet's own tick (the mocked useMessages hook only re-reads this on
      // the next render).
      mockMessages = [{ id: 'm1', text: 'hi from home', sentAt: NOW }]
      act(() => {
        vi.advanceTimersByTime(5_000) // usePet's TICK_MS
      })

      expect(screen.getByText(/hunting grounds/i)).toBeInTheDocument()
      expect(screen.queryByText('hi from home')).not.toBeInTheDocument()
    })

    it('dismissing a message acks it, records history, and bumps happiness', () => {
      seedSave()
      mockMessages = [{ id: 'm1', text: 'hi from home', sentAt: NOW }]
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }))
      expect(mockDismiss).toHaveBeenCalledWith('m1')
      expect(getSave().stats.happiness).toBe(85)
      const historyRaw = localStorage.getItem('catmagochi-message-history-v1')
      expect(JSON.parse(historyRaw!)).toEqual([{ id: 'm1', text: 'hi from home', sentAt: NOW }])
    })

    it('dismissing a nudge-kind message skips the generic happiness bonus (already rewarded via its care event)', () => {
      seedSave()
      mockMessages = [{ id: 'm1', text: 'Thinking of you', sentAt: NOW, kind: 'nudge' }]
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }))
      expect(mockDismiss).toHaveBeenCalledWith('m1')
      expect(getSave().stats.happiness).toBe(80)
      const historyRaw = localStorage.getItem('catmagochi-message-history-v1')
      expect(JSON.parse(historyRaw!)).toEqual([{ id: 'm1', text: 'Thinking of you', sentAt: NOW, kind: 'nudge' }])
    })
  })

  describe('shared-pet sync', () => {
    it('emits a care event when feeding', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[FEED]'))
      expect(mockEmit).toHaveBeenCalledTimes(1)
      const [id, type] = mockEmit.mock.calls[0]
      expect(typeof id).toBe('string')
      expect(type).toBe('feed')
    })

    it('emits a care event when cleaning', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[CLEAN]'))
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(mockEmit.mock.calls[0][1]).toBe('clean')
    })

    it('emits a care event when petting', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(mockEmit.mock.calls[0][1]).toBe('pet')
    })

    it('applies an incoming remote care event to the save and pulses the affected stat', () => {
      seedSave()
      renderApp()
      act(() => {
        capturedOnCareEvent?.('remote-1', 'feed')
      })
      expect(getSave().stats.fullness).toBe(100)
      expect(getSave().growth).toBe(3)
      const fill = screen.getByRole('progressbar', { name: 'Fullness' }).querySelector('.stat-fill')
      expect(fill).toHaveClass('pulsing')
    })

    // The defect this guards: handleRemoteCareEventRef.current is assigned
    // during render *after* the boot-splash and name-screen early returns, so
    // it stays the default () => false while either is up. Reporting false is
    // what keeps a partner's queued actions on the relay instead of acking
    // them into oblivion during setup. Move that assignment above the early
    // returns and every unit test still passes -- only this one fails.
    it('does not ack a care event that arrives while the boot splash is up', () => {
      seedSave()
      render(<App />) // deliberately not renderApp(): stay on the splash
      expect(screen.getByText(/booting/)).toBeInTheDocument()
      expect(capturedOnCareEvent?.('during-splash', 'feed')).toBe(false)
    })

    it('does not ack a care event that arrives before the pet is named', () => {
      localStorage.setItem('catmagochi-start-seen-v1', '1') // skip the splash
      render(<App />)
      expect(screen.getByText(/What should we name your new kitten/)).toBeInTheDocument()
      expect(capturedOnCareEvent?.('before-adoption', 'feed')).toBe(false)
    })

    // The handler's return value is the ack decision useCareEvents acts on.
    // A duplicate must still report true: it is dealt with, and leaving it
    // unacked means the relay replays it on every reconnect, forever.
    it('tells the relay to drop a redelivered event it has already applied', () => {
      seedSave()
      renderApp()
      let first: boolean | undefined
      let second: boolean | undefined
      act(() => {
        first = capturedOnCareEvent?.('remote-dup', 'feed')
      })
      act(() => {
        second = capturedOnCareEvent?.('remote-dup', 'feed')
      })
      expect(first).toBe(true)
      expect(second).toBe(true)
      // ...but the deltas ran exactly once
      expect(getSave().totalFeeds).toBe(1)
    })

    it('shows the same reaction glyph for a remote feed as a local one', () => {
      seedSave()
      renderApp()
      act(() => {
        capturedOnCareEvent?.('remote-1', 'feed')
      })
      expect(document.querySelector('.cat-effect')?.textContent).toBe('nom nom')
    })

    it('a remote pet event pulses happiness without a feed/clean-style glyph cue', () => {
      seedSave()
      renderApp()
      act(() => {
        capturedOnCareEvent?.('remote-1', 'pet')
      })
      expect(getSave().stats.happiness).toBe(83)
      expect(getSave().totalPets).toBe(1)
      const fill = screen.getByRole('progressbar', { name: 'Happiness' }).querySelector('.stat-fill')
      expect(fill).toHaveClass('pulsing')
    })

    it('a remote play (nudge) event pulses stats and shows its own glyph cue', () => {
      seedSave()
      renderApp()
      act(() => {
        capturedOnCareEvent?.('remote-1', 'play')
      })
      expect(getSave().stats.happiness).toBe(90)
      expect(getSave().totalPlays).toBe(1)
      expect(document.querySelector('.cat-effect')?.textContent).toBe('*purr*')
    })

    it('does not double-apply a remote event that echoes an id this device already emitted', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[FEED]')) // local: growth 3, fullness 100
      const emittedId = mockEmit.mock.calls[0][0] as string
      act(() => {
        capturedOnCareEvent?.(emittedId, 'feed') // relay echoing our own event back
      })
      expect(getSave().growth).toBe(3)
    })

    it('a remote event does not itself trigger another outgoing emit', () => {
      seedSave()
      renderApp()
      act(() => {
        capturedOnCareEvent?.('remote-1', 'clean')
      })
      expect(mockEmit).not.toHaveBeenCalled()
    })
  })

  describe('growth banner', () => {
    it('shows no banner for the initial kitten stage', () => {
      seedSave({ growth: 0 })
      renderApp()
      expect(screen.queryByText(/GREW INTO/)).not.toBeInTheDocument()
    })

    it('shows a banner on transitioning to young, then auto-dismisses it', () => {
      seedSave({ growth: 39 }) // one pet (+1 growth) away from the young threshold (40)
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
      expect(screen.getByText('Mochi GREW INTO A YOUNG CAT!')).toBeInTheDocument()
      expect(screen.getByText('[YOUNG CAT]')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2_500)
      })
      expect(screen.queryByText('Mochi GREW INTO A YOUNG CAT!')).not.toBeInTheDocument()
    })
  })

  describe('growth progress toggle', () => {
    it('is hidden until the stage badge is tapped', () => {
      seedSave({ growth: 20 })
      renderApp()
      expect(screen.queryByText(/Growth to/)).not.toBeInTheDocument()
    })

    it('shows progress toward the next stage when tapped, and hides again on a second tap', () => {
      seedSave({ growth: 20 }) // kitten, 20/40 = 50% toward young
      renderApp()
      const badge = screen.getByText('[KITTEN]')
      fireEvent.click(badge)
      expect(screen.getByRole('progressbar', { name: 'Growth to YOUNG CAT' })).toHaveAttribute('aria-valuenow', '50')
      expect(badge).toHaveAttribute('aria-expanded', 'true')

      fireEvent.click(badge)
      expect(screen.queryByText(/Growth to/)).not.toBeInTheDocument()
      expect(badge).toHaveAttribute('aria-expanded', 'false')
    })

    it('toggles via keyboard (Enter/Space) as well as click', () => {
      seedSave({ growth: 20 })
      renderApp()
      const badge = screen.getByText('[KITTEN]')
      fireEvent.keyDown(badge, { key: 'Enter' })
      expect(screen.getByRole('progressbar', { name: 'Growth to YOUNG CAT' })).toBeInTheDocument()
      fireEvent.keyDown(badge, { key: ' ' })
      expect(screen.queryByText(/Growth to/)).not.toBeInTheDocument()
    })

    it('ignores keys other than Enter/Space', () => {
      seedSave({ growth: 20 })
      renderApp()
      const badge = screen.getByText('[KITTEN]')
      fireEvent.keyDown(badge, { key: 'a' })
      expect(screen.queryByText(/Growth to/)).not.toBeInTheDocument()
    })

    it('shows progress toward adult while young, relative to the young threshold', () => {
      seedSave({ growth: 80 }) // young, (80-40)/(120-40) = 50% toward adult
      renderApp()
      fireEvent.click(screen.getByText('[YOUNG CAT]'))
      expect(screen.getByRole('progressbar', { name: 'Growth to ADULT CAT' })).toHaveAttribute('aria-valuenow', '50')
    })

    it('shows a "fully grown" message instead of a bar once adult', () => {
      seedSave({ growth: 120 })
      renderApp()
      fireEvent.click(screen.getByText('[ADULT CAT]'))
      expect(screen.getByText('fully grown!')).toBeInTheDocument()
      expect(screen.queryByRole('progressbar', { name: /Growth to/ })).not.toBeInTheDocument()
    })
  })

  describe('menu', () => {
    it('opens the menu overlay and closes it', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[MENU]'))
      const overlay = screen.getByText('MENU').closest('.menu-panel') as HTMLElement
      fireEvent.click(within(overlay).getByText('[ CLOSE ]'))
      expect(screen.queryByText('MESSAGE HISTORY')).not.toBeInTheDocument()
    })

    it('disables the menu button while a mini-game is active', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      expect(screen.getByText('[MENU]')).toBeDisabled()
    })

    // The overlay hides the card but the buttons behind it were still live.
    it('disables the care actions behind the menu overlay', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[MENU]'))
      for (const label of ['[FEED]', '[PLAY]', '[CLEAN]', '[SLEEP]']) {
        expect(screen.getByText(label)).toBeDisabled()
      }
    })

    it('re-enables the care actions once the menu closes', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[MENU]'))
      const overlay = screen.getByText('MENU').closest('.menu-panel') as HTMLElement
      fireEvent.click(within(overlay).getByText('[ CLOSE ]'))
      expect(screen.getByText('[FEED]')).not.toBeDisabled()
    })
  })

  describe('stats window', () => {
    it('opens when the pet name is clicked, showing extended stats', () => {
      seedSave({ growth: 20, totalFeeds: 4 })
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Mochi' }))
      expect(screen.getByText("Mochi'S STATS")).toBeInTheDocument()
      expect(screen.getByText('Times fed')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('closes via the close button', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Mochi' }))
      fireEvent.click(screen.getByText('[ CLOSE ]'))
      expect(screen.queryByText("Mochi'S STATS")).not.toBeInTheDocument()
    })

    it('disables the care actions behind the stats overlay', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByRole('button', { name: 'Mochi' }))
      expect(screen.getByText('[FEED]')).toBeDisabled()
    })

    it('returns focus to the pet name after closing', () => {
      seedSave()
      renderApp()
      const nameButton = screen.getByRole('button', { name: 'Mochi' })
      nameButton.focus()
      fireEvent.click(nameButton)
      fireEvent.click(screen.getByText('[ CLOSE ]'))
      expect(document.activeElement).toBe(nameButton)
    })

    it('the pet name stays an accessible heading even though it is also clickable', () => {
      seedSave()
      renderApp()
      expect(screen.getByRole('heading', { name: 'Mochi' })).toBeInTheDocument()
    })
  })

  describe('notification prompt', () => {
    it('shows the prompt after adoption when notifications are off', () => {
      seedSave()
      renderApp()
      expect(screen.getByText(/Turn on notifications/)).toBeInTheDocument()
    })

    it('does not show the prompt once notifications are already enabled', () => {
      seedSave()
      localStorage.setItem(
        'catmagochi-notification-settings-v1',
        JSON.stringify({ global: true, message: true, attention: true, update: true }),
      )
      renderApp()
      expect(screen.queryByText(/Turn on notifications/)).not.toBeInTheDocument()
    })

    it('does not show the prompt once it has already been dismissed', () => {
      seedSave()
      localStorage.setItem('catmagochi-notification-prompt-seen-v1', '1')
      renderApp()
      expect(screen.queryByText(/Turn on notifications/)).not.toBeInTheDocument()
    })

    it('[ ENABLE ] turns notifications on and dismisses the prompt', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[ ENABLE ]'))
      expect(screen.queryByText(/Turn on notifications/)).not.toBeInTheDocument()
      const settings = JSON.parse(localStorage.getItem('catmagochi-notification-settings-v1')!)
      expect(settings.global).toBe(true)
      expect(localStorage.getItem('catmagochi-notification-prompt-seen-v1')).toBe('1')
    })

    it('[ NOT NOW ] dismisses the prompt without changing settings', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[ NOT NOW ]'))
      expect(screen.queryByText(/Turn on notifications/)).not.toBeInTheDocument()
      expect(localStorage.getItem('catmagochi-notification-prompt-seen-v1')).toBe('1')
      const stored = localStorage.getItem('catmagochi-notification-settings-v1')
      expect(stored ? JSON.parse(stored).global : false).toBe(false)
    })
  })
})

describe('the cat shows its level and gear on the main screen', () => {
  // Its own setup: this block sits outside the main describe, whose beforeEach
  // is what renderApp()'s timer advance depends on.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockMessages = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('wears the trinket outside the panel, not only inside it', () => {
    seedSave()
    localStorage.setItem(
      'catmagochi-quest-v1',
      JSON.stringify({ level: 1, xp: 0, zoneClears: {}, lastPlayDay: null, bag: { 'rat-tooth': 1 }, worn: 'rat-tooth' }),
    )
    renderApp()
    expect(document.querySelector('.cat-collar')?.textContent).toBe(collarFor('rat-tooth'))
  })

  it('shows no collar when nothing is worn', () => {
    seedSave()
    renderApp()
    expect(document.querySelector('.cat-collar')).toBeNull()
  })

  it('carries the level band onto the sprite', () => {
    seedSave()
    localStorage.setItem(
      'catmagochi-quest-v1',
      JSON.stringify({ level: 9, xp: 0, zoneClears: {}, lastPlayDay: null, bag: {}, worn: null }),
    )
    renderApp()
    expect(document.querySelector('.cat-sprite')).toHaveAttribute('data-level-band', String(levelBand(9)))
  })
})

// The reported defect: "cat needs attention" is documented as local-only and
// needing no server, but the only requestPermission() call lived inside
// usePushSubscription, which no-ops without relay/VAPID env vars. Permission
// was therefore never granted and the local alert never fired.
describe('notifications work without a relay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockMessages = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('asks for permission when notifications are switched on, with no relay configured', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    seedSave()
    localStorage.setItem(
      'catmagochi-notification-settings-v1',
      JSON.stringify({ global: true, message: true, attention: true, update: true }),
    )
    renderApp()
    await act(async () => {})
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('asks for nothing while notifications are switched off', async () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    seedSave()
    renderApp()
    await act(async () => {})
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('says what is actually working when there is no relay', () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    seedSave()
    localStorage.setItem(
      'catmagochi-notification-settings-v1',
      JSON.stringify({ global: true, message: true, attention: true, update: true }),
    )
    renderApp()
    fireEvent.click(screen.getByText('[MENU]'))
    fireEvent.click(screen.getByText('SETTINGS'))
    expect(screen.getByText(/cat needs attention.*works right now/i)).toBeInTheDocument()
  })

  it('no longer offers to save you from missing a nudge', () => {
    seedSave()
    renderApp()
    expect(screen.queryByText(/nudge/i)).not.toBeInTheDocument()
  })
})
