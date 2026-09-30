import { useId } from 'react'
import { packById } from '@core/persona'
import { avatarColors, monogram } from './avatar'
import { hasFace } from './face-ids'
import { CoachFace } from './faces'
import { toonFor } from './toon/heads'

// Round heads for the little SVG riders (ride-along bikes, the home
// velodrome), all drawn round (0, 0) at radius 12.

/** The coach: their photo caricature, their cartoon face, or a monogram. */
export function CoachHead({ personaId }: { personaId: string }) {
  const clip = useId()
  const toon = toonFor(personaId)?.heads[0]
  if (toon) {
    const { background } = avatarColors(personaId)
    return (
      <g>
        <clipPath id={clip}>
          <circle r={12} />
        </clipPath>
        <circle r={12} fill={background} />
        <g clipPath={`url(#${clip})`}>
          <image href={toon.head} x={-11} y={-11} width={22} height={22} />
          <image href={toon.jaw} x={-11} y={-11} width={22} height={22} />
        </g>
      </g>
    )
  }
  if (hasFace(personaId)) return <CoachFace personaId={personaId} />
  const colors = avatarColors(personaId)
  return <Initials text={monogram(packById(personaId)?.meta.name ?? '?')} {...colors} />
}

/** The rider: their photo if they added one, else their initials (or "You") under a helmet. */
export function RiderHead({ photo, initials }: { photo: string | null; initials: string }) {
  const clip = useId()
  if (photo) {
    return (
      <g>
        <clipPath id={clip}>
          <circle r={12} />
        </clipPath>
        <image href={photo} x={-12} y={-12} width={24} height={24} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
        <circle r={12} fill="none" stroke="var(--color-accent)" strokeWidth={1.6} />
      </g>
    )
  }
  return <Initials text={initials} background="var(--color-panel-2)" color="var(--color-ink)" helmet="var(--color-accent)" />
}

export function Initials({ text, background, color, helmet }: { text: string; background: string; color: string; helmet?: string }) {
  return (
    <>
      <circle r={12} fill={background} />
      {helmet && <path d="M-13 -2 A13 13 0 0 1 13 -2 Z" fill={helmet} />}
      <text y={helmet ? 7 : 4.5} textAnchor="middle" fontSize={text.length > 2 ? 8 : 11} fontWeight={700} fill={color} className="font-display">
        {text}
      </text>
    </>
  )
}
