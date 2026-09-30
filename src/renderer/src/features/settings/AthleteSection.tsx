import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ImagePlus, Trash2 } from 'lucide-react'
import { displayWeightKg, formatWeight, storedWeightKg, weightUnit } from '@core/units'
import { currentProfile, deleteFtp, recordFtp, updateProfile } from '../../db/athlete-repo'
import { db } from '../../db/db'
import { MAX_NAME, photoFromFile, riderInitials, saveRider, useRider } from '../../db/rider'
import { patchSettings, useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { Field, Input, NumberInput, Section } from '../../ui/form'
import { Segmented } from '../../ui/Segmented'

const SOURCE_LABEL: Record<string, string> = {
  'test-20min': '20-min test',
  'test-ramp': 'Ramp test',
  'test-8min': '8-min test',
  'test-kolie': 'Baseline test',
  manual: 'Manual',
  estimate: 'Estimate',
}

const WEIGHTS = [
  { value: 'kg' as const, label: 'kg' },
  { value: 'lb' as const, label: 'lb' },
]

export function AthleteSection() {
  const history = useLiveQuery(() => db().ftpHistory.orderBy('date').reverse().toArray(), [])
  const profile = useLiveQuery(() => currentProfile(), [])
  const currentFtp = history?.[0]?.ftpW ?? null
  const [ftpDraft, setFtpDraft] = useState<number | null>(null)
  const units = useSettings((s) => s.weightUnit)
  const kg = profile?.weightKg ?? 75
  const weightShown = Math.round(displayWeightKg(kg, units) * 10) / 10

  const saveFtp = async () => {
    if (!ftpDraft || ftpDraft < 50 || ftpDraft > 700) return
    await recordFtp({ date: Date.now(), ftpW: Math.round(ftpDraft), source: 'manual', weightKg: profile?.weightKg })
    setFtpDraft(null)
  }

  return (
    <>
      <ProfileSection />
      <Section title="FTP" description="Workouts are written as % of FTP, so this one number scales every target.">
        <Field label="Current FTP" hint="Set it by hand, or let a test set it for you.">
          <div className="flex flex-wrap items-center gap-3">
            <NumberInput value={ftpDraft ?? currentFtp} onChange={setFtpDraft} unit="W" min={50} max={700} data-testid="ftp-input" />
            <Button variant="primary" size="sm" disabled={ftpDraft === null || ftpDraft === currentFtp} onClick={() => void saveFtp()}>
              Save
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/workouts" search={{ filter: 'tests' }}>Take the FTP test →</Link>
            </Button>
          </div>
          {currentFtp && profile?.weightKg && (
            <div className="mt-2 text-xs text-ink-dim">
              {(currentFtp / profile.weightKg).toFixed(2)} W/kg at {formatWeight(profile.weightKg, units)} {weightUnit(units)}
            </div>
          )}
        </Field>
        <Field label="History" hint="Every test and manual change, newest first.">
          {history && history.length > 0 ? (
            <table className="w-full max-w-lg text-sm">
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-line/50 last:border-0">
                    <td className="py-1.5 text-ink-dim">{new Date(h.date).toLocaleDateString()}</td>
                    <td className="tabular py-1.5 font-semibold">{h.ftpW} W</td>
                    <td className="py-1.5 text-ink-dim">{SOURCE_LABEL[h.source] ?? h.source}</td>
                    <td className="py-1.5 text-right">
                      <Button size="iconSm" variant="ghost" aria-label="Delete entry" onClick={() => h.id && void deleteFtp(h.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="pt-2 text-sm text-ink-faint">No FTP yet. The default of 200 W is used until you set one.</div>
          )}
        </Field>
      </Section>

      <Section title="Body & heart" description="Used for W/kg, heart-rate zones and the physics that turns watts into virtual speed.">
        <Field label="Weight">
          <div className="flex flex-wrap items-center gap-3">
            <DraftNumber
              value={weightShown}
              onCommit={(v) => v !== null && void updateProfile({ weightKg: Math.round(storedWeightKg(v, units) * 100) / 100 })}
              unit={weightUnit(units)}
              min={units === 'lb' ? 66 : 30}
              max={units === 'lb' ? 440 : 200}
              step={0.1}
              aria-label="Weight"
            />
            <Segmented ariaLabel="Weight units" value={units} onChange={(v) => void patchSettings({ weightUnit: v })} options={WEIGHTS} />
          </div>
        </Field>
        <Field label="Threshold HR (LTHR)" hint="Your average HR over a hard 20-min test × 0.95 is a good estimate.">
          <DraftNumber value={profile?.lthr ?? null} onCommit={(v) => void updateProfile({ lthr: v ?? undefined })} unit="bpm" min={100} max={220} aria-label="Threshold HR" />
        </Field>
        <Field label="Max HR">
          <DraftNumber value={profile?.maxHr ?? null} onCommit={(v) => void updateProfile({ maxHr: v ?? undefined })} unit="bpm" min={120} max={230} aria-label="Max HR" />
        </Field>
        <Field label="Resting HR">
          <DraftNumber value={profile?.restHr ?? null} onCommit={(v) => void updateProfile({ restHr: v ?? undefined })} unit="bpm" min={30} max={100} aria-label="Resting HR" />
        </Field>
      </Section>
    </>
  )
}

/** Your name and photo: your head on the ride-along bike and the home velodrome. Kept on this Mac. */
function ProfileSection() {
  const rider = useRider()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const name = draft ?? rider.name ?? ''
  const commit = () => {
    if (draft !== null) void saveRider({ name: draft })
    setDraft(null)
  }
  const choose = async (f: File | undefined) => {
    setError(null)
    if (!f) return
    try {
      await saveRider({ photo: await photoFromFile(f) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Section title="You" description="Optional. Your name and a photo put your own face on your rider: on the ride-along bike and lapping the velodrome on Home. They stay on this Mac.">
      <Field label="Name">
        <Input
          value={name}
          maxLength={MAX_NAME}
          placeholder="What the app calls you"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="max-w-xs"
          data-testid="rider-name"
        />
      </Field>
      <Field label="Photo" hint="Any picture: the middle square is used, shrunk to a small thumbnail.">
        <div className="flex items-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-accent bg-panel-2 font-display font-bold" data-testid="rider-photo">
            {rider.photo ? <img src={rider.photo} alt="Your photo" className="size-full object-cover" /> : riderInitials(rider.name)}
          </div>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void choose(e.target.files?.[0]).finally(() => (e.target.value = ''))} data-testid="rider-photo-input" />
          <Button size="sm" onClick={() => file.current?.click()}>
            <ImagePlus className="size-3.5" /> {rider.photo ? 'Change photo' : 'Add a photo'}
          </Button>
          {rider.photo && (
            <Button size="sm" variant="ghost" onClick={() => void saveRider({ photo: null })}>
              Remove
            </Button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </Field>
    </Section>
  )
}

/**
 * A number field that saves when you press Enter or leave it, not on every
 * keystroke: a half-typed "1" would otherwise be saved as your threshold HR.
 * Out-of-range values are not saved and the field goes back to the stored one;
 * clearing it clears the value.
 */
function DraftNumber({
  value,
  onCommit,
  min,
  max,
  ...rest
}: { value: number | null; onCommit: (v: number | null) => void; min: number; max: number; unit?: string; step?: number; 'aria-label': string }) {
  const [draft, setDraft] = useState<number | null | undefined>(undefined)
  const commit = () => {
    if (draft === undefined) return
    if (draft === null || (draft >= min && draft <= max)) {
      if (draft !== value) onCommit(draft)
    }
    setDraft(undefined)
  }
  return (
    <NumberInput
      {...rest}
      value={draft === undefined ? value : draft}
      min={min}
      max={max}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}
