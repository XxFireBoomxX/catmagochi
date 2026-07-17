import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NudgePicker } from './NudgePicker'
import { NUDGE_OPTIONS } from '../data/nudges'

describe('NudgePicker', () => {
  it('renders every canned option as its own button', () => {
    render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
    for (const text of NUDGE_OPTIONS) {
      expect(screen.getByRole('button', { name: text })).toBeInTheDocument()
    }
  })

  it('calls onSend with the picked option text', () => {
    const onSend = vi.fn()
    render(<NudgePicker onSend={onSend} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: NUDGE_OPTIONS[1] }))
    expect(onSend).toHaveBeenCalledWith(NUDGE_OPTIONS[1])
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel and not onSend when cancel is tapped', () => {
    const onSend = vi.fn()
    const onCancel = vi.fn()
    render(<NudgePicker onSend={onSend} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: '[ CANCEL ]' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  describe('first-use intro', () => {
    it('shows an intro line the first time it opens', () => {
      render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
      expect(screen.getByText('Send a quick note instead of a game.')).toBeInTheDocument()
    })

    it('does not show the intro line once it has already been seen', () => {
      localStorage.setItem('catmagochi-nudge-intro-seen-v1', '1')
      render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
      expect(screen.queryByText('Send a quick note instead of a game.')).not.toBeInTheDocument()
    })

    it('marks the intro as seen after picking an option', () => {
      render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: NUDGE_OPTIONS[0] }))
      expect(localStorage.getItem('catmagochi-nudge-intro-seen-v1')).toBe('1')
    })

    it('marks the intro as seen after cancelling', () => {
      render(<NudgePicker onSend={() => {}} onCancel={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: '[ CANCEL ]' }))
      expect(localStorage.getItem('catmagochi-nudge-intro-seen-v1')).toBe('1')
    })
  })
})
