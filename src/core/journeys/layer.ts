// JourneyLayer: a free ride or workout, somewhere. The ride session applies
// it on top of the ride's own plan, which keeps every say over the trainer
// (so a workout is still a WorkoutPlan everywhere that matters), and it moves
// a dot along the journey's road at the speed the rider's power would give them there (the
// same physics as route rides). The dot's position goes into the FIT file as
// GPS, and its speed into the ride's speed and distance, so the activity's
// numbers match its map. No power is coasting: missing is not progress.
import { DEFAULT_BIKE, stepSpeed, type BikeParams } from '../physics/bike'
import type { PlanInput, PlanTick } from '../ride/plan'
import { sampleAt } from '../routes/lookup'
import type { JourneyCourse } from './course'
import type { JourneyTick, MilestoneEvent } from './types'

export interface JourneyRider {
  riderKg?: number
  bikeKg?: number
  cda?: number
  crr?: number
}

export interface JourneyLayerOptions {
  course: JourneyCourse
  /** Saved journey being continued, or null for a one-off. */
  journeyId: string | null
  /** Where on the course this ride starts, m. */
  startM: number
  /** Real terrain slows you on the climbs; flat is watts to distance only. */
  terrain: 'real' | 'flat'
  rider: JourneyRider
  /** Write the position into the ride (and so its FIT file). */
  gps: boolean
}

const positiveOr = (v: number | undefined, fallback: number) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : fallback)

/** Position on an out-and-back of a course: past the end, ride back; past the start again, turn again. */
export function foldPosition(distM: number, lengthM: number): { positionM: number; reversed: boolean } {
  if (lengthM <= 0) return { positionM: 0, reversed: false }
  if (distM <= lengthM) return { positionM: Math.max(0, distM), reversed: false }
  const over = distM - lengthM
  const lap = Math.floor(over / lengthM)
  const into = over - lap * lengthM
  return lap % 2 === 0 ? { positionM: lengthM - into, reversed: true } : { positionM: into, reversed: false }
}

/** What the ride session needs from a journey: its say on top of the plan's tick. */
export interface PlanLayer {
  tick(input: PlanInput, base: PlanTick): PlanTick
}

export class JourneyLayer implements PlanLayer {
  private readonly bike: BikeParams
  private lastMovingS = 0
  private rideM = 0
  private speedMps = 0
  private passed: number
  private readonly passedNames: string[] = []
  private readonly startedFinished: boolean

  constructor(readonly opts: JourneyLayerOptions) {
    const r = opts.rider
    this.bike = {
      ...DEFAULT_BIKE,
      riderKg: positiveOr(r.riderKg, DEFAULT_BIKE.riderKg),
      bikeKg: positiveOr(r.bikeKg, DEFAULT_BIKE.bikeKg),
      cda: positiveOr(r.cda, DEFAULT_BIKE.cda),
      crr: positiveOr(r.crr, DEFAULT_BIKE.crr),
    }
    // milestones behind the start were celebrated on an earlier ride
    this.passed = opts.course.milestones.filter((m) => m.atM <= opts.startM).length
    this.startedFinished = opts.startM >= opts.course.lengthM
  }

  get course(): JourneyCourse {
    return this.opts.course
  }

  /** Ridden this ride, m. */
  get riddenM(): number {
    return this.rideM
  }

  /** The milestones passed so far this ride, in order. */
  get passedThisRide(): string[] {
    return this.passedNames.slice()
  }

  tick(input: PlanInput, base: PlanTick): PlanTick {
    const { course, terrain } = this.opts
    const t = input.movingS
    const dt = Number.isFinite(t) ? Math.max(0, t - this.lastMovingS) : 0
    if (dt > 0) {
      this.lastMovingS = t
      const before = foldPosition(this.opts.startM + this.rideM, course.lengthM)
      const grade = terrain === 'flat' ? 0 : sampleAt(course.route.profile, before.positionM).gradePct * (before.reversed ? -1 : 1)
      const power = input.power !== null && Number.isFinite(input.power) ? Math.max(0, input.power) : 0
      // stepSpeed is stable for any dt, but long gaps (a stall) shouldn't fling the rider forward
      this.speedMps = stepSpeed(this.speedMps, power, grade, Math.min(dt, 2), this.bike)
      this.rideM += this.speedMps * dt
    }

    const { positionM, reversed } = foldPosition(this.opts.startM + this.rideM, course.lengthM)
    const here = sampleAt(course.route.profile, positionM)
    const gradePct = terrain === 'flat' ? 0 : Math.round(here.gradePct * (reversed ? -1 : 1) * 100) / 100
    const progressM = Math.min(course.lengthM, this.opts.startM + this.rideM)
    const finished = this.startedFinished || progressM >= course.lengthM

    // one milestone per tick at most; a fast tick past two catches the second on the next
    let milestone: MilestoneEvent | null = null
    const nextMs = course.milestones[this.passed]
    if (nextMs && progressM >= nextMs.atM) {
      this.passed++
      if (nextMs.kind !== 'halfway') this.passedNames.push(nextMs.name)
      milestone = {
        name: nextMs.name,
        kind: nextMs.kind,
        atM: nextMs.atM,
        journeyName: course.name,
        kmDone: Math.round(nextMs.atM / 1000),
        kmLeft: Math.max(0, Math.round((course.lengthM - nextMs.atM) / 1000)),
      }
    }
    const upcoming = course.milestones[this.passed]
    const journey: JourneyTick = {
      courseId: course.id,
      journeyId: this.opts.journeyId,
      name: course.name,
      kind: course.kind,
      lengthM: course.lengthM,
      startM: this.opts.startM,
      rideM: this.rideM,
      positionM,
      progressM,
      reversed,
      lat: here.lat,
      lon: here.lon,
      ele: Math.round(here.ele * 10) / 10,
      gradePct,
      speedMps: this.speedMps,
      finished,
      next: upcoming && !reversed ? { name: upcoming.name, kind: upcoming.kind, inM: Math.max(0, upcoming.atM - progressM) } : null,
    }

    return {
      ...base,
      // the virtual road sets speed and distance, so the activity's numbers match its map
      speed: this.speedMps,
      ...(base.altitude === undefined || base.altitude === null ? { altitude: journey.ele } : {}),
      ...(base.grade === undefined || base.grade === null ? { grade: gradePct } : {}),
      ...(this.opts.gps ? { lat: here.lat, lon: here.lon } : {}),
      cue: base.cue ?? (milestone ? milestoneCue(milestone) : null),
      journey,
      milestone,
    }
  }
}

export function milestoneCue(m: MilestoneEvent): string {
  switch (m.kind) {
    case 'finish':
      return `${m.name}: you made it. ${m.kmDone} km of ${m.journeyName}.`
    case 'halfway':
      return `Halfway: ${m.kmDone} km done, ${m.kmLeft} to go.`
    case 'border':
      return `Welcome to ${m.name} · ${m.kmDone} km in.`
    case 'summit':
      return `Top of ${m.name} · ${m.kmDone} km in.`
    default:
      return `${m.name} · ${m.kmDone} km in, ${m.kmLeft} to go.`
  }
}
