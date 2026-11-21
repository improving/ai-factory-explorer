import { useState } from 'react'
import { formatSize, type NcclRow } from '../collectives/ncclTests'
import { spreadLabels, thinTicks } from '../views/chartLayout'

// The two series of the chart (dataviz: validated for the light and the dark panel).
const OUT = '#0072B2'
const IN = '#D55E00'
const W = 640
const H = 240
const M = { l: 52, r: 104, t: 28, b: 34 }

// busbw against the message size (a log scale of the size): out-of-place and in-place, the limit of the model (dashed),
// and the threshold (dotted). A legend and direct labels name the series; the pointer shows a crosshair and the values
// of the nearest size. The table under the chart has the same values.
export function NcclChart({ rows, limit, threshold }: { rows: NcclRow[]; limit: number | null; threshold: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const sorted = [...rows].sort((a, b) => a.size - b.size)
  const lx = sorted.map((r) => Math.log2(r.size))
  const x0 = lx[0]!
  const x1 = Math.max(lx[lx.length - 1]!, x0 + 1)
  const yMax = Math.max(limit ?? 0, ...sorted.map((r) => Math.max(r.out.busbw, r.inp.busbw))) * 1.1 || 1
  const px = (i: number) => M.l + ((lx[i]! - x0) / (x1 - x0)) * (W - M.l - M.r)
  const py = (v: number) => H - M.b - (v / yMax) * (H - M.t - M.b)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax)
  const line = (k: 'out' | 'inp') => sorted.map((r, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(r[k].busbw)}`).join(' ')
  const last = sorted.length - 1
  const near = (clientX: number, box: DOMRect) => {
    const x = ((clientX - box.left) / box.width) * W
    let best = 0
    for (let i = 1; i < sorted.length; i++) if (Math.abs(px(i) - x) < Math.abs(px(best) - x)) best = i
    return best
  }
  const h = hover === null ? null : sorted[hover]!
  // The labels: the x labels at least 56 units apart; the series labels at the right of the last point, and the limit
  // and threshold labels at the left of their lines, each pair moved apart (dataviz: no label collision).
  const showX = thinTicks(sorted.map((_, i) => px(i)), 56)
  const [yOut, yIn] = spreadLabels([py(sorted[last]!.out.busbw), py(sorted[last]!.inp.busbw)], 14)
  const [yLimit, yThr] = limit !== null ? spreadLabels([py(limit) - 4, py((limit * threshold) / 100) - 4], 13) : [0, 0]
  return (
    <div className="nccl-chart" data-testid="nccl-chart">
      <div className="legend" aria-hidden="true">
        <span>
          <i style={{ background: OUT }} /> out-of-place
        </span>
        <span>
          <i style={{ background: IN }} /> in-place
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`busbw against the message size, ${sorted.length} sizes${limit ? `, limit ${limit.toFixed(1)} GB/s` : ''}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} />
            <text x={M.l - 6} y={py(v) + 4} textAnchor="end">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        <text x={M.l - 6} y={M.t - 12} textAnchor="end">
          GB/s
        </text>
        {sorted.map((r, i) => (
          <text key={r.size} x={px(i)} y={H - M.b + 16} textAnchor="middle">
            {showX[i] ? formatSize(r.size) : ''}
          </text>
        ))}
        {limit !== null && (
          <>
            <line className="limit" x1={M.l} x2={W - M.r} y1={py(limit)} y2={py(limit)} />
            <text className="label" x={M.l + 4} y={yLimit}>
              limit {limit.toFixed(0)} GB/s
            </text>
            <line className="threshold" x1={M.l} x2={W - M.r} y1={py((limit * threshold) / 100)} y2={py((limit * threshold) / 100)} />
            <text x={M.l + 4} y={yThr}>
              threshold {threshold} %
            </text>
          </>
        )}
        <path d={line('out')} fill="none" stroke={OUT} strokeWidth={2} />
        <path d={line('inp')} fill="none" stroke={IN} strokeWidth={2} />
        {sorted.map((r, i) => (
          <g key={r.size}>
            <circle cx={px(i)} cy={py(r.out.busbw)} r={5} fill={OUT} className="mark" />
            <circle cx={px(i)} cy={py(r.inp.busbw)} r={5} fill={IN} className="mark" />
          </g>
        ))}
        <text className="label" x={px(last) + 10} y={yOut! + 4}>
          out-of-place
        </text>
        <text className="label" x={px(last) + 10} y={yIn! + 4}>
          in-place
        </text>
        {hover !== null && <line className="cross" x1={px(hover)} x2={px(hover)} y1={M.t} y2={H - M.b} />}
        <rect
          className="hit"
          x={M.l}
          y={M.t}
          width={W - M.l - M.r}
          height={H - M.t - M.b}
          fill="transparent"
          onPointerMove={(e) => setHover(near(e.clientX, (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()))}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {h && hover !== null && (
        // In the right half, the tooltip is at the left of the crosshair, so that it stays inside the chart.
        <div className={`nccl-tip${px(hover) > W / 2 ? ' flip' : ''}`} style={{ left: `${(px(hover) / W) * 100}%` }} role="status">
          <strong>{formatSize(h.size)}</strong>
          <div>
            <i style={{ background: OUT }} /> {h.out.busbw.toFixed(2)} GB/s out-of-place
          </div>
          <div>
            <i style={{ background: IN }} /> {h.inp.busbw.toFixed(2)} GB/s in-place
          </div>
        </div>
      )}
    </div>
  )
}
