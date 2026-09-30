// A plain-language read of the Fitness page, written by the app itself: what
// fitness, fatigue and form mean today, the six-week trend, and what FTP the
// recent power suggests. It is what riders without an AI provider see, and
// the facts it is built from are what the AI overview is given.

export interface FitnessFacts {
  /** Today's fitness (CTL), fatigue (ATL) and form (TSB); null with no rides. */
  ctl: number | null
  atl: number | null
  tsb: number | null
  /** Fitness six weeks ago, when the history reaches back that far. */
  ctl42dAgo: number | null
  /** TSS per week, oldest first, the current (partial) week last. */
  weeklyTss: readonly number[]
  /** Rides in the last 28 days. */
  rides28d: number
  ftpW: number | null
  /** FTP estimated from the last 90 days of power. */
  eftpW: number | null
}

const r = Math.round

function formLine(tsb: number): string {
  if (tsb < -30) return `Form (TSB, fitness minus fatigue) is ${r(tsb)}: you are very tired, and an easy day or two would pay off more than another hard one.`
  if (tsb < -10) return `Form (TSB, fitness minus fatigue) is ${r(tsb)}: the productive kind of tired that comes with building, so keep the hard days hard and the easy days easy.`
  if (tsb <= 5) return `Form (TSB, fitness minus fatigue) is ${tsb > 0 ? '+' : ''}${r(tsb)}: fresh enough for a proper session.`
  return `Form (TSB, fitness minus fatigue) is +${r(tsb)}: you are rested, which makes it a good day for a hard workout or an FTP test.`
}

function trendLine(ctl: number, before: number | null): string | null {
  if (before === null) return null
  const d = ctl - before
  if (d >= 3) return `That is up ${r(d)} over six weeks: you are building.`
  if (d <= -3) return `That is down ${r(-d)} over six weeks, so you have been riding less than before.`
  return 'That has held steady over six weeks.'
}

function loadLine(weeks: readonly number[], rides28d: number): string | null {
  const full = weeks.slice(0, -1).slice(-4)
  if (full.length === 0) return null
  const avg = full.reduce((a, b) => a + b, 0) / full.length
  const spread = Math.max(...full) - Math.min(...full)
  const steady = avg > 0 && spread <= avg * 0.5
  return `You averaged ${r(avg)} TSS a week over the last four weeks across ${rides28d} ride${rides28d === 1 ? '' : 's'}${avg > 0 ? (steady ? ', and steadily' : ', with some big swings week to week') : ''}.`
}

function ftpLine(ftp: number | null, eftp: number | null): string | null {
  if (ftp === null && eftp === null) return null
  if (ftp === null) return `Your recent power suggests an FTP of about ${r(eftp!)} W; set it or take a test so zones and targets fit.`
  if (eftp === null) return `Your FTP is set to ${r(ftp)} W. A few hard efforts would let the app check it against your power.`
  const ratio = eftp / ftp
  if (ratio >= 1.03) return `Your FTP is set to ${r(ftp)} W, but your recent power suggests about ${r(eftp)} W: a test is probably due.`
  if (ratio <= 0.95) return `Your FTP is set to ${r(ftp)} W and your recent best efforts point to about ${r(eftp)} W. Either you haven't gone hard lately or the FTP is set a little high.`
  return `Your FTP of ${r(ftp)} W matches what your recent power says (about ${r(eftp)} W).`
}

/** One paragraph, or a short nudge when there is nothing to read yet. */
export function fitnessOverview(f: FitnessFacts): string {
  if (f.ctl === null || f.atl === null || f.tsb === null) {
    return 'There are no rides to read yet. Ride a few times, ideally with one hard session, and this fills in with your fitness, fatigue and form.'
  }
  const parts = [
    `Your fitness (CTL, your average daily load over six weeks) is ${r(f.ctl)} and your fatigue (ATL, the last week) is ${r(f.atl)}.`,
    trendLine(f.ctl, f.ctl42dAgo),
    formLine(f.tsb),
    loadLine(f.weeklyTss, f.rides28d),
    ftpLine(f.ftpW, f.eftpW),
  ]
  return parts.filter((p): p is string => p !== null).join(' ')
}
