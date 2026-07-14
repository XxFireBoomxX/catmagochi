import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatBar } from './StatBar'

describe('StatBar', () => {
  it('renders the code, label, and rounded percentage', () => {
    render(<StatBar code="FOOD" label="Fullness" value={55.4} />)
    expect(screen.getByText('FOOD')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'Fullness' })
    expect(bar).toHaveAttribute('aria-valuenow', '55')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(screen.getByText('55%')).toBeInTheDocument()
  })

  it('rounds aria-valuenow and the displayed percentage the same way', () => {
    render(<StatBar code="ENGY" label="Energy" value={33.6} />)
    const bar = screen.getByRole('progressbar', { name: 'Energy' })
    expect(bar).toHaveAttribute('aria-valuenow', '34')
    expect(screen.getByText('34%')).toBeInTheDocument()
  })

  it('uses the low-level style under 25', () => {
    render(<StatBar code="CLEN" label="Cleanliness" value={10} />)
    const fill = document.querySelector('.stat-fill')
    expect(fill).toHaveClass('stat-low')
  })

  it('uses the mid-level style from 25 up to 60', () => {
    render(<StatBar code="CLEN" label="Cleanliness" value={40} />)
    const fill = document.querySelector('.stat-fill')
    expect(fill).toHaveClass('stat-mid')
  })

  it('uses the high-level style at 60 and above', () => {
    render(<StatBar code="CLEN" label="Cleanliness" value={80} />)
    const fill = document.querySelector('.stat-fill')
    expect(fill).toHaveClass('stat-high')
  })

  it('treats the boundary values 25 and 60 as mid/high respectively', () => {
    const { rerender } = render(<StatBar code="X" label="X" value={25} />)
    expect(document.querySelector('.stat-fill')).toHaveClass('stat-mid')
    rerender(<StatBar code="X" label="X" value={60} />)
    expect(document.querySelector('.stat-fill')).toHaveClass('stat-high')
  })

  it('adds the pulsing class only when isPulsing is true', () => {
    const { rerender } = render(<StatBar code="X" label="X" value={50} />)
    expect(document.querySelector('.stat-fill')).not.toHaveClass('pulsing')
    rerender(<StatBar code="X" label="X" value={50} isPulsing />)
    expect(document.querySelector('.stat-fill')).toHaveClass('pulsing')
  })

  it('renders a 10-segment bar with the right filled/empty split', () => {
    render(<StatBar code="X" label="X" value={55} />)
    const fill = document.querySelector('.stat-fill')!
    // 55/100 * 10 = 5.5, rounds to 6 filled segments
    expect(fill.textContent).toBe('██████░░░░')
  })

  it('renders a fully-filled bar at 100 and fully-empty bar at 0', () => {
    const { rerender } = render(<StatBar code="X" label="X" value={100} />)
    expect(document.querySelector('.stat-fill')!.textContent).toBe('██████████')
    rerender(<StatBar code="X" label="X" value={0} />)
    expect(document.querySelector('.stat-fill')!.textContent).toBe('░░░░░░░░░░')
  })
})
