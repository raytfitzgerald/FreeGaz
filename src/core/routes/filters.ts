// Signal-processing primitives for the elevation pipeline (smooth.ts). They
// all work on uniformly spaced samples and return new arrays.
//
// References
//   Savitzky A, Golay MJE (1964). Smoothing and differentiation of data by
//     simplified least squares procedures. Analytical Chemistry 36(8):1627-1639.
//   Gorry PA (1990). General least-squares smoothing and differentiation by the
//     convolution (Savitzky-Golay) method. Analytical Chemistry 62(6):570-573.
//   Schafer RW (2011). What is a Savitzky-Golay filter? IEEE Signal Processing
//     Magazine 28(4):111-117.
//   Tukey JW (1977). Exploratory Data Analysis. Addison-Wesley. Running
//     medians and the end-point rule; R implements the same rule as
//     runmed(endrule = "median") / smoothEnds().

/**
 * Running median over `window` samples (rounded down to odd), for spike
 * removal. It passes any monotone stretch through unchanged and removes
 * features narrower than about half the window. Near the ends the window
 * shrinks symmetrically, and the two end samples use Tukey's end-point rule
 *   y[0] = median(x[0], y[1], 3 y[1] - 2 y[2])
 * so a spike on the very first or last sample goes too, without flattening a
 * climb that starts at the first sample.
 */
export function runningMedian(x: ArrayLike<number>, window: number): Float64Array {
  const n = x.length
  const out = Float64Array.from(x)
  const half = Math.floor(Math.floor(window) / 2)
  if (half < 1 || n < 3) return out
  const buf: number[] = []
  for (let i = 1; i < n - 1; i++) {
    const k = Math.min(half, i, n - 1 - i)
    buf.length = 0
    for (let j = i - k; j <= i + k; j++) buf.push(x[j]!)
    buf.sort((a, b) => a - b)
    out[i] = buf[k]!
  }
  out[0] = median3(x[0]!, out[1]!, 3 * out[1]! - 2 * out[2]!)
  out[n - 1] = median3(x[n - 1]!, out[n - 2]!, 3 * out[n - 2]! - 2 * out[n - 3]!)
  return out
}

/**
 * Savitzky-Golay weights: the least-squares polynomial of degree `order`
 * through 2 half + 1 equally spaced samples, evaluated at offset `at`
 * (-half..half, 0 = centre), written as weights on the samples. The weights
 * come from the normal equations on the abscissa scaled to [-1, 1], which
 * gives the same fit as Gorry's Gram-polynomial method and stays well
 * conditioned for long windows. They sum to 1 and reproduce any polynomial of
 * degree <= order exactly.
 */
export function savitzkyGolayWeights(half: number, order: number, at = 0): Float64Array {
  if (!Number.isInteger(half) || half < 0) throw new RangeError('half must be a non-negative integer')
  const size = 2 * half + 1
  const degree = Math.max(0, Math.min(Math.floor(order), size - 1))
  const terms = degree + 1
  const scale = half > 0 ? 1 / half : 1
  const moments = new Array<number>(2 * degree + 1).fill(0)
  for (let j = -half; j <= half; j++) {
    let pw = 1
    for (let k = 0; k <= 2 * degree; k++) {
      moments[k] = moments[k]! + pw
      pw *= j * scale
    }
  }
  const normal = Array.from({ length: terms }, (_, r) => Array.from({ length: terms }, (_, c) => moments[r + c]!))
  const coef = solve(
    normal,
    Array.from({ length: terms }, (_, k) => (at * scale) ** k),
  )
  const w = new Float64Array(size)
  for (let j = -half; j <= half; j++) {
    let pw = 1
    let s = 0
    for (let k = 0; k < terms; k++) {
      s += coef[k]! * pw
      pw *= j * scale
    }
    w[j + half] = s
  }
  return w
}

/**
 * Savitzky-Golay smoothing over `window` samples (rounded down to odd, and
 * shrunk to fit short series). Interior samples use the symmetric centre
 * weights, so the filter is zero-phase: features stay where they are. The
 * first and last half-window are read off the polynomial fitted to the first
 * and last full window (SciPy's savgol_filter mode='interp').
 */
export function savitzkyGolay(x: ArrayLike<number>, window: number, order: number): Float64Array {
  const n = x.length
  let size = Math.min(Math.floor(window), n)
  if (size % 2 === 0) size -= 1
  const out = Float64Array.from(x)
  if (size < 3) return out
  const half = (size - 1) / 2
  const degree = Math.min(order, size - 1)
  const centre = savitzkyGolayWeights(half, degree)
  for (let i = half; i < n - half; i++) out[i] = dot(centre, x, i - half)
  for (let i = 0; i < half; i++) {
    out[i] = dot(savitzkyGolayWeights(half, degree, i - half), x, 0)
    out[n - 1 - i] = dot(savitzkyGolayWeights(half, degree, half - i), x, n - size)
  }
  return out
}

/**
 * Zero-phase slew-rate limiter: the mean of a forward and a backward
 * rate-limited pass, where maxStep[i] bounds |y[i + 1] - y[i]|. Each pass
 * honours the bound, so their mean does too. A signal that already complies
 * passes through unchanged, and a step becomes a ramp centred on the step
 * (at half the allowed rate) instead of one that lags behind it.
 */
export function limitRate(x: ArrayLike<number>, maxStep: ArrayLike<number>): Float64Array {
  const n = x.length
  const out = new Float64Array(n)
  if (n === 0) return out
  const fwd = new Float64Array(n)
  const bwd = new Float64Array(n)
  fwd[0] = x[0]!
  for (let i = 1; i < n; i++) fwd[i] = clamp(x[i]!, fwd[i - 1]! - maxStep[i - 1]!, fwd[i - 1]! + maxStep[i - 1]!)
  bwd[n - 1] = x[n - 1]!
  for (let i = n - 2; i >= 0; i--) bwd[i] = clamp(x[i]!, bwd[i + 1]! - maxStep[i]!, bwd[i + 1]! + maxStep[i]!)
  for (let i = 0; i < n; i++) out[i] = (fwd[i]! + bwd[i]!) / 2
  return out
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function median3(a: number, b: number, c: number): number {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c))
}

function dot(w: Float64Array, x: ArrayLike<number>, start: number): number {
  let s = 0
  for (let j = 0; j < w.length; j++) s += w[j]! * x[start + j]!
  return s
}

/** Solves a small dense system a v = b (Gaussian elimination, partial pivoting). Mutates its inputs. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r
    if (piv !== col) {
      const rowSwap = a[col]!
      a[col] = a[piv]!
      a[piv] = rowSwap
      const rhsSwap = b[col]!
      b[col] = b[piv]!
      b[piv] = rhsSwap
    }
    const top = a[col]!
    const p = top[col]!
    if (p === 0) throw new Error('singular least-squares system')
    for (let r = col + 1; r < n; r++) {
      const row = a[r]!
      const f = row[col]! / p
      if (f === 0) continue
      for (let c = col; c < n; c++) row[c] = row[c]! - f * top[c]!
      b[r] = b[r]! - f * b[col]!
    }
  }
  const v = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    const row = a[r]!
    let s = b[r]!
    for (let c = r + 1; c < n; c++) s -= row[c]! * v[c]!
    v[r] = s / row[r]!
  }
  return v
}
