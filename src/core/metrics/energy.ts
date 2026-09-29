// Energy expenditure estimates from mechanical work. These are rough
// estimates for display, not nutrition advice.

/** Kilojoules per kilocalorie (thermochemical calorie). */
export const KJ_PER_KCAL = 4.184

/**
 * Metabolic energy (kcal) behind `kj` of mechanical work at the pedals.
 *
 * Metabolic kcal = mechanical kJ / (gross efficiency × 4.184). At a typical
 * gross efficiency of about 24 % (1/4.184 ≈ 23.9 %), the two cancel and
 * 1 kJ at the pedals ≈ 1 kcal burned. That 1:1 is the default and is returned
 * exactly.
 * @param kj mechanical work, kJ
 * @param grossEfficiency optional gross efficiency (0–1) to use instead of the 1:1 rule
 */
export function kcalFromKj(kj: number, grossEfficiency?: number): number {
  if (grossEfficiency === undefined) return kj
  if (!(grossEfficiency > 0 && grossEfficiency <= 1)) throw new RangeError('grossEfficiency must be in (0, 1]')
  return kj / (grossEfficiency * KJ_PER_KCAL)
}

/**
 * Fraction of energy from carbohydrate (0–1) at an intensity: 50 % at
 * IF ≤ 0.6, rising linearly to 95 % at IF ≥ 1.0. This is a crude estimate of
 * the crossover concept (Brooks & Mercier 1994). Individual values vary widely.
 * @param intensityFactor NP / FTP (dimensionless)
 */
export function carbFraction(intensityFactor: number): number {
  const t = Math.min(1, Math.max(0, (intensityFactor - 0.6) / 0.4))
  return 0.5 + t * 0.45
}

/**
 * Carbohydrate burned, g (an estimate): kcalFromKj(kj) × carbFraction(IF) / 4,
 * using 4 kcal per gram.
 * @param kj mechanical work, kJ
 * @param intensityFactor NP / FTP of the effort (dimensionless)
 */
export function carbsBurnedG(kj: number, intensityFactor: number): number {
  return (kcalFromKj(kj) * carbFraction(intensityFactor)) / 4
}
