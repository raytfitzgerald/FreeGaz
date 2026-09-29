// Default source priorities: dedicated sensors beat trainer-reported values.
import type { SensorHub } from './hub'
import type { Metric } from './types'

export const DEFAULT_PRIORITIES: Partial<Record<Metric, readonly string[]>> = {
  power: ['power:cps', 'trainer:ftms', 'trainer:wahoo-legacy'],
  cadence: ['power:cps', 'cadence:csc', 'trainer:ftms', 'trainer:wahoo-legacy'],
  hr: ['hr:hrs', 'coreTemp:core', 'trainer:ftms'],
  speed: ['trainer:ftms', 'trainer:wahoo-legacy', 'cadence:csc'],
}

export function applyDefaultPriorities(hub: SensorHub): void {
  for (const [metric, ids] of Object.entries(DEFAULT_PRIORITIES)) hub.setPriority(metric as Metric, [...ids])
}
