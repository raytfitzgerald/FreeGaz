import { cn } from '../../ui/cn'
import { GRADE_CLASSES, gradeVar } from '../../routes/grade'

/** The grade classes as swatch + label (the label carries the meaning; the swatch only matches it to the chart). */
export function GradeLegend({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-dim', className)} aria-label="Grade colours">
      {GRADE_CLASSES.map((c, i) => (
        <li key={c.label} className="flex items-center gap-1.5" title={c.name}>
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: gradeVar(i) }} />
          {c.label}
        </li>
      ))}
    </ul>
  )
}
