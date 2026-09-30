import { Drama } from 'lucide-react'
import { cn } from '../ui/cn'

/** The PARODY label every parody persona wears wherever its face appears. Theme-independent: parody amber and its ink read on both (10:1). */
export function ParodyBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 rounded-md bg-parody px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wider text-on-parody shadow', className)}
      data-testid="parody-badge"
    >
      <Drama className="size-2.5" aria-hidden /> Parody
    </span>
  )
}
