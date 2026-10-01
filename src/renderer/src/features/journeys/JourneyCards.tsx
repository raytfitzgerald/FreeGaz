import { useEffect, useState } from 'react'
import { Flag, MapPinned } from 'lucide-react'
import type { JourneyCourse } from '@core/journeys/course'
import { mapFrame } from '@core/journeys/map'
import { journeyTotals, type Journey } from '@core/journeys/progress'
import { distanceUnit, formatLongDistance } from '@core/units'
import type { SavedJourney } from '../../journeys/ride'
import { loadCourse } from '../../journeys/catalogue'
import { useSettings } from '../../stores/settings'

/** One line on the saved-ride card: where the ride went. */
export function SavedJourneyLine({ j }: { j: SavedJourney }) {
  const units = useSettings((s) => s.units)
  const km = (m: number) => `${formatLongDistance(m, units, m < 100_000 ? 1 : 0)} ${distanceUnit(units)}`
  const where =
    j.kind === 'drop' ? `${j.name} · ${km(j.rodeM)} ridden` : `${j.name}${j.day !== null ? `, day ${j.day}` : ''} · ${km(j.rodeM)} today · ${km(j.progressM)} of ${km(j.lengthM)}`
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-dim" data-testid="saved-journey">
      <MapPinned className="size-4 text-accent" aria-hidden />
      <span className="text-ink">{where}</span>
      {j.passed.length > 0 && <span>· passed {j.passed.join(', ')}</span>}
      {j.simulated && j.kind !== 'drop' && <span className="text-accent">· simulated, so the journey didn't move</span>}
    </p>
  )
}

/** The end of a saved journey: the whole road and the totals. */
export function JourneyFinishCard({ journey }: { journey: Journey }) {
  const units = useSettings((s) => s.units)
  const [course, setCourse] = useState<JourneyCourse | null>(null)
  useEffect(() => {
    let live = true
    void loadCourse(journey.courseId)
      .then((c) => live && setCourse(c))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [journey.courseId])
  const t = journeyTotals(journey)
  const km = (m: number) => `${formatLongDistance(m, units, 0)} ${distanceUnit(units)}`
  const W = 640
  const H = 220
  const frame = course ? mapFrame(course.route.points, 0, course.lengthM, W, H, 16) : null
  return (
    <section className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-5" data-testid="journey-finished" data-snap>
      <div className="flex items-center gap-2 font-display text-xl font-semibold">
        <Flag className="size-5 text-accent" aria-hidden /> You rode {journey.name}
      </div>
      <div className="tabular mt-1 flex flex-wrap gap-x-6 text-sm text-ink-dim">
        <span>
          <b className="text-ink">{km(t.distanceM)}</b>
        </span>
        <span>
          <b className="text-ink">{t.rides}</b> {t.rides === 1 ? 'ride' : 'rides'}
        </span>
        <span>
          <b className="text-ink">{t.days}</b> {t.days === 1 ? 'day' : 'days'}
        </span>
      </div>
      {frame && course && (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label={`The whole of ${journey.name}`}>
          <polyline points={frame.path(0, course.lengthM)} fill="none" stroke="var(--color-accent)" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          {(() => {
            const a = course.route.points[0]!
            const b = course.route.points.at(-1)!
            const [x0, y0] = frame.project(a.lat, a.lon)
            const [x1, y1] = frame.project(b.lat, b.lon)
            return (
              <>
                <circle cx={x0} cy={y0} r={6} fill="var(--color-panel)" stroke="var(--color-ink)" strokeWidth={2} />
                <rect x={x1 - 6} y={y1 - 6} width={12} height={12} rx={2} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} />
              </>
            )
          })()}
          <text x={W - 4} y={H - 4} textAnchor="end" fontSize={9} fill="var(--color-ink-faint)">
            © OpenStreetMap contributors
          </text>
        </svg>
      )}
    </section>
  )
}
