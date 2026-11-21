import { describe, expect, it } from 'vitest'
import { fitBox, panToCentre, toMap, toModel, union } from '../src/ui/minimapGeom'

describe('minimap geometry', () => {
  it('fits a box that has the shape of the map exactly', () => {
    expect(fitBox({ x1: 0, y1: 0, x2: 100, y2: 50 }, 200, 100, 0)).toEqual({ scale: 2, dx: 0, dy: 0 })
  })

  it('centres a box that is narrower than the map', () => {
    const f = fitBox({ x1: 100, y1: 100, x2: 200, y2: 200 }, 200, 100, 0)
    expect(f.scale).toBe(1)
    expect(toMap(f, { x1: 100, y1: 100, x2: 200, y2: 200 })).toEqual({ x1: 50, y1: 0, x2: 150, y2: 100 })
  })

  it('toModel is the inverse of toMap', () => {
    const f = fitBox({ x1: -40, y1: 10, x2: 360, y2: 210 }, 200, 130)
    const m = toMap(f, { x1: 0, y1: 50, x2: 0, y2: 50 })
    const p = toModel(f, m.x1, m.y1)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(50)
  })

  it('an empty box (one point) does not divide by zero', () => {
    const f = fitBox({ x1: 5, y1: 5, x2: 5, y2: 5 }, 200, 130)
    expect(Number.isFinite(f.scale) && Number.isFinite(f.dx) && Number.isFinite(f.dy)).toBe(true)
  })

  it('a map smaller than the padding gives a scale above zero', () => {
    expect(fitBox({ x1: 0, y1: 0, x2: 10, y2: 10 }, 4, 4, 4).scale).toBeGreaterThan(0)
  })

  it('the pan puts the point at the centre of the canvas', () => {
    expect(panToCentre({ x: 10, y: 20 }, 2, 100, 100)).toEqual({ x: 30, y: 10 })
  })

  it('the union holds both boxes, so the visible area is always inside the map', () => {
    expect(union({ x1: 0, y1: 0, x2: 100, y2: 50 }, { x1: -20, y1: 10, x2: 80, y2: 90 })).toEqual({ x1: -20, y1: 0, x2: 100, y2: 90 })
  })
})
