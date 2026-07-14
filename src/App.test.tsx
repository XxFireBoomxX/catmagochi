import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { PetSave, RelayMessage } from './types'

const SAVE_KEY = 'catmagochi-save-v1'
const NOW = new Date('2026-01-01T00:00:00.000Z').getTime()

let mockMessages: RelayMessage[] = []
const mockDismiss = vi.fn((id: string) => {
  mockMessages = mockMessages.filter((m) => m.id !== id)
})
vi.mock('./hooks/useMessages', () => ({
  useMessages: () => ({ messages: mockMessages, dismiss: mockDismiss }),
}))

vi.mock('./hooks/useFlavorText', () => ({
  useFlavorText: (mood: string) => `is ${mood} (mocked)`,
}))

function seedSave(overrides: Partial<PetSave> = {}) {
  const save: PetSave = {
    name: 'Mochi',
    stats: { fullness: 80, happiness: 80, energy: 80, cleanliness: 80 },
    sleeping: false,
    lastUpdate: NOW,
    growth: 0,
    ...overrides,
  }
  localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  return save
}

function getSave(): PetSave {
  return JSON.parse(localStorage.getItem(SAVE_KEY)!)
}

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mockMessages = []
    mockDismiss.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('adoption flow', () => {
    it('shows the name screen when there is no save yet', () => {
      render(<App />)
      expect(screen.getByText('Catmagochi')).toBeInTheDocument()
      expect(screen.getByPlaceholderText("Kitten's name")).toBeInTheDocument()
    })

    it('creates a pet with the entered name and shows the game screen', () => {
      render(<App />)
      fireEvent.change(screen.getByPlaceholderText("Kitten's name"), { target: { value: 'Tama' } })
      fireEvent.click(screen.getByText('[ ADOPT ]'))
      expect(screen.getByRole('heading', { name: 'Tama' })).toBeInTheDocument()
      expect(getSave().name).toBe('Tama')
    })

    it('falls back to the default name when submitted blank', () => {
      render(<App />)
      fireEvent.click(screen.getByText('[ ADOPT ]'))
      expect(screen.getByRole('heading', { name: 'Cat' })).toBeInTheDocument()
    })
  })

  describe('main game screen', () => {
    it('shows the app version in the top-left corner', () => {
      seedSave()
      render(<App />)
      expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument()
    })

    it('renders the stage badge and all four stat bars from the save', () => {
      seedSave()
      render(<App />)
      expect(screen.getByText('[KITTEN]')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'Fullness' })).toHaveAttribute('aria-valuenow', '80')
      expect(screen.getByRole('progressbar', { name: 'Happiness' })).toHaveAttribute('aria-valuenow', '80')
      expect(screen.getByRole('progressbar', { name: 'Energy' })).toHaveAttribute('aria-valuenow', '80')
      expect(screen.getByRole('progressbar', { name: 'Cleanliness' })).toHaveAttribute('aria-valuenow', '80')
    })

    it('feeding increases fullness and briefly pulses the fullness bar', () => {
      seedSave()
      render(<App />)
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
      render(<App />)
      fireEvent.click(screen.getByText('[CLEAN]'))
      expect(getSave().stats.cleanliness).toBe(70)
    })

    it('sleep toggles to wake, and disables feed/play/clean while asleep', () => {
      seedSave()
      render(<App />)
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
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
      expect(getSave().stats.happiness).toBe(83)
    })
  })

  describe('mini-game panel swap', () => {
    it('replaces the cat with the yarn game while playing, and disables other actions', () => {
      seedSave()
      render(<App />)
      fireEvent.click(screen.getByText('[PLAY]'))
      expect(screen.getByRole('button', { name: 'Catch the yarn' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pet Mochi' })).not.toBeInTheDocument()
      expect(screen.getByText('[FEED]')).toBeDisabled()
      expect(screen.getByText('[CLEAN]')).toBeDisabled()
      expect(screen.getByText('[PLAY]')).toBeDisabled()
    })

    it('applies playGame stats and restores the cat panel once the game completes', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0)
      seedSave()
      render(<App />)
      fireEvent.click(screen.getByText('[PLAY]'))
      for (let i = 0; i < 3; i++) {
        act(() => {
          vi.advanceTimersByTime(500)
        })
        fireEvent.click(screen.getByRole('button', { name: 'Catch the yarn' }))
        act(() => {
          vi.advanceTimersByTime(600)
        })
      }
      act(() => {
        vi.advanceTimersByTime(1_600) // SUMMARY_MS -> onComplete(3)
      })
      expect(getSave().growth).toBe(7) // 1 + 2*3
      expect(screen.getByRole('button', { name: 'Pet Mochi' })).toBeInTheDocument()
      expect(screen.getByText('[FEED]')).not.toBeDisabled()
    })
  })

  describe('incoming messages', () => {
    it('shows the message panel instead of the cat when a message is queued', () => {
      seedSave()
      mockMessages = [{ id: 'm1', text: 'hi from home', sentAt: NOW }]
      render(<App />)
      expect(screen.getByText('hi from home')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pet Mochi' })).not.toBeInTheDocument()
      expect(screen.getByText('[FEED]')).toBeDisabled()
    })

    it('does not let an incoming message interrupt an in-progress mini-game', () => {
      seedSave()
      render(<App />)
      fireEvent.click(screen.getByText('[PLAY]'))
      expect(screen.getByRole('button', { name: 'Catch the yarn' })).toBeInTheDocument()

      // Queue a message mid-game and force a re-render via usePet's own tick
      // (the mocked useMessages hook only re-reads this on the next render).
      mockMessages = [{ id: 'm1', text: 'hi from home', sentAt: NOW }]
      act(() => {
        vi.advanceTimersByTime(5_000) // usePet's TICK_MS; game completion takes far longer
      })

      expect(screen.getByRole('button', { name: 'Catch the yarn' })).toBeInTheDocument()
      expect(screen.queryByText('hi from home')).not.toBeInTheDocument()
    })

    it('dismissing a message acks it, records history, and bumps happiness', () => {
      seedSave()
      mockMessages = [{ id: 'm1', text: 'hi from home', sentAt: NOW }]
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }))
      expect(mockDismiss).toHaveBeenCalledWith('m1')
      expect(getSave().stats.happiness).toBe(85)
      const historyRaw = localStorage.getItem('catmagochi-message-history-v1')
      expect(JSON.parse(historyRaw!)).toEqual([{ id: 'm1', text: 'hi from home', sentAt: NOW }])
    })
  })

  describe('growth banner', () => {
    it('shows no banner for the initial kitten stage', () => {
      seedSave({ growth: 0 })
      render(<App />)
      expect(screen.queryByText(/GREW INTO/)).not.toBeInTheDocument()
    })

    it('shows a banner on transitioning to young, then auto-dismisses it', () => {
      seedSave({ growth: 39 }) // one pet (+1 growth) away from the young threshold (40)
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'Pet Mochi' }))
      expect(screen.getByText('Mochi GREW INTO A YOUNG CAT!')).toBeInTheDocument()
      expect(screen.getByText('[YOUNG CAT]')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(2_500)
      })
      expect(screen.queryByText('Mochi GREW INTO A YOUNG CAT!')).not.toBeInTheDocument()
    })
  })

  describe('menu', () => {
    it('opens the menu overlay and closes it', () => {
      seedSave()
      render(<App />)
      fireEvent.click(screen.getByText('[MENU]'))
      const overlay = screen.getByText('MENU').closest('.menu-panel') as HTMLElement
      fireEvent.click(within(overlay).getByText('[ CLOSE ]'))
      expect(screen.queryByText('MESSAGE HISTORY')).not.toBeInTheDocument()
    })

    it('disables the menu button while a mini-game is active', () => {
      seedSave()
      render(<App />)
      fireEvent.click(screen.getByText('[PLAY]'))
      expect(screen.getByText('[MENU]')).toBeDisabled()
    })
  })
})
