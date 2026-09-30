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
import t17Head from './trump-portrait-2017-head.webp'
import t17Jaw from './trump-portrait-2017-jaw.webp'
import t25Head from './trump-portrait-2025-head.webp'
import t25Jaw from './trump-portrait-2025-jaw.webp'
import t26Head from './trump-portrait-2026-06-head.webp'
import t26Jaw from './trump-portrait-2026-06-jaw.webp'
import twhHead from './trump-whitehouse-2026-07-28-head.webp'
import twhJaw from './trump-whitehouse-2026-07-28-jaw.webp'
import type { ToonTie } from '../CoachToon'

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

const TRUMP_HEADS: readonly ToonHead[] = [
  { head: t17Head, jaw: t17Jaw, credit: 'Official White House photo by Shealah Craighead (public domain)' },
  { head: t25Head, jaw: t25Jaw, credit: 'Official portrait by Daniel Torok, White House (public domain)' },
  { head: twhHead, jaw: twhJaw, credit: 'Official White House photo by Daniel Torok (public domain)' },
  { head: t26Head, jaw: t26Jaw, credit: 'Official portrait by Daniel Torok, White House (public domain)' },
]

/** A persona's caricature: the photo heads it cycles through, and the suit's tie. */
export interface Toon {
  heads: readonly ToonHead[]
  tie: ToonTie
}

const TOONS: Readonly<Record<string, Toon>> = {
  bibi: { heads: BIBI_HEADS, tie: { color: '#2d6cdf', length: 1 } },
  // the long red tie, streaming in the wind
  trump: { heads: TRUMP_HEADS, tie: { color: '#d7263d', length: 1.55 } },
}

/** A persona's caricature, or null for the personas drawn as monograms. */
export function toonFor(personaId: string | null | undefined): Toon | null {
  return (personaId && TOONS[personaId]) || null
}
