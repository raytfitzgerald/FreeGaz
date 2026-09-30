// The live coach in the renderer. Created once in the composition root, it
// builds a RideCoach for every ride (RideRunner.onSessionStart), feeds it from
// the engine tick and the session's events, shows each line on the ride
// screen and speaks it through a SpeechQueue. What to say is decided in
// @core/coach; this file only wires time, settings, speech and display.
//
// Per tick it does a few sensor lookups and, a few times a second at most,
// asks the persona engine for a line. AI never runs here: a quip pack is
// requested once at ride start and joins the canned lines when it arrives.
import { RideCoach, RideProbe, workoutSegments, workoutStructure, type CoachSegment, type SegmentResolver } from '@core/coach'
import type { TrainerController } from '@core/control/trainer-controller'
import { PRIORITY, PROFESSIONAL, packById, type CoachLine, type PersonaPack } from '@core/persona'
import type { RideSession, SessionEvent } from '@core/ride/session'
import { WorkoutPlan } from '@core/ride/workout-plan'
import type { SensorHub } from '@core/sensors/hub'
import type { Clock } from '@core/time/clock'
import type { AppSettings, CoachPrefs } from '@shared/settings'
import { speak, stopSpeaking } from '../audio/tts'
import { bridge } from '../platform/bridge'
import { rideStore } from '../stores/ride'
import { settingsStore } from '../stores/settings'
import { fetchQuipLines, type QuipSource } from './quips'
import { SpeechQueue, type Voice } from './speech-queue'
import { markLine, markMuted, markSpeaking, markWord } from './talk'

/** Dispatched on window by RideRunner for the C key and the phone's mute button. */
export const MUTE_EVENT = 'freegaz:mute-coach'
export const MUTED_TEXT = 'Coach muted. Press C or Unmute to bring them back.'
export const UNMUTED_TEXT = 'Coach back on.'

export interface FtpOutcome {
  rideId: string
  ftpNew: number
  ftpOld: number | null
}

export interface CoachRuntimeDeps {
  rides: { onSessionStart(listener: (session: RideSession) => void): () => void }
  engine: { onTick(fn: (now: number) => void): () => void }
  clock: Clock
  hub: SensorHub
  controller: TrainerController
  settings: { get(): AppSettings; subscribe(listener: (next: AppSettings, prev: AppSettings) => void): () => void }
  /** Speaks lines; null keeps the coach to text (automated tests, no speech engine). */
  voice: Voice | null
  /** Puts a line on the ride screen; `from` is the persona line behind it (absent for the app's own notices). */
  show(session: RideSession, text: string, from?: Pick<CoachLine, 'personaId' | 'priority'>): void
  /** Mute toggles (the C key, the phone remote, the ride screen's button). */
  onMute(listener: () => void): () => void
  /** The current ride's mute state changed (for the ride screen's button). */
  onMutedChange?: (muted: boolean) => void
  /** Valid FTP-test results, which arrive after the ride is saved. */
  onFtpResult?(listener: (r: FtpOutcome) => void): () => void
  /** AI quip packs; omitted, or any failure, means canned lines only. */
  quips?: QuipSource | null
  /** The coach started or stopped talking (music ducking). */
  onSpeaking?: (busy: boolean) => void
  rng?: () => number
}

interface ActiveRide {
  session: RideSession
  coach: RideCoach
  probe: RideProbe
  offs: (() => void)[]
  muted: boolean
  finished: boolean
}

export function personaFor(prefs: Pick<CoachPrefs, 'personaId'>): PersonaPack {
  return packById(prefs.personaId) ?? PROFESSIONAL
}

function allSegments(resolve: SegmentResolver): CoachSegment[] {
  const out: CoachSegment[] = []
  for (let i = 0; i < 5000; i++) {
    const s = resolve(i)
    if (!s) break
    out.push(s)
  }
  return out
}

export class CoachRuntime {
  private active: ActiveRide | null = null
  private readonly queue: SpeechQueue | null
  private readonly offs: (() => void)[] = []
  /** Listens for the FTP-test result of the ride that just ended. */
  private offResult: (() => void) | null = null

  constructor(private readonly deps: CoachRuntimeDeps) {
    this.queue = deps.voice ? new SpeechQueue(deps.voice, () => deps.clock.now(), undefined, deps.onSpeaking) : null
  }

  start(): void {
    if (this.offs.length > 0) return
    this.offs.push(
      this.deps.rides.onSessionStart((s) => this.begin(s)),
      this.deps.settings.subscribe((next, prev) => this.applySettings(next, prev)),
      this.deps.onMute(() => this.toggleMute()),
    )
  }

  stop(): void {
    for (const off of this.offs.splice(0)) off()
    if (this.active) this.detach(this.active)
    this.offResult?.()
    this.offResult = null
    this.queue?.clear()
  }

  /** The current ride's coach, if a ride is on (for tests and the UI). */
  get coach(): RideCoach | null {
    return this.active?.coach ?? null
  }

  get muted(): boolean {
    return this.active?.muted ?? false
  }

  private begin(session: RideSession): void {
    if (this.active) this.detach(this.active)
    this.offResult?.()
    this.offResult = null
    const prefs = this.deps.settings.get()
    const plan = session.options.plan
    const workout = plan instanceof WorkoutPlan ? plan : null
    const segments = workout ? workoutSegments(workout) : null
    const athlete = session.options.athlete
    const coach = new RideCoach({
      rideKind: session.kind,
      ftpW: athlete.ftpW,
      wPrimeJ: athlete.wPrimeJ,
      lthr: athlete.lthr,
      maxHr: athlete.maxHr,
      workoutName: plan?.name ?? session.options.name,
      plannedDurationS: workout?.timeline.durationS ?? null,
      segments,
      ftpTestProtocol: workout?.workout.ftpTest?.protocol ?? null,
      fueling: prefs.fueling,
      bests: session.options.bests,
      persona: personaFor(prefs.coach),
      spice: prefs.coach.spice,
      profanity: prefs.coach.profanity,
      ...(this.deps.rng ? { rng: this.deps.rng } : {}),
    })
    const ride: ActiveRide = { session, coach, probe: new RideProbe(session, this.deps.hub, this.deps.controller), offs: [], muted: false, finished: false }
    this.active = ride
    this.deps.onMutedChange?.(false)
    ride.offs.push(
      this.deps.engine.onTick((now) => this.onTick(ride, now)),
      session.on((e) => this.onEvent(ride, e)),
    )
    if (prefs.coach.enabled && prefs.coach.useAi && this.deps.quips) this.requestQuips(ride, prefs.coach, workout, segments)
  }

  private onTick(ride: ActiveRide, now: number): void {
    if (ride.finished) return
    const tick = ride.probe.read(now)
    if (!this.deps.settings.get().coach.enabled) {
      // keep following the ride so switching the coach back on mid-ride is seamless
      ride.coach.detector.tick(tick)
      return
    }
    this.deliver(ride, ride.coach.tick(tick))
  }

  private onEvent(ride: ActiveRide, e: SessionEvent): void {
    const now = this.deps.clock.now()
    if (this.deps.settings.get().coach.enabled) this.deliver(ride, ride.coach.event(e, now))
    else ride.coach.detector.event(e, now)
    if (e.type === 'state' && e.state === 'finished') this.finish(ride)
  }

  private finish(ride: ActiveRide): void {
    this.detach(ride)
    const listen = this.deps.onFtpResult
    if (ride.session.kind !== 'ftp-test' || !listen) return
    const off = listen((r) => {
      if (r.rideId !== ride.session.rideId) return
      off()
      if (this.offResult === off) this.offResult = null
      if (this.deps.settings.get().coach.enabled) this.deliver(ride, ride.coach.ftpResult(r, this.deps.clock.now()))
    })
    this.offResult = off
  }

  private detach(ride: ActiveRide): void {
    ride.finished = true
    for (const off of ride.offs.splice(0)) off()
    if (this.active === ride) {
      this.active = null
      this.deps.onMutedChange?.(false)
    }
  }

  private deliver(ride: ActiveRide, lines: readonly CoachLine[]): void {
    if (lines.length === 0) return
    let top = lines[0]!
    for (const l of lines) if (l.priority > top.priority) top = l
    if (!ride.finished) this.deps.show(ride.session, top.text, top)
    if (!this.queue || !this.deps.settings.get().coach.voice) return
    const at = this.deps.clock.now()
    for (const l of lines) {
      // the engine lets only safety lines through a mute; this keeps the voice honest too
      if (ride.muted && l.priority < PRIORITY.safety) continue
      this.queue.say({ text: l.speech, priority: l.priority, at, personaId: l.personaId })
    }
  }

  private toggleMute(): void {
    this.queue?.clear()
    const ride = this.active
    if (!ride) return
    ride.muted = !ride.muted
    if (ride.muted) ride.coach.mute(this.deps.clock.now())
    else ride.coach.unmute()
    this.deps.onMutedChange?.(ride.muted)
    this.deps.show(ride.session, ride.muted ? MUTED_TEXT : UNMUTED_TEXT)
  }

  private applySettings(next: AppSettings, prev: AppSettings): void {
    const c = next.coach
    const p = prev.coach
    if ((p.voice && !c.voice) || (p.enabled && !c.enabled)) this.queue?.clear()
    const ride = this.active
    if (!ride) return
    if (c.personaId !== p.personaId) ride.coach.setPersona(personaFor(c))
    if (c.spice !== p.spice) ride.coach.setSpice(c.spice)
    if (c.profanity !== p.profanity) ride.coach.setProfanity(c.profanity)
    if (next.fueling !== prev.fueling) ride.coach.setFueling(next.fueling)
  }

  private requestQuips(ride: ActiveRide, prefs: CoachPrefs, workout: WorkoutPlan | null, segments: SegmentResolver | null): void {
    const quips = this.deps.quips
    if (!quips) return
    const persona = ride.coach.persona
    void quips({
      persona: persona.meta,
      spice: prefs.spice,
      profanity: prefs.profanity,
      ride: {
        kind: ride.session.kind,
        name: ride.session.options.name,
        durationS: workout?.timeline.durationS ?? null,
        structure: segments ? workoutStructure(allSegments(segments)) : null,
      },
    })
      .then((lines) => {
        // too late, or the rider switched persona meanwhile: the canned lines carry on
        if (this.active === ride && !ride.finished && lines.length > 0) ride.coach.setExtraLines(persona.meta.id, lines)
      })
      .catch(() => undefined)
  }
}

/** The runtime wired to the app: settings and ride stores, Web Speech, AI through main. */
export function createCoachRuntime(
  rt: Pick<CoachRuntimeDeps, 'rides' | 'engine' | 'clock' | 'hub' | 'controller'>,
  opts: { speak: boolean },
): CoachRuntime {
  const settings: CoachRuntimeDeps['settings'] = {
    get: () => settingsStore.getState(),
    subscribe: (l) => settingsStore.subscribe(l),
  }
  const voice: Voice = {
    speak: (u, onEnd) => speak(u.text, { prefs: settings.get().coach, hint: packById(u.personaId)?.meta.voiceHint, onEnd, onWord: markWord }),
    cancel: stopSpeaking,
  }
  // Lower Spotify / Music while the coach talks; restore after a short silence
  // so back-to-back lines don't make the volume pump.
  let ducked = false
  let unduck: ReturnType<typeof setTimeout> | null = null
  const music = (action: 'duck' | 'unduck') => void bridge().invoke('music.command', { action }).catch(() => undefined)
  const onSpeaking = (busy: boolean) => {
    markSpeaking(busy)
    if (busy) {
      if (unduck) clearTimeout(unduck)
      unduck = null
      if (!ducked) {
        ducked = true
        music('duck')
      }
    } else if (ducked && !unduck) {
      unduck = setTimeout(() => {
        unduck = null
        ducked = false
        music('unduck')
      }, 700)
    }
  }
  return new CoachRuntime({
    ...rt,
    onSpeaking,
    settings,
    voice: opts.speak && typeof speechSynthesis !== 'undefined' ? voice : null,
    show: (session, text, from) => {
      if (session.currentState === 'finished') return
      session.setCoachLine(text)
      // who said it, for the caricature on the ride screen
      markLine(text, from?.personaId ?? null, from?.priority ?? PRIORITY.cue)
      // show it now rather than at the next once-a-second snapshot
      if (rideStore.getState().active) rideStore.setState({ snapshot: session.snapshot() })
    },
    onMutedChange: markMuted,
    onMute: (l) => {
      window.addEventListener(MUTE_EVENT, l)
      return () => window.removeEventListener(MUTE_EVENT, l)
    },
    onFtpResult: (l) =>
      rideStore.subscribe((s, prev) => {
        const t = s.ftpTest
        if (t && t !== prev.ftpTest && t.result.valid) l({ rideId: t.rideId, ftpNew: t.result.ftpW, ftpOld: t.previousFtpW })
      }),
    quips: fetchQuipLines,
  })
}
