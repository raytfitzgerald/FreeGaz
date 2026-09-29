import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, FolderOpen } from 'lucide-react'
import type { InvokeRes } from '@shared/ipc/contract'
import { bridge } from '../../platform/bridge'
import { patchSettings, useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { Field, Input, Section, Switch } from '../../ui/form'

const open = (url: string) => void bridge().invoke('files.openUrl', { url })

const loadStatus = () => Promise.all([bridge().invoke('strava.status', {}), bridge().invoke('intervals.status', {}), bridge().invoke('files.exportDir', {})])

export function IntegrationsSection() {
  const autoUpload = useSettings((s) => s.autoUpload)
  const [strava, setStrava] = useState<InvokeRes<'strava.status'> | null>(null)
  const [icu, setIcu] = useState<InvokeRes<'intervals.status'> | null>(null)
  const [exportDir, setExportDir] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [icuKey, setIcuKey] = useState('')
  const [icuAthlete, setIcuAthlete] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const apply = ([s, i, d]: Awaited<ReturnType<typeof loadStatus>>) => {
    setStrava(s)
    setIcu(i)
    setExportDir(d.dir)
  }
  const refresh = async () => apply(await loadStatus())
  useEffect(() => {
    let live = true
    void loadStatus().then((r) => live && apply(r))
    return () => {
      live = false
    }
  }, [])

  const saveStravaApp = async () => {
    setMsg(null)
    try {
      await bridge().invoke('strava.setApp', { clientId: clientId.trim(), clientSecret: clientSecret.trim() })
      setClientSecret('')
      await refresh()
      setMsg('Strava app saved. Now press Connect.')
    } catch {
      setMsg('That Client ID / Secret doesn’t look right. The ID is a number; the secret is a 40-character code.')
    }
  }

  const connect = async () => {
    setBusy(true)
    setMsg('Finish authorizing in your browser…')
    const r = await bridge().invoke('strava.connect', {})
    setBusy(false)
    setMsg(r.ok ? `Connected as ${r.athleteName ?? 'you'}.` : (r.error ?? 'Connection failed'))
    await refresh()
  }

  return (
    <>
      <Section title="Ride files" description="Every finished ride is saved as a .fit file. Point this at iCloud Drive or Dropbox for free syncing.">
        <Field label="Save FIT files to">
          <div className="flex items-center gap-2">
            <code className="truncate rounded-lg bg-panel-2 px-3 py-2 text-xs">{exportDir}</code>
            <Button size="sm" onClick={() => void bridge().invoke('files.chooseExportDir', {}).then(refresh)}>
              <FolderOpen className="size-3.5" /> Change
            </Button>
          </div>
        </Field>
      </Section>

      <Section title="Strava" description="FreeGaz uploads your rides as Virtual Rides. It never reads anything from Strava.">
        {strava?.connected ? (
          <Field label="Status">
            <div className="flex items-center gap-3 pt-2 text-sm">
              <CheckCircle2 className="size-4 text-good" /> Connected{strava.athleteName ? ` as ${strava.athleteName}` : ''}
              <Button size="sm" variant="ghost" onClick={() => void bridge().invoke('strava.disconnect', {}).then(refresh)}>
                Disconnect
              </Button>
            </div>
          </Field>
        ) : (
          <>
            <Field
              label="One-time setup"
              hint="Strava requires each user to create their own API app, and since June 2026 that needs a Strava subscription. No subscription? Use “Upload manually” after a ride."
            >
              <ol className="list-decimal space-y-1.5 pl-5 pt-2 text-sm text-ink-dim">
                <li>
                  Open{' '}
                  <button type="button" className="text-accent underline" onClick={() => open('https://www.strava.com/settings/api')}>
                    strava.com/settings/api
                  </button>{' '}
                  and create an app (any name, e.g. “FreeGaz personal”).
                </li>
                <li>
                  Set <b className="text-ink">Authorization Callback Domain</b> to <code className="rounded bg-panel-3 px-1">127.0.0.1</code>
                </li>
                <li>Paste the Client ID and Client Secret below, save, then Connect.</li>
              </ol>
            </Field>
            <Field label="Client ID">
              <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={strava?.clientId ?? '123456'} inputMode="numeric" className="max-w-xs" />
            </Field>
            <Field label="Client Secret" hint="Stored encrypted in your Keychain; never shown again.">
              <Input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" placeholder={strava?.configured ? '•••••• (saved)' : ''} className="max-w-md" />
            </Field>
            <Field label="">
              <div className="flex gap-2">
                <Button size="sm" disabled={!clientId || !clientSecret} onClick={() => void saveStravaApp()}>
                  Save app
                </Button>
                <Button size="sm" variant="primary" disabled={!strava?.configured || busy} onClick={() => void connect()}>
                  Connect Strava
                </Button>
              </div>
            </Field>
          </>
        )}
        <Field label="Auto-upload" hint="Upload every real (non-simulated) ride when you finish.">
          <Switch checked={autoUpload.strava} disabled={!strava?.connected} onChange={(v) => void patchSettings({ autoUpload: { ...autoUpload, strava: v } })} label={autoUpload.strava ? 'On' : 'Off'} />
        </Field>
        {msg && <div className="py-2 text-sm text-ink-dim">{msg}</div>}
      </Section>

      <Section title="Garmin Connect" description="Garmin has no public upload API for individuals, and the unofficial login libraries broke in 2026. Import the FIT file by hand: it takes 10 seconds.">
        <Field label="Import">
          <Button size="sm" onClick={() => open('https://connect.garmin.com/modern/import-data')}>
            <ExternalLink className="size-3.5" /> Open Garmin Connect import
          </Button>
        </Field>
      </Section>

      <Section title="intervals.icu" description="Optional. Uses your personal API key (Settings → Developer Settings on intervals.icu).">
        {icu?.configured ? (
          <Field label="Status">
            <div className="flex items-center gap-3 pt-2 text-sm">
              <CheckCircle2 className="size-4 text-good" /> Configured
              <Button size="sm" variant="ghost" onClick={() => void bridge().invoke('intervals.clear', {}).then(refresh)}>
                Remove
              </Button>
            </div>
          </Field>
        ) : (
          <>
            <Field label="API key">
              <Input value={icuKey} onChange={(e) => setIcuKey(e.target.value)} type="password" className="max-w-md" />
            </Field>
            <Field label="Athlete ID" hint="Leave blank to use the key's owner.">
              <Input value={icuAthlete} onChange={(e) => setIcuAthlete(e.target.value)} placeholder="0" className="max-w-xs" />
            </Field>
            <Field label="">
              <Button size="sm" disabled={icuKey.length < 8} onClick={() => void bridge().invoke('intervals.configure', { apiKey: icuKey.trim(), athleteId: icuAthlete.trim() || '0' }).then(() => { setIcuKey(''); return refresh() })}>
                Save
              </Button>
            </Field>
          </>
        )}
        <Field label="Auto-upload">
          <Switch checked={autoUpload.intervals} disabled={!icu?.configured} onChange={(v) => void patchSettings({ autoUpload: { ...autoUpload, intervals: v } })} label={autoUpload.intervals ? 'On' : 'Off'} />
        </Field>
      </Section>
    </>
  )
}
