// Generated monogram avatars: initials on a colour derived from the persona id,
// so every persona is recognisable without any image (and a custom persona
// gets one for free).

/** "Drill Sergeant" → "DS", "The Overlord" → "O", "Bibi" → "B". */
export function monogram(name: string): string {
  const words = name
    .replace(/^the\s+/i, '')
    .split(/[\s-]+/)
    .filter((w) => /\p{L}/u.test(w))
  const letters = words.slice(0, 2).map((w) => [...w].find((ch) => /\p{L}/u.test(ch)) ?? '')
  return letters.join('').toUpperCase() || '?'
}

/** A stable hue (0-359) for an id. */
export function avatarHue(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) % 360
}

/** Background and ink for the dark theme: a deep tint with light letters (at least 5:1 at any hue). */
export function avatarColors(id: string): { background: string; color: string } {
  const hue = avatarHue(id)
  return { background: `hsl(${hue} 55% 26%)`, color: `hsl(${hue} 90% 88%)` }
}
