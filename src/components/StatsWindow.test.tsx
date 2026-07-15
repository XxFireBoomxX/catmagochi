import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatsWindow } from './StatsWindow'
import type { PetSave } from '../types'

const NOW = new Date('2026-01-10T00:00:00.000Z').getTime()

const baseSave: PetSave = {
  name: 'Mochi',
  stats: { fullness: 62.4, happiness: 78, energy: 55.6, cleanliness: 90 },
  sleeping: false,
  lastUpdate: NOW,
  growth: 45,
  adoptedAt: NOW - 3 * 24 * 60 * 60 * 1000, // 3 days ago
  totalFeeds: 12,
  totalPlays: 5,
  totalCleans: 8,
  totalPets: 23,
}

describe('StatsWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <StatsWindow open={false} save={baseSave} mood="happy" stage="young" onClose={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pet name in the title and all stat rows when open', () => {
    render(<StatsWindow open save={baseSave} mood="happy" stage="young" onClose={() => {}} />)
    expect(screen.getByText("Mochi'S STATS")).toBeInTheDocument()
    expect(screen.getByText('Stage')).toBeInTheDocument()
    expect(screen.getByText('YOUNG CAT')).toBeInTheDocument()
    expect(screen.getByText('Mood')).toBeInTheDocument()
    expect(screen.getByText('happy')).toBeInTheDocument()
    expect(screen.getByText('Growth')).toBeInTheDocument()
    expect(screen.getByText('45')).toBeInTheDocument()
  })

  it('rounds fractional stat values for display', () => {
    render(<StatsWindow open save={baseSave} mood="happy" stage="young" onClose={() => {}} />)
    expect(screen.getByText('62%')).toBeInTheDocument() // fullness 62.4 -> 62%
    expect(screen.getByText('56%')).toBeInTheDocument() // energy 55.6 -> 56%
  })

  it('shows the action counters', () => {
    render(<StatsWindow open save={baseSave} mood="happy" stage="young" onClose={() => {}} />)
    expect(screen.getByText('Times fed')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Times played')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Times cleaned')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Times petted')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  it('formats the adopted date as "N days ago"', () => {
    render(<StatsWindow open save={baseSave} mood="happy" stage="young" onClose={() => {}} />)
    expect(screen.getByText('3 days ago')).toBeInTheDocument()
  })

  it('formats a same-day adoption as "today"', () => {
    render(<StatsWindow open save={{ ...baseSave, adoptedAt: NOW }} mood="happy" stage="young" onClose={() => {}} />)
    expect(screen.getByText('today')).toBeInTheDocument()
  })

  it('formats exactly one day ago in the singular', () => {
    render(
      <StatsWindow
        open
        save={{ ...baseSave, adoptedAt: NOW - 24 * 60 * 60 * 1000 }}
        mood="happy"
        stage="young"
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('1 day ago')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<StatsWindow open save={baseSave} mood="happy" stage="young" onClose={onClose} />)
    fireEvent.click(screen.getByText('[ CLOSE ]'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
