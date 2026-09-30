import type { ReactNode } from 'react'
import { avatarColors } from './avatar'
import type { FACE_IDS } from './face-ids'

// Cartoon faces for the coaches drawn as characters (Bibi and The Donald have
// photo caricatures instead). Each is a few strokes on the persona's own
// colour, drawn round (0, 0) on a head of radius 12, so the same face works
// as an avatar, on the ride-along bike and standing in the velodrome.
// Heads are the persona's hue, not a skin tone: they're characters.

const ink = (c: string) => ({ stroke: c, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' })

type Draw = (c: string, bg: string) => ReactNode

const FACES: Record<(typeof FACE_IDS)[number], Draw> = {
  // campaign hat, a scowl and a mouth mid-bellow
  'drill-sergeant': (c) => (
    <>
      <ellipse cx={0} cy={-8.2} rx={13.5} ry={2.6} fill={c} />
      <path d="M-6.5 -8.5 L-4 -15 L0 -13 L4 -15 L6.5 -8.5 Z" fill={c} />
      <path d="M-7 -2.8 L-2.2 -1.4 M7 -2.8 L2.2 -1.4" {...ink(c)} strokeWidth={1.8} />
      <circle cx={-3.8} cy={0.6} r={1.1} fill={c} />
      <circle cx={3.8} cy={0.6} r={1.1} fill={c} />
      <rect x={-3.2} y={4} width={6.4} height={4.2} rx={1.6} fill={c} />
    </>
  ),
  // one eyebrow up, a smirk, and a bow tie peeking in
  'roast-comic': (c) => (
    <>
      <path d="M-7 -3.6 Q-4.5 -5.6 -2 -3.8 M2.2 -2.8 L6.8 -3" {...ink(c)} />
      <circle cx={-4.2} cy={-0.6} r={1.1} fill={c} />
      <circle cx={4.2} cy={-0.6} r={1.1} fill={c} />
      <path d="M-4.2 5 Q0.5 6.4 5 3.2" {...ink(c)} strokeWidth={1.6} />
      <path d="M-3 10.4 L0 11.6 L3 10.4 L3 13 L0 11.8 L-3 13 Z" fill={c} />
    </>
  ),
  // glasses, a moustache, and the long-suffering frown
  'disappointed-dad': (c) => (
    <>
      <path d="M-7.2 -4.4 L-2.4 -3.4 M7.2 -4.4 L2.4 -3.4" {...ink(c)} />
      <circle cx={-4.2} cy={-0.4} r={2.8} {...ink(c)} />
      <circle cx={4.2} cy={-0.4} r={2.8} {...ink(c)} />
      <path d="M-1.4 -0.6 L1.4 -0.6" {...ink(c)} />
      <path d="M-5 4.2 Q-2.5 2.8 0 4 Q2.5 2.8 5 4.2 Q2.5 5.6 0 4.9 Q-2.5 5.6 -5 4.2 Z" fill={c} />
      <path d="M-3.4 8.4 Q0 6.8 3.4 8.4" {...ink(c)} />
    </>
  ),
  // a crown, slit eyes and a very pleased grin
  'the-overlord': (c) => (
    <>
      <path d="M-8 -8 L-8 -14.5 L-4 -10.8 L0 -15.5 L4 -10.8 L8 -14.5 L8 -8 Z" fill={c} />
      <path d="M-7 -1 L-2 0.4 M7 -1 L2 0.4" {...ink(c)} strokeWidth={2} />
      <path d="M-6 4 Q0 9.6 6 4 Q0 6.6 -6 4 Z" fill={c} />
    </>
  ),
  // sweatband, raised brows, the biggest smile in the building
  'hype-coach': (c, bg) => (
    <>
      <rect x={-12} y={-8.6} width={24} height={3.6} rx={1.4} fill={c} />
      <path d="M-6.8 -2.6 Q-4.4 -4.2 -2 -2.6 M2 -2.6 Q4.4 -4.2 6.8 -2.6" {...ink(bg)} strokeWidth={1.2} />
      <path d="M-6.4 -1.6 Q-4.4 -3.6 -2.4 -1.6 M2.4 -1.6 Q4.4 -3.6 6.4 -1.6" {...ink(c)} strokeWidth={1.6} />
      <path d="M-6.4 3 Q0 11.4 6.4 3 Z" fill={c} />
    </>
  ),
  // square specs, a neat side parting and a small, satisfied smile
  'data-nerd': (c) => (
    <>
      <path d="M-9 -7 Q-2 -12 8 -8" {...ink(c)} strokeWidth={1.8} />
      <rect x={-7.4} y={-3.2} width={5.8} height={4.6} rx={0.8} {...ink(c)} />
      <rect x={1.6} y={-3.2} width={5.8} height={4.6} rx={0.8} {...ink(c)} />
      <path d="M-1.6 -1.2 L1.6 -1.2" {...ink(c)} />
      <circle cx={-4.5} cy={-0.9} r={0.9} fill={c} />
      <circle cx={4.5} cy={-0.9} r={0.9} fill={c} />
      <path d="M-2.6 5.4 Q0 7.2 2.6 5.4" {...ink(c)} />
    </>
  ),
  // eyes closed, entirely at peace with your suffering
  zen: (c) => (
    <>
      <path d="M-6.6 0 Q-4.4 2 -2.2 0 M2.2 0 Q4.4 2 6.6 0" {...ink(c)} strokeWidth={1.6} />
      <path d="M-3.2 5 Q0 7.4 3.2 5" {...ink(c)} />
      <path d="M-9.4 3.2 L-8 3.2 M8 3.2 L9.4 3.2" {...ink(c)} opacity={0.6} />
    </>
  ),
  // tidy hair, level gaze, a straight line of a mouth
  professional: (c) => (
    <>
      <path d="M-10.4 -4.4 Q-9 -12 0 -11.8 Q9 -12 10.4 -4.4 Q6 -9 -2 -8.6 Q-7 -8.4 -10.4 -4.4 Z" fill={c} />
      <circle cx={-4} cy={-0.4} r={1.1} fill={c} />
      <circle cx={4} cy={-0.4} r={1.1} fill={c} />
      <path d="M-3.2 5 L3.2 5" {...ink(c)} />
    </>
  ),
}

/** A coach's face, drawn round (0, 0) at radius 12. Null for personas without one. */
export function CoachFace({ personaId }: { personaId: string }) {
  const draw = (FACES as Partial<Record<string, Draw>>)[personaId]
  if (!draw) return null
  const { background, color } = avatarColors(personaId)
  return (
    <g data-face={personaId}>
      <circle r={12} fill={background} />
      {draw(color, background)}
    </g>
  )
}
