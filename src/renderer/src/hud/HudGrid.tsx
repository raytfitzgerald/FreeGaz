import { useLiveQuery } from 'dexie-react-hooks'
import { memo, useMemo, useState, type ReactNode } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, LayoutGrid, Plus, RotateCcw, X } from 'lucide-react'
import type { AthleteSnapshot } from '@core/ride/types'
import { athleteSnapshot, DEFAULT_FTP_W, DEFAULT_WEIGHT_KG } from '../db/athlete-repo'
import { patchSettings, settingsStore, toggleSpeedUnit, useSettings } from '../stores/settings'
import { Button } from '../ui/Button'
import { MetricTile } from '../ui/MetricTile'
import { cn } from '../ui/cn'
import { DEFAULT_LAYOUT, PRESETS, WIDGETS, WIDGET_BY_ID, type HudView, type WidgetDef, type WidgetGroup } from './catalog'
import { useWidget } from './useHud'

const SPEED_FLIP = { label: 'Switch speed units', onClick: () => void toggleSpeedUnit() }

const FALLBACK: AthleteSnapshot = { ftpW: DEFAULT_FTP_W, weightKg: DEFAULT_WEIGHT_KG }
const GROUPS: WidgetGroup[] = ['Power', 'Heart rate', 'Cadence', 'Time', 'Speed & distance', 'Energy', 'Trainer', 'Body']

/** A configurable grid of metric tiles. Layouts are saved per ride view. */
export function HudGrid({ view }: { view: HudView }) {
  const saved = useSettings((s) => s.hud[view])
  const tiles = saved ?? DEFAULT_LAYOUT[view]
  const athlete = useLiveQuery(() => athleteSnapshot(), []) ?? FALLBACK
  const [editing, setEditing] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const save = (next: string[] | null) => void patchSettings({ hud: { ...settingsStore.getState().hud, [view]: next } })
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    save(arrayMove(tiles, tiles.indexOf(String(e.active.id)), tiles.indexOf(String(e.over.id))))
  }

  return (
    <div data-testid={`hud-${view}`}>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <>
            <select
              aria-label="Load a preset"
              value=""
              onChange={(e) => {
                const p = PRESETS.find((x) => x.id === e.target.value)
                if (p) save([...p.tiles])
              }}
              className="h-8 rounded-lg border border-line bg-panel-2 px-2 text-xs text-ink"
            >
              <option value="">Load preset…</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <WidgetPicker label="Add tile" exclude={tiles} onPick={(id) => save([...tiles, id])} icon={<Plus className="size-3.5" />} />
            <Button size="sm" variant="ghost" onClick={() => save(null)} title="Back to the default tiles">
              <RotateCcw className="size-3.5" /> Reset
            </Button>
          </>
        )}
        <Button size="sm" variant={editing ? 'primary' : 'ghost'} onClick={() => setEditing((v) => !v)} data-testid="hud-edit">
          <LayoutGrid className="size-3.5" /> {editing ? 'Done' : 'Edit tiles'}
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tiles} strategy={rectSortingStrategy} disabled={!editing}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {tiles.map((id) => {
              const def = WIDGET_BY_ID.get(id)
              if (!def) return null
              return (
                <SortableTile
                  key={id}
                  def={def}
                  athlete={athlete}
                  editing={editing}
                  exclude={tiles}
                  onRemove={() => save(tiles.filter((t) => t !== id))}
                  onReplace={(next) => save(tiles.map((t) => (t === id ? next : t)))}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableTile(props: { def: WidgetDef; athlete: AthleteSnapshot; editing: boolean; exclude: string[]; onRemove: () => void; onReplace: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.def.id, disabled: !props.editing })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('relative', isDragging && 'z-10 opacity-80')}>
      <HudTile def={props.def} athlete={props.athlete} />
      {props.editing && (
        <div className="absolute inset-0 flex items-start justify-between rounded-2xl border border-dashed border-accent/60 bg-panel/70 p-1.5">
          <button type="button" className="cursor-grab rounded p-1 text-ink-dim hover:text-ink" aria-label={`Move ${props.def.label}`} {...attributes} {...listeners}>
            <GripVertical className="size-4" />
          </button>
          <WidgetPicker label="Change" exclude={props.exclude} onPick={props.onReplace} compact />
          <button type="button" className="rounded p-1 text-ink-dim hover:text-bad" aria-label={`Remove ${props.def.label}`} onClick={props.onRemove}>
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/** One metric tile. Memoised on its definition, so only its own value re-renders it. */
export const HudTile = memo(function HudTile({ def, athlete }: { def: WidgetDef; athlete: AthleteSnapshot }) {
  const { value, sub, unit } = useWidget(def, athlete)
  return <MetricTile label={def.label} value={value} unit={unit} size="md" accent={def.accent} sub={sub} testId={`hud-${def.id}`} unitAction={def.id === 'speed' ? SPEED_FLIP : undefined} />
})

function WidgetPicker({ label, exclude, onPick, icon, compact }: { label: string; exclude: string[]; onPick: (id: string) => void; icon?: ReactNode; compact?: boolean }) {
  const groups = useMemo(() => GROUPS.map((g) => ({ g, items: WIDGETS.filter((w) => w.group === g && !exclude.includes(w.id)) })).filter((x) => x.items.length > 0), [exclude])
  return (
    <label className={cn('relative inline-flex items-center gap-1 rounded-lg text-xs', compact ? 'px-1 py-0.5 text-ink-dim hover:text-ink' : 'h-8 border border-line bg-panel-2 px-2 text-ink')}>
      {icon}
      <span>{label}</span>
      <select
        aria-label={label}
        value=""
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">{label}</option>
        {groups.map(({ g, items }) => (
          <optgroup key={g} label={g}>
            {items.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
