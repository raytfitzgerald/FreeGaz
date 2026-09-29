import { AlertTriangle, CircleAlert } from 'lucide-react'
import type { WorkoutIssue } from '@core/workout/validate'

/** Every validation problem, errors first, each with icon + label; step issues jump to their block. */
export function IssuesList({ issues, onSelect }: { issues: WorkoutIssue[]; onSelect: (index: number) => void }) {
  if (issues.length === 0) return null
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 py-3" aria-label="Problems" data-testid="builder-issues">
      <ul className="space-y-1 text-xs">
        {sorted.map((i, k) => (
          <li key={k} className="flex items-start gap-2 text-ink">
            {i.severity === 'error' ? <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-bad" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className="font-medium">{i.severity === 'error' ? 'Error' : 'Warning'}:</span> {i.message}
            </span>
            {i.segmentIndex !== undefined && (
              <button type="button" className="shrink-0 text-ink-dim underline decoration-line-strong underline-offset-2 hover:text-ink" onClick={() => onSelect(i.segmentIndex ?? 0)}>
                Show
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
