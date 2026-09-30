/** The built-in coaches drawn as cartoon faces (faces.tsx); Bibi and The Donald have photo caricatures. */
export const FACE_IDS = ['drill-sergeant', 'roast-comic', 'disappointed-dad', 'the-overlord', 'hype-coach', 'data-nerd', 'zen', 'professional'] as const

export function hasFace(personaId: string): boolean {
  return (FACE_IDS as readonly string[]).includes(personaId)
}
