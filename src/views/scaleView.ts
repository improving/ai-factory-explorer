// The grid of the rack tiles of the load fleet: one tile for each rack, inside a width and a height.
// A tile of 8 px shows a fleet of a thousand racks as a picture, which a graph of a thousand servers does not.
export type TileGrid = { cols: number; rows: number; size: number; gap: number; width: number; height: number }

// The largest tile that keeps every rack inside the space: a big tile on a wide panel, a small one on a short one.
export function tileGrid(count: number, width: number, height: number, max = 8, gap = 1): TileGrid {
  const n = Math.max(1, Math.round(count))
  const w = Math.max(40, Math.round(width))
  const h = Math.max(20, Math.round(height))
  const grid = (size: number): TileGrid => {
    const cols = Math.max(1, Math.min(n, Math.floor((w + gap) / (size + gap))))
    const rows = Math.ceil(n / cols)
    return { cols, rows, size, gap, width: cols * (size + gap) - gap, height: rows * (size + gap) - gap }
  }
  for (let size = Math.max(2, Math.round(max)); size > 2; size--) {
    const g = grid(size)
    if (g.height <= h) return g
  }
  return grid(2) // a space too small for every rack: the panel scrolls
}

export const tilePos = (grid: TileGrid, index: number): { x: number; y: number } => ({
  x: (index % grid.cols) * (grid.size + grid.gap),
  y: Math.floor(index / grid.cols) * (grid.size + grid.gap),
})

// The fill of a tile: the rack is free, partly used, or full.
export type TileState = 'free' | 'part' | 'full'
export const tileState = (free: number, gpus: number): TileState => (gpus <= 0 || free >= gpus ? 'free' : free <= 0 ? 'full' : 'part')

export const TILE_LEGEND: { id: TileState; label: string }[] = [
  { id: 'free', label: 'free' },
  { id: 'part', label: 'in use' },
  { id: 'full', label: 'full' },
]
