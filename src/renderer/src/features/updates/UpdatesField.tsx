import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { patchSettings, settingsStore, useSettings } from '../../stores/settings'
import { useRide } from '../../stores/ride'
import { checkForUpdates, downloadUpdate, installUpdate, useUpdateStatus } from '../../stores/updates'
import { Button } from '../../ui/Button'
import { Field, Switch } from '../../ui/form'
import { updateStatusText } from './update-copy'

const setPrefs = (p: Partial<ReturnType<typeof settingsStore.getState>['updates']>) => void patchSettings({ updates: { ...settingsStore.getState().updates, ...p } })

export function UpdatesField() {
  const status = useUpdateStatus((s) => s)
  const prefs = useSettings((s) => s.updates)
  const riding = useRide((s) => s.active)
  const [busy, setBusy] = useState(false)
  const run = (fn: () => Promise<unknown>) => {
    setBusy(true)
    void fn().finally(() => setBusy(false))
  }
  const supported = status.state !== 'unsupported'
  return (
    <>
      <Field label="Updates" hint={status.state === 'ready' && riding ? 'Finish your ride first. The update also installs when you quit.' : undefined}>
        <div className="flex flex-col items-start gap-2 pt-2">
          <p className="text-sm text-ink-dim" data-testid="update-status" aria-live="polite">
            {updateStatusText(status)}
          </p>
          {supported && (
            <div className="flex flex-wrap gap-2">
              {status.state === 'ready' ? (
                <Button size="sm" variant="primary" disabled={riding} onClick={() => run(installUpdate)} data-testid="update-install">
                  Restart to update
                </Button>
              ) : status.state === 'available' ? (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => run(downloadUpdate)}>
                  Download update
                </Button>
              ) : (
                <Button size="sm" disabled={busy || status.state === 'checking' || status.state === 'downloading'} onClick={() => run(checkForUpdates)} data-testid="update-check">
                  Check for updates
                </Button>
              )}
            </div>
          )}
        </div>
      </Field>
      {supported && (
        <>
          <Field label="Update automatically" hint="Checks at launch and every six hours, and downloads in the background. Nothing installs until you restart or quit.">
            <Switch checked={prefs.auto} onChange={(v) => setPrefs({ auto: v })} label={prefs.auto ? 'On' : 'Off'} />
          </Field>
          <Field label="Include pre-releases" hint="Every 0.x release is a pre-release, so turning this off stops updates until 1.0.">
            <Switch checked={prefs.prereleases} onChange={(v) => setPrefs({ prereleases: v })} label={prefs.prereleases ? 'On' : 'Off'} />
          </Field>
        </>
      )}
    </>
  )
}

/** The sidebar notice once an update is downloaded. Hidden during a ride. */
export function UpdateReadyLink() {
  const status = useUpdateStatus((s) => s)
  const riding = useRide((s) => s.active)
  if (status.state !== 'ready' || riding) return null
  return (
    <button
      type="button"
      onClick={() => void installUpdate()}
      className="no-drag mx-2 mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-accent hover:bg-panel-2"
      data-testid="update-ready"
    >
      <RefreshCw className="size-3.5 shrink-0" aria-hidden />
      <span>
        FreeGaz {status.version} is ready.
        <br />
        Restart to update
      </span>
    </button>
  )
}
