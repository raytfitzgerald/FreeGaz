import { Download, Pause, Play, Trash2 } from 'lucide-react'
import { devicesStore, useDevices } from '../../stores/devices'
import { Button } from '../../ui/Button'
import { Card, CardBody, CardHeader } from '../../ui/Card'

const shortUuid = (u: string) => (u.startsWith('0000') && u.endsWith('-0000-1000-8000-00805f9b34fb') ? `0x${u.slice(4, 8)}` : u.slice(0, 8))

/**
 * Raw GATT traffic for debugging trainer quirks. Captures export as NDJSON
 * that tests can replay (tests/fixtures/ble-captures).
 */
export function CaptureConsole() {
  const capturing = useDevices((s) => s.capturing)
  const captures = useDevices((s) => s.captures)

  const download = () => {
    const ndjson = captures.map((c) => JSON.stringify(c)).join('\n') + '\n'
    const url = URL.createObjectURL(new Blob([ndjson], { type: 'application/x-ndjson' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `freegaz-ble-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="mt-8">
      <CardHeader
        title="Bluetooth packet capture"
        subtitle="Records raw notifications and writes. Handy for diagnosing a misbehaving trainer."
        actions={
          <>
            <Button size="sm" variant={capturing ? 'danger' : 'secondary'} onClick={() => devicesStore.setState({ capturing: !capturing })}>
              {capturing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              {capturing ? 'Stop' : 'Record'}
            </Button>
            <Button size="sm" variant="ghost" disabled={captures.length === 0} onClick={download}>
              <Download className="size-3.5" /> NDJSON
            </Button>
            <Button size="sm" variant="ghost" disabled={captures.length === 0} onClick={() => devicesStore.setState({ captures: [] })}>
              <Trash2 className="size-3.5" />
            </Button>
          </>
        }
      />
      {captures.length > 0 && (
        <CardBody>
          <div className="max-h-72 overflow-auto rounded-xl bg-bg p-3 font-mono text-[11px] leading-5">
            {captures.slice(-300).map((c, i) => (
              <div key={i} className="flex gap-3 whitespace-nowrap">
                <span className="tabular w-16 text-ink-faint">{(c.tMono / 1000).toFixed(2)}</span>
                <span className={c.dir === 'rx' ? 'w-6 text-good' : 'w-6 text-accent'}>{c.dir}</span>
                <span className="w-28 text-ink-dim">{c.sourceId}</span>
                <span className="w-24 text-ink-dim">{shortUuid(c.characteristic)}</span>
                <span>{c.hex}</span>
              </div>
            ))}
          </div>
        </CardBody>
      )}
    </Card>
  )
}
