// Critical power (CP) and W' from a power-duration curve, and FTP estimation.

/** A point on a power-duration curve. */
export interface PowerDurationPoint {
  /** Duration, s. */
  durationS: number
  /** Best mean power for that duration, W. */
  watts: number
}

export interface CpFit {
  /** Critical power, W (the slope of work against time). */
  cpW: number
  /** W', J (the intercept of work against time). */
  wPrimeJ: number
  /** Coefficient of determination of the work-time regression (0–1). */
  r2: number
  /** Number of points used. */
  n: number
}

export interface CpFitOptions {
  /** Shortest duration used, s (default 180; 120 is also common). */
  minS?: number
  /** Longest duration used, s (default 1200). */
  maxS?: number
}

/** Default shortest duration for the 2-parameter fit, s. */
export const CP_FIT_MIN_S = 180
/** Default longest duration for the 2-parameter fit, s. */
export const CP_FIT_MAX_S = 1200

/**
 * Monod & Scherrer 2-parameter critical-power model, W = CP·t + W', fitted by
 * ordinary least squares of work (J = W × s) against time (s).
 *
 * Only points with minS ≤ durationS ≤ maxS and watts > 0 are used. If a
 * duration appears more than once, its best power is kept. The fit needs at
 * least 3 distinct durations, with the longest at least twice the shortest.
 * It returns null otherwise, when it is degenerate, or when CP ≤ 0 or W' ≤ 0.
 *
 * Work against time is almost linear for any real data, so r² from this
 * regression is typically > 0.99. It rejects gross nonsense but does not tell
 * you whether the efforts were maximal.
 */
export function fitCriticalPower(points: readonly PowerDurationPoint[], opts: CpFitOptions = {}): CpFit | null {
  const minS = opts.minS ?? CP_FIT_MIN_S
  const maxS = opts.maxS ?? CP_FIT_MAX_S
  const best = new Map<number, number>()
  for (const { durationS: t, watts: w } of points) {
    if (!(t >= minS && t <= maxS) || !(w > 0) || !Number.isFinite(w)) continue
    best.set(t, Math.max(best.get(t) ?? 0, w))
  }
  const n = best.size
  if (n < 3) return null
  const ts = [...best.keys()]
  if (Math.max(...ts) < 2 * Math.min(...ts)) return null

  let meanT = 0
  let meanWork = 0
  for (const [t, w] of best) {
    meanT += t
    meanWork += w * t
  }
  meanT /= n
  meanWork /= n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const [t, w] of best) {
    const dx = t - meanT
    const dy = w * t - meanWork
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (!(sxx > 0) || !(syy > 0)) return null
  const cpW = sxy / sxx
  const wPrimeJ = meanWork - cpW * meanT
  const r2 = (sxy * sxy) / (sxx * syy)
  if (!(cpW > 0) || !(wPrimeJ > 0) || !Number.isFinite(cpW) || !Number.isFinite(wPrimeJ)) return null
  return { cpW, wPrimeJ, r2, n }
}

/** Minimum r² for estimateFtp to trust a CP fit. */
export const CP_FIT_MIN_R2 = 0.95
/** FTP as a fraction of the best 20-minute power (Allen & Coggan). */
export const FTP_FROM_20MIN = 0.95

export type FtpEstimate =
  | { ftpW: number; method: 'cp'; cp: CpFit }
  | { ftpW: number; method: '95pct-20min'; cp?: CpFit }
  | { ftpW: null; method: 'insufficient'; cp?: CpFit }

/**
 * Estimates FTP (W) from a power-duration curve:
 * 1. CP from fitCriticalPower, if r² ≥ 0.95 with ≥ 3 points. FTP is taken as
 *    equal to CP; with 3–20 min inputs CP usually sits within a few percent of FTP.
 * 2. Otherwise 0.95 × the best 20-minute (1200 s) power.
 * 3. Otherwise 'insufficient', with ftpW null.
 * A rejected fit is still returned in `cp`, for diagnostics. The estimate is
 * only as good as the efforts: sub-maximal rides give a low FTP.
 */
export function estimateFtp(mmp: readonly PowerDurationPoint[], opts: CpFitOptions = {}): FtpEstimate {
  const fit = fitCriticalPower(mmp, opts)
  if (fit && fit.r2 >= CP_FIT_MIN_R2 && fit.n >= 3) return { ftpW: fit.cpW, method: 'cp', cp: fit }
  let best20: number | null = null
  for (const p of mmp) {
    if (p.durationS === 1200 && p.watts > 0 && (best20 === null || p.watts > best20)) best20 = p.watts
  }
  const cp = fit ?? undefined
  if (best20 !== null) return { ftpW: FTP_FROM_20MIN * best20, method: '95pct-20min', cp }
  return { ftpW: null, method: 'insufficient', cp }
}
