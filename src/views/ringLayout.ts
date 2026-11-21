// The logical ring of Collectives mode, in SVG units: two rows, as a race track. Rank 0 is at the top left; the top
// row goes left to right, and the bottom row goes right to left, so each arrow is long enough to see (16 ranks too).
export const RING_W = 640
export const RING_H = 200
export const RING_R = 16 // the radius of a rank
const X0 = 40
const TOP = 50
const BOTTOM = 150

export function ringPos(i: number, n: number): { x: number; y: number } {
  const half = Math.ceil(n / 2)
  const dx = half > 1 ? (RING_W - 2 * X0) / (half - 1) : 0
  return i < half ? { x: X0 + i * dx, y: TOP } : { x: X0 + (n - 1 - i) * dx, y: BOTTOM }
}

// One row (Tree, PAT, AlltoAll): rank 0 on the left; the arrows are arcs above the row (tree 2: below it).
export function arcPos(i: number, n: number): { x: number; y: number } {
  return { x: X0 + (n > 1 ? (i * (RING_W - 2 * X0)) / (n - 1) : 0), y: RING_H / 2 }
}

// An arc between two ranks of one row, from the top (or the bottom) of a rank, and the place of its label: just inside
// the peak, so that the label stays in the box. The peak is at least 8 units from the edge of the box.
export function arcPath(a: { x: number; y: number }, b: { x: number; y: number }, below: boolean): { d: string; label: { x: number; y: number } } {
  const s = below ? 1 : -1
  const y0 = a.y + s * RING_R
  const lift = Math.min(Math.abs(b.x - a.x) * 0.35 + 20, RING_H / 2 - RING_R - 8)
  const peak = y0 + s * lift // a quadratic curve peaks at half of its control offset
  return { d: `M${a.x},${y0} Q${(a.x + b.x) / 2},${y0 + 2 * s * lift} ${b.x},${y0}`, label: { x: (a.x + b.x) / 2, y: below ? peak - 6 : peak + 14 } }
}
