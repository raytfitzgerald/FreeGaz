import type { PersonaMeta } from '@core/persona'
import { cn } from '../ui/cn'
import { avatarColors, monogram } from './avatar'
import { toonFor } from './toon/heads'

const SIZES = {
  sm: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const

/** A persona's avatar: its caricature head when it has one, else a generated monogram. */
export function PersonaAvatar({ persona, size = 'sm', className }: { persona: Pick<PersonaMeta, 'id' | 'name'>; size?: keyof typeof SIZES; className?: string }) {
  const head = toonFor(persona.id)?.heads[0]
  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        role="img"
        aria-label={`${persona.name} avatar`}
        title={head?.credit}
        className={cn('relative flex select-none items-center justify-center overflow-hidden rounded-full font-display font-semibold tracking-wide', SIZES[size])}
        style={avatarColors(persona.id)}
      >
        {head ? (
          <>
            {/* two layers: the jaw covers the painted-in open mouth */}
            <img src={head.head} alt="" draggable={false} className="absolute left-[5%] top-[7%] size-[90%]" />
            <img src={head.jaw} alt="" draggable={false} className="absolute left-[5%] top-[7%] size-[90%]" />
          </>
        ) : (
          monogram(persona.name)
        )}
      </div>
    </div>
  )
}
