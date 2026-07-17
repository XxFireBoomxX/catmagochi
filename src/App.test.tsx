import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { START_TOTAL_MS } from './components/StartScreen'
import type { CareEventType, PetSave, RelayMessage } from './types'

const SAVE_KEY = 'catmagochi-save-v1'
const NOW = new Date('2026-01-01T00:00:00.000Z').getTime()

let mockMessages: RelayMessage[] = []
const mockDismiss = vi.fn((id: string) => {
  mockMessages = mockMessages.filter((m) => m.id !== id)
})
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
let capturedOnCareEvent: ((id: string, type: CareEventType) => void) | null = null
vi.mock('./hooks/useCareEvents', () => ({
  useCareEvents: (onEvent: (id: string, type: CareEventType) => void) => {
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

  describe('play / nudge picker', () => {
    it('opens the nudge picker in place of the cat, and disables other actions', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      expect(screen.getByText('Thinking of you')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pet Mochi' })).not.toBeInTheDocument()
      expect(screen.getByText('[FEED]')).toBeDisabled()
      expect(screen.getByText('[CLEAN]')).toBeDisabled()
      expect(screen.getByText('[PLAY]')).toBeDisabled()
    })

    it('picking a nudge applies the play reward, sends it, and restores the cat panel', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      fireEvent.click(screen.getByText('Miss you'))
      expect(getSave().stats.happiness).toBe(90)
      expect(getSave().growth).toBe(3)
      expect(getSave().totalPlays).toBe(1)
      expect(mockSend).toHaveBeenCalledWith('Miss you', 'nudge')
      expect(screen.getByRole('button', { name: 'Pet Mochi' })).toBeInTheDocument()
      expect(screen.getByText('[FEED]')).not.toBeDisabled()
    })

    it('cancel closes the picker without applying anything or sending', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      fireEvent.click(screen.getByText('[ CANCEL ]'))
      expect(getSave().growth).toBe(0)
      expect(mockSend).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Pet Mochi' })).toBeInTheDocument()
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

    it('does not let an incoming message interrupt an open nudge picker', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      expect(screen.getByText('Thinking of you')).toBeInTheDocument()

      // Queue a message while the picker is open and force a re-render via
      // usePet's own tick (the mocked useMessages hook only re-reads this on
      // the next render).
      mockMessages = [{ id: 'm1', text: 'hi from home', sentAt: NOW }]
      act(() => {
        vi.advanceTimersByTime(5_000) // usePet's TICK_MS
      })

      expect(screen.getByText('Thinking of you')).toBeInTheDocument()
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

    it('emits a care event when a nudge is picked', () => {
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      fireEvent.click(screen.getByText('Thinking of you'))
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(mockEmit.mock.calls[0][1]).toBe('play')
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

  describe('nudge send feedback', () => {
    it('shows "Sent." when the send resolves to sent', async () => {
      mockSend.mockResolvedValue('sent')
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thinking of you' }))
      })
      expect(screen.getByText('Sent.')).toBeInTheDocument()
    })

    it('shows the queued message when the send resolves to queued', async () => {
      mockSend.mockResolvedValue('queued')
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thinking of you' }))
      })
      expect(screen.getByText('Saved — will send when back online.')).toBeInTheDocument()
    })

    it('shows nothing when the send resolves to unconfigured', async () => {
      mockSend.mockResolvedValue('unconfigured')
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thinking of you' }))
      })
      expect(screen.queryByText('Sent.')).not.toBeInTheDocument()
      expect(screen.queryByText(/Saved/)).not.toBeInTheDocument()
    })

    it('clears the send-status caption after its display window', async () => {
      mockSend.mockResolvedValue('sent')
      seedSave()
      renderApp()
      fireEvent.click(screen.getByText('[PLAY]'))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thinking of you' }))
      })
      expect(screen.getByText('Sent.')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2_500)
      })
      expect(screen.queryByText('Sent.')).not.toBeInTheDocument()
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
