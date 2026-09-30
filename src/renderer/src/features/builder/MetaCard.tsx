import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Workout } from '@core/workout/model'
import { Input, Select } from '../../ui/form'
import { tagLabel } from '../../workouts/library'
import { addTags, withOptional } from './fields'

type Meta = Pick<Workout, 'name' | 'author' | 'description' | 'tags' | 'folder'>

const fieldLabel = 'mb-1 block text-[11px] font-medium leading-4 text-ink-faint'

/**
 * Name, author, description and tags, kept to two rows so the canvas stays
 * on screen. Text commits as you type; a run of typing in one field is one
 * undo step. Tags are chips: Enter or a comma adds, ⌫ in an empty box removes.
 */
export function MetaCard({ workout, onChange }: { workout: Workout; onChange: (next: Workout, group?: string) => void }) {
  const [tagText, setTagText] = useState('')
  const set = <K extends keyof Meta>(key: K, value: Meta[K] | undefined, group?: string) => onChange(withOptional<Workout, K>(workout, key, value), group)
  const addTyped = (text: string) => {
    const tags = addTags(workout.tags, text)
    if (tags.length !== workout.tags.length) set('tags', tags)
    setTagText('')
  }

  return (
    <section className="grid gap-x-3 gap-y-2.5 rounded-2xl border border-line bg-panel px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" aria-label="Workout details">
      <Labeled label="Name">
        <Input
          value={workout.name}
          onChange={(e) => set('name', e.target.value, 'meta:name')}
          placeholder="Name this workout"
          className="font-display text-base font-semibold"
          data-testid="builder-name"
        />
      </Labeled>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3">
        <Labeled label="Author">
          <Input
            value={workout.author ?? ''}
            onChange={(e) => set('author', e.target.value === '' ? undefined : e.target.value, 'meta:author')}
            placeholder="Optional"
            data-testid="builder-author"
          />
        </Labeled>
        <Labeled label="Folder">
          <Select value={workout.folder ?? 'custom'} onChange={(e) => set('folder', e.target.value === 'plan' ? 'plan' : undefined)} data-testid="builder-folder">
            <option value="custom">Custom workouts</option>
            <option value="plan">Training plan</option>
          </Select>
        </Labeled>
      </div>
      <Labeled label="Description">
        <textarea
          value={workout.description ?? ''}
          onChange={(e) => set('description', e.target.value === '' ? undefined : e.target.value, 'meta:description')}
          placeholder="How to ride it (shown in the library, exported to .zwo)"
          rows={1}
          className="no-drag field-sizing-content block max-h-32 min-h-10 w-full resize-none rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          data-testid="builder-description"
        />
      </Labeled>
      {/* Not a <label>: a click on it would land on the first chip's remove button. */}
      <div>
        <span className={fieldLabel} id="builder-tags-label">
          Tags
        </span>
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2 py-1 focus-within:border-accent" role="group" aria-labelledby="builder-tags-label">
          {workout.tags.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-panel-3 py-0.5 pl-2.5 pr-1 text-xs text-ink" data-testid="builder-tag">
              {tagLabel(t)}
              <button
                type="button"
                className="rounded-full p-0.5 text-ink-faint hover:bg-panel-2 hover:text-ink"
                aria-label={`Remove tag ${tagLabel(t)}`}
                onClick={() => set('tags', workout.tags.filter((x) => x !== t))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={tagText}
            onChange={(e) => (e.target.value.endsWith(',') ? addTyped(e.target.value) : setTagText(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTyped(tagText)
              } else if (e.key === 'Backspace' && tagText === '' && workout.tags.length > 0) {
                set('tags', workout.tags.slice(0, -1))
              }
            }}
            onBlur={() => addTyped(tagText)}
            placeholder={workout.tags.length ? 'Add a tag' : 'threshold, sweet spot… (Enter or comma)'}
            aria-label="Add a tag"
            className="no-drag h-7 min-w-32 flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            data-testid="builder-tag-input"
          />
        </div>
      </div>
    </section>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={fieldLabel}>{label}</span>
      {children}
    </label>
  )
}
