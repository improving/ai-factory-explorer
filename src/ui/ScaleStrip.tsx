import { useEffect, useMemo, useRef, useState } from 'react'
import { TILE_LEGEND, tileGrid, tilePos, tileState } from '../views/scaleView'

// One tile for each rack of the fleet, filled by its free GPUs: the scale of the fleet as a picture.
// The width comes from the panel, so the tiles keep their size when the panel is dragged.
export function ScaleStrip({ free, gpus, height = 96 }: { free: number[]; gpus: number; height?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(Math.max(120, Math.round(el.getBoundingClientRect().width)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const grid = useMemo(() => tileGrid(free.length, width, height), [free.length, width, height])
  const tiles = useMemo(() => free.map((f) => tileState(f, gpus)), [free, gpus])
  return (
    <div className="scale-strip" ref={box} data-testid="scale-strip">
      <svg viewBox={`0 0 ${grid.width} ${grid.height}`} width={grid.width} height={grid.height} role="img" aria-label={`${free.length} racks, ${tiles.filter((t) => t === 'full').length} full`}>
        {tiles.map((state, i) => {
          const p = tilePos(grid, i)
          return <rect key={i} x={p.x} y={p.y} width={grid.size} height={grid.size} className={`tile-${state}`} />
        })}
      </svg>
      <p className="scale-legend">
        {TILE_LEGEND.map((l) => (
          <span key={l.id}>
            <i className={`tile-${l.id}`} /> {l.label}
          </span>
        ))}
        <span className="muted">{free.length.toLocaleString('en-US')} racks</span>
      </p>
    </div>
  )
}
