// Display names and summaries for builder blocks (palette, canvas tooltip,
// inspector). Words only: colour comes from zoneVar beside the text.
import { resolvePower } from '@core/workout/compile'
import { newSegment, type PaletteItem } from '@core/workout/edit'
import type { PowerTarget, Segment } from '@core/workout/model'
import { formatClock } from '@core/workout/numbers'
import { POWER_ZONE_LABELS } from '../../ui/zones'

export function kindLabel(seg: Segment): string {
  switch (seg.kind) {
    case 'steady':
      return 'Steady'
    case 'ramp':
      return seg.role === 'warmup' ? 'Warm-up' : seg.role === 'cooldown' ? 'Cool-down' : 'Ramp'
    case 'intervals':
      return 'Intervals'
    case 'freeride':
      return 'Free ride'
    case 'maxeffort':
      return 'Max effort'
  }
}

/** "88%" for a fraction of FTP. */
export const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`

/**
 * A target in both units, its own unit first: "88% · 176 W", or "220 W · 110%"
 * for absolute watts. Without an FTP, just its own unit ("88% FTP", "220 W").
 */
export function powerText(p: PowerTarget, ftpW: number | null): string {
  if (ftpW === null || !(ftpW > 0)) return p.unit === 'ftp' ? `${pct(p.value)} FTP` : `${Math.round(p.value)} W`
  const w = resolvePower(p, ftpW)
  return p.unit === 'ftp' ? `${pct(w / ftpW)} · ${Math.round(w)} W` : `${Math.round(w)} W · ${pct(w / ftpW)}`
}

/** One-line description of a segment's targets (with watts when `ftpW` is given). */
export function segmentSummary(seg: Segment, ftpW: number | null): string {
  switch (seg.kind) {
    case 'steady':
      return `${formatClock(seg.durationS)} at ${powerText(seg.power, ftpW)}`
    case 'ramp':
      return `${formatClock(seg.durationS)}, ${powerText(seg.from, ftpW)} → ${powerText(seg.to, ftpW)}`
    case 'intervals':
      return `${seg.repeat} × ${formatClock(seg.on.durationS)} at ${powerText(seg.on.power, ftpW)} / ${formatClock(seg.off.durationS)} at ${powerText(seg.off.power, ftpW)}`
    case 'freeride':
      return `${formatClock(seg.durationS)}, ERG off: ride by feel`
    case 'maxeffort':
      return `${formatClock(seg.durationS)} all-out, ERG off`
  }
}

export interface PaletteEntry {
  item: PaletteItem
  /** Button text: "Z2", "Warm-up"… */
  label: string
  /** Button title: what the block adds, with its defaults. */
  hint: string
}

const ITEMS: readonly PaletteItem[] = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'warmup', 'cooldown', 'ramp', 'intervals', 'freeride', 'maxeffort']

export const PALETTE: readonly PaletteEntry[] = ITEMS.map((item) => {
  const seg = newSegment(item)
  const zone = /^z\d$/.test(item) ? Number(item.slice(1)) - 1 : null
  const name = zone === null ? kindLabel(seg) : (POWER_ZONE_LABELS[zone] ?? item)
  return { item, label: zone === null ? kindLabel(seg) : item.toUpperCase(), hint: `Add ${name}: ${segmentSummary(seg, null)}` }
})
