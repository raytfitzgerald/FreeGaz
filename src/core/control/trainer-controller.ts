// Trainer control as a desired-state reconciler.
//
// The rest of the app says what it *wants* (ERG 250 W, SIM 4 %, level 30 %,
// hold HR 140). `decide()` is a pure function that turns wants + live inputs
// into at most one wire command per tick, applying:
//   * intensity scaling and offsets (ERG)
//   * soft start after start/resume/spiral recovery (ERG)
//   * low-cadence "spiral of death" release (ERG)
//   * ERG release while paused
//   * slope scaling U/D/limit (SIM; feel only, speed uses true grade)
//   * HR-ERG PI loop
//   * deadbands and a minimum command interval (trainers choke on floods)
// `TrainerController` wraps it with a bound driver and handles send results.
import type { CommandResult, Range, TrainerCommand } from '../devices/types'

export type Desired =
  | { mode: 'idle' }
  | { mode: 'erg'; watts: number }
  | { mode: 'resistance'; pct: number }
  | { mode: 'sim'; gradePct: number }
  | { mode: 'hr'; targetBpm: number }

export interface SlopeScaling {
  /** % of uphill grade sent to the trainer (100 = real). */
  uphillPct: number
  /** % of downhill grade sent (50 = half as steep). */
  downhillPct: number
  /** Absolute cap in % grade, both directions. */
  limitPct: number
}

export interface ControllerSettings {
  /** ERG multiplier in % (100 = as written). */
  intensityPct: number
  /** Added to ERG targets after scaling, W. */
  ergOffsetW: number
  ergSoftStartS: number
  spiralGuard: {
    enabled: boolean
    lowCadenceRpm: number
    lowForS: number
    recoverCadenceRpm: number
    recoverForS: number
    /** Resistance used while released, % of range. */
    releasePct: number
  }
  /** Resistance used while paused (ERG released), % of range. */
  pausedResistancePct: number
  slope: SlopeScaling
  /** Rolling resistance and wind parameters sent with SIM grade. */
  sim: { crr: number; cwKgPerM: number; windMps: number }
  hrErg: { kp: number; ki: number; minW: number; maxW: number; updateS: number }
  minCommandIntervalMs: number
  ergDeadbandW: number
  simDeadbandPct: number
  resistanceDeadbandPct: number
}

export const DEFAULT_CONTROLLER_SETTINGS: ControllerSettings = {
  intensityPct: 100,
  ergOffsetW: 0,
  ergSoftStartS: 10,
  spiralGuard: { enabled: true, lowCadenceRpm: 55, lowForS: 3, recoverCadenceRpm: 70, recoverForS: 5, releasePct: 10 },
  pausedResistancePct: 5,
  slope: { uphillPct: 100, downhillPct: 50, limitPct: 20 },
  sim: { crr: 0.0033, cwKgPerM: 0.51, windMps: 0 },
  hrErg: { kp: 1.5, ki: 0.05, minW: 60, maxW: 400, updateS: 5 },
  minCommandIntervalMs: 1000,
  ergDeadbandW: 2,
  simDeadbandPct: 0.1,
  resistanceDeadbandPct: 1,
}

export interface ControllerInputs {
  now: number
  cadence: number | null
  power: number | null
  hr: number | null
  /** Ride is paused (user or auto-pause): release ERG. */
  paused: boolean
}

export type Guard = 'none' | 'soft-start' | 'spiral' | 'paused'

export interface ControllerState {
  desired: Desired
  /** Last command the trainer acknowledged, or null when unknown (fresh bind / reconnect). */
  applied: TrainerCommand | null
  lastSentAt: number | null
  /** After a failed send nothing goes out before this time (another app holding control is retried slowly). */
  retryAt: number | null
  softStart: { fromW: number; startedAt: number } | null
  spiral: { lowSince: number | null; active: boolean; recoverSince: number | null }
  hrErg: { watts: number | null; integral: number; lastUpdate: number | null }
  guard: Guard
  /** What the trainer is being asked to do right now after guards (for the HUD). */
  effective: TrainerCommand
  /** Set whenever something (mode change, resume) should trigger a soft start. */
  wantsSoftStart: boolean
}

export function initialControllerState(): ControllerState {
  return {
    desired: { mode: 'idle' },
    applied: null,
    lastSentAt: null,
    retryAt: null,
    softStart: null,
    spiral: { lowSince: null, active: false, recoverSince: null },
    hrErg: { watts: null, integral: 0, lastUpdate: null },
    guard: 'none',
    effective: { kind: 'idle' },
    wantsSoftStart: false,
  }
}

/** Uphill: min(g × U, limit). Downhill: max(g × D, −limit). */
export function scaleGrade(gradePct: number, s: SlopeScaling): number {
  const scaled = gradePct >= 0 ? (gradePct * s.uphillPct) / 100 : (gradePct * s.downhillPct) / 100
  return Math.max(-s.limitPct, Math.min(s.limitPct, scaled))
}

/** The ERG target the rider is asked to hold: intensity and offset applied, guards ignored. */
export function scaledErgTarget(watts: number, settings: Pick<ControllerSettings, 'intensityPct' | 'ergOffsetW'>): number {
  return Math.round((watts * settings.intensityPct) / 100 + settings.ergOffsetW)
}

export function clampToRange(value: number, range: Range | undefined): number {
  if (!range) return value
  let v = Math.max(range.min, Math.min(range.max, value))
  if (range.step > 0) v = range.min + Math.round((v - range.min) / range.step) * range.step
  return v
}

export interface DecideContext {
  settings: ControllerSettings
  powerRange?: Range
}

/**
 * Pure: given the current state and inputs, returns the next state and at most
 * one command to send now. Callers must report the send result through
 * `acknowledge()` so `applied` tracks what the trainer actually has.
 */
export function decide(
  prev: ControllerState,
  input: ControllerInputs,
  ctx: DecideContext,
): { state: ControllerState; command: TrainerCommand | null } {
  const { settings } = ctx
  const s: ControllerState = {
    ...prev,
    spiral: { ...prev.spiral },
    hrErg: { ...prev.hrErg },
  }

  const effective = computeEffective(s, input, ctx)
  s.effective = effective

  if (!shouldSend(s, effective, input.now, settings)) return { state: s, command: null }
  return { state: s, command: effective }
}

/** Records that `decide()`'s command was actually sent at `now`. */
export function markSent(prev: ControllerState, now: number): ControllerState {
  return { ...prev, lastSentAt: now }
}

/** Retry delays after a failed send, from when it was sent. */
export const RETRY_MS: Record<Exclude<CommandResult, 'ok'>, number> = {
  'not-permitted': 5000,
  unsupported: 10_000,
  rejected: 1000,
  timeout: 1000,
  disconnected: 1000,
}

/** Records the outcome of sending `cmd`. */
export function acknowledge(prev: ControllerState, cmd: TrainerCommand, result: CommandResult): ControllerState {
  if (result === 'ok') return { ...prev, applied: cmd, retryAt: null }
  // Anything else: we no longer know what the trainer holds; resend after a pause.
  return { ...prev, applied: null, retryAt: (prev.lastSentAt ?? 0) + RETRY_MS[result] }
}

/** Sets a new desired state; mode changes into ERG arm the soft start. */
export function setDesired(prev: ControllerState, desired: Desired): ControllerState {
  const enteringErg = (desired.mode === 'erg' || desired.mode === 'hr') && prev.desired.mode !== desired.mode
  const next: ControllerState = { ...prev, desired }
  if (enteringErg) next.wantsSoftStart = true
  if (desired.mode !== 'hr') next.hrErg = { watts: null, integral: 0, lastUpdate: null }
  if (desired.mode !== 'erg' && desired.mode !== 'hr') {
    next.softStart = null
    next.spiral = { lowSince: null, active: false, recoverSince: null }
  }
  return next
}

/**
 * A new trainer was bound (or reconnected): its state is unknown, so reapply.
 * No soft start: a reconnect should be invisible to the rider, and the
 * trainer's own ERG ramp covers a trainer that rebooted.
 */
export function markUnknown(prev: ControllerState): ControllerState {
  return { ...prev, applied: null, lastSentAt: null, retryAt: null }
}

function computeEffective(s: ControllerState, input: ControllerInputs, ctx: DecideContext): TrainerCommand {
  const { settings } = ctx
  const d = s.desired

  if (d.mode === 'idle') {
    s.guard = 'none'
    return { kind: 'idle' }
  }

  if (d.mode === 'resistance') {
    s.guard = input.paused ? 'paused' : 'none'
    return { kind: 'resistance', pct: clamp(d.pct, 0, 100) }
  }

  if (d.mode === 'sim') {
    s.guard = 'none'
    return {
      kind: 'sim',
      gradePct: round(scaleGrade(d.gradePct, settings.slope), 2),
      windMps: settings.sim.windMps,
      crr: settings.sim.crr,
      cwKgPerM: settings.sim.cwKgPerM,
    }
  }

  // ---- ERG and HR-ERG ----
  if (input.paused) {
    s.guard = 'paused'
    s.wantsSoftStart = true
    s.softStart = null
    return { kind: 'resistance', pct: settings.pausedResistancePct }
  }

  let targetW: number
  if (d.mode === 'hr') {
    targetW = hrErgStep(s, d.targetBpm, input, settings)
  } else {
    targetW = scaledErgTarget(d.watts, settings)
  }
  targetW = clampToRange(Math.round(targetW), ctx.powerRange)

  // Spiral-of-death guard: cadence has collapsed under a high ERG load.
  if (settings.spiralGuard.enabled && input.cadence !== null) {
    const g = settings.spiralGuard
    if (!s.spiral.active) {
      if (input.cadence < g.lowCadenceRpm) {
        s.spiral.lowSince ??= input.now
        if (input.now - s.spiral.lowSince >= g.lowForS * 1000) {
          s.spiral = { lowSince: null, active: true, recoverSince: null }
        }
      } else {
        s.spiral.lowSince = null
      }
    } else if (input.cadence >= g.recoverCadenceRpm) {
      s.spiral.recoverSince ??= input.now
      if (input.now - s.spiral.recoverSince >= g.recoverForS * 1000) {
        s.spiral = { lowSince: null, active: false, recoverSince: null }
        s.wantsSoftStart = true
      }
    } else {
      s.spiral.recoverSince = null
    }
    if (s.spiral.active) {
      s.guard = 'spiral'
      return { kind: 'resistance', pct: g.releasePct }
    }
  }

  // Soft start: ramp linearly from the rider's current power to target.
  if (s.wantsSoftStart) {
    s.wantsSoftStart = false
    const fromW = Math.max(0, Math.min(targetW, input.power ?? targetW * 0.5))
    s.softStart = settings.ergSoftStartS > 0 && fromW < targetW - 10 ? { fromW, startedAt: input.now } : null
  }
  if (s.softStart) {
    const frac = (input.now - s.softStart.startedAt) / (settings.ergSoftStartS * 1000)
    if (frac >= 1) {
      s.softStart = null
    } else {
      s.guard = 'soft-start'
      const w = s.softStart.fromW + (targetW - s.softStart.fromW) * frac
      return { kind: 'erg', watts: Math.round(w) }
    }
  }

  s.guard = 'none'
  return { kind: 'erg', watts: targetW }
}

function hrErgStep(s: ControllerState, targetBpm: number, input: ControllerInputs, settings: ControllerSettings): number {
  const k = settings.hrErg
  const current = s.hrErg.watts
  if (current === null) {
    const start = clamp(input.power ?? (k.minW + k.maxW) / 3, k.minW, k.maxW)
    s.hrErg = { watts: start, integral: 0, lastUpdate: input.now }
    return start
  }
  if (input.hr !== null && s.hrErg.lastUpdate !== null && input.now - s.hrErg.lastUpdate >= k.updateS * 1000) {
    const err = targetBpm - input.hr
    const integral = clamp(s.hrErg.integral + err * k.updateS, -600, 600)
    const watts = clamp(current + k.kp * err + k.ki * integral * 0.1, k.minW, k.maxW)
    s.hrErg = { watts, integral, lastUpdate: input.now }
    return watts
  }
  return current
}

function shouldSend(s: ControllerState, cmd: TrainerCommand, now: number, settings: ControllerSettings): boolean {
  if (cmd.kind === 'idle') return false
  if (s.retryAt !== null && now < s.retryAt) return false
  const a = s.applied
  const sinceLast = s.lastSentAt === null ? Infinity : now - s.lastSentAt
  const modeChanged = !a || a.kind !== cmd.kind
  // Mode changes go out quickly (but never more than 4/s); tweaks honour the interval.
  const minGap = modeChanged ? Math.min(250, settings.minCommandIntervalMs) : settings.minCommandIntervalMs
  if (sinceLast < minGap) return false
  if (modeChanged) return true
  switch (cmd.kind) {
    case 'erg':
      return Math.abs(cmd.watts - (a as { watts: number }).watts) >= settings.ergDeadbandW
    case 'resistance':
      return Math.abs(cmd.pct - (a as { pct: number }).pct) >= settings.resistanceDeadbandPct
    case 'sim': {
      const prev = a as Extract<TrainerCommand, { kind: 'sim' }>
      return (
        Math.abs(cmd.gradePct - prev.gradePct) >= settings.simDeadbandPct ||
        cmd.windMps !== prev.windMps ||
        cmd.crr !== prev.crr ||
        cmd.cwKgPerM !== prev.cwKgPerM
      )
    }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp

// ---------------------------------------------------------------------------

export interface TrainerSink {
  send(cmd: TrainerCommand): Promise<CommandResult>
  readonly powerRange?: Range
}

export type ControllerEvent =
  | { type: 'sent'; command: TrainerCommand; result: CommandResult }
  | { type: 'guard'; guard: Guard }
  | { type: 'control-lost' }

/**
 * Stateful wrapper: owns the state, binds to the current trainer sink and
 * performs sends. Call `tick()` from the ride engine (e.g. every 250 ms).
 */
export class TrainerController {
  private state = initialControllerState()
  private sink: TrainerSink | null = null
  private inFlight = false
  private readonly listeners = new Set<(e: ControllerEvent) => void>()

  constructor(private settings: ControllerSettings = DEFAULT_CONTROLLER_SETTINGS) {}

  get snapshot(): Readonly<ControllerState> {
    return this.state
  }
  get currentSettings(): Readonly<ControllerSettings> {
    return this.settings
  }

  on(listener: (e: ControllerEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  bind(sink: TrainerSink | null): void {
    this.sink = sink
    this.state = markUnknown(this.state)
  }

  setDesired(desired: Desired): void {
    this.state = setDesired(this.state, desired)
  }

  updateSettings(patch: Partial<ControllerSettings>): void {
    this.settings = { ...this.settings, ...patch }
  }

  /** Nudge ERG intensity by ±pct (e.g. +1 / −5). Clamped 50–150 %. */
  adjustIntensity(deltaPct: number): number {
    const next = clamp(this.settings.intensityPct + deltaPct, 50, 150)
    this.settings = { ...this.settings, intensityPct: next }
    return next
  }

  tick(input: ControllerInputs): void {
    const prevGuard = this.state.guard
    const { state, command } = decide(this.state, input, { settings: this.settings, powerRange: this.sink?.powerRange })
    this.state = state
    if (state.guard !== prevGuard) this.emit({ type: 'guard', guard: state.guard })
    if (!command || !this.sink || this.inFlight) return
    const sink = this.sink
    this.state = markSent(this.state, input.now)
    this.inFlight = true
    void sink
      .send(command)
      .catch((): CommandResult => 'disconnected')
      .then((result) => {
        this.inFlight = false
        if (this.sink !== sink) return
        this.state = acknowledge(this.state, command, result)
        this.emit({ type: 'sent', command, result })
        if (result === 'not-permitted') this.emit({ type: 'control-lost' })
      })
  }

  private emit(e: ControllerEvent): void {
    for (const l of this.listeners) l(e)
  }
}
