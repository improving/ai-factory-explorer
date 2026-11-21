import { describe, expect, it } from 'vitest'
import { TILE_LEGEND, tileGrid, tilePos, tileState } from '../src/views/scaleView'

describe('the grid of the rack tiles', () => {
  it('puts one tile in one place', () => {
    const g = tileGrid(1, 600, 200)
    expect(g.cols).toBe(1)
    expect(g.rows).toBe(1)
    expect(g.size).toBe(8)
    expect([g.width, g.height]).toEqual([8, 8])
  })

  it('fills a row before it starts the next one', () => {
    const g = tileGrid(66, 600, 200)
    expect(g.cols).toBe(66)
    expect(g.rows).toBe(1)
    expect(tilePos(g, 0)).toEqual({ x: 0, y: 0 })
    expect(tilePos(g, 65)).toEqual({ x: 65 * (g.size + g.gap), y: 0 })
    expect(tilePos(g, 66)).toEqual({ x: 0, y: g.size + g.gap })
  })

  it('stays inside its width and its height', () => {
    for (const count of [1, 12, 144, 576, 1152, 4000]) {
      for (const width of [120, 320, 600, 900]) {
        for (const height of [40, 80, 200]) {
          const g = tileGrid(count, width, height)
          expect(g.width).toBeLessThanOrEqual(width)
          expect(g.cols * g.rows).toBeGreaterThanOrEqual(count)
          expect(g.cols * (g.rows - 1)).toBeLessThan(count) // no empty row
          expect(g.size).toBeGreaterThanOrEqual(2)
          if (g.size > 2) expect(g.height).toBeLessThanOrEqual(height)
        }
      }
    }
  })

  it('gives a smaller tile to a shorter space, and the maximum to a wide and tall one', () => {
    expect(tileGrid(1152, 900, 40).size).toBeLessThan(tileGrid(1152, 900, 200).size)
    expect(tileGrid(1152, 900, 200).size).toBe(8)
  })

  it('a space too small for every rack still gives tiles of two pixels', () => {
    const g = tileGrid(4000, 120, 20)
    expect(g.size).toBe(2)
    expect(g.height).toBeGreaterThan(20) // the panel scrolls
  })

  it('a count of zero or a width of zero still gives a grid', () => {
    expect(tileGrid(0, 0, 0).cols).toBe(1)
    expect(tileGrid(0, 0, 0).rows).toBe(1)
  })
})

describe('the fill of a tile', () => {
  it('is free, part, or full', () => {
    expect(tileState(32, 32)).toBe('free')
    expect(tileState(1, 32)).toBe('part')
    expect(tileState(0, 32)).toBe('full')
    expect(tileState(0, 0)).toBe('free')
  })

  it('names the three states of the legend', () => {
    expect(TILE_LEGEND.map((l) => l.id)).toEqual(['free', 'part', 'full'])
  })
})
