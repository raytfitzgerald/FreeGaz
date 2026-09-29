// uPlot axis and series presets for the house chart spec.
import type uPlot from 'uplot'
import { cssVar } from '../ui/zones'

/** Axis/grid styling per the house chart spec: hairline, solid, recessive. */
export function axis(opts: Partial<uPlot.Axis> = {}): uPlot.Axis {
  const ink = cssVar('--color-ink-faint')
  const grid = cssVar('--color-line')
  return {
    stroke: ink,
    grid: { stroke: grid, width: 1 },
    ticks: { stroke: grid, width: 1, size: 4 },
    font: '11px -apple-system, system-ui, sans-serif',
    ...opts,
  }
}

/** A 2px round-joined line series (with optional ~10 % area wash). */
export function line(label: string, colorVar: string, opts: Partial<uPlot.Series> & { wash?: boolean } = {}): uPlot.Series {
  const color = cssVar(colorVar)
  const { wash, ...rest } = opts
  return {
    label,
    stroke: color,
    width: 2,
    fill: wash ? `${color}1a` : undefined,
    points: { show: false },
    spanGaps: false,
    ...rest,
  }
}
