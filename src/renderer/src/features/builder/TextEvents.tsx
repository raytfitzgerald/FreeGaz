import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { segmentDurationS } from '@core/workout/edit'
import type { Segment, TextEvent } from '@core/workout/model'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/form'
import { CommitInput } from './CommitInput'
import { formatDurationInput, parseDurationInput, withOptional } from './fields'

/** On-screen cues for one block: a time from the block's start (mm:ss) and a message. */
export function TextEvents({ seg, onChange }: { seg: Segment; onChange: (next: Segment, group?: string) => void }) {
  const events = seg.text ?? []
  const [draft, setDraft] = useState({ at: '', message: '' })
  const set = (list: TextEvent[], group?: string) => onChange(withOptional(seg, 'text', list.length > 0 ? list : undefined), group)
  const last = events.at(-1)
  const suggested = last ? Math.min(last.offsetS + 30, Math.max(0, segmentDurationS(seg) - 1)) : 0
  const at = draft.at.trim() === '' ? suggested : parseDurationInput(draft.at, 0)
  const canAdd = at !== null && draft.message.trim() !== ''

  const add = () => {
    if (!canAdd) return
    set([...events, { offsetS: at, message: draft.message.trim() }].sort((a, b) => a.offsetS - b.offsetS))
    setDraft({ at: '', message: '' })
  }

  return (
    <div className="pt-2" data-testid="text-events">
      <div className="text-xs font-medium">Text events</div>
      <div className="text-[11px] text-ink-faint">Cues shown during the ride, timed from the start of this block.</div>
      {events.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {events.map((ev, i) => (
            <li key={i} className="flex items-center gap-1.5" data-testid="text-event">
              <CommitInput
                value={ev.offsetS}
                format={formatDurationInput}
                parse={(t) => parseDurationInput(t, 0)}
                onCommit={(v) => set(events.map((e, j) => (j === i ? { ...e, offsetS: v } : e)))}
                className="w-18 shrink-0"
                aria-label="Cue time (mm:ss)"
              />
              <Input
                value={ev.message}
                onChange={(e) => set(events.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)), `cue:${i}`)}
                className="h-9 min-w-0"
                aria-label="Cue message"
              />
              <Button size="iconSm" variant="ghost" className="shrink-0" onClick={() => set(events.filter((_, j) => j !== i))} aria-label="Remove text event" title="Remove text event">
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input
          value={draft.at}
          onChange={(e) => setDraft((d) => ({ ...d, at: e.target.value }))}
          placeholder={formatDurationInput(suggested)}
          aria-invalid={at === null || undefined}
          className="tabular h-9 w-18 shrink-0"
          aria-label="New cue time (mm:ss)"
          data-testid="cue-new-time"
        />
        <Input
          value={draft.message}
          onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
          placeholder="Add a cue…"
          className="h-9 min-w-0"
          aria-label="New cue message"
          data-testid="cue-new-message"
        />
        <Button type="submit" size="iconSm" className="shrink-0" disabled={!canAdd} aria-label="Add text event" title="Add text event">
          <Plus className="size-4" />
        </Button>
      </form>
    </div>
  )
}
