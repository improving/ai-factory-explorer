import { describe, expect, it } from 'vitest'
import { spreadLabels, thinTicks } from '../src/views/chartLayout'
import { RING_H, RING_R, RING_W, arcPath, arcPos, ringPos } from '../src/views/ringLayout'

describe('the layout of the logical ring', () => {
  it.each([8, 16])('leaves a visible arrow between each rank and the next one (n = %i)', (n) => {
    for (let i = 0; i < n; i++) {
      const a = ringPos(i, n)
      const b = ringPos((i + 1) % n, n)
      expect(Math.hypot(b.x - a.x, b.y - a.y) - 2 * RING_R, `rank ${i}`).toBeGreaterThanOrEqual(40)
    }
  })

  it('puts rank 0 at the top left and goes clockwise: the top row left to right, the bottom row right to left', () => {
    const p = (i: number) => ringPos(i, 8)
    expect(p(0).x).toBeLessThan(p(1).x)
    expect(p(3).y).toBe(p(0).y)
    expect(p(4).x).toBe(p(3).x)
    expect(p(4).y).toBeGreaterThan(p(3).y)
    expect(p(7).x).toBe(p(0).x)
  })

  it('arcPos: one row from left to right, with room for each rank, inside the box', () => {
    for (const n of [4, 8, 16]) {
      const xs = Array.from({ length: n }, (_, i) => arcPos(i, n).x)
      expect(xs.every((x, i) => i === 0 || x > xs[i - 1]! + 2 * RING_R)).toBe(true)
      expect(xs[0]!).toBeGreaterThanOrEqual(RING_R)
      expect(xs[n - 1]!).toBeLessThanOrEqual(RING_W - RING_R)
    }
  })

  it('arcPath: the label of each arc, above or below the row, stays inside the box (16 ranks, the longest arcs too)', () => {
    for (const below of [false, true]) {
      for (let j = 1; j < 16; j++) {
        const { label } = arcPath(arcPos(0, 16), arcPos(j, 16), below)
        expect(label.y, `rank 0 to rank ${j}`).toBeGreaterThanOrEqual(12)
        expect(label.y, `rank 0 to rank ${j}`).toBeLessThanOrEqual(RING_H - 4)
      }
    }
  })
})

describe('the label rules of the nccl-tests chart', () => {
  it('thinTicks keeps the first label, then each label at least minGap after the last kept one', () => {
    expect(thinTicks([0, 20, 40, 60, 120], 50)).toEqual([true, false, false, true, true])
    expect(thinTicks(Array.from({ length: 31 }, (_, i) => i * 17), 56).filter(Boolean)).toHaveLength(8) // every 4th label: 68 ≥ 56
  })

  it('spreadLabels moves labels apart, at least gap, and keeps their order', () => {
    expect(spreadLabels([100, 104], 14)).toEqual([95, 109])
    expect(spreadLabels([50, 200], 14)).toEqual([50, 200])
    const three = spreadLabels([100, 100, 100], 14)
    expect(three[1]! - three[0]!).toBeGreaterThanOrEqual(14)
    expect(three[2]! - three[1]!).toBeGreaterThanOrEqual(14)
  })
})
