// Fuel and drink reminders on moving time: drink every N minutes, and eat
// every 20 minutes from minute 30 (a third of the hourly carbohydrate target
// each time). Pure: the caller asks what fell due since the last call.

export interface FuelingPrefsLike {
  enabled: boolean
  carbsPerHourG: number
  drinkEveryMin: number
}

export type FuelingReminder = { kind: 'drink' } | { kind: 'eat'; grams: number }

export const EAT_EVERY_S = 20 * 60
export const FIRST_EAT_S = 30 * 60

export class FuelingTimer {
  private lastS = 0

  constructor(private readonly prefs: FuelingPrefsLike) {}

  /** Reminders whose time was crossed since the previous call (moving seconds). */
  due(movingS: number): FuelingReminder[] {
    const from = this.lastS
    this.lastS = Math.max(this.lastS, movingS)
    const p = this.prefs
    if (!p.enabled || movingS <= from) return []
    const out: FuelingReminder[] = []
    const drinkS = Math.max(60, p.drinkEveryMin * 60)
    if (Math.floor(movingS / drinkS) > Math.floor(from / drinkS)) out.push({ kind: 'drink' })
    const grams = Math.round(p.carbsPerHourG / 3 / 5) * 5
    const eatSlot = (s: number) => (s < FIRST_EAT_S ? -1 : Math.floor((s - FIRST_EAT_S) / EAT_EVERY_S))
    if (grams > 0 && eatSlot(movingS) > eatSlot(from)) out.push({ kind: 'eat', grams })
    return out
  }
}
