import { Bluetooth, Loader2 } from 'lucide-react'
import { ROLE_LABEL, type DeviceRole } from '@core/devices/types'
import { bridge } from '../../platform/bridge'
import { useDevices } from '../../stores/devices'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'

/**
 * Our replacement for Chromium's device picker (Electron has none). Main
 * pushes the scan list; the user's choice goes back via `ble.choose`.
 */
export function ChooserDialog() {
  const chooser = useDevices((s) => s.chooser)
  if (!chooser) return null
  const role = chooser.role as DeviceRole
  const label = ROLE_LABEL[role] ?? 'device'

  const choose = (deviceId: string | null) => void bridge().invoke('ble.choose', { requestId: chooser.requestId, deviceId })

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && choose(null)}
      title={`Pair ${label.toLowerCase()}`}
      description="Wake the device up (spin the pedals, wet the HR strap) and pick it from the list."
      footer={
        <Button variant="ghost" onClick={() => choose(null)}>
          Cancel
        </Button>
      }
    >
      <div className="flex min-h-40 flex-col gap-2" data-testid="chooser-list">
        {chooser.devices.length === 0 && (
          <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-ink-dim">
            <Loader2 className="size-4 animate-spin" /> Scanning for devices…
          </div>
        )}
        {chooser.devices.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => choose(d.id)}
            className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 px-4 py-3 text-left transition-colors hover:border-accent hover:bg-panel-3"
          >
            <Bluetooth className="size-4 text-accent" />
            <span className="flex-1 font-medium">{d.name}</span>
            <span className="text-xs text-ink-faint">Pair</span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}
