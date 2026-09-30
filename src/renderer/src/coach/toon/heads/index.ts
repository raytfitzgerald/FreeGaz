// Photo heads for the coach caricatures. Each head is two layers made by
// scripts/toon-cutout.swift: the head (with a dark mouth painted where only an
// open jaw shows it) and the jaw, which slides down to talk. Sources, licences
// and what was changed: ATTRIBUTION.md in this folder.
import dodHead from './bibi-dod-2025-02-05-head.webp'
import dodJaw from './bibi-dod-2025-02-05-jaw.webp'
import pibHead from './bibi-pib-2026-02-26-head.webp'
import pibJaw from './bibi-pib-2026-02-26-jaw.webp'
import whHead from './bibi-whitehouse-2026-07-28-head.webp'
import whJaw from './bibi-whitehouse-2026-07-28-jaw.webp'

export interface ToonHead {
  head: string
  jaw: string
  /** Who took the photo, for the tooltip. */
  credit: string
}

const BIBI_HEADS: readonly ToonHead[] = [
  { head: whHead, jaw: whJaw, credit: 'Official White House photo by Daniel Torok (public domain)' },
  { head: dodHead, jaw: dodJaw, credit: 'U.S. Department of Defense photo by Senior Airman Madelyn Keech (public domain)' },
  { head: pibHead, jaw: pibJaw, credit: 'Press Information Bureau, Government of India (GODL-India)' },
]

const HEADS: Readonly<Record<string, readonly ToonHead[]>> = { bibi: BIBI_HEADS }

/** The caricature heads for a persona, or null for the personas drawn as monograms. */
export function toonHeadsFor(personaId: string | null | undefined): readonly ToonHead[] | null {
  return (personaId && HEADS[personaId]) || null
}
