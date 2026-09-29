// Grade classes for route profiles and maps. The colours are the sequential
// --color-grade-* tokens in styles.css; the label always travels with them.
// The edges sit on odd grades so the round numbers routes are built around
// (4, 6, 8, 12 %) land mid-class instead of flickering between two colours.

export interface GradeClass {
  /** Upper bound (exclusive), %. */
  below: number
  label: string
  name: string
}

export const GRADE_CLASSES: readonly GradeClass[] = [
  { below: 1, label: '< 1 %', name: 'Flat or downhill' },
  { below: 3, label: '1–3 %', name: 'Rolling' },
  { below: 5, label: '3–5 %', name: 'Climbing' },
  { below: 7, label: '5–7 %', name: 'Hard' },
  { below: 10, label: '7–10 %', name: 'Steep' },
  { below: Number.POSITIVE_INFINITY, label: '10 %+', name: 'Very steep' },
]

/** The class index of a grade, %. Non-finite grades count as flat. */
export function gradeClass(gradePct: number): number {
  if (!Number.isFinite(gradePct)) return 0
  const i = GRADE_CLASSES.findIndex((c) => gradePct < c.below)
  return i < 0 ? GRADE_CLASSES.length - 1 : i
}

export const gradeVar = (cls: number): string => `var(--color-grade-${Math.max(0, Math.min(GRADE_CLASSES.length - 1, cls))})`

/** "6.2 %", "−3.0 %" (a real minus sign), "0.0 %". */
export function formatGrade(gradePct: number | null | undefined): string {
  if (gradePct === null || gradePct === undefined || !Number.isFinite(gradePct)) return '—'
  const v = Math.round(gradePct * 10) / 10
  return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} %`
}
