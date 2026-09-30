// The FreeGaz wordmark and its track lines as React components. The letters
// and the measurement line take the text colour; the other lines are brand
// constants (styles.css --color-stayer, --color-sprinter, --color-azure).
import { WORDMARK } from '@shared/brand'

export function Wordmark({ className }: { className?: string }) {
  const l = WORDMARK.lines
  return (
    <svg viewBox={WORDMARK.viewBox} className={className} role="img" aria-label="FreeGaz">
      <path d={WORDMARK.word} fill="currentColor" />
      <path d={l.stayer} fill="var(--color-stayer)" />
      <path d={l.sprinter} fill="var(--color-sprinter)" />
      <path d={l.measure} fill="currentColor" />
      <path d={l.azure} fill="var(--color-azure)" />
    </svg>
  )
}

/** The track lines alone, leaning like the wordmark: a brand divider. */
export function TrackLines({ className }: { className?: string }) {
  const l = WORDMARK.lines
  return (
    <svg viewBox={WORDMARK.linesViewBox} preserveAspectRatio="xMinYMid meet" className={className} aria-hidden>
      <path d={l.stayer} fill="var(--color-stayer)" />
      <path d={l.sprinter} fill="var(--color-sprinter)" />
      <path d={l.measure} fill="currentColor" />
      <path d={l.azure} fill="var(--color-azure)" />
    </svg>
  )
}
