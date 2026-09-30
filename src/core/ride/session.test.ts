import { Decoder, Stream } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { TrainerController } from '../control/trainer-controller'
import { SensorHub } from '../sensors/hub'
import { FakeClock } from '../time/clock'
import { finalizeRide, fitFileName } from './finalize'
import { parseJournal } from './journal'
import type { RidePlan } from './plan'
import { RideSession, type JournalSink, type SessionEvent } from './session'

function memoryJournal(opts: { failFirstAppend?: boolean } = {}) {
  const files = new Map<string, string[]>()
  const seqs: number[] = []
  let failed = false
  const sink: JournalSink = {
    begin: async (id, meta) => {
      files.set(id, [meta])
    },
    append: async (id, seq, lines) => {
      if (opts.failFirstAppend && !failed) {
        failed = true
        throw new Error('disk full')
      }
      seqs.push(seq)
      files.get(id)!.push(...lines)
      return seq
    },
    close: async () => undefined,
  }
  return { sink, files, seqs }
}

function setup(opts: { autoPause?: boolean; plan?: RidePlan; bests?: Record<number, number>; failFirstAppend?: boolean } = {}) {
  const clock = new FakeClock(Date.UTC(2026, 8, 29, 13, 0, 0))
  const hub = new SensorHub()
  const controller = new TrainerController()
  const journal = memoryJournal({ failFirstAppend: opts.failFirstAppend })
  let paused = false
  const session = new RideSession(
    { clock, hub, controller, journal: journal.sink, setPaused: (p) => (paused = p) },
    {
      rideId: 'ride-test-01',
      name: 'Test ride',
      kind: opts.plan?.kind ?? 'free',
      simulated: true,
      athlete: { ftpW: 250, weightKg: 75, lthr: 165 },
      autoPause: opts.autoPause ?? true,
      plan: opts.plan,
      bests: opts.bests,
    },
  )
  const events: SessionEvent[] = []
  session.on((e) => events.push(e))
  let t = 0
  /** Advance time feeding the hub at 4 Hz and ticking the session at 4 Hz. */
  const ride = async (seconds: number, power: number | null, cadence: number | null = power === null ? null : power > 0 ? 90 : 0, hr: number | null = 140) => {
    const end = t + seconds * 1000
    while (t < end) {
      t += 250
      clock.advance(250)
      if (power !== null) hub.ingest({ metric: 'power', value: power, tMono: t, sourceId: 'trainer:ftms' })
      if (cadence !== null) hub.ingest({ metric: 'cadence', value: cadence, tMono: t, sourceId: 'trainer:ftms' })
      if (hr !== null && t % 1000 === 0) hub.ingest({ metric: 'hr', value: hr, tMono: t, sourceId: 'hr:hrs' })
      session.tick(t)
      await Promise.resolve()
    }
  }
  return { clock, hub, controller, session, journal, events, ride, isPaused: () => paused }
}

describe('RideSession', () => {
  it('records a free ride with a user pause and finalizes to a valid FIT', async () => {
    const { session, ride, journal } = setup()
    session.start()
    await ride(600, 200)
    session.pause('user')
    await ride(60, 0)
    session.resume()
    await ride(300, 220)
    const { records } = await session.finish()

    expect(records.length).toBeGreaterThanOrEqual(899)
    expect(records.length).toBeLessThanOrEqual(901)
    // pause gap shows up in timestamps
    const gaps = records.slice(1).filter((r, i) => r.ts - records[i]!.ts > 1000)
    expect(gaps).toHaveLength(1)

    const j = parseJournal(journal.files.get('ride-test-01')!.join('\n'))
    expect(j.meta?.name).toBe('Test ride')
    expect(j.meta?.athlete?.lthr).toBe(165) // a recovered ride keeps its HR zones
    expect(j.records.length).toBe(records.length)
    expect(j.ended).toBe(true)

    const fin = finalizeRide({
      rideId: 'ride-test-01', name: 'Test ride', kind: 'free', simulated: true, startedAt: records[0]!.ts - 1000,
      athlete: { ftpW: 250, weightKg: 75, lthr: 165 }, records, utcOffsetMin: -420, softwareVersion: 10, now: Date.now(),
    })
    expect(fin.summary.movingS).toBe(records.length)
    expect(fin.summary.elapsedS).toBeGreaterThanOrEqual(records.length + 58)
    expect(fin.summary.avgPower).toBeGreaterThan(200)
    expect(fin.summary.np).toBeGreaterThan(200)
    expect(fin.summary.tss).toBeGreaterThan(0)
    const dec = new Decoder(Stream.fromByteArray(Array.from(fin.fit!)))
    expect(dec.checkIntegrity()).toBe(true)
    const { messages } = dec.read()
    expect(messages.recordMesgs).toHaveLength(records.length)
    expect(messages.sessionMesgs![0]!.subSport).toBe('virtualActivity')
    expect(messages.eventMesgs!.filter((e) => e.event === 'timer').map((e) => e.eventType)).toEqual(['start', 'stopAll', 'start', 'stopAll'])
  })

  it('auto-pauses on real zeros (not on missing data) and resumes when pedalling', async () => {
    const { session, ride, events, isPaused } = setup()
    session.start()
    await ride(60, 200)
    await ride(5, 0, 0)
    expect(session.currentState).toBe('paused')
    expect(isPaused()).toBe(true)
    expect(events.some((e) => e.type === 'state' && e.state === 'paused' && e.reason === 'auto')).toBe(true)
    await ride(3, 180, 85)
    expect(session.currentState).toBe('riding')
  })

  it('pauses with sensor-lost after 30 s of total silence', async () => {
    const { session, ride, events } = setup()
    session.start()
    await ride(30, 200)
    await ride(40, null, null, null)
    expect(session.currentState).toBe('paused')
    expect(events.some((e) => e.type === 'state' && e.reason === 'sensor-lost')).toBe(true)
  })

  it('emits live PRs against previous bests', async () => {
    const { session, ride, events } = setup({ bests: { 60: 280, 5: 900 } })
    session.start()
    await ride(90, 310)
    const prs = events.filter((e) => e.type === 'pr')
    expect(prs.some((p) => p.type === 'pr' && p.durationS === 60 && p.watts >= 300)).toBe(true)
    expect(prs.some((p) => p.type === 'pr' && p.durationS === 5)).toBe(false)
    // Once per duration per ride, however long the effort keeps improving.
    expect(prs.filter((p) => p.type === 'pr' && p.durationS === 60)).toHaveLength(1)
  })

  it('announces no PRs without history (every effort would be one)', async () => {
    const { session, ride, events } = setup({ bests: {} })
    session.start()
    await ride(60, 150)
    await ride(120, 320)
    await session.finish()
    expect(events.filter((e) => e.type === 'pr')).toEqual([])
  })

  it('writes the last records and the end line before closing, even with an append in flight', async () => {
    const { session, ride, journal } = setup()
    const order: string[] = []
    let release: (() => void) | null = null
    const append = journal.sink.append
    journal.sink.append = async (id, seq, lines) => {
      // the first append after 5 s hangs until finish() has been called
      if (seq === 2) await new Promise<void>((r) => (release = r))
      order.push(`append ${seq}`)
      return append(id, seq, lines)
    }
    journal.sink.close = async () => {
      order.push('close')
    }
    session.start()
    await ride(10, 200)
    const finished = session.finish()
    ;(release as (() => void) | null)?.()
    await finished
    expect(order.at(-1)).toBe('close')
    expect(parseJournal(journal.files.get('ride-test-01')!.join('\n')).ended).toBe(true)
  })

  it('retries failed journal appends with the same sequence number', async () => {
    const { session, ride, journal } = setup({ failFirstAppend: true })
    session.start()
    await ride(5, 200)
    await session.finish()
    expect(journal.seqs[0]).toBe(1)
    const lines = journal.files.get('ride-test-01')!
    expect(parseJournal(lines.join('\n')).records.length).toBeGreaterThanOrEqual(4)
  })

  it('laps on plan segment changes and records the plan target', async () => {
    let seg = 0
    const plan: RidePlan = {
      kind: 'workout',
      name: 'Two blocks',
      tick: ({ movingS }) => {
        seg = movingS < 60 ? 0 : 1
        return {
          desired: { mode: 'erg', watts: seg === 0 ? 150 : 250 },
          targetW: seg === 0 ? 150 : 250,
          segmentIndex: seg,
          segmentLabel: seg === 0 ? 'Easy' : 'Hard',
          segmentKind: 'steady',
          segmentRemainingS: 60 - (movingS % 60),
          segmentElapsedS: movingS % 60,
          nextLabel: null,
          remainingS: 120 - movingS,
          finished: movingS >= 120,
        }
      },
    }
    const { session, ride, controller } = setup({ plan })
    session.start()
    await ride(125, 200)
    const { records } = await session.finish()
    expect(new Set(records.map((r) => r.lap))).toEqual(new Set([0, 1]))
    expect(records[10]!.targetW).toBe(150)
    expect(records[100]!.targetW).toBe(250)
    expect(controller.snapshot.desired).toEqual({ mode: 'idle' })
  })

  it('names FIT files by local start time', () => {
    expect(fitFileName({ startedAt: Date.UTC(2026, 8, 29, 13, 5), name: 'Sweet Spot' }, -420)).toBe('2026-09-29 0605 - Sweet Spot.fit')
    // a very long route name still makes a file name the IPC contract accepts
    expect(fitFileName({ startedAt: 0, name: 'x'.repeat(400) }).length).toBeLessThanOrEqual(200)
  })
})
