import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { cn } from '../../ui/cn'

export interface NoticeMessage {
  tone: 'good' | 'bad' | 'info'
  text: string
}

const TONES = {
  good: { box: 'border-good/40 bg-good/5', icon: CheckCircle2, iconClass: 'text-good', label: 'Done' },
  bad: { box: 'border-bad/40 bg-bad/10', icon: CircleAlert, iconClass: 'text-bad', label: 'Problem' },
  info: { box: 'border-accent/40 bg-accent/5', icon: Info, iconClass: 'text-accent', label: 'Note' },
} as const

/** A dismissable status line: icon + label + text, never colour alone. */
export function Notice({ notice, onDismiss }: { notice: NoticeMessage; onDismiss: () => void }) {
  const t = TONES[notice.tone]
  const Icon = t.icon
  return (
    <div className={cn('mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-2 text-sm', t.box)} role="status" data-testid="builder-notice">
      <Icon className={cn('mt-0.5 size-4 shrink-0', t.iconClass)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="sr-only">{t.label}: </span>
        {notice.text}
      </span>
      <button type="button" onClick={onDismiss} className="rounded p-0.5 text-ink-faint hover:bg-panel-2 hover:text-ink" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  )
}
