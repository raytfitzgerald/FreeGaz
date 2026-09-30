import type { PersonaMeta } from '@core/persona'
import { cn } from '../ui/cn'
import { avatarColors, monogram } from './avatar'
import { hasFace } from './face-ids'
import { CoachFace } from './faces'
import { toonFor } from './toon/heads'

const SIZES = {
  sm: 'size-10 text-sm',
  lg: 'size-14 text-lg',
} as const

/** A persona's avatar: its caricature head or cartoon face, else a generated monogram (custom personas). */
export function PersonaAvatar({ persona, size = 'sm', className }: { persona: Pick<PersonaMeta, 'id' | 'name'>; size?: keyof typeof SIZES; className?: string }) {
  const head = toonFor(persona.id)?.heads[0]
  if (!head && hasFace(persona.id)) {
    return (
      <div className={cn('relative shrink-0', className)}>
        <svg viewBox="-14.5 -16.5 29 29" className={cn('select-none overflow-visible', SIZES[size])} role="img" aria-label={`${persona.name} avatar`}>
          <CoachFace personaId={persona.id} />
        </svg>
      </div>
    )
  }
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
