import { describe, expect, it } from 'vitest'
import { PowerMatch } from './power-match'

describe('PowerMatch', () => {
  it('learns the pedal/trainer ratio and scales the command to hit the target on the pedals', () => {
    const pm = new PowerMatch()
    const target = 200
    let factor = 1
    // Pedals read 5 % below the trainer.
    for (let t = 0; t <= 30_000; t += 250) {
      const trainer = target * factor
      factor = pm.update({ now: t, ergSteady: true, pedalW: trainer * 0.95, trainerW: trainer })
    }
    expect(Math.abs(target * factor * 0.95 - target) / target).toBeLessThan(0.02)
    expect(pm.active).toBe(true)
  })

  it('waits for steady ERG and ignores implausible or tiny readings', () => {
    const pm = new PowerMatch()
    expect(pm.update({ now: 0, ergSteady: false, pedalW: 190, trainerW: 200 })).toBe(1)
    expect(pm.update({ now: 1000, ergSteady: true, pedalW: 190, trainerW: 200 })).toBe(1) // not steady for 5 s yet
    expect(pm.update({ now: 7000, ergSteady: true, pedalW: 100, trainerW: 200 })).toBe(1) // 50 % apart: a fault, not a calibration
    expect(pm.update({ now: 11_000, ergSteady: true, pedalW: 40, trainerW: 45 })).toBe(1) // too little power to judge
    expect(pm.update({ now: 15_000, ergSteady: true, pedalW: 190, trainerW: 200 })).toBeCloseTo(1 / 0.95, 6)
  })

  it('never corrects by more than 15 %', () => {
    const pm = new PowerMatch()
    for (let t = 0; t < 60_000; t += 1000) pm.update({ now: t, ergSteady: true, pedalW: 164, trainerW: 200 })
    expect(pm.factor).toBeCloseTo(1.15, 6)
  })
})
