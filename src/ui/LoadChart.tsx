import { useEffect, useRef, useState } from 'react'

export type LoadSeries = { id: string; label: string; color: string; values: (number | null)[] }

// A line for each series over the run, with a cursor line at the tick that the panel shows.
// The x axis is the 30 minutes; the y axis starts at zero, so a queue that grows is a slope and not a rescale.
// The chart measures its own width, so one unit of the viewBox is one pixel and the labels keep their size.
export function LoadChart({ series, cursor, height = 110, unit = '', format = (n: number) => String(n) }: { series: LoadSeries[]; cursor: number; height?: number; unit?: string; format?: (n: number) => string }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(Math.max(160, Math.round(el.getBoundingClientRect().width)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const m = { l: 46, r: 6, t: 8, b: 16 }
  const plotW = Math.max(20, width - m.l - m.r)
  const plotH = height - m.t - m.b
  const n = Math.max(...series.map((s) => s.values.length), 2)
  const top = Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0)))
  const px = (i: number) => m.l + (i / (n - 1)) * plotW
  const py = (v: number) => m.t + plotH - (v / top) * plotH
  const cx = px(Math.min(n - 1, Math.max(0, cursor)))
  // A label for each five minutes of the run.
  const step = Math.max(60, Math.round((n - 1) / 6 / 60) * 60)
  const ticks = Array.from({ length: Math.floor((n - 1) / step) + 1 }, (_, k) => k * step)
  return (
    <div className="load-chart-box" ref={box}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${series.map((s) => s.label).join(', ')} over the run`}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={m.l} x2={width - m.r} y1={py(top * f)} y2={py(top * f)} className="grid" />
        ))}
        <text x={m.l - 5} y={py(top) + 4} textAnchor="end" className="axis">
          {format(top)}
        </text>
        <text x={m.l - 5} y={py(0) + 4} textAnchor="end" className="axis">
          0
        </text>
        {series.map((s) => {
          const points = s.values
            .map((v, i) => (v === null ? null : `${px(i)},${py(v)}`))
            .filter((p): p is string => p !== null)
          return points.length > 1 ? <polyline key={s.id} points={points.join(' ')} fill="none" stroke={s.color} strokeWidth={1.5} /> : null
        })}
        <line x1={cx} x2={cx} y1={m.t} y2={m.t + plotH} className="cursor" />
        {ticks.map((i) => (
          <text key={i} x={px(i)} y={height - 4} textAnchor={i === 0 ? 'start' : 'middle'} className="axis">
            {`${Math.round(i / 60)}m`}
          </text>
        ))}
        {unit !== '' && (
          <text x={width - m.r} y={m.t + 8} textAnchor="end" className="axis">
            {unit}
          </text>
        )}
      </svg>
    </div>
  )
}
