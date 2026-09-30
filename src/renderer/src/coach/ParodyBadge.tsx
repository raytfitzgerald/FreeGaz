import { Drama } from 'lucide-react'
import { cn } from '../ui/cn'

/** The PARODY label every parody persona wears wherever its face appears. Theme-independent: amber and black read on both. */
export function ParodyBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 rounded-md bg-amber-400 px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wider text-black shadow', className)}
      data-testid="parody-badge"
    >
      <Drama className="size-2.5" aria-hidden /> Parody
    </span>
  )
}
