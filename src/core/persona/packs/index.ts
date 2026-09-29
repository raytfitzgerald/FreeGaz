// The nine built-in persona packs.
import type { PersonaPack } from '../types'
import { BIBI } from './bibi'
import { DATA_NERD } from './data-nerd'
import { DISAPPOINTED_DAD } from './disappointed-dad'
import { DRILL_SERGEANT } from './drill-sergeant'
import { HYPE_COACH } from './hype-coach'
import { PROFESSIONAL } from './professional'
import { ROAST_COMIC } from './roast-comic'
import { THE_OVERLORD } from './the-overlord'
import { ZEN } from './zen'

export { BIBI, BIBI_BANNED_PATTERNS } from './bibi'
export { DATA_NERD } from './data-nerd'
export { DISAPPOINTED_DAD } from './disappointed-dad'
export { DRILL_SERGEANT } from './drill-sergeant'
export { HYPE_COACH } from './hype-coach'
export { PROFESSIONAL } from './professional'
export { ROAST_COMIC } from './roast-comic'
export { THE_OVERLORD } from './the-overlord'
export { ZEN } from './zen'

export const PACKS: readonly PersonaPack[] = [
  DRILL_SERGEANT,
  ROAST_COMIC,
  DISAPPOINTED_DAD,
  THE_OVERLORD,
  HYPE_COACH,
  DATA_NERD,
  ZEN,
  PROFESSIONAL,
  BIBI,
]

const BY_ID = new Map(PACKS.map((p) => [p.meta.id, p]))

export function packById(id: string): PersonaPack | undefined {
  return BY_ID.get(id)
}
