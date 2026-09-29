import { resolvePower, type Timeline } from '@core/workout/compile'
import type { ProfileBlock } from '../charts/WorkoutChart'

/** Timeline steps as chart blocks, in fractions of FTP. */
export function profileBlocks(tl: Timeline, ftpW: number): ProfileBlock[] {
  const frac = (t: Parameters<typeof resolvePower>[0] | null) => (t && ftpW > 0 ? resolvePower(t, ftpW) / ftpW : null)
  return tl.steps.map((s) => ({ startS: s.startS, endS: s.endS, from: frac(s.from), to: frac(s.to), kind: s.kind, label: s.label }))
}
