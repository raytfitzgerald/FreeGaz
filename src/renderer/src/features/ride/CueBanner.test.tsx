import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRIORITY } from '@core/persona'
import type { LiveRide } from '@shared/live'
import { coachTalkStore, markLine } from '../../coach/talk'
import { LEAVE_MS, resetHeadCycles } from '../../coach/toon/motion'
import { rideStore } from '../../stores/ride'
import { CueBanner } from './CueBanner'

const INITIAL = rideStore.getState()

/** A coach line as the runtime delivers it: on the session snapshot and in the talk store. */
function say(text: string, personaId: string | null, priority: number = PRIORITY.banter) {
  act(() => {
    markLine(text, personaId, priority)
    rideStore.setState({ snapshot: { coachLine: text } as LiveRide })
  })
}
function clear() {
  act(() => rideStore.setState({ snapshot: { coachLine: null } as LiveRide }))
}

beforeEach(() => {
  resetHeadCycles()
  rideStore.setState(INITIAL, true)
  coachTalkStore.setState({ line: null, speaking: false, words: 0 })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CueBanner', () => {
  it('shows a plain coach line for a persona without a caricature', () => {
    render(<CueBanner />)
    say('Hold it. Hold it.', 'drill-sergeant')
    expect(screen.getByTestId('cue').textContent).toContain('Hold it. Hold it.')
    expect(screen.queryByTestId('coach-toon')).toBeNull()
  })

  it('lets Bibi say his own lines, as a labelled parody caricature', () => {
    render(<CueBanner />)
    say('Let me be very clear: this interval is historic.', 'bibi')
    const cue = screen.getByTestId('cue')
    expect(cue.textContent).toContain('Let me be very clear: this interval is historic.')
    expect(screen.getByRole('img', { name: /Bibi, parody caricature/ })).toBeTruthy()
    expect(screen.getByTestId('parody-badge').textContent).toMatch(/parody/i)
  })

  it('moves to the next photo with every new line', () => {
    render(<CueBanner />)
    say('One.', 'bibi')
    const first = screen.getByTestId('coach-toon').dataset.head
    say('Two.', 'bibi')
    const second = screen.getByTestId('coach-toon').dataset.head
    say('Three.', 'bibi')
    const third = screen.getByTestId('coach-toon').dataset.head
    expect(new Set([first, second, third]).size).toBe(3)
  })

  it('keeps safety prompts plain, whoever says them', () => {
    render(<CueBanner />)
    say('Easy now. Stop pedalling if you feel unwell.', 'bibi', PRIORITY.safety)
    expect(screen.getByTestId('cue').textContent).toContain('Stop pedalling')
    expect(screen.queryByTestId('coach-toon')).toBeNull()
  })

  it('gives the app its own voice for notices such as mute', () => {
    render(<CueBanner />)
    say('Coach muted. Press C to unmute.', null)
    expect(screen.queryByTestId('coach-toon')).toBeNull()
  })

  it('rides off when the line is over, then clears the banner', () => {
    vi.useFakeTimers()
    render(<CueBanner />)
    say('History will judge this interval.', 'bibi')
    clear()
    // still on stage, riding off
    expect(screen.getByTestId('coach-toon')).toBeTruthy()
    act(() => vi.advanceTimersByTime(LEAVE_MS + 10))
    expect(screen.queryByTestId('cue')).toBeNull()
  })

  it('makes way at once for a workout cue', () => {
    render(<CueBanner />)
    say('Weeks away.', 'bibi')
    act(() => rideStore.setState({ cue: { text: 'Stand up for 10 seconds', at: Date.now() }, snapshot: { coachLine: null } as LiveRide }))
    expect(screen.getByTestId('cue').textContent).toContain('Stand up for 10 seconds')
    expect(screen.queryByTestId('coach-toon')).toBeNull()
  })
})
