import { describe, expect, it } from 'vitest'
import type { TrainerCommand } from '../devices/types'
import {
  DEFAULT_CONTROLLER_SETTINGS,
  type ControllerInputs,
  type ControllerSettings,
  type ControllerState,
  type Desired,
  TrainerController,
  acknowledge,
  clampToRange,
  decide,
  initialControllerState,
  markSent,
  markUnknown,
  scaleGrade,
  setDesired,
} from './trainer-controller'

const settings: ControllerSettings = { ...DEFAULT_CONTROLLER_SETTINGS, ergSoftStartS: 0 }

/** Drives decide() at 4 Hz for `seconds`, acknowledging every command as OK. */
function run(
  state: ControllerState,
  seconds: number,
  inputs: (t: number) => Partial<ControllerInputs>,
  cfg: ControllerSettings = settings,
  t0 = 0,
): { state: ControllerState; sent: { t: number; cmd: TrainerCommand }[]; end: number } {
  const sent: { t: number; cmd: TrainerCommand }[] = []
  let s = state
  let t = t0
  for (; t < t0 + seconds * 1000; t += 250) {
    const res = decide(s, { now: t, cadence: 90, power: null, hr: null, paused: false, ...inputs(t) }, { settings: cfg })
    s = res.state
    if (res.command) {
      s = acknowledge(markSent(s, t), res.command, 'ok')
      sent.push({ t, cmd: res.command })
    }
  }
  return { state: s, sent, end: t }
}

const withDesired = (d: Desired) => setDesired(initialControllerState(), d)

describe('ERG basics', () => {
  it('sends the target once, then stays quiet', () => {
    const { sent } = run(withDesired({ mode: 'erg', watts: 200 }), 10, () => ({}))
    expect(sent).toEqual([{ t: 0, cmd: { kind: 'erg', watts: 200 } }])
  })

  it('applies intensity and offset', () => {
    const cfg = { ...settings, intensityPct: 105, ergOffsetW: 5 }
    const { sent } = run(withDesired({ mode: 'erg', watts: 200 }), 1, () => ({}), cfg)
    expect(sent[0]?.cmd).toEqual({ kind: 'erg', watts: 215 })
  })

  it('honours the deadband and the minimum command interval on a ramp', () => {
    let s = withDesired({ mode: 'erg', watts: 100 })
    const sent: number[] = []
    for (let t = 0; t < 10_000; t += 250) {
      s = setDesired(s, { mode: 'erg', watts: 100 + t / 100 }) // +10 W/s
      const r = decide(s, { now: t, cadence: 90, power: null, hr: null, paused: false }, { settings })
      s = r.state
      if (r.command) {
        s = acknowledge(markSent(s, t), r.command, 'ok')
        sent.push(t)
      }
    }
    // at most one per second
    for (let i = 1; i < sent.length; i++) expect(sent[i]! - sent[i - 1]!).toBeGreaterThanOrEqual(1000)
    expect(sent.length).toBeGreaterThanOrEqual(9)
  })

  it('clamps to the trainer power range and step', () => {
    expect(clampToRange(1234, { min: 0, max: 1000, step: 1 })).toBe(1000)
    expect(clampToRange(203, { min: 0, max: 2000, step: 5 })).toBe(205)
  })
})

describe('soft start', () => {
  it('ramps from the rider’s current power to target over the configured time', () => {
    const cfg = { ...settings, ergSoftStartS: 10 }
    const { sent } = run(withDesired({ mode: 'erg', watts: 250 }), 12, () => ({ power: 50 }), cfg)
    const watts = sent.map((x) => (x.cmd as { watts: number }).watts)
    expect(watts[0]).toBeGreaterThanOrEqual(50)
    expect(watts[0]).toBeLessThan(70)
    expect(watts.at(-1)).toBe(250)
    // monotonic increase
    for (let i = 1; i < watts.length; i++) expect(watts[i]!).toBeGreaterThanOrEqual(watts[i - 1]!)
  })

  it('re-arms after a pause', () => {
    const cfg = { ...settings, ergSoftStartS: 10 }
    let r = run(withDesired({ mode: 'erg', watts: 200 }), 15, () => ({ power: 200 }), cfg)
    r = run(r.state, 5, () => ({ paused: true }), cfg, r.end)
    expect(r.sent[0]?.cmd).toEqual({ kind: 'resistance', pct: cfg.pausedResistancePct })
    r = run(r.state, 3, () => ({ power: 20 }), cfg, r.end)
    const first = r.sent[0]?.cmd as { kind: string; watts: number }
    expect(first.kind).toBe('erg')
    expect(first.watts).toBeLessThan(60)
  })
})

describe('spiral-of-death guard', () => {
  it('releases to light resistance when cadence collapses and recovers with a soft start', () => {
    const cfg = { ...settings, ergSoftStartS: 10 }
    const g = cfg.spiralGuard
    let r = run(withDesired({ mode: 'erg', watts: 300 }), 12, () => ({ power: 300, cadence: 85 }), cfg)
    // cadence sags below 55 for >3 s
    r = run(r.state, 4, () => ({ power: 280, cadence: 45 }), cfg, r.end)
    expect(r.state.guard).toBe('spiral')
    expect(r.sent.at(-1)?.cmd).toEqual({ kind: 'resistance', pct: g.releasePct })
    // rider spins back up above 70 for >5 s
    r = run(r.state, 6, () => ({ power: 120, cadence: 85 }), cfg, r.end)
    expect(r.state.guard).toBe('soft-start')
    const last = r.sent.at(-1)?.cmd as { kind: string; watts: number }
    expect(last.kind).toBe('erg')
    expect(last.watts).toBeLessThan(300)
  })

  it('does not trigger on a brief dip', () => {
    let r = run(withDesired({ mode: 'erg', watts: 300 }), 2, () => ({ cadence: 85 }))
    r = run(r.state, 2, () => ({ cadence: 40 }), settings, r.end)
    r = run(r.state, 2, () => ({ cadence: 85 }), settings, r.end)
    expect(r.state.guard).toBe('none')
  })

  it('ignores missing cadence (never guesses)', () => {
    const r = run(withDesired({ mode: 'erg', watts: 300 }), 10, () => ({ cadence: null }))
    expect(r.state.guard).toBe('none')
  })
})

describe('SIM', () => {
  it('scales uphill and downhill separately and caps', () => {
    const slope = { uphillPct: 100, downhillPct: 50, limitPct: 20 }
    expect(scaleGrade(8, slope)).toBe(8)
    expect(scaleGrade(-8, slope)).toBe(-4)
    expect(scaleGrade(30, slope)).toBe(20)
    expect(scaleGrade(-60, slope)).toBe(-20)
    expect(scaleGrade(8, { uphillPct: 50, downhillPct: 25, limitPct: 20 })).toBe(4)
  })

  it('sends grade changes beyond the deadband only', () => {
    let s = withDesired({ mode: 'sim', gradePct: 2 })
    let r = run(s, 2, () => ({}))
    expect(r.sent).toHaveLength(1)
    s = setDesired(r.state, { mode: 'sim', gradePct: 2.05 })
    r = run(s, 2, () => ({}), settings, r.end)
    expect(r.sent).toHaveLength(0)
    s = setDesired(r.state, { mode: 'sim', gradePct: 3 })
    r = run(s, 2, () => ({}), settings, r.end)
    expect(r.sent[0]?.cmd).toMatchObject({ kind: 'sim', gradePct: 3 })
  })
})

describe('HR-ERG', () => {
  it('raises watts when HR is below target and lowers when above', () => {
    let r = run(withDesired({ mode: 'hr', targetBpm: 140 }), 30, () => ({ hr: 120, power: 150 }))
    const up = (r.sent.at(-1)?.cmd as { watts: number }).watts
    expect(up).toBeGreaterThan(150)
    r = run(r.state, 60, () => ({ hr: 160, power: up }), settings, r.end)
    const down = (r.sent.at(-1)?.cmd as { watts: number }).watts
    expect(down).toBeLessThan(up)
  })
})

describe('reconnect / rebind', () => {
  it('reapplies the current target after markUnknown', () => {
    let r = run(withDesired({ mode: 'erg', watts: 220 }), 3, () => ({ power: 220 }))
    expect(r.sent).toHaveLength(1)
    r = run(markUnknown(r.state), 1, () => ({ power: 220 }), settings, r.end)
    expect(r.sent[0]?.cmd).toEqual({ kind: 'erg', watts: 220 })
  })

  it('reapplies the exact target after a reconnect, without a soft start', () => {
    let r = run(withDesired({ mode: 'erg', watts: 280 }), 15, () => ({ power: 280 }))
    r = run(markUnknown(r.state), 1, () => ({ power: 160 }), settings, r.end)
    expect(r.sent[0]?.cmd).toEqual({ kind: 'erg', watts: 280 })
    expect(r.state.guard).toBe('none')
  })

  it('backs off after the trainer refuses control, instead of retrying every tick', () => {
    let s = withDesired({ mode: 'erg', watts: 200 })
    let d = decide(s, { now: 0, cadence: 90, power: 200, hr: null, paused: false }, { settings })
    s = acknowledge(markSent(d.state, 0), d.command!, 'not-permitted')
    for (const now of [250, 1000, 4750]) {
      d = decide(s, { now, cadence: 90, power: 200, hr: null, paused: false }, { settings })
      expect(d.command).toBeNull()
      s = d.state
    }
    d = decide(s, { now: 5000, cadence: 90, power: 200, hr: null, paused: false }, { settings })
    expect(d.command).toEqual({ kind: 'erg', watts: 200 })
  })

  it('a failed send is retried', () => {
    let s = withDesired({ mode: 'erg', watts: 200 })
    let d = decide(s, { now: 0, cadence: 90, power: null, hr: null, paused: false }, { settings })
    s = acknowledge(markSent(d.state, 0), d.command!, 'timeout')
    d = decide(s, { now: 1000, cadence: 90, power: null, hr: null, paused: false }, { settings })
    expect(d.command).toEqual({ kind: 'erg', watts: 200 })
  })
})

describe('TrainerController (stateful wrapper)', () => {
  it('sends through the bound sink and reapplies on rebind', async () => {
    const got: TrainerCommand[] = []
    const sink = { send: async (c: TrainerCommand) => (got.push(c), 'ok' as const) }
    const c = new TrainerController({ ...settings })
    c.bind(sink)
    c.setDesired({ mode: 'erg', watts: 180 })
    c.tick({ now: 0, cadence: 90, power: 180, hr: null, paused: false })
    await Promise.resolve()
    await Promise.resolve()
    c.tick({ now: 1000, cadence: 90, power: 180, hr: null, paused: false })
    await Promise.resolve()
    expect(got).toEqual([{ kind: 'erg', watts: 180 }])
    c.bind(sink)
    c.tick({ now: 1250, cadence: 90, power: 180, hr: null, paused: false })
    await Promise.resolve()
    expect(got).toHaveLength(2)
  })

  it('reports control loss', async () => {
    const events: string[] = []
    const c = new TrainerController({ ...settings })
    c.on((e) => events.push(e.type))
    c.bind({ send: async () => 'not-permitted' as const })
    c.setDesired({ mode: 'erg', watts: 150 })
    c.tick({ now: 0, cadence: 90, power: null, hr: null, paused: false })
    await new Promise((r) => setTimeout(r, 0))
    expect(events).toContain('control-lost')
  })

  it('adjusts intensity within 50-150 %', () => {
    const c = new TrainerController({ ...settings })
    expect(c.adjustIntensity(+5)).toBe(105)
    expect(c.adjustIntensity(-200)).toBe(50)
  })
})
