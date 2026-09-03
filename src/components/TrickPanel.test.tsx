import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrickPanel } from './TrickPanel'
import { TRICKS, TRICK_POINTS } from '../data/tricks'
import { fillLine } from '../data/lessons'

const NAME = 'Mia'

const KEY = 'catmagochi-tricks-v1'
const TODAY = '2026-09-02'

function seed(save: Record<string, unknown>) {
  localStorage.setItem(KEY, JSON.stringify(save))
}

function setup() {
  const props = { name: NAME, onLessonDone: vi.fn(), onPerform: vi.fn(), onClose: vi.fn() }
  render(<TrickPanel {...props} />)
  return props
}

const pickApproach = () => fireEvent.click(screen.getByRole('button', { name: /wait quietly/i }))

describe('TrickPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${TODAY}T09:00:00`))
    // A roll of 0 is the best outcome and the first line of every pool.
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("opens on today's lesson, naming the trick being taught", () => {
    setup()
    expect(screen.getByText(`TEACHING: ${TRICKS[0].name}`)).toBeInTheDocument()
  })

  it('offers all three approaches', () => {
    setup()
    for (const label of [/offer a treat/i, /wait quietly/i, /wave the string/i]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('reports the lesson exactly once when an approach is picked', () => {
    const { onLessonDone } = setup()
    pickApproach()
    expect(onLessonDone).toHaveBeenCalledTimes(1)
  })

  it('shows how far along the trick is after the lesson', () => {
    setup()
    pickApproach()
    const bar = screen.getByRole('progressbar', { name: new RegExp(`learning ${TRICKS[0].name}`, 'i') })
    expect(bar).toHaveAttribute('aria-valuenow', String(Math.round((2 / TRICK_POINTS) * 100)))
  })

  it('cannot take a second lesson the same day', () => {
    const { onLessonDone } = setup()
    pickApproach()
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(screen.getByText(/tomorrow/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /wait quietly/i })).not.toBeInTheDocument()
    expect(onLessonDone).toHaveBeenCalledTimes(1)
  })

  it('celebrates when the trick is finally learned', () => {
    seed({ currentTrickId: TRICKS[0].id, progress: TRICK_POINTS - 1, learned: [], lastLessonDay: null })
    setup()
    pickApproach()
    expect(screen.getByText(new RegExp(`learned ${TRICKS[0].name}`, 'i'))).toBeInTheDocument()
    // The progress bar is replaced by the celebration -- there is nothing
    // left to be part-way through.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('opens straight to what she knows once the lesson is spent', () => {
    seed({ currentTrickId: TRICKS[1].id, progress: 0, learned: [TRICKS[0].id], lastLessonDay: TODAY })
    setup()
    expect(screen.getByRole('button', { name: new RegExp(TRICKS[0].name, 'i') })).toBeInTheDocument()
  })

  it('performs a learned trick and reports it', () => {
    seed({ currentTrickId: TRICKS[1].id, progress: 0, learned: [TRICKS[0].id], lastLessonDay: TODAY })
    const { onPerform } = setup()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(TRICKS[0].name, 'i') }))
    expect(onPerform).toHaveBeenCalledTimes(1)
    expect(screen.getByText(fillLine(TRICKS[0].success[0], { name: NAME, trick: TRICKS[0].name }))).toBeInTheDocument()
  })

  it('sometimes refuses instead of performing', () => {
    seed({ currentTrickId: TRICKS[1].id, progress: 0, learned: [TRICKS[0].id], lastLessonDay: TODAY })
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // above the success threshold
    setup()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(TRICKS[0].name, 'i') }))
    expect(
      screen.getByText(fillLine(TRICKS[0].refusal.at(-1)!, { name: NAME, trick: TRICKS[0].name })),
    ).toBeInTheDocument()
  })

  it('performing stays available, unlike the lesson', () => {
    seed({ currentTrickId: TRICKS[1].id, progress: 0, learned: [TRICKS[0].id], lastLessonDay: TODAY })
    const { onPerform } = setup()
    const button = screen.getByRole('button', { name: new RegExp(TRICKS[0].name, 'i') })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onPerform).toHaveBeenCalledTimes(2)
  })

  it('says so plainly when nothing is learned yet and the lesson is spent', () => {
    seed({ currentTrickId: TRICKS[0].id, progress: 1, learned: [], lastLessonDay: TODAY })
    setup()
    expect(screen.getByText(/tomorrow/i)).toBeInTheDocument()
    expect(screen.getByText(/nothing.*yet/i)).toBeInTheDocument()
  })

  it('celebrates the end of the curriculum instead of offering a lesson', () => {
    seed({ currentTrickId: null, progress: 0, learned: TRICKS.map((t) => t.id), lastLessonDay: null })
    setup()
    expect(screen.getByText(/knows every trick/i)).toBeInTheDocument()
  })

  it('closes on the back button', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the mood for the day so the choice has something to go on', () => {
    setup()
    expect(screen.getByText(new RegExp(`^${NAME} `))).toBeInTheDocument()
  })
})
