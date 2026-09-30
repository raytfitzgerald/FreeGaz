import { useState } from 'react'
import { useStore } from 'zustand'
import { Bug, ExternalLink } from 'lucide-react'
import { bugReportBody, MAX_TITLE } from '@core/support/bug-report'
import { bridge } from '../../platform/bridge'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Input } from '../../ui/form'
import { bugReportStore as store, openBugReport } from './open'

// Report a bug: a short form that opens a pre-filled GitHub issue in the
// browser. GitHub emails the maintainer; the reporter reviews everything on
// GitHub before it's posted. Opened from the sidebar or Settings → About.

const area =
  'no-drag w-full resize-y rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none'

export function ReportBugDialog() {
  const open = useStore(store, (s) => s.open)
  const diagnostics = useStore(store, (s) => s.diagnostics)
  const [title, setTitle] = useState('')
  const [what, setWhat] = useState('')
  const [steps, setSteps] = useState('')
  const [expected, setExpected] = useState('')
  const [include, setInclude] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const close = () => {
    store.setState({ open: false })
    setStatus(null)
  }
  const reset = () => {
    setTitle('')
    setWhat('')
    setSteps('')
    setExpected('')
  }

  const ready = title.trim().length > 0 && what.trim().length > 0
  const send = async () => {
    setBusy(true)
    try {
      const body = bugReportBody({ title, what, steps, expected, diagnostics: include ? diagnostics : null })
      const r = await bridge().invoke('support.reportBug', { title: title.trim().slice(0, MAX_TITLE), body: body.slice(0, 30_000) })
      reset()
      setStatus(r.trimmed ? 'Opened on GitHub. It was long, so the end was trimmed: paste the rest there if it matters.' : 'Opened on GitHub: check it over and press Submit new issue there.')
    } catch (e) {
      setStatus(`Couldn't open GitHub: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? store.setState({ open: true }) : close())}
      title="Report a bug"
      description="This opens a new issue on GitHub with your report filled in. You'll see all of it there, and can edit it, before you submit. You need a free GitHub account."
      className="w-[min(640px,calc(100vw-32px))]"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {status ? 'Done' : 'Cancel'}
          </Button>
          <Button variant="primary" disabled={!ready || busy} onClick={() => void send()} data-testid="bug-send">
            <ExternalLink className="size-4" /> Open on GitHub
          </Button>
        </>
      }
    >
      <div className="space-y-3" data-testid="bug-report">
        {status && (
          <p className="rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-sm" role="status">
            {status}
          </p>
        )}
        <label className="block text-sm font-medium">
          Short summary
          <Input className="mt-1 w-full" value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} placeholder="Light mode turns dark when I change units" data-testid="bug-title" />
        </label>
        <label className="block text-sm font-medium">
          What happened
          <textarea className={`${area} mt-1 h-24`} value={what} onChange={(e) => setWhat(e.target.value)} data-testid="bug-what" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Steps to make it happen <span className="font-normal text-ink-faint">(optional)</span>
            <textarea className={`${area} mt-1 h-20`} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={'1. Settings → Appearance\n2. …'} />
          </label>
          <label className="block text-sm font-medium">
            What you expected <span className="font-normal text-ink-faint">(optional)</span>
            <textarea className={`${area} mt-1 h-20`} value={expected} onChange={(e) => setExpected(e.target.value)} />
          </label>
        </div>
        <details className="rounded-xl border border-line bg-panel-2 px-3 py-2 text-sm">
          <summary className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} onClick={(e) => e.stopPropagation()} aria-label="Include diagnostics" data-testid="bug-include" />
            Include diagnostics <span className="text-ink-faint">(versions, device types, a few settings; no names or ride data)</span>
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-ink-dim" data-testid="bug-diagnostics">
            {diagnostics ?? 'Gathering…'}
          </pre>
        </details>
      </div>
    </Dialog>
  )
}

/** The sidebar's quiet entry point. */
export function ReportBugLink() {
  return (
    <button type="button" onClick={openBugReport} className="no-drag mx-2 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-faint hover:bg-panel-2 hover:text-ink" data-testid="report-bug">
      <Bug className="size-3.5" aria-hidden /> Report a bug
    </button>
  )
}
