import { useMemo } from 'react'
import type { RouteThumb } from '../../routes/route-codec'
import { gradeRuns } from '../../routes/geometry'
import { gradeVar } from '../../routes/grade'

const W = 300

/** A small, axis-free elevation profile for library cards, filled by grade (decorative: the card text carries the numbers). */
export function ElevationThumb({ thumb, height = 44 }: { thumb: RouteThumb; height?: number }) {
  const paths = useMemo(() => {
    const n = thumb.ele.length
    if (n === 0) return []
    const lo = Math.min(...thumb.ele)
    // At least 40 m tall, so a flat route stays flat.
    const top = Math.max(Math.max(...thumb.ele), lo + 40)
    const base = lo - (top - lo) * 0.15
    const y = (e: number) => height - ((e - base) / (top - base)) * height
    const x = (i: number) => (i / n) * W
    // Slice i spans [x(i), x(i+1)] and is sampled at its middle; an edge
    // between slices takes their mean, so neighbouring runs meet exactly.
    const edge = (k: number) => (k <= 0 ? thumb.ele[0]! : k >= n ? thumb.ele[n - 1]! : (thumb.ele[k - 1]! + thumb.ele[k]!) / 2)
    return gradeRuns(thumb.grade).map((r) => {
      let d = `M${x(r.from)},${height}L${x(r.from)},${y(edge(r.from))}`
      for (let i = r.from; i < r.to; i++) d += `L${x(i + 0.5)},${y(thumb.ele[i]!)}`
      d += `L${x(r.to)},${y(edge(r.to))}L${x(r.to)},${height}Z`
      return { d, cls: r.cls }
    })
  }, [thumb, height])
  if (paths.length === 0) return <div style={{ height }} aria-hidden="true" />
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={gradeVar(p.cls)} />
      ))}
    </svg>
  )
}
