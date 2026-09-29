import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

/**
 * Thin imperative wrapper: uPlot owns its canvas; React only hands it new
 * data. Rebuilds when `optsKey` changes, otherwise calls setData (cheap).
 */
export function UPlot({
  options,
  data,
  optsKey,
  height = 220,
  className,
  ariaLabel,
}: {
  options: (width: number) => Omit<uPlot.Options, 'width' | 'height'>
  data: uPlot.AlignedData
  optsKey: string
  height?: number
  className?: string
  ariaLabel: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)
  const dataRef = useRef(data)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const width = Math.max(200, el.clientWidth)
    plot.current = new uPlot({ ...options(width), width, height }, dataRef.current, el)
    const ro = new ResizeObserver(([e]) => {
      if (e && plot.current) plot.current.setSize({ width: Math.max(200, e.contentRect.width), height })
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      plot.current?.destroy()
      plot.current = null
    }
    // Rebuild only when the option set changes; data flows through setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optsKey, height])

  useEffect(() => {
    dataRef.current = data
    plot.current?.setData(data)
  }, [data])

  return <div ref={host} className={className} role="img" aria-label={ariaLabel} />
}
