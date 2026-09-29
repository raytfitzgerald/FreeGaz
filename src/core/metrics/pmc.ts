// Performance Management Chart (Banister impulse-response, as TrainingPeaks
// implements it): CTL (fitness), ATL (fatigue) and TSB (form) from daily TSS.

export interface PmcDay {
  /** Calendar day, YYYY-MM-DD. */
  date: string
  /** Training Stress Score for the day. */
  tss: number
}

export interface PmcRow {
  /** Calendar day, YYYY-MM-DD. */
  date: string
  /** Total TSS for the day (0 on rest days). */
  tss: number
  /** Chronic training load (fitness), TSS/day, after today's training. */
  ctl: number
  /** Acute training load (fatigue), TSS/day, after today's training. */
  atl: number
  /** Training stress balance (form) = yesterday's CTL − yesterday's ATL. */
  tsb: number
}

export interface PmcOptions {
  /** First day to output, YYYY-MM-DD (default: the earliest entry). Earlier entries still warm the model up. */
  from?: string
  /** Last day to output, YYYY-MM-DD (default: the latest entry). Later entries are ignored. */
  to?: string
  /** CTL time constant, days (default 42). */
  ctlDays?: number
  /** ATL time constant, days (default 7). */
  atlDays?: number
  /** CTL on the day before the computation starts (default 0). */
  startCtl?: number
  /** ATL on the day before the computation starts (default 0). */
  startAtl?: number
}

const MS_PER_DAY = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Daily PMC rows, one per calendar day from `from` to `to` inclusive.
 *
 * - Several entries on the same day are summed. Days with no entry get 0 TSS.
 * - CTL_t = CTL_{t−1} + (TSS_t − CTL_{t−1}) / ctlDays, and likewise for ATL with atlDays.
 * - TSB_t = CTL_{t−1} − ATL_{t−1}: today's form is yesterday's fitness minus yesterday's fatigue.
 * - The computation starts at the earlier of `from` and the first entry, seeded
 *   with startCtl and startAtl. Rows before `from` are computed but not returned.
 * - Dates are plain calendar days using UTC arithmetic, so time zones and DST
 *   cannot shift them. An invalid date (e.g. 2026-02-30) throws a RangeError.
 *   Entries with a non-finite TSS are skipped.
 */
export function computePmc(days: readonly PmcDay[], opts: PmcOptions = {}): PmcRow[] {
  const ctlDays = opts.ctlDays ?? 42
  const atlDays = opts.atlDays ?? 7
  if (!(ctlDays > 0) || !(atlDays > 0)) throw new RangeError('ctlDays and atlDays must be positive')

  const tssByDay = new Map<number, number>()
  let firstEntry: number | undefined
  let lastEntry: number | undefined
  for (const d of days) {
    if (!Number.isFinite(d.tss)) continue
    const n = dayNumber(d.date)
    tssByDay.set(n, (tssByDay.get(n) ?? 0) + d.tss)
    if (firstEntry === undefined || n < firstEntry) firstEntry = n
    if (lastEntry === undefined || n > lastEntry) lastEntry = n
  }
  const from = opts.from !== undefined ? dayNumber(opts.from) : firstEntry
  const to = opts.to !== undefined ? dayNumber(opts.to) : lastEntry
  if (from === undefined || to === undefined || to < from) return []

  const start = firstEntry !== undefined ? Math.min(from, firstEntry) : from
  let ctl = opts.startCtl ?? 0
  let atl = opts.startAtl ?? 0
  const rows: PmcRow[] = []
  for (let n = start; n <= to; n++) {
    const tss = tssByDay.get(n) ?? 0
    const tsb = ctl - atl
    ctl += (tss - ctl) / ctlDays
    atl += (tss - atl) / atlDays
    if (n >= from) rows.push({ date: isoDate(n), tss, ctl, atl, tsb })
  }
  return rows
}

// Days since 1970-01-01 for a YYYY-MM-DD string, or a RangeError for anything else.
function dayNumber(date: string): number {
  const m = ISO_DATE.exec(date)
  if (m) {
    const n = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY
    if (Number.isInteger(n) && isoDate(n) === date) return n
  }
  throw new RangeError(`invalid calendar date "${date}", expected YYYY-MM-DD`)
}

function isoDate(dayNum: number): string {
  return new Date(dayNum * MS_PER_DAY).toISOString().slice(0, 10)
}
