// Maps a route's grade to the grade sent to the trainer in SIM mode.

export interface SlopeScaling {
  /** Share of uphill grade passed on to the trainer, % (default 100). */
  uphillPct: number
  /** Share of downhill grade passed on to the trainer, % (default 50). */
  downhillPct: number
  /** Steepest uphill grade sent, % (default 20). */
  limitPct: number
  /** Steepest downhill grade sent, as a negative %. Defaults to −limitPct. */
  minPct?: number
}

export const DEFAULT_SLOPE_SCALING: Readonly<SlopeScaling> = { uphillPct: 100, downhillPct: 50, limitPct: 20 }

/**
 * Trainer grade (%) for a route grade (%). Uphill gives
 * min(g × uphillPct/100, limitPct). Downhill gives
 * max(g × downhillPct/100, minPct ?? −limitPct). A non-finite grade gives 0.
 */
export function trainerGrade(routeGradePct: number, s: Readonly<SlopeScaling> = DEFAULT_SLOPE_SCALING): number {
  if (!Number.isFinite(routeGradePct)) return 0
  const g =
    routeGradePct >= 0
      ? Math.min((routeGradePct * s.uphillPct) / 100, s.limitPct)
      : Math.max((routeGradePct * s.downhillPct) / 100, s.minPct ?? -s.limitPct)
  return g === 0 ? 0 : g // never −0
}
