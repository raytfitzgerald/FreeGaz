import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { createBackup, restoreBackup } from '../../db/backup'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'
import { Field, Section } from '../../ui/form'

export function DataSection() {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const backup = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const zip = await createBackup()
      const stamp = new Date().toISOString().slice(0, 10)
      const res = await bridge().invoke('files.saveAs', { defaultName: `FreeGaz backup ${stamp}.zip`, bytes: new Uint8Array(zip), filters: [{ name: 'FreeGaz backup', extensions: ['zip'] }] })
      setMsg(res.path ? `Saved ${(zip.byteLength / 1024 / 1024).toFixed(1)} MB to ${res.path}` : null)
    } catch (e) {
      setMsg(`Backup failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: File) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await restoreBackup(new Uint8Array(await file.arrayBuffer()))
      setMsg(`Restored ${r.rides} rides, ${r.workouts} workouts and ${r.ftpEntries} FTP entries.`)
    } catch (e) {
      setMsg(`Restore failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Your data" description="Rides live in this app's database and as FIT files in your export folder. Back up the database to move to another Mac or keep a safety copy.">
      <Field label="Backup" hint="Everything: rides with every second of data, workouts, FTP history and profile.">
        <Button size="sm" disabled={busy} onClick={() => void backup()}>
          <Download className="size-3.5" /> Save backup…
        </Button>
      </Field>
      <Field label="Restore" hint="Merges a backup into this app. Nothing is deleted.">
        <input ref={input} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
        <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" /> Restore from backup…
        </Button>
      </Field>
      {msg && <div className="py-3 text-sm text-ink-dim">{msg}</div>}
    </Section>
  )
}
