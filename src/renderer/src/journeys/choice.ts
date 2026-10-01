// Where the next ride goes: chosen in the ride picker, or the default from
// Settings → Journeys. Read once when the ride starts.
import { createStore, useStore } from 'zustand'

export type JourneyChoice =
  | { kind: 'none' }
  /** One-off from a famous place; `courseId` null picks one at random. */
  | { kind: 'drop'; courseId: string | null }
  /** Carry on a saved journey. */
  | { kind: 'continue'; journeyId: string }
  /** Begin a new saved journey on this course (a grand journey or an imported route). */
  | { kind: 'start'; courseId: string }

/** null: use the Settings default. */
export const journeyChoiceStore = createStore<{ choice: JourneyChoice | null }>(() => ({ choice: null }))

export const chooseJourney = (choice: JourneyChoice | null) => journeyChoiceStore.setState({ choice })
export const useJourneyChoice = () => useStore(journeyChoiceStore, (s) => s.choice)
