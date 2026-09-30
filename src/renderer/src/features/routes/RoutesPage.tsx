import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type DragEvent } from 'react'
import { FileUp } from 'lucide-react'
import { Button } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { cn } from '../../ui/cn'
import { ROUTE_FILE_EXTENSIONS, importRouteFile, listRoutes } from '../../routes/routes-repo'
import { RouteCard } from './RouteCard'
import { RouteDetailDialog, type Notice } from './RouteDetailDialog'

/** /routes: the route library, GPX/TCX import (picker or drop), and the way into a route ride. */
export function RoutesPage() {
  const routes = useLiveQuery(() => listRoutes(), [])
  const [openId, setOpenId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const importFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    const added: string[] = []
    const known: string[] = []
    const failed: string[] = []
    let lastId: string | null = null
    for (const f of list) {
      try {
        const { route, duplicate } = await importRouteFile(f.name, new Uint8Array(await f.arrayBuffer()))
        ;(duplicate ? known : added).push(route.name)
        lastId = route.id
      } catch (e) {
        failed.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const parts = [
      added.length ? `Imported ${added.join(', ')}.` : '',
      known.length ? `Already in your library: ${known.join(', ')}.` : '',
      failed.length ? `Couldn't import ${failed.join('; ')}` : '',
    ].filter(Boolean)
    setNotice({ tone: failed.length ? 'bad' : 'good', text: parts.join(' ') })
    if (list.length === 1 && lastId) setOpenId(lastId)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) void importFiles(e.dataTransfer.files)
  }

  const mine = (routes ?? []).filter((r) => !r.builtin)
  const demos = (routes ?? []).filter((r) => r.builtin)
  const open = routes?.find((r) => r.id === openId) ?? null

  return (
    <div
      className={cn('mx-auto max-w-6xl px-4 md:px-8 pb-12', dragging && 'outline-2 outline-dashed outline-accent/60')}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-testid="routes-page"
    >
      <PageHeader
        title="Routes"
        subtitle="Ride real courses in SIM mode: the trainer follows the gradient. Reactive, Steady or against a ghost."
        actions={
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ROUTE_FILE_EXTENSIONS.join(',')}
              className="hidden"
              data-testid="route-file-input"
              onChange={(e) => {
                if (e.target.files) void importFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Button size="sm" onClick={() => fileInput.current?.click()} title="Or drop .gpx / .tcx files on this page">
              <FileUp className="size-3.5" /> Import GPX / TCX
            </Button>
          </>
        }
      />

      {notice && (
        <div className={cn('mb-4 rounded-xl border px-4 py-2 text-sm', notice.tone === 'good' ? 'border-good/40 bg-good/5' : 'border-bad/40 bg-bad/10')} role="status" data-testid="routes-notice">
          {notice.text}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-ink-dim">Your routes</h2>
        {routes && mine.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="w-full rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-faint hover:border-line-strong hover:text-ink-dim"
          >
            Drop a GPX or TCX file here (a course, or an activity you recorded outdoors), or click to choose one.
          </button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((r) => (
              <RouteCard key={r.id} entry={r} onOpen={() => setOpenId(r.id)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-dim">Demo routes</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="demo-routes">
          {demos.map((r) => (
            <RouteCard key={r.id} entry={r} onOpen={() => setOpenId(r.id)} />
          ))}
        </div>
      </section>

      {open && <RouteDetailDialog entry={open} onClose={() => setOpenId(null)} onNotice={setNotice} />}
    </div>
  )
}
