// Zone presentation shared by charts, the builder and the HUD. Colours come
// from the validated CSS tokens (styles.css); labels always accompany them.

export const POWER_ZONE_LABELS = ['Z1 Recovery', 'Z2 Endurance', 'Z3 Tempo', 'Z4 Threshold', 'Z5 VO2max', 'Z6 Anaerobic', 'Z7 Neuromuscular'] as const
export const POWER_ZONE_SHORT = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7'] as const
/** Upper bounds (exclusive) as fractions of FTP: Coggan zones. */
export const POWER_ZONE_EDGES = [0.56, 0.76, 0.91, 1.06, 1.21, 1.51, Infinity] as const

export const zoneVar = (i: number): string => `var(--color-z${Math.min(7, Math.max(1, i + 1))})`

/** 0-based Coggan zone for a fraction of FTP. */
export function zoneIndexForFraction(f: number): number {
  for (let i = 0; i < POWER_ZONE_EDGES.length; i++) if (f < POWER_ZONE_EDGES[i]!) return i
  return 6
}

/** Resolved hex of a zone token (for canvas drawing, which can't read CSS vars). */
export function zoneHex(i: number): string {
  return cssVar(`--color-z${Math.min(7, Math.max(1, i + 1))}`)
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}
