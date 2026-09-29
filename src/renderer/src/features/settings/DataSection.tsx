import { useRef, useState } from 'react'
import { Download, RefreshCw, Upload } from 'lucide-react'
import { createBackup, restoreBackup } from '../../db/backup'
import { importFitFiles } from '../../db/fit-import'
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
      setMsg(`Restored ${r.rides} rides, ${r.workouts} workouts, ${r.routes} routes and ${r.ftpEntries} FTP entries.`)
    } catch (e) {
      setMsg(`Restore failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const rebuild = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const { dir, files } = await bridge().invoke('files.listFits', {})
      if (files.length === 0) {
        setMsg(`No .fit files in ${dir}.`)
        return
      }
      const loaded: { name: string; bytes: Uint8Array }[] = []
      for (const f of files) loaded.push({ name: f.name, bytes: (await bridge().invoke('files.readFit', { name: f.name })).bytes })
      const r = await importFitFiles(loaded, (done, total) => setMsg(`Reading ${done} of ${total}…`))
      setMsg(`Added ${r.imported.length} ride${r.imported.length === 1 ? '' : 's'} from ${dir}; ${r.skipped.length} already there or not rides.`)
    } catch (e) {
      setMsg(`Rebuild failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Your data" description="Rides live in this app's database and as FIT files in your export folder. Back up the database to move to another Mac or keep a safety copy.">
      <Field label="Backup" hint="Everything: rides with every second of data, workouts, routes, FTP history and profile.">
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
      <Field label="Rebuild from FIT folder" hint="Adds every ride file in your export folder that isn't in the app yet (e.g. after moving to a new Mac).">
        <Button size="sm" disabled={busy} onClick={() => void rebuild()}>
          <RefreshCw className="size-3.5" /> Scan ride folder
        </Button>
      </Field>
      {msg && <div className="py-3 text-sm text-ink-dim">{msg}</div>}
    </Section>
  )
}
