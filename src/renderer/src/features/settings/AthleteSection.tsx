import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { currentProfile, deleteFtp, recordFtp, updateProfile } from '../../db/athlete-repo'
import { db } from '../../db/db'
import { Button } from '../../ui/Button'
import { Field, NumberInput, Section } from '../../ui/form'

const SOURCE_LABEL: Record<string, string> = {
  'test-20min': '20-min test',
  'test-ramp': 'Ramp test',
  'test-8min': '8-min test',
  'test-kolie': 'Baseline test',
  manual: 'Manual',
  estimate: 'Estimate',
}

export function AthleteSection() {
  const history = useLiveQuery(() => db().ftpHistory.orderBy('date').reverse().toArray(), [])
  const profile = useLiveQuery(() => currentProfile(), [])
  const currentFtp = history?.[0]?.ftpW ?? null
  const [ftpDraft, setFtpDraft] = useState<number | null>(null)

  const saveFtp = async () => {
    if (!ftpDraft || ftpDraft < 50 || ftpDraft > 700) return
    await recordFtp({ date: Date.now(), ftpW: Math.round(ftpDraft), source: 'manual', weightKg: profile?.weightKg })
    setFtpDraft(null)
  }

  return (
    <>
      <Section title="FTP" description="Workouts are written as % of FTP, so this one number scales every target.">
        <Field label="Current FTP" hint="Set it by hand, or let a test set it for you.">
          <div className="flex flex-wrap items-center gap-3">
            <NumberInput value={ftpDraft ?? currentFtp} onChange={setFtpDraft} unit="W" min={50} max={700} data-testid="ftp-input" />
            <Button variant="primary" size="sm" disabled={ftpDraft === null || ftpDraft === currentFtp} onClick={() => void saveFtp()}>
              Save
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/ride">Take the FTP test →</Link>
            </Button>
          </div>
          {currentFtp && profile?.weightKg && (
            <div className="mt-2 text-xs text-ink-dim">
              {(currentFtp / profile.weightKg).toFixed(2)} W/kg at {profile.weightKg} kg
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
          <NumberInput value={profile?.weightKg ?? 75} onChange={(v) => v && void updateProfile({ weightKg: v })} unit="kg" min={30} max={200} step={0.1} />
        </Field>
        <Field label="Threshold HR (LTHR)" hint="Your average HR over a hard 20-min test × 0.95 is a good estimate.">
          <NumberInput value={profile?.lthr ?? null} onChange={(v) => void updateProfile({ lthr: v ?? undefined })} unit="bpm" min={100} max={220} />
        </Field>
        <Field label="Max HR">
          <NumberInput value={profile?.maxHr ?? null} onChange={(v) => void updateProfile({ maxHr: v ?? undefined })} unit="bpm" min={120} max={230} />
        </Field>
        <Field label="Resting HR">
          <NumberInput value={profile?.restHr ?? null} onChange={(v) => void updateProfile({ restHr: v ?? undefined })} unit="bpm" min={30} max={100} />
        </Field>
      </Section>
    </>
  )
}
