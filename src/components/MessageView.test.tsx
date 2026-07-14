import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageView } from './MessageView'

const message = { id: '1', text: 'Thinking of you!', sentAt: Date.now() }

describe('MessageView', () => {
  it('renders the message text', () => {
    render(<MessageView message={message} onDismiss={() => {}} />)
    expect(screen.getByText('Thinking of you!')).toBeInTheDocument()
    expect(screen.getByText(/FROM HOME/)).toBeInTheDocument()
  })

  it('calls onDismiss when clicked', () => {
    const onDismiss = vi.fn()
    render(<MessageView message={message} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss on Enter and Space, not on other keys', () => {
    const onDismiss = vi.fn()
    render(<MessageView message={message} onDismiss={onDismiss} />)
    const el = screen.getByRole('button', { name: 'Dismiss message' })
    fireEvent.keyDown(el, { key: 'Enter' })
    fireEvent.keyDown(el, { key: ' ' })
    fireEvent.keyDown(el, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
