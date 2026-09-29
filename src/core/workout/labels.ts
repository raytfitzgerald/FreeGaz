// Display-string helpers shared by the compiler, validators and FTP tests.

/**
 * Collapse runs of whitespace (including newlines) to one space and trim.
 * Labels and cue messages are single-line in every format FreeGaz reads or
 * writes (XML attribute normalization does the same in Zwift), so the
 * compiler normalizes them; empty results become `undefined`.
 */
export function normalizeText(s: string | undefined): string | undefined {
  if (s === undefined) return undefined
  const t = s.replace(/\s+/g, ' ').trim()
  return t === '' ? undefined : t
}

/**
 * Whether a step label belongs to an FTP test's effort. The label either
 * equals `effortLabel` ("20-min test effort") or extends it with a space
 * ("Ramp" matches "Ramp step 7").
 */
export function matchesEffortLabel(label: string | undefined, effortLabel: string): boolean {
  const l = normalizeText(label)
  const e = normalizeText(effortLabel)
  if (l === undefined || e === undefined) return false
  return l === e || l.startsWith(`${e} `)
}
