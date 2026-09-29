// Deterministic ids. Core code has no crypto, so imported workouts get an id
// derived from their content (FNV-1a, 32-bit) unless the caller injects a
// `newId()`. Same file in, same id out: re-importing a file is idempotent.

/** 32-bit FNV-1a over the UTF-16 code units of `s`, as 8 lowercase hex digits. */
export function fnv1a32(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** `prefix:hash`, e.g. `zwo:1a2b3c4d` for an imported .zwo file. */
export function contentId(prefix: string, content: string): string {
  return `${prefix}:${fnv1a32(content)}`
}

/** Letters that NFKD does not split into a base letter plus accents. */
const TRANSLITERATE: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', þ: 'th', '×': 'x' }

/** Lowercase ASCII slug: "Sweet Spot 3×15" → "sweet-spot-3x15", "Rønnestad" → "ronnestad". */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[øæœßłđþ×]/g, (c) => TRANSLITERATE[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
