// FIT activity encoder (Garmin FIT protocol), via the MIT-licensed
// @markw65/fit-file-writer. Layout follows Garmin's "Encoding Activity Files"
// guidance, summary-last:
//   file_id → developer_data_id → field_description* → device_info →
//   event(timer start) → record* (timer stop/start around pauses) →
//   lap* → event(timer stop) → session → activity
// sport=cycling + sub_sport=virtual_activity makes Strava file it as a
// VirtualRide. Missing values are simply omitted (FIT "invalid").
import { FitWriter, type FitDevInfo } from '@markw65/fit-file-writer'
import type { RideRecord } from '../ride/recorder'

/** 16-byte application id for FreeGaz developer fields (constant forever). */
export const FREEGAZ_APP_ID = [0x46, 0x72, 0x65, 0x65, 0x47, 0x61, 0x7a, 0x2d, 0x9e, 0x31, 0x4b, 0x2a, 0x8c, 0x57, 0x10, 0x01]

/** Developer field numbers (field_definition_number) — never renumber. */
export const DEV_FIELD = {
  targetPower: 0,
  trainerGrade: 1,
  wPrimeBalance: 2,
} as const

export interface FitLapSummary {
  startIndex: number
  endIndex: number
  avgPower: number | null
  maxPower: number | null
  np: number | null
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  maxCadence: number | null
  distanceM: number
  kj: number
}

export interface FitSessionSummary {
  avgPower: number | null
  maxPower: number | null
  np: number | null
  tss: number | null
  intensityFactor: number | null
  kj: number
  avgHr: number | null
  maxHr: number | null
  avgCadence: number | null
  maxCadence: number | null
  avgSpeed: number | null
  maxSpeed: number | null
  totalAscentM: number | null
  thresholdPowerW: number
}

export interface FitActivityInput {
  records: RideRecord[]
  /** Optional W'bal per record (J), written as a developer field. */
  wbal?: (number | null)[]
  laps: FitLapSummary[]
  session: FitSessionSummary
  /** Minutes east of UTC at ride start (e.g. -420 for PDT). */
  utcOffsetMin: number
  softwareVersion: number
  serialNumber: number
}

const round = (v: number | null | undefined, dp = 0): number | undefined =>
  v === null || v === undefined || !Number.isFinite(v) ? undefined : Math.round(v * 10 ** dp) / 10 ** dp

/** Drop undefined keys: the writer treats present keys as fields to encode. */
function clean<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]
  return o
}

export function encodeFitActivity(input: FitActivityInput): Uint8Array {
  const { records } = input
  if (records.length === 0) throw new Error('Cannot encode an empty ride')
  const w = new FitWriter()
  const first = records[0]!
  const last = records[records.length - 1]!
  const startMs = first.ts - 1000
  const endMs = last.ts
  const start = w.time(new Date(startMs))
  const end = w.time(new Date(endMs))
  const timerS = records.length
  const elapsedS = Math.round((endMs - startMs) / 1000)

  w.writeMessage(
    'file_id',
    { type: 'activity', manufacturer: 'development', product: 1, serial_number: input.serialNumber >>> 0, time_created: start, product_name: 'FreeGaz' },
    null,
    true,
  )

  // Developer data: FreeGaz-specific streams.
  w.writeMessage('developer_data_id', { developer_data_index: 0, application_id: FREEGAZ_APP_ID, application_version: input.softwareVersion }, null, true)
  w.writeMessage('field_description', {
    developer_data_index: 0,
    field_definition_number: DEV_FIELD.targetPower,
    fit_base_type_id: 'uint16',
    field_name: 'target_power',
    units: 'watts',
    native_mesg_num: 'record',
  })
  w.writeMessage('field_description', {
    developer_data_index: 0,
    field_definition_number: DEV_FIELD.trainerGrade,
    fit_base_type_id: 'float32',
    field_name: 'trainer_grade',
    units: '%',
    native_mesg_num: 'record',
  })
  w.writeMessage(
    'field_description',
    {
      developer_data_index: 0,
      field_definition_number: DEV_FIELD.wPrimeBalance,
      fit_base_type_id: 'uint32',
      field_name: 'w_prime_balance',
      units: 'J',
      native_mesg_num: 'record',
    },
    null,
    true,
  )

  w.writeMessage(
    'device_info',
    { timestamp: start, device_index: 0 /* creator */, manufacturer: 'development', product: 1, product_name: 'FreeGaz', software_version: input.softwareVersion / 100 },
    null,
    true,
  )

  w.writeMessage('event', { timestamp: start, event: 'timer', event_type: 'start' })

  let prevTs = startMs
  records.forEach((r, i) => {
    // A jump of more than one second between records means the ride was paused.
    if (r.ts - prevTs > 1000) {
      w.writeMessage('event', { timestamp: w.time(new Date(prevTs)), event: 'timer', event_type: 'stop_all' })
      w.writeMessage('event', { timestamp: w.time(new Date(r.ts - 1000)), event: 'timer', event_type: 'start' })
    }
    prevTs = r.ts

    const dev: FitDevInfo[] = []
    if (r.targetW !== null) dev.push({ field_num: DEV_FIELD.targetPower, value: Math.round(r.targetW) })
    if (r.grade !== null) dev.push({ field_num: DEV_FIELD.trainerGrade, value: r.grade })
    const wb = input.wbal?.[i]
    if (wb !== undefined && wb !== null) dev.push({ field_num: DEV_FIELD.wPrimeBalance, value: Math.max(0, Math.round(wb)) })

    w.writeMessage(
      'record',
      clean({
        timestamp: w.time(new Date(r.ts)),
        power: round(r.power),
        heart_rate: round(r.hr),
        cadence: round(r.cadence),
        distance: round(r.distance, 2),
        enhanced_speed: round(r.speed, 3),
        enhanced_altitude: round(r.altitude, 1),
        grade: round(r.grade, 2),
        core_temperature: round(r.coreTemp, 2),
        saturated_hemoglobin_percent: round(r.smo2, 1),
        left_right_balance: r.lrBalance === null ? undefined : { value: Math.round(100 - r.lrBalance), options: ['right'] as 'right'[] },
      }),
      dev.length ? dev : null,
      i === records.length - 1,
    )
  })

  input.laps.forEach((lap, i) => {
    const a = records[lap.startIndex]!
    const b = records[lap.endIndex]!
    const lapStart = w.time(new Date(a.ts - 1000))
    const lapEnd = w.time(new Date(b.ts))
    const lapTimer = lap.endIndex - lap.startIndex + 1
    w.writeMessage(
      'lap',
      clean({
        message_index: { value: i },
        timestamp: lapEnd,
        start_time: lapStart,
        total_elapsed_time: Math.round((b.ts - (a.ts - 1000)) / 1000),
        total_timer_time: lapTimer,
        total_distance: round(lap.distanceM, 2),
        avg_power: round(lap.avgPower),
        max_power: round(lap.maxPower),
        normalized_power: round(lap.np),
        avg_heart_rate: round(lap.avgHr),
        max_heart_rate: round(lap.maxHr),
        avg_cadence: round(lap.avgCadence),
        max_cadence: round(lap.maxCadence),
        total_work: Math.round(lap.kj * 1000),
        event: 'lap',
        event_type: 'stop',
        lap_trigger: i === input.laps.length - 1 ? 'session_end' : 'manual',
        sport: 'cycling',
        sub_sport: 'virtual_activity',
      }),
      null,
      i === input.laps.length - 1,
    )
  })

  w.writeMessage('event', { timestamp: end, event: 'timer', event_type: 'stop_all' }, null, true)

  const s = input.session
  w.writeMessage(
    'session',
    clean({
      message_index: { value: 0 },
      timestamp: end,
      start_time: start,
      total_elapsed_time: elapsedS,
      total_timer_time: timerS,
      total_distance: round(last.distance, 2),
      sport: 'cycling',
      sub_sport: 'virtual_activity',
      event: 'session',
      event_type: 'stop',
      trigger: 'activity_end',
      first_lap_index: 0,
      num_laps: Math.max(1, input.laps.length),
      avg_power: round(s.avgPower),
      max_power: round(s.maxPower),
      normalized_power: round(s.np),
      training_stress_score: round(s.tss, 1),
      intensity_factor: round(s.intensityFactor, 3),
      threshold_power: Math.round(s.thresholdPowerW),
      total_work: Math.round(s.kj * 1000),
      total_calories: Math.round(s.kj),
      avg_heart_rate: round(s.avgHr),
      max_heart_rate: round(s.maxHr),
      avg_cadence: round(s.avgCadence),
      max_cadence: round(s.maxCadence),
      enhanced_avg_speed: round(s.avgSpeed, 3),
      enhanced_max_speed: round(s.maxSpeed, 3),
      total_ascent: round(s.totalAscentM),
    }),
    null,
    true,
  )

  w.writeMessage(
    'activity',
    {
      timestamp: end,
      total_timer_time: timerS,
      num_sessions: 1,
      type: 'manual',
      event: 'activity',
      event_type: 'stop',
      local_timestamp: end + input.utcOffsetMin * 60,
    },
    null,
    true,
  )

  const view = w.finish()
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice()
}
