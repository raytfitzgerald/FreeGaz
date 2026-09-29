// Renderer-side AI helpers. All calls go through main (keys never live here).
import type { AiMessage } from '@core/ai/types'
import type { RideSummary } from '@core/ride/types'
import { pmcSeries, powerCurve, realRides } from '../db/fitness'
import { ftpHistory } from '../db/athlete-repo'
import { bridge } from '../platform/bridge'

export interface StreamHandle {
  done: Promise<{ text: string | null; error: string | null; code: string | null; model: string | null }>
  cancel(): void
}

export function streamAi(purpose: 'debrief' | 'chat', messages: AiMessage[], onDelta: (text: string) => void): StreamHandle {
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
