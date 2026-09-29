import { describe, expect, it } from 'vitest'
import * as metrics from './index'
import * as physics from '../physics/index'

describe('barrel exports', () => {
  it('load at runtime and expose the public API', () => {
    for (const name of [
      'RollingMean',
      'NormalizedPowerAccumulator',
      'normalizedPower',
      'trainingStressScore',
      'WPrimeBalance',
      'wPrimeBalanceIntegral',
      'TimeInZones',
      'zoneFor',
      'meanMaxPower',
      'mergeMmp',
      'fitCriticalPower',
      'estimateFtp',
      'aerobicDecoupling',
      'HrDriftAccumulator',
      'cleanRr',
      'dfaAlpha1',
      'computePmc',
      'carbsBurnedG',
      'summarizeRide',
      'isValidSample',
    ]) {
      expect(metrics, name).toHaveProperty(name)
    }
    for (const name of ['steadySpeedForPower', 'stepSpeed', 'powerForSpeed', 'airDensity', 'cwFromCda', 'trainerGrade', 'DEFAULT_BIKE']) {
      expect(physics, name).toHaveProperty(name)
    }
  })
})
