import { ALGORITHM_LABEL, COLLECTIVE_LABEL, type Op, type Schedule } from '../collectives/schedule'
import { useApp } from '../state/store'
import { select } from '../state/transitions'
import { RAIL_COLORS, railColor } from '../views/palette'
import { RING_H as H, RING_R as R, RING_W as W, arcPath, arcPos, ringPos } from '../views/ringLayout'

type P = { x: number; y: number }
// shift: a sideways offset (an NVLS leg to the switch and one from it do not lie on one line); trim: where the line
// stops at each end; labelAt: the place of the label on the line (0 is the start).
type Arrow = { key: string; a: P; b: P; chunks: Set<number>; op: Op; below: boolean; arc: boolean; shift: number; trim: [number, number]; labelAt: number }
const SWITCH: P = { x: W / 2, y: H / 2 } // the NVSwitch chips (NVLS)
const BOX = 28 // the trim at the NVSwitch box: the arrowheads stop before its text

// One arrow: a line between two rows, or an arc in one row. It has the colour of its chunk; with more than one chunk,
// the text colour and "×k". "+" marks an addition.
function ArrowView({ w }: { w: Arrow }) {
  const single = w.chunks.size === 1
  const chunk = [...w.chunks][0]!
  // A leg from the NVSwitch box with one chunk carries a sum or a copy that the switch made: no label.
  const label = w.key.startsWith('sw-') && single ? '' : `${w.op === 'reduce' ? '+' : ''}${single ? '' : `×${w.chunks.size}`}`
  let d: string
  let mid: P
  if (w.arc) {
    const g = arcPath(w.a, w.b, w.below)
    d = g.d
    mid = g.label
  } else {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
    const ux = (w.b.x - w.a.x) / len
    const uy = (w.b.y - w.a.y) / len
    const a = { x: w.a.x + ux * w.trim[0] - uy * w.shift, y: w.a.y + uy * w.trim[0] + ux * w.shift }
    const b = { x: w.b.x - ux * w.trim[1] - uy * w.shift, y: w.b.y - uy * w.trim[1] + ux * w.shift }
    d = `M${a.x},${a.y} L${b.x},${b.y}`
    mid = { x: a.x + (b.x - a.x) * w.labelAt, y: a.y + (b.y - a.y) * w.labelAt - 6 }
  }
  return (
    <g data-testid={`send-${w.key}`} className={single ? undefined : 'multi'}>
      <path d={d} fill="none" stroke={single ? railColor(chunk) : undefined} strokeWidth={3} markerEnd={single ? `url(#ring-arrow-${chunk % RAIL_COLORS.length})` : 'url(#ring-arrow-m)'} />
      {label && (
        <text className="ring-op" x={mid.x} y={mid.y}>
          {label}
        </text>
      )}
    </g>
  )
}

// The logical diagram: one circle for each rank and the arrows of the current step, one arrow for each sender and
// receiver. Ring and Broadcast: two rows. Tree, PAT, and AlltoAll: one row, with arcs (tree 2 below the row). NVLS:
// two rows and the NVSwitch chips in the middle. A click on a rank selects its GPU.
export function LogicalDiagram({ sc, step }: { sc: Schedule; step: number }) {
  const { set } = useApp()
  const n = sc.ranks.length
  const arc = sc.algorithm === 'tree' || sc.algorithm === 'pat' || sc.algorithm === 'p2p'
  const pos = (i: number) => (arc ? arcPos(i, n) : ringPos(i, n))
  const arrows = new Map<string, Arrow>()
  const add = (key: string, a: P, b: P, chunk: number, op: Op, more: Partial<Arrow> = {}) => {
    const w = arrows.get(key) ?? { key, a, b, chunks: new Set<number>(), op, below: false, arc: false, shift: 0, trim: [R, R], labelAt: 0.5, ...more }
    w.chunks.add(chunk)
    arrows.set(key, w)
  }
  for (const x of step >= 1 ? (sc.steps[step - 1]?.sends ?? []) : []) {
    if (x.via) {
      // NVLS: the leg to the switch and the leg from it, on two parallel lines; the label near the rank.
      add(`${x.from}-sw`, pos(x.from), SWITCH, x.chunk, x.op, { shift: 5, trim: [R, BOX], labelAt: 0.3 })
      add(`sw-${x.to}`, SWITCH, pos(x.to), x.chunk, x.op, { shift: 5, trim: [BOX, R], labelAt: 0.7 })
    } else add(`${x.from}-${x.to}`, pos(x.from), pos(x.to), x.chunk, x.op, { below: sc.algorithm === 'tree' && x.chunk === 1, arc })
  }
  // The base lines of the ring (a Broadcast chain has no line back to rank 0).
  const base = arc || sc.algorithm === 'nvls' ? [] : sc.ranks.map((_, i) => i).filter((i) => sc.collective !== 'broadcast' || i < n - 1)
  return (
    <svg className="ring-diagram" data-testid="ring-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${COLLECTIVE_LABEL[sc.collective]}, ${ALGORITHM_LABEL[sc.algorithm]}: ${n} ranks, step ${step}`}>
      <defs>
        {RAIL_COLORS.map((c, k) => (
          <marker key={k} id={`ring-arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
        <marker id="ring-arrow-m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" className="ring-multi-head" />
        </marker>
      </defs>
      {base.map((i) => {
        const a = pos(i)
        const b = pos((i + 1) % n)
        return <line key={`base-${i}`} className="ring-base" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      })}
      {sc.algorithm === 'nvls' && (
        <g className="ring-switch">
          <rect x={SWITCH.x - 44} y={SWITCH.y - 14} width={88} height={28} rx={4} />
          <text x={SWITCH.x} y={SWITCH.y + 4}>
            NVSwitch
          </text>
        </g>
      )}
      {[...arrows.values()].map((w) => (
        <ArrowView key={w.key} w={w} />
      ))}
      {sc.ranks.map((id, i) => {
        const p = pos(i)
        return (
          <g key={id} className="ring-rank" onClick={() => set((s) => select(s, id))}>
            <circle cx={p.x} cy={p.y} r={R} />
            <text x={p.x} y={p.y + 4}>
              {i}
            </text>
            <title>{`Rank ${i}: ${id}`}</title>
          </g>
        )
      })}
    </svg>
  )
}
