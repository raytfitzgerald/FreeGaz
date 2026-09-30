import { describe, expect, it } from 'vitest'
import { TrainerController } from '@core/control/trainer-controller'
import { mulberry32, type CoachLineTemplate } from '@core/persona'
import { RideSession, type JournalSink } from '@core/ride/session'
import { WorkoutPlan } from '@core/ride/workout-plan'
import { SensorHub } from '@core/sensors/hub'
import { FakeClock } from '@core/time/clock'
import { BUILTIN_WORKOUTS } from '@core/workout/builtins'
import { FTP_TEST_20MIN } from '@core/workout/ftp-tests'
import type { Workout } from '@core/workout/model'
import { DEFAULT_SETTINGS, type AppSettings, type CoachPrefs } from '@shared/settings'
import type { QuipRequest } from './quips'
import { CoachRuntime, MUTED_TEXT, UNMUTED_TEXT, type FtpOutcome } from './runtime'
import type { Voice } from './speech-queue'

const journal: JournalSink = { begin: async () => undefined, append: async (_id, seq) => seq, close: async () => undefined }
const VO2 = BUILTIN_WORKOUTS.find((w) => w.id === 'builtin:vo2max-5x4')!

function harness(opts: { coach?: Partial<CoachPrefs>; quips?: (req: QuipRequest) => Promise<CoachLineTemplate[]> } = {}) {
  const clock = new FakeClock()
  const hub = new SensorHub()
  const controller = new TrainerController()
  let settings: AppSettings = { ...DEFAULT_SETTINGS, coach: { ...DEFAULT_SETTINGS.coach, ...opts.coach } }
  const settingsListeners = new Set<(next: AppSettings, prev: AppSettings) => void>()
  const ticks = new Set<(now: number) => void>()
  const starts = new Set<(s: RideSession) => void>()
  const mutes = new Set<() => void>()
  const results = new Set<(r: FtpOutcome) => void>()
  const shown: string[] = []
  const spoken: string[] = []
  /** Whose line each shown one was (null: the app's own notice). */
  const sources: (string | null)[] = []
  // a voice that finishes each line at once, so everything queued gets said
  const voice: Voice = {
    speak: (u, onEnd) => {
      spoken.push(u.text)
      onEnd()
      return true
    },
    cancel: () => undefined,
  }
  const runtime = new CoachRuntime({
    rides: {
      onSessionStart: (l) => {
        starts.add(l)
        return () => starts.delete(l)
      },
    },
    engine: {
      onTick: (fn) => {
        ticks.add(fn)
        return () => ticks.delete(fn)
      },
    },
    clock,
    hub,
    controller,
    settings: {
      get: () => settings,
      subscribe: (l) => {
        settingsListeners.add(l)
        return () => settingsListeners.delete(l)
      },
    },
    voice,
    show: (_s, text, from) => {
      shown.push(text)
      sources.push(from?.personaId ?? null)
    },
    onMute: (l) => {
      mutes.add(l)
      return () => mutes.delete(l)
    },
    onFtpResult: (l) => {
      results.add(l)
      return () => results.delete(l)
    },
    quips: opts.quips ?? null,
    rng: mulberry32(1),
  })
  runtime.start()

  const startRide = (workout: Workout = VO2) => {
    const plan = new WorkoutPlan(workout, { ftpW: 250 })
    const session = new RideSession(
      { clock, hub, controller, journal, setPaused: () => undefined },
      { rideId: 'r-test-1', name: workout.name, kind: plan.kind, simulated: true, athlete: { ftpW: 250, weightKg: 75 }, autoPause: false, plan },
    )
    // like RideRunner: the session's own tick first, then ride-aware features
    ticks.add((now) => session.tick(now))
    session.start()
    for (const l of starts) l(session)
    return session
  }
  const ride = (seconds: number) => {
    for (let i = 0; i < seconds * 4; i++) {
      clock.advance(250)
      const now = clock.now()
      hub.ingest({ metric: 'power', value: 200, tMono: now, sourceId: 'test' })
      hub.ingest({ metric: 'cadence', value: 90, tMono: now, sourceId: 'test' })
      for (const fn of [...ticks]) fn(now)
    }
  }
  const setCoach = (patch: Partial<CoachPrefs>) => {
    const prev = settings
    settings = { ...settings, coach: { ...settings.coach, ...patch } }
    for (const l of settingsListeners) l(settings, prev)
  }
  return {
    runtime,
    shown,
    sources,
    spoken,
    ticks,
    startRide,
    ride,
    setCoach,
    mute: () => mutes.forEach((l) => l()),
    ftp: (r: FtpOutcome) => [...results].forEach((l) => l(r)),
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

describe('CoachRuntime', () => {
  it("tells the screen whose line it is, and marks its own notices as nobody's", () => {
    const h = harness()
    h.startRide()
    h.ride(1)
    expect(h.sources).toEqual(['drill-sergeant'])
    h.mute()
    expect(h.shown.at(-1)).toBe(MUTED_TEXT)
    expect(h.sources.at(-1)).toBeNull()
  })

  it('shows and speaks the coach through the ride', () => {
    const h = harness()
    h.startRide()
    h.ride(1)
    expect(h.shown).toHaveLength(1)
    expect(h.spoken).toHaveLength(1)
    h.ride(300)
    expect(h.shown.length).toBeGreaterThan(3)
    expect(h.spoken.length).toBe(h.shown.length)
    expect(h.runtime.coach?.persona.meta.id).toBe('drill-sergeant')
  })

  it('stays silent when the coach is off, and picks up mid-ride without a stale burst', () => {
    const h = harness({ coach: { enabled: false } })
    h.startRide()
    h.ride(200)
    expect(h.shown).toEqual([])
    expect(h.spoken).toEqual([])
    h.setCoach({ enabled: true })
    h.ride(1)
    // the ride-start line belonged to the start; it is not replayed
    expect(h.shown).toEqual([])
    h.ride(300)
    expect(h.shown.length).toBeGreaterThan(0)
  })

  it('shows lines without speaking when speech is off', () => {
    const h = harness({ coach: { voice: false } })
    h.startRide()
    h.ride(120)
    expect(h.shown.length).toBeGreaterThan(0)
    expect(h.spoken).toEqual([])
  })

  it('mute toggles with feedback, and nothing is said while muted', () => {
    const h = harness()
    h.startRide()
    h.ride(5)
    h.mute()
    expect(h.runtime.muted).toBe(true)
    expect(h.shown.at(-1)).toBe(MUTED_TEXT)
    const said = h.spoken.length
    const seen = h.shown.length
    h.ride(900)
    expect(h.spoken.length).toBe(said)
    expect(h.shown.length).toBe(seen)
    h.mute()
    expect(h.shown.at(-1)).toBe(UNMUTED_TEXT)
    h.ride(900)
    expect(h.spoken.length).toBeGreaterThan(said)
  })

  it('applies a persona change live', () => {
    const h = harness()
    h.startRide()
    h.ride(10)
    h.setCoach({ personaId: 'bibi', spice: 5 })
    expect(h.runtime.coach?.persona.meta.id).toBe('bibi')
    h.setCoach({ personaId: 'no-such-persona' })
    expect(h.runtime.coach?.persona.meta.id).toBe('professional')
  })

  it('asks for an AI quip pack at ride start and mixes the lines in when they arrive', async () => {
    const calls: QuipRequest[] = []
    const lines: CoachLineTemplate[] = [{ id: 'ai.idle_banter.1', text: 'Fresh banter.', triggers: ['idle_banter'], spice: 3, weight: 2 }]
    const h = harness({ coach: { useAi: true }, quips: async (req) => (calls.push(req), lines) })
    h.startRide()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ persona: { id: 'drill-sergeant' }, spice: 3, profanity: 'clean', ride: { kind: 'workout', name: VO2.name, structure: '2 × 30 seconds at 110 % FTP; 5 × 4:00 at 115 % FTP' } })
    expect(h.runtime.coach?.extraLineCount).toBe(0)
    await flush()
    expect(h.runtime.coach?.extraLineCount).toBe(1)
  })

  it('drops an AI pack written for a persona the rider has since left, and never asks with AI off', async () => {
    let resolve: (l: CoachLineTemplate[]) => void = () => undefined
    const h = harness({ coach: { useAi: true }, quips: () => new Promise((r) => (resolve = r)) })
    h.startRide()
    h.setCoach({ personaId: 'zen' })
    resolve([{ id: 'ai.idle_banter.1', text: 'Fresh banter.', triggers: ['idle_banter'], spice: 3 }])
    await flush()
    expect(h.runtime.coach?.extraLineCount).toBe(0)
    let asked = 0
    const off = harness({ coach: { useAi: false }, quips: async () => (asked++, []) })
    off.startRide()
    expect(asked).toBe(0)
  })

  it('lets go of a finished ride, and still announces the FTP-test result', async () => {
    const h = harness()
    const session = h.startRide(FTP_TEST_20MIN)
    h.ride(30)
    await session.finish()
    expect(h.runtime.coach).toBeNull()
    // only the session's own tick is left
    expect(h.ticks.size).toBe(1)
    const before = h.spoken.length
    h.ftp({ rideId: 'someone-else', ftpNew: 300, ftpOld: 250 })
    expect(h.spoken.length).toBe(before)
    h.ftp({ rideId: session.rideId, ftpNew: 262, ftpOld: 250 })
    expect(h.spoken.at(-1)).toMatch(/262/)
    // said once
    h.ftp({ rideId: session.rideId, ftpNew: 262, ftpOld: 250 })
    expect(h.spoken.filter((s) => s.includes('262'))).toHaveLength(1)
  })

  it('stop() unhooks everything', () => {
    const h = harness()
    h.runtime.stop()
    h.startRide()
    h.ride(60)
    expect(h.shown).toEqual([])
  })
})
