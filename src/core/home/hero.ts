// The Home page hero's words: a time-of-day line and a headline that reads
// the rider's week and form. Plain interface voice (the coach gets the jokes).

export interface HeroInput {
  now: Date
  /** Non-simulated rides since Monday. */
  ridesThisWeek: number
  /** Non-simulated rides ever. */
  ridesEver: number
  /** Form (TSB) today, when there is any history. */
  tsb: number | null
}

export interface HeroWords {
  eyebrow: string
  title: string
  sub: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export function partOfDay(h: number): string {
  if (h < 5) return 'night'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 22) return 'evening'
  return 'night'
}

export function heroWords(i: HeroInput): HeroWords {
  const eyebrow = `${DAYS[i.now.getDay()]} ${partOfDay(i.now.getHours())}`
  const n = i.ridesThisWeek
  if (i.ridesEver === 0) return { eyebrow, title: 'The track is empty.', sub: 'Your first ride puts a rider on it. One lap each, every ride this week.' }
  if (n === 0) return { eyebrow, title: 'Nobody on the track this week.', sub: 'Lap one is the hardest one. After that it gets company.' }
  const laps = `${n} ride${n === 1 ? '' : 's'} on the track this week.`
  if (i.tsb !== null && i.tsb < -25) return { eyebrow, title: "You've earned an easy one.", sub: `${laps} Your form is ${Math.round(i.tsb)}: spin, don't sprint.` }
  if (i.tsb !== null && i.tsb > 5) return { eyebrow, title: 'Fresh legs. Spend them.', sub: `${laps} Form is +${Math.round(i.tsb)}, which is a polite way of saying go hard.` }
  return { eyebrow, title: n >= 4 ? 'The track is getting crowded.' : 'Keep the wheels turning.', sub: laps }
}
