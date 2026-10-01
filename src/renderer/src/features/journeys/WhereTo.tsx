import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from '@tanstack/react-router'
import { MapPinned } from 'lucide-react'
import { distanceUnit, formatLongDistance } from '@core/units'
import { db } from '../../db/db'
import { CATALOGUE, DROPS, GRAND, routeJourneys } from '../../journeys/catalogue'
import { chooseJourney, useJourneyChoice, type JourneyChoice } from '../../journeys/choice'
import { useSettings } from '../../stores/settings'
import { Select } from '../../ui/form'

// "Where to?" on the ride setup screens: send this ride somewhere (a famous
// start, the journey in progress, a new grand journey, an imported route) or
// nowhere. Shown when Journeys are on; the choice applies to the next ride.

const encode = (c: JourneyChoice): string =>
  c.kind === 'none' ? 'none' : c.kind === 'drop' ? `drop:${c.courseId ?? '*'}` : c.kind === 'continue' ? `continue:${c.journeyId}` : `start:${c.courseId}`

function decode(v: string): JourneyChoice {
  const [kind, id = ''] = [v.slice(0, v.indexOf(':') === -1 ? v.length : v.indexOf(':')), v.slice(v.indexOf(':') + 1)]
  if (kind === 'drop') return { kind: 'drop', courseId: id === '*' ? null : id }
  if (kind === 'continue') return { kind: 'continue', journeyId: id }
  if (kind === 'start') return { kind: 'start', courseId: id }
  return { kind: 'none' }
}

export function WhereTo() {
  const prefs = useSettings((s) => s.journeys)
  const units = useSettings((s) => s.units)
  const chosen = useJourneyChoice()
  const journeys = useLiveQuery(async () => (await db().journeys.toArray()).filter((j) => j.finishedAt === null).sort((a, b) => b.updatedAt - a.updatedAt), [], [])
  const routes = useLiveQuery(() => routeJourneys().catch(() => []), [], [])
  if (!prefs.enabled) {
    return (
      <p className="flex items-center gap-2 text-xs text-ink-faint" data-testid="where-to-off">
        <MapPinned className="size-3.5" aria-hidden /> Want this ride to go somewhere real?{' '}
        <Link to="/settings" search={{ tab: 'journeys' }} className="text-accent underline underline-offset-2">
          Turn on Journeys
        </Link>
      </p>
    )
  }
  const active = journeys.find((j) => j.id === prefs.activeId)
  const fallback: JourneyChoice =
    prefs.mode === 'none' ? { kind: 'none' } : prefs.mode === 'continue' && active ? { kind: 'continue', journeyId: active.id } : { kind: 'drop', courseId: null }
  const value = encode(chosen ?? fallback)
  const km = (m: number) => `${formatLongDistance(m, units, 0)} ${distanceUnit(units)}`
  const meta = (() => {
    const c = decode(value)
    if (c.kind === 'drop' && c.courseId) return CATALOGUE.find((m) => m.id === c.courseId)?.blurb
    if (c.kind === 'drop') return 'A famous start, picked at random: the Stelvio, Shibuya, the Golden Gate…'
    if (c.kind === 'start') return CATALOGUE.find((m) => m.id === c.courseId)?.blurb ?? 'Your route, ridden as a journey: distance from your watts, picking up where you stop.'
    if (c.kind === 'continue') {
      const j = journeys.find((x) => x.id === c.journeyId)
      return j ? `Day ${j.rides.length + 1}. ${km(j.progressM)} of ${km(j.lengthM)} so far.` : undefined
    }
    return 'This ride stays in the pain cave.'
  })()

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-panel px-5 py-3" data-testid="where-to">
      <label className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <MapPinned className="size-4 text-accent" aria-hidden /> Where to?
        </span>
        <Select value={value} onChange={(e) => chooseJourney(decode(e.target.value))} className="min-w-0 max-w-full flex-1 sm:max-w-md" data-testid="where-to-select">
          <option value="drop:*">Somewhere random</option>
          <optgroup label="Drop me at">
            {DROPS.map((d) => (
              <option key={d.id} value={`drop:${d.id}`}>
                {d.name} · {km(d.lengthM)}
              </option>
            ))}
          </optgroup>
          {journeys.length > 0 && (
            <optgroup label="Carry on">
              {journeys.map((j) => (
                <option key={j.id} value={`continue:${j.id}`}>
                  {j.name} · {km(j.progressM)} of {km(j.lengthM)}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Start a journey">
            {GRAND.map((g) => (
              <option key={g.id} value={`start:${g.id}`}>
                {g.name} · {km(g.lengthM)}
              </option>
            ))}
          </optgroup>
          {routes.length > 0 && (
            <optgroup label="Your routes">
              {routes.map((r) => (
                <option key={r.id} value={`start:${r.id}`}>
                  {r.name} · {km(r.lengthM)}
                </option>
              ))}
            </optgroup>
          )}
          <option value="none">Nowhere: no journey</option>
        </Select>
      </label>
      {meta && <p className="text-xs text-ink-dim">{meta}</p>}
    </div>
  )
}
