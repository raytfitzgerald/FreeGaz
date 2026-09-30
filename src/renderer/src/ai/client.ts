// Renderer-side AI helpers. All calls go through main (keys never live here).
import { coachVoice } from '@core/coach'
import type { AiMessage } from '@core/ai/types'
import type { FitnessFacts } from '@core/metrics'
import { PROFESSIONAL, packById } from '@core/persona'
import type { RideSummary } from '@core/ride/types'
import { isoDay, pmcSeries, powerCurve, realRides, weeklyLoad } from '../db/fitness'
import { currentFtp, ftpHistory } from '../db/athlete-repo'
import { bridge } from '../platform/bridge'
import { settingsStore } from '../stores/settings'

/** The [Coach settings] block for the rider's coach as set right now (persona, spice, language). */
export function coachVoiceNow(): string {
  const c = settingsStore.getState().coach
  return coachVoice(packById(c.personaId) ?? PROFESSIONAL, { spice: c.spice, profanity: c.profanity })
}

/** Settings that change what the coach would write, for telling when a cached text is stale. */
export function coachVoiceKey(): string {
  const c = settingsStore.getState().coach
  return `${c.personaId}/${c.spice}/${c.profanity}`
}

export interface StreamHandle {
  done: Promise<{ text: string | null; error: string | null; code: string | null; model: string | null }>
  cancel(): void
}

export function streamAi(purpose: 'debrief' | 'chat' | 'fitness-summary', messages: AiMessage[], onDelta: (text: string) => void): StreamHandle {
  const streamId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  let offDelta = () => {}
  let offEnd = () => {}
  const done = new Promise<{ text: string | null; error: string | null; code: string | null; model: string | null }>((resolve) => {
    offDelta = bridge().on('ai.stream.delta', (d) => {
      if (d.streamId === streamId) onDelta(d.text)
    })
    offEnd = bridge().on('ai.stream.end', (e) => {
      if (e.streamId !== streamId) return
      offDelta()
      offEnd()
      resolve(e)
    })
    void bridge()
      .invoke('ai.stream.start', { streamId, purpose, messages })
      .catch((e: unknown) => {
        offDelta()
        offEnd()
        resolve({ text: null, error: e instanceof Error ? e.message : String(e), code: 'provider', model: null })
      })
  })
  return {
    done,
    cancel: () => void bridge().invoke('ai.stream.cancel', { streamId }),
  }
}

const r1 = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 10) / 10)

/** Compact, model-friendly summary of one ride (all numbers computed by FreeGaz). */
export function rideFacts(r: RideSummary) {
  return {
    date: new Date(r.startedAt).toISOString().slice(0, 10),
    name: r.name,
    kind: r.kind,
    movingMin: Math.round(r.movingS / 60),
    np: r.np,
    avgPower: r.avgPower,
    if: r.intensityFactor,
    tss: r1(r.tss),
    kj: Math.round(r.kj),
    avgHr: r.avgHr,
    maxHr: r.maxHr,
    avgCadence: r.avgCadence,
    decouplingPct: r1(r.decouplingPct),
    ef: r.ef,
    vi: r.vi,
    ftpAtRide: r.athlete.ftpW,
    zonesMin: r.powerZonesS.map((s) => Math.round(s / 60)),
    best: Object.fromEntries(r.mmp.filter((p) => [5, 60, 300, 1200, 3600].includes(p.durationS)).map((p) => [`${p.durationS}s`, p.watts])),
    laps: r.laps.slice(0, 30).map((l) => ({ label: l.label, s: l.durationS, avgW: l.avgPower, targetW: l.targetW, hr: l.avgHr, rpm: l.avgCadence })),
    rpe: r.rpe,
    notes: r.notes?.slice(0, 400),
  }
}

/** Recent training context for the coach (locally recorded rides only, never Strava data). */
export async function trainingContext(): Promise<string> {
  const [rides, pmc, curve, ftp] = await Promise.all([realRides(Date.now() - 42 * 86_400_000), pmcSeries(42), powerCurve(), ftpHistory()])
  const now = pmc.at(-1)
  return JSON.stringify({
    today: new Date().toISOString().slice(0, 10),
    ftpHistory: ftp.slice(-8).map((f) => ({ date: new Date(f.date).toISOString().slice(0, 10), ftpW: f.ftpW, source: f.source })),
    load: now ? { ctl: r1(now.ctl), atl: r1(now.atl), tsb: r1(now.tsb) } : null,
    eftp: curve.eftp.ftpW ? Math.round(curve.eftp.ftpW) : null,
    best90d: Object.fromEntries(curve.last90.filter((p) => [5, 60, 300, 1200, 3600].includes(p.durationS)).map((p) => [`${p.durationS}s`, Math.round(p.watts)])),
    rides: rides.slice(-20).map(rideFacts),
  })
}

/** The numbers behind the Fitness page's overview (locally recorded, non-simulated rides only). */
export async function fitnessFacts(): Promise<FitnessFacts> {
  const [pmc, weeks, recent, curve, ftp] = await Promise.all([pmcSeries(42), weeklyLoad(5), realRides(Date.now() - 28 * 86_400_000), powerCurve(), currentFtp()])
  const now = pmc.at(-1)
  // six weeks ago, but only if the rider was already riding then (otherwise it's the model's empty start, not a fitness of 0)
  const firstRide = (await realRides(0))[0]
  const before = pmc.length > 42 && firstRide && isoDay(firstRide.startedAt) <= pmc[0]!.date ? pmc[0] : undefined
  return {
    ctl: now ? now.ctl : null,
    atl: now ? now.atl : null,
    tsb: now ? now.tsb : null,
    ctl42dAgo: before ? before.ctl : null,
    weeklyTss: weeks.map((w) => Math.round(w.tss)),
    rides28d: recent.length,
    ftpW: ftp?.ftpW ?? null,
    eftpW: curve.eftp.ftpW ? Math.round(curve.eftp.ftpW) : null,
  }
}

/** What the AI fitness overview is written from: the facts, plus FTP history and best efforts. */
export async function fitnessContext(facts: FitnessFacts): Promise<string> {
  const [curve, ftp] = await Promise.all([powerCurve(), ftpHistory()])
  return JSON.stringify({
    today: new Date().toISOString().slice(0, 10),
    ...facts,
    ctl: r1(facts.ctl),
    atl: r1(facts.atl),
    tsb: r1(facts.tsb),
    ctl42dAgo: r1(facts.ctl42dAgo),
    ftpHistory: ftp.slice(-8).map((f) => ({ date: new Date(f.date).toISOString().slice(0, 10), ftpW: f.ftpW, source: f.source })),
    best90d: Object.fromEntries(curve.last90.filter((p) => [5, 60, 300, 1200, 3600].includes(p.durationS)).map((p) => [`${p.durationS}s`, Math.round(p.watts)])),
  })
}
