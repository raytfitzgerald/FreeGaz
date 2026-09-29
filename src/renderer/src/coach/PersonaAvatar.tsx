import { Drama } from 'lucide-react'
import type { PersonaMeta } from '@core/persona'
import { cn } from '../ui/cn'
import { avatarColors, monogram } from './avatar'

const SIZES = {
  sm: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const

/**
 * A persona's generated monogram. Parody personas carry a visible PARODY
 * badge wherever the avatar appears. No photos: a real one needs the owner's
 * sign-off on the exact file first.
 */
export function PersonaAvatar({ persona, size = 'sm', className }: { persona: Pick<PersonaMeta, 'id' | 'name' | 'parody'>; size?: keyof typeof SIZES; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        role="img"
        aria-label={`${persona.name} avatar${persona.parody ? ', parody' : ''}`}
        className={cn('flex select-none items-center justify-center rounded-full font-display font-semibold tracking-wide', SIZES[size])}
        style={avatarColors(persona.id)}
      >
        {monogram(persona.name)}
      </div>
      {persona.parody && (
        <span
          className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-md bg-amber-400 px-1 py-px text-[9px] font-bold uppercase leading-none tracking-wider text-black shadow"
          data-testid="parody-badge"
        >
          <Drama className="size-2.5" aria-hidden /> Parody
        </span>
      )}
    </div>
  )
}
