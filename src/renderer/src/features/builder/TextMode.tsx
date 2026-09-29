import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert } from 'lucide-react'
import { parseIntervalsText, toIntervalsText, type TextParseError } from '@core/workout/io/intervals-text'
import type { Segment, Workout } from '@core/workout/model'

/** How long typing must pause before the text is parsed into the workout. */
export const TEXT_DEBOUNCE_MS = 300

/** Focus sessions across every mount: each one is its own undo step, even after the editor remounts. */
let sessions = 0

const CHEATS: [string, string][] = [
  ['Warm-up', 'a line of words: section label'],
  ['- 10m 65%', 'steady: time + % FTP'],
  ['- 5m 220w', 'or watts; Z1…Z7 for zones'],
  ['- 8m 95-105%', 'a target range'],
  ['- 10m warmup 45-75%', 'ramp (warmup, ramp, cooldown)'],
  ['4x', 'header: repeat the next steps'],
  ['- 20m freeride', 'ERG off; add terrain for hills'],
  ['- 20s max', 'all-out, ERG off'],
  ['- 5m 90% 95rpm', 'cadence (85-95rpm for a range)'],
  ['- 3m 80% avg', 'show the running average'],
  ['- Over 2m 105%', 'words before the time: label'],
  ['  > 30s Stay smooth', 'cue, timed from its step'],
  ['1h2m30s  5m  90s  5:30', 'durations'],
]

/**
 * The workout as intervals.icu text. It opens with the workout serialized;
 * edits parse after a pause and replace the blocks only when the whole text
 * is valid. The editor remounts (re-serializing) whenever the workout
 * changes anywhere else, so both views stay in sync.
 */
export function TextMode({ workout, onSegments }: { workout: Workout; onSegments: (segments: Segment[], group: string) => void }) {
  const [text, setText] = useState(() => toIntervalsText(workout))
  const [errors, setErrors] = useState<TextParseError[]>([])
  const [pending, setPending] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const session = useRef(0)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const apply = (t: string) => {
    timer.current = null
    setPending(false)
    const r = parseIntervalsText(t)
    setErrors(r.errors)
    if (r.errors.length === 0) onSegments(r.workout.segments, `text:${session.current}`)
  }

  const badLines = new Set(errors.map((e) => e.line)).size

  const flush = () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    apply(text)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <textarea
          value={text}
          onChange={(e) => {
            const t = e.target.value
            setText(t)
            setPending(true)
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => apply(t), TEXT_DEBOUNCE_MS)
          }}
          onFocus={() => {
            session.current = ++sessions
          }}
          onBlur={flush}
          spellCheck={false}
          rows={Math.min(24, Math.max(10, text.split('\n').length + 2))}
          aria-label="Workout as intervals.icu text"
          aria-invalid={errors.length > 0 || undefined}
          aria-describedby="builder-text-status"
          className="no-drag block w-full resize-y rounded-xl border border-line bg-panel-2 px-4 py-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          placeholder={'Warm-up\n- 10m warmup 45-75%\n\nMain set 4x\n- 4m 105%\n- 3m 55%\n\n- 8m cooldown 65-40%'}
          data-testid="builder-text"
        />
        <div id="builder-text-status" className="mt-2 text-xs" role="status" data-testid="builder-text-status">
          {errors.length > 0 ? (
            <div className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2" data-testid="builder-text-errors">
              <div className="flex items-center gap-2 font-medium text-ink">
                <CircleAlert className="size-3.5 text-bad" aria-hidden /> Not applied: fix {badLines === 1 ? `line ${errors[0]?.line}` : `these ${badLines} lines`} to update the blocks.
              </div>
              <ul className="mt-1 space-y-0.5 pl-5.5 text-ink-dim">
                {errors.slice(0, 12).map((e, i) => (
                  <li key={i}>
                    <span className="tabular font-medium text-ink">Line {e.line}:</span> {e.message}
                  </li>
                ))}
                {errors.length > 12 && <li>…and {errors.length - 12} more.</li>}
              </ul>
            </div>
          ) : (
            <span className="flex items-center gap-2 text-ink-dim">
              <CheckCircle2 className="size-3.5 text-good" aria-hidden /> {pending ? 'Reading…' : 'In sync with the blocks'}
            </span>
          )}
        </div>
      </div>
      <aside className="rounded-xl border border-line bg-panel-2/60 px-3 py-2.5" aria-label="Text syntax cheat sheet">
        <div className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Syntax (intervals.icu)</div>
        <dl className="mt-1.5 space-y-1 text-[11px] leading-snug">
          {CHEATS.map(([code, what]) => (
            <div key={code}>
              <dt className="whitespace-pre font-mono text-ink">{code}</dt>
              <dd className="text-ink-faint">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] leading-snug text-ink-faint">A blank line ends a section. Paste straight from intervals.icu, or copy out to it.</p>
      </aside>
    </div>
  )
}
