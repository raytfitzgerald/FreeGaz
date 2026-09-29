import { useEffect, useState } from 'react'
import { MonitorUp, Smartphone } from 'lucide-react'
import type { InvokeRes } from '@shared/ipc/contract'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'
import { Field, Section, Switch } from '../../ui/form'

export function RemoteSection() {
  const [remote, setRemote] = useState<InvokeRes<'remote.status'> | null>(null)
  const [allowControl, setAllowControl] = useState(true)
  const [hud, setHud] = useState(false)
  const [clickThrough, setClickThrough] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void bridge().invoke('remote.status', {}).then(setRemote)
    const t = setInterval(() => void bridge().invoke('remote.status', {}).then(setRemote), 3000)
    return () => clearInterval(t)
  }, [])

  const start = async () => {
    setError(null)
    try {
      setRemote(await bridge().invoke('remote.start', { allowControl }))
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': /, '') : String(e))
    }
  }

  return (
    <>
      <Section title="Mini-HUD" description="A small always-on-top window with your key numbers. It floats over fullscreen Netflix, YouTube and every Space.">
        <Field label="Show mini-HUD">
          <Switch checked={hud} onChange={(v) => void bridge().invoke('minihud.toggle', { open: v }).then((r) => setHud(r.open))} label={hud ? 'Showing' : 'Hidden'} />
        </Field>
        <Field label="Click-through" hint="Clicks pass through to whatever is behind it (e.g. the video player).">
          <Switch
            checked={clickThrough}
            disabled={!hud}
            onChange={(v) => void bridge().invoke('minihud.setClickThrough', { on: v }).then(() => setClickThrough(v))}
            label={clickThrough ? 'On' : 'Off'}
          />
        </Field>
      </Section>

      <Section title="Phone remote" description="Put your phone on the bars: live numbers plus pause, skip and ±1 % buttons. Works on your local Wi-Fi only, protected by a one-time secret in the QR code.">
        <Field label="Allow control" hint="Off = view-only screen.">
          <Switch checked={allowControl} disabled={remote?.running} onChange={setAllowControl} label={allowControl ? 'Buttons enabled' : 'View-only'} />
        </Field>
        <Field label="Remote">
          {remote?.running ? (
            <div className="flex flex-wrap items-start gap-6 pt-1">
              {remote.qrDataUrl && <img src={remote.qrDataUrl} alt="QR code for the phone remote" className="size-44 rounded-xl bg-white p-2" />}
              <div className="space-y-2 text-sm">
                <div className="text-ink-dim">Scan with your phone camera, or open:</div>
                <code className="block rounded-lg bg-panel-2 px-3 py-2 text-xs">{remote.url}</code>
                <div className="text-ink-dim">{remote.clients.length} connected</div>
                <Button size="sm" variant="danger" onClick={() => void bridge().invoke('remote.stop', {}).then(setRemote)}>
                  Stop remote
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="primary" onClick={() => void start()}>
              <Smartphone className="size-3.5" /> Start phone remote
            </Button>
          )}
          {error && <div className="mt-2 text-xs text-bad">{error}</div>}
        </Field>
        <Field label="" hint="">
          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <MonitorUp className="size-3.5" /> macOS may ask to allow FreeGaz to find devices on your local network. Allow it.
          </div>
        </Field>
      </Section>
    </>
  )
}
