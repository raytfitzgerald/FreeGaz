// What the builder opens for a /builder?id=… URL: a new workout, a stored
// one, or (built-ins are read-only) a copy of a built-in.
import { newWorkout } from '@core/workout/edit'
import type { Workout } from '@core/workout/model'
import { copyOf, getWorkout } from '../../workouts/library'
import type { NoticeMessage } from './Notice'

export interface OpenDoc {
  /** Unique per open: the editor's React key, so every open starts with fresh history. */
  key: string
  workout: Workout
  /** The workout is in the library as it is (so "Saved" is true until it changes). */
  stored: boolean
  notice: NoticeMessage | null
}

export async function openDoc(id: string | undefined): Promise<OpenDoc> {
  const key = crypto.randomUUID()
  const fresh = (notice: NoticeMessage | null): OpenDoc => ({ key, workout: newWorkout(`user:${crypto.randomUUID()}`), stored: false, notice })
  if (!id) return fresh(null)
  const found = await getWorkout(id).catch(() => null)
  if (!found) return fresh({ tone: 'bad', text: "That workout isn't in your library any more, so this is a new one." })
  if (found.source === 'builtin') {
    return {
      key,
      workout: copyOf(found),
      stored: false,
      notice: { tone: 'info', text: `“${found.name}” is a built-in workout, which is read-only, so this is a copy. Save it to add it to your library.` },
    }
  }
  return { key, workout: found, stored: true, notice: null }
}
