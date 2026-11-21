// The geometry of the minimap: model coordinates (Cytoscape) to map pixels, and back.
export type Box = { x1: number; y1: number; x2: number; y2: number }
export type Fit = { scale: number; dx: number; dy: number }

// The scale and the offset that fit the model box in a w × h map, centred, with `pad` pixels on each side.
export function fitBox(b: Box, w: number, h: number, pad = 4): Fit {
  const bw = Math.max(b.x2 - b.x1, 1)
  const bh = Math.max(b.y2 - b.y1, 1)
  const scale = Math.max(Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh), 1e-6)
  return { scale, dx: (w - bw * scale) / 2 - b.x1 * scale, dy: (h - bh * scale) / 2 - b.y1 * scale }
}

export const toMap = (f: Fit, b: Box): Box => ({ x1: b.x1 * f.scale + f.dx, y1: b.y1 * f.scale + f.dy, x2: b.x2 * f.scale + f.dx, y2: b.y2 * f.scale + f.dy })

export const toModel = (f: Fit, x: number, y: number) => ({ x: (x - f.dx) / f.scale, y: (y - f.dy) / f.scale })

// The pan that puts the model point p at the centre of a w × h canvas at this zoom.
export const panToCentre = (p: { x: number; y: number }, zoom: number, w: number, h: number) => ({ x: w / 2 - p.x * zoom, y: h / 2 - p.y * zoom })

// The smallest box that holds both boxes: the map fits the graph and the visible area together.
export const union = (a: Box, b: Box): Box => ({ x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) })
