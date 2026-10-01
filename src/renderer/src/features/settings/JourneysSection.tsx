import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Play, Trash2 } from 'lucide-react'
import { journeyTotals, type Journey } from '@core/journeys/progress'
import { distanceUnit, formatLongDistance } from '@core/units'
import { db } from '../../db/db'
import { GRAND, loadCourse, routeJourneys } from '../../journeys/catalogue'
import { deleteJourney, startJourney } from '../../journeys/repo'
import { patchSettings, settingsStore, useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Field, Section, Select, Switch } from '../../ui/form'
import { Segmented } from '../../ui/Segmented'

const setPrefs = (p: Partial<ReturnType<typeof settingsStore.getState>['journeys']>) => void patchSettings({ journeys: { ...settingsStore.getState().journeys, ...p } })

/** Settings → Journeys: send free rides and workouts somewhere real. */
export function JourneysSection() {
  const prefs = useSettings((s) => s.journeys)
  const units = useSettings((s) => s.units)
  const journeys = useLiveQuery(async () => (await db().journeys.toArray()).sort((a, b) => b.updatedAt - a.updatedAt), [], [])
  const routes = useLiveQuery(() => routeJourneys().catch(() => []), [], [])
  const [pick, setPick] = useState(GRAND[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [doomed, setDoomed] = useState<Journey | null>(null)
  const km = (m: number) => `${formatLongDistance(m, units, m < 100_000 ? 1 : 0)} ${distanceUnit(units)}`

  const begin = async () => {
    if (!pick) return
    setBusy(true)
    try {
      const j = await startJourney(await loadCourse(pick))
      setPrefs({ enabled: true, activeId: j.id, mode: 'continue' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Section
        title="Journeys"
        description="Free rides and workouts go somewhere real: a dot moves along a real road at the speed your watts would take you, and the ride lands on Strava with a map. The trainer is never changed by a journey."
      >
        <Field label="Journeys">
          <Switch checked={prefs.enabled} onChange={(v) => setPrefs({ enabled: v })} label={prefs.enabled ? 'On' : 'Off'} />
        </Field>
        <Field label="Unless I pick" hint="What a ride does when you don't choose under Where to? on the ride screen.">
          <Select value={prefs.mode} onChange={(e) => setPrefs({ mode: e.target.value as typeof prefs.mode })} disabled={!prefs.enabled}>
            <option value="drop">Drop me somewhere famous</option>
            <option value="continue">Carry on my journey</option>
            <option value="none">No journey</option>
          </Select>
        </Field>
        <Field label="Terrain" hint="Real terrain: the road's hills slow you down and speed you up. Flat: watts to distance only.">
          <Segmented
            ariaLabel="Terrain"
            value={prefs.terrain}
            onChange={(terrain) => setPrefs({ terrain })}
            options={[
              { value: 'real', label: 'Real terrain' },
              { value: 'flat', label: 'Flat' },
            ]}
          />
        </Field>
        <Field label="Map on Strava" hint="Writes the road you rode into the FIT file as GPS, so Strava draws the map. It stays a virtual ride. Off: the journey stays in FreeGaz.">
          <Switch checked={prefs.gps} onChange={(v) => setPrefs({ gps: v })} label={prefs.gps ? 'On' : 'Off'} />
        </Field>
      </Section>

      <Section title="Your journeys" description="Multi-day trips pick up where the last ride stopped. Simulated rides never move them.">
        <Field label="Start one">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} data-testid="journey-start-select">
              {GRAND.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {km(g.lengthM)}
                </option>
              ))}
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (your route) · {km(r.lengthM)}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={() => void begin()} disabled={busy || !pick} data-testid="journey-start">
              <Play className="size-3.5" /> Start
            </Button>
          </div>
        </Field>
        {journeys.length === 0 ? (
          <p className="py-3 text-sm text-ink-dim">No journeys yet. Start one above, or pick one under Where to? before a ride.</p>
        ) : (
          <ul className="py-1">
            {journeys.map((j) => {
              const t = journeyTotals(j)
              const pct = Math.min(100, (100 * j.progressM) / Math.max(1, j.lengthM))
              const active = prefs.activeId === j.id
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-testid="journey-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-semibold">{j.name}</span>
                      {active && j.finishedAt === null && <span className="eyebrow text-accent">Next ride</span>}
                      {j.finishedAt !== null && <span className="eyebrow text-good">Finished</span>}
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-3" aria-hidden>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="tabular mt-1 text-xs text-ink-dim">
                      {km(j.progressM)} of {km(j.lengthM)} · {t.rides} {t.rides === 1 ? 'ride' : 'rides'}
                    </div>
                  </div>
                  {j.finishedAt === null && !active && (
                    <Button size="sm" variant="ghost" onClick={() => setPrefs({ activeId: j.id, mode: 'continue', enabled: true })}>
                      Ride this next
                    </Button>
                  )}
                  <Button size="iconSm" variant="ghost" aria-label={`Delete ${j.name}`} onClick={() => setDoomed(j)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="Where the roads come from">
        <p className="py-3 text-sm text-ink-dim">
          Roads: © OpenStreetMap contributors, available under the Open Database License, routed for bikes with BRouter. Elevation: NASA SRTM. The roads ship with the app, so riding a journey sends nothing anywhere.
        </p>
      </Section>

      <Dialog
        open={doomed !== null}
        onOpenChange={(o) => !o && setDoomed(null)}
        title={`Delete ${doomed?.name ?? 'this journey'}?`}
        description="Its progress is gone for good. Your rides stay in History."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDoomed(null)}>
              Keep it
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const j = doomed
                setDoomed(null)
                if (!j) return
                void deleteJourney(j.id)
                if (settingsStore.getState().journeys.activeId === j.id) setPrefs({ activeId: null })
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <span />
      </Dialog>
    </>
  )
}
