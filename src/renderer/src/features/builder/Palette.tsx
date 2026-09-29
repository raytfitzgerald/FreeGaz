import { memo } from 'react'
import { insertSegment, newSegment, newWorkout, type PaletteItem } from '@core/workout/edit'
import { zoneVar } from '../../ui/zones'
import { PALETTE } from './blocks'
import { layoutSegments } from './layout'
import { pieceShapes, type Shape } from './shapes'

const GLYPH_W = 30
const GLYPH_H = 18
const GLYPH_TOP = 1.6

/** Each palette block drawn with the canvas's own shape code, so the button looks like what it adds. */
const GLYPHS: ReadonlyMap<PaletteItem, Shape[]> = new Map(
  PALETTE.map(({ item }) => {
    const [box] = layoutSegments(insertSegment(newWorkout('glyph'), 0, newSegment(item)), 100)
    const total = box ? box.endS - box.startS : 1
    const x = (s: number) => (s / total) * GLYPH_W
    const y = (f: number) => GLYPH_H - (Math.min(f, GLYPH_TOP) / GLYPH_TOP) * GLYPH_H
    const shapes = (box?.pieces ?? []).flatMap((p) => pieceShapes(p, x, y, GLYPH_H, box && box.pieces.length > 1 ? 0.5 : 0, 1.5))
    return [item, shapes] as const
  }),
)

const fill = (f: Shape['fill']) => (f === 'free' ? 'var(--color-ink-faint)' : f === 'max' ? zoneVar(6) : zoneVar(f))

/** Block buttons: click to add after the selected block, or at the end. */
export const Palette = memo(function Palette({ onAdd }: { onAdd: (item: PaletteItem) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Add a block">
      {PALETTE.map((p) => (
        <button
          key={p.item}
          type="button"
          title={p.hint}
          aria-label={p.hint}
          data-testid={`palette-${p.item}`}
          onClick={() => onAdd(p.item)}
          className="no-drag flex h-9 items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-3"
        >
          <svg width={GLYPH_W} height={GLYPH_H} viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`} aria-hidden className="shrink-0">
            {(GLYPHS.get(p.item) ?? []).map((sh, i) => (
              <path key={i} d={sh.d} fill={fill(sh.fill)} />
            ))}
          </svg>
          {p.label}
        </button>
      ))}
    </div>
  )
})
