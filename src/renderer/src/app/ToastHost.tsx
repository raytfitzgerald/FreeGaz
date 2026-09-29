import { useEffect } from 'react'
import { CupSoda, Trophy, X, Info } from 'lucide-react'
import { dismissToast, useRide, type Toast } from '../stores/ride'
import { cn } from '../ui/cn'

const SHOW_MS = 8000
const ICONS = { pr: Trophy, fuel: CupSoda, info: Info } as const

/** Bottom-right stack of ride toasts (PRs, fueling). */
export function ToastHost() {
  const toasts = useRide((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite" role="status">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastCard({ toast }: { toast: Toast }) {
  useEffect(() => {
    const id = setTimeout(() => dismissToast(toast.id), SHOW_MS)
    return () => clearTimeout(id)
  }, [toast.id])
  const Icon = ICONS[toast.tone]
  return (
    <div
      className={cn('pointer-events-auto flex items-start gap-3 rounded-xl border bg-panel-2 px-4 py-3 shadow-xl', toast.tone === 'pr' ? 'border-accent/60' : 'border-line-strong')}
      data-testid={`toast-${toast.tone}`}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', toast.tone === 'pr' ? 'text-accent' : 'text-ink-dim')} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{toast.title}</div>
        {toast.body && <div className="mt-0.5 text-xs text-ink-dim">{toast.body}</div>}
      </div>
      <button type="button" className="text-ink-faint hover:text-ink" aria-label="Dismiss" onClick={() => dismissToast(toast.id)}>
        <X className="size-4" />
      </button>
    </div>
  )
}
