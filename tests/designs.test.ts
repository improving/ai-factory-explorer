import { describe, expect, it } from 'vitest'
import { DESIGNS, designById, leafCount, raRow } from '../src/catalog/designs'
import type { PlatformId } from '../src/catalog/kinds'

describe.each(DESIGNS)('design $id', (d) => {
  it('has the leaves of its leaf rule in each RA row', () => {
    for (const r of d.rows) {
      const groups = r.su / d.susPerGroup
      expect(Number.isInteger(groups)).toBe(true)
      expect(leafCount(d) * groups).toBe(r.leaf)
    }
  })
  it('has the servers of its SUs, less the reserved slots', () => {
    for (const r of d.rows) {
      const reserved = d.reservedSlots.filter((s) => s.su <= r.su).length
      expect(r.nodes).toBe(d.serversPerSu.value * r.su - reserved)
    }
  })
  it('has a name, a short name, and a source', () => {
    expect(d.name.length).toBeGreaterThan(10)
    expect(d.short.length).toBeGreaterThan(5)
    expect(d.source).toMatch(/^https:\/\//)
  })
})

describe('the RA rows', () => {
  const rows = (id: Parameters<typeof designById>[0]) => designById(id).rows.map((r) => [r.su, r.nodes, r.leaf, r.spine])
  it('B300 XDR: Table 3', () => {
    expect(rows('b300-xdr')).toEqual([
      [1, 72, 8, 4],
      [2, 144, 16, 8],
      [4, 288, 32, 18],
      [8, 576, 64, 36],
      [18, 1296, 144, 72],
    ])
    expect(raRow(designById('b300-xdr'), 18)?.gpus).toBe(9216)
  })
  it('B300 Spectrum-X: Table 7, 4 SU', () => {
    expect(rows('b300-spx')).toEqual([[4, 256, 64, 32]])
  })
  it('Enterprise RA: Table 6, by nodes', () => {
    expect(rows('ent-b300')).toEqual([
      [8, 32, 8, 4],
      [16, 64, 16, 8],
      [32, 128, 32, 16],
    ])
  })
  it('H100: the architecture page, 4 SU', () => {
    expect(rows('ndr-h100')).toEqual([[4, 128, 32, 16]])
  })
  it('B200: one slot reserved for the UFM', () => {
    expect(rows('ndr-b200')).toEqual([
      [1, 31, 8, 4],
      [2, 63, 16, 8],
      [3, 95, 24, 16],
      [4, 127, 32, 16],
    ])
  })
  it('GB300: Table 3, trays', () => {
    expect(rows('gb300-xdr')).toEqual([
      [2, 288, 16, 8],
      [4, 576, 32, 18],
      [8, 1152, 64, 36],
      [16, 2304, 128, 72],
    ])
  })
  it('has no row for 3 SU in B300 XDR', () => {
    expect(raRow(designById('b300-xdr'), 3)).toBeUndefined()
  })
})

describe('the design list', () => {
  it('gives each platform at least one design', () => {
    const platforms: PlatformId[] = ['b300', 'b200', 'h100', 'h200', 'gb200-nvl72', 'gb300-nvl72']
    for (const p of platforms) expect(DESIGNS.some((d) => d.platforms.includes(p))).toBe(true)
  })
  it('shows the conflicts of the pages as notes', () => {
    expect(designById('ndr-h100').notes.join(' ')).toMatch(/probably a copy/)
    expect(designById('b300-spx').notes.join(' ')).toMatch(/Q3400/)
    expect(designById('ent-b300').notes.join(' ')).toMatch(/SN5610/)
  })
})
