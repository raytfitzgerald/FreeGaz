import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import uPlot from 'uplot'
import { axis, line } from '../../charts/style'
import { UPlot } from '../../charts/UPlot'
import { ftpTimeline, pmcSeries, powerCurve, weeklyLoad } from '../../db/fitness'
import { db } from '../../db/db'
import { Card, CardBody, CardHeader } from '../../ui/Card'
import { PageHeader } from '../../ui/PageHeader'
import { formatDuration } from '../../ui/format'
import { useNow } from '../../ui/useNow'
import { cssVar } from '../../ui/zones'
import { FitnessOverviewCard } from './FitnessOverviewCard'

/** Categorical slots 1-3 (validated all-pairs in both modes). */
const SLOT = ['--color-cadence', '--color-power', '--color-speed'] as const

export function FitnessPage() {
  const rideCount = useLiveQuery(() => db().rides.count(), [])
  const pmc = useLiveQuery(() => pmcSeries(180), [rideCount])
  const weeks = useLiveQuery(() => weeklyLoad(16), [rideCount])
  const curve = useLiveQuery(() => powerCurve(), [rideCount])
  const ftp = useLiveQuery(() => ftpTimeline(), [])

  const latest = pmc?.at(-1)
  return (
    <div className="mx-auto max-w-6xl px-8 pb-12">
      <PageHeader title="Fitness" subtitle="Training load, FTP over time and your power curve. Simulated rides are excluded." />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Fitness (CTL)" value={latest ? Math.round(latest.ctl) : null} />
        <Stat label="Fatigue (ATL)" value={latest ? Math.round(latest.atl) : null} />
        <Stat label="Form (TSB)" value={latest ? Math.round(latest.tsb) : null} signed />
        <Stat label="eFTP (90 days)" value={curve?.eftp.ftpW ? Math.round(curve.eftp.ftpW) : null} unit="W" />
      </div>

      <div className="space-y-4">
        <FitnessOverviewCard rideCount={rideCount} />
        <Card>
          <CardHeader title="Training load" subtitle="Fitness is your 42-day average load, fatigue the 7-day; form = fitness − fatigue." />
          <CardBody>{pmc && pmc.length > 1 ? <PmcChart rows={pmc} /> : <Empty />}</CardBody>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Power curve" subtitle="Best average power for every duration." />
            <CardBody>{curve && curve.last365.length > 0 ? <PowerCurveChart curve={curve} /> : <Empty />}</CardBody>
          </Card>
          <Card>
            <CardHeader title="FTP over time" subtitle="Tests, manual changes and estimates." />
            <CardBody>{ftp && ftp.length > 0 ? <FtpChart rows={ftp} /> : <Empty text="Set your FTP or take a test to start the history." />}</CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Weekly load" subtitle="TSS per week, last 16 weeks." />
          <CardBody>{weeks ? <WeeklyChart weeks={weeks} /> : <Empty />}</CardBody>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, unit, signed }: { label: string; value: number | null; unit?: string; signed?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-5 py-4">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="mt-1 font-display text-3xl font-semibold">
        {value === null ? '—' : signed && value > 0 ? `+${value}` : value}
        {unit && value !== null && <span className="ml-1 text-sm font-normal text-ink-dim">{unit}</span>}
      </div>
    </div>
  )
}

function Empty({ text = 'Ride a few times and this fills in.' }: { text?: string }) {
  return <div className="flex h-40 items-center justify-center text-sm text-ink-faint">{text}</div>
}

function PmcChart({ rows }: { rows: { date: string; ctl: number; atl: number; tsb: number }[] }) {
  const data = useMemo<uPlot.AlignedData>(
    () => [rows.map((r) => new Date(`${r.date}T12:00:00`).getTime() / 1000), rows.map((r) => r.ctl), rows.map((r) => r.atl), rows.map((r) => r.tsb)],
    [rows],
  )
  return (
    <UPlot
      ariaLabel="Fitness, fatigue and form over the last 180 days"
      optsKey="pmc"
      data={data}
      height={240}
      options={() => ({
        scales: { x: { time: true } },
        axes: [axis(), axis({ label: 'TSS / day', labelSize: 14 })],
        series: [{}, line('Fitness (CTL)', SLOT[0]), line('Fatigue (ATL)', SLOT[1]), line('Form (TSB)', SLOT[2])],
        legend: { show: true },
        cursor: { points: { size: 8 } },
      })}
    />
  )
}

function PowerCurveChart({ curve }: { curve: { last90: { durationS: number; watts: number }[]; last365: { durationS: number; watts: number }[] } }) {
  const data = useMemo<uPlot.AlignedData>(() => {
    const durations = [...new Set([...curve.last365.map((p) => p.durationS), ...curve.last90.map((p) => p.durationS)])].sort((a, b) => a - b)
    const w90 = new Map(curve.last90.map((p) => [p.durationS, p.watts]))
    const w365 = new Map(curve.last365.map((p) => [p.durationS, p.watts]))
    return [durations, durations.map((d) => w90.get(d) ?? null), durations.map((d) => w365.get(d) ?? null)]
  }, [curve])
  return (
    <UPlot
      ariaLabel="Best power for each duration: last 90 days and last 12 months"
      optsKey="mmp"
      data={data}
      height={240}
      options={() => ({
        scales: { x: { time: false, distr: 3, log: 10 } },
        axes: [axis({ values: (_u, vals) => vals.map((v) => (v == null ? '' : formatDuration(v))) }), axis({ label: 'W', labelSize: 14 })],
        series: [{ value: (_u, v) => (v == null ? '' : formatDuration(v)) }, line('Last 90 days', SLOT[0]), line('Last 12 months', SLOT[1])],
        legend: { show: true },
      })}
    />
  )
}

function FtpChart({ rows }: { rows: { date: number; ftpW: number }[] }) {
  const now = useNow()
  // The last FTP holds until today.
  const data = useMemo<uPlot.AlignedData>(() => {
    const xs = rows.map((r) => r.date / 1000)
    xs.push(now / 1000)
    const ys = rows.map((r) => r.ftpW)
    ys.push(rows.at(-1)!.ftpW)
    return [xs, ys]
  }, [rows, now])
  return (
    <UPlot
      ariaLabel="FTP over time"
      optsKey="ftp"
      data={data}
      height={240}
      options={() => ({
        scales: { x: { time: true } },
        axes: [axis(), axis({ label: 'W', labelSize: 14 })],
        series: [{}, { ...line('FTP', SLOT[0]), paths: uPlot.paths.stepped!({ align: 1 }), points: { show: true, size: 8, stroke: cssVar(SLOT[0]), fill: cssVar(SLOT[0]) } }],
        legend: { show: false },
      })}
    />
  )
}

function WeeklyChart({ weeks }: { weeks: { weekStart: number; tss: number; hours: number }[] }) {
  const data = useMemo<uPlot.AlignedData>(() => [weeks.map((w) => w.weekStart / 1000 + 3.5 * 86400), weeks.map((w) => Math.round(w.tss))], [weeks])
  return (
    <UPlot
      ariaLabel="Weekly training stress"
      optsKey="weeks"
      data={data}
      height={200}
      options={(width) => ({
        scales: { x: { time: true } },
        axes: [axis(), axis({ label: 'TSS', labelSize: 14 })],
        series: [
          {},
          {
            label: 'Weekly TSS',
            fill: cssVar(SLOT[0]),
            stroke: cssVar(SLOT[0]),
            width: 0,
            paths: uPlot.paths.bars!({ size: [Math.min(0.6, 24 / Math.max(1, width / weeks.length)), 24], radius: 0.2 }),
            points: { show: false },
          },
        ],
        legend: { show: false },
      })}
    />
  )
}
