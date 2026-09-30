import { useState } from 'react'
import { Battery, Bluetooth, BluetoothOff, Cpu, Fan, Gauge, HeartPulse, Link2Off, RefreshCw, Thermometer, Trash2, Waves, Zap } from 'lucide-react'
import type { ManagedDevice } from '@core/devices/manager'
import { ROLE_LABEL, type DeviceRole } from '@core/devices/types'
import { getRuntime } from '../../runtime/composition'
import { devicesStore, useDevices } from '../../stores/devices'
import { useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { Card, CardBody, CardHeader } from '../../ui/Card'
import { PageHeader } from '../../ui/PageHeader'
import { STATE_LABEL } from '../../ui/connection-state'
import { StatusDot } from '../../ui/StatusDot'
import { CaptureConsole } from './CaptureConsole'

const PRIMARY: DeviceRole[] = ['trainer', 'hr']
const EXTRA: DeviceRole[] = ['power', 'cadence', 'coreTemp', 'smo2', 'fan']

const ROLE_ICON: Record<DeviceRole, typeof Zap> = {
  trainer: Zap,
  hr: HeartPulse,
  power: Gauge,
  cadence: RefreshCw,
  coreTemp: Thermometer,
  smo2: Waves,
  fan: Fan,
}

const ROLE_HINT: Record<DeviceRole, string> = {
  trainer: 'Wahoo KICKR or any FTMS smart trainer. Controls ERG, level and slope.',
  hr: 'Chest strap, arm band, or a Garmin watch with “Broadcast Heart Rate” on.',
  power: 'Power pedals or crank meter (Cycling Power Service). Becomes the power source.',
  cadence: 'Speed/cadence sensor.',
  coreTemp: 'CORE body temperature sensor.',
  smo2: 'Moxy muscle-oxygen monitor.',
  fan: 'Wahoo KICKR Headwind.',
}

/** The web app on a browser without Web Bluetooth (every iPhone browser, Firefox, desktop Safari). */
function NoBluetoothNotice() {
  return (
    <div className="mb-4 flex gap-3 rounded-2xl border border-accent/40 bg-accent/5 px-5 py-4 text-sm" role="note" data-testid="no-bluetooth">
      <BluetoothOff className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">This browser can't talk to Bluetooth trainers or heart-rate straps.</p>
        <p className="text-ink-dim">
          iPhone and iPad browsers don't offer Web Bluetooth. To ride with your trainer, use Chrome on Android, Chrome or Edge on a computer, or the Mac app. Workouts, history
          and the rest still work here, or <a href="?sim=1" className="text-accent underline underline-offset-2">look around with simulated devices</a>.
        </p>
      </div>
    </div>
  )
}

export function DevicesPage() {
  const devices = useDevices((s) => s.devices)
  const [showExtra, setShowExtra] = useState(devices.some((d) => EXTRA.includes(d.role)))
  const notices = useDevices((s) => s.notices)
  const rt = getRuntime()

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 pb-10">
      <PageHeader
        title="Devices"
        subtitle={rt.sim ? 'Simulator mode: every device here is virtual.' : 'Paired devices reconnect automatically when FreeGaz starts.'}
        actions={
          <Button onClick={() => void rt.autoConnect()}>
            <Bluetooth className="size-4" /> Connect remembered
          </Button>
        }
      />

      {__FREEGAZ_WEB__ && !rt.sim && !('bluetooth' in navigator) && <NoBluetoothNotice />}

      <div className="grid gap-4 md:grid-cols-2">
        {PRIMARY.map((role) => (
          <DeviceCard key={role} role={role} device={devices.find((d) => d.role === role)} />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">More sensors</h2>
        <Button variant="ghost" size="sm" onClick={() => setShowExtra((v) => !v)}>
          {showExtra ? 'Hide' : 'Show'}
        </Button>
      </div>
      {showExtra && (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {EXTRA.map((role) => (
            <DeviceCard key={role} role={role} device={devices.find((d) => d.role === role)} compact />
          ))}
        </div>
      )}

      {notices.length > 0 && (
        <Card className="mt-8">
          <CardHeader
            title="Recent device events"
            actions={
              <Button variant="ghost" size="sm" onClick={() => devicesStore.setState({ notices: [] })}>
                Clear
              </Button>
            }
          />
          <CardBody>
            <ul className="space-y-1 text-sm">
              {notices
                .slice()
                .reverse()
                .map((n) => (
                  <li key={n.id} className="flex gap-3">
                    <span className="tabular w-20 shrink-0 text-ink-faint">{new Date(n.at).toLocaleTimeString()}</span>
                    <span className="w-28 shrink-0 text-ink-dim">{ROLE_LABEL[n.role]}</span>
                    <span>{n.message}</span>
                  </li>
                ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <CaptureConsole />
    </div>
  )
}

function DeviceCard({ role, device, compact }: { role: DeviceRole; device?: ManagedDevice; compact?: boolean }) {
  const rt = getRuntime()
  const connecting = useDevices((s) => s.connecting.includes(role))
  const remembered = useSettings((s) => s.rememberedDevices.find((d) => d.role === role))
  const Icon = ROLE_ICON[role]
  const state = device?.state ?? (connecting ? 'connecting' : 'none')
  const [error, setError] = useState<string | null>(null)

  const connect = async () => {
    setError(null)
    try {
      await rt.connect(role)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/cancel/i.test(msg)) setError(msg)
    }
  }

  return (
    <Card data-testid={`device-${role}`}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon className="size-4 text-accent" /> {ROLE_LABEL[role]}
          </span>
        }
        subtitle={compact ? undefined : ROLE_HINT[role]}
        actions={
          <span className="flex items-center gap-2 text-xs text-ink-dim">
            <StatusDot state={state} /> {STATE_LABEL[state]}
          </span>
        }
      />
      <CardBody className="space-y-3">
        {device ? (
          <div className="rounded-xl bg-panel-2 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium" data-testid={`device-${role}-name`}>
                {device.name}
              </span>
              {device.battery !== undefined && (
                <span className="flex items-center gap-1 text-xs text-ink-dim">
                  <Battery className="size-3.5" /> {device.battery}%
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
              {device.info.manufacturer && <span>{device.info.manufacturer}</span>}
              {device.info.model && <span>Model {device.info.model}</span>}
              {device.info.firmware && <span>FW {device.info.firmware}</span>}
              {device.drivers.length > 0 && (
                <span className="flex items-center gap-1">
                  <Cpu className="size-3" /> {device.drivers.join(' + ').toUpperCase()}
                </span>
              )}
              {device.reconnects > 0 && <span>{device.reconnects} reconnects</span>}
            </div>
            {device.lastError && <div className="mt-2 text-xs text-bad">{device.lastError}</div>}
          </div>
        ) : remembered ? (
          <div className="text-xs text-ink-dim">
            Remembered: <span className="text-ink">{remembered.name}</span>
          </div>
        ) : null}
        {error && <div className="text-xs text-bad">{error}</div>}
        <div className="flex flex-wrap gap-2">
          {device ? (
            <Button size="sm" variant="secondary" onClick={() => rt.disconnect(role)}>
              <Link2Off className="size-3.5" /> Disconnect
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={connecting} onClick={() => void connect()} data-testid={`connect-${role}`}>
              <Bluetooth className="size-3.5" /> {remembered ? 'Reconnect' : 'Pair'}
            </Button>
          )}
          {remembered && (
            <Button size="sm" variant="ghost" onClick={() => void rt.forget(role)}>
              <Trash2 className="size-3.5" /> Forget
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
