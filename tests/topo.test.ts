import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateServer } from '../src/topology/server'
import { topoMatrix } from '../src/topology/topo'

const m = topoMatrix(DEFAULT_CONFIG, 'su1-n05')!
const cell = (row: string, col: string) => m.rows.find((r) => r.head === row)!.cells[m.heads.indexOf(col)]!

describe('topoMatrix (DGX B300)', () => {
  it('has a row and a column for each GPU and each NIC', () => {
    expect(m.heads).toEqual(['GPU0', 'GPU1', 'GPU2', 'GPU3', 'GPU4', 'GPU5', 'GPU6', 'GPU7', 'NIC0', 'NIC1', 'NIC2', 'NIC3', 'NIC4', 'NIC5', 'NIC6', 'NIC7'])
    expect(m.rows.map((r) => r.head)).toEqual(m.heads)
  })
  it('gives NV18 between GPUs, X on the diagonal, and PIX between GPU i and NIC i (assumed)', () => {
    expect(cell('GPU0', 'GPU0').text).toBe('X')
    expect(cell('GPU0', 'GPU5')).toMatchObject({ text: 'NV18', status: 'assumed' })
    expect(cell('GPU3', 'NIC3')).toMatchObject({ text: 'PIX', status: 'assumed' })
    expect(cell('NIC3', 'GPU3')).toMatchObject({ text: 'PIX', status: 'assumed' })
  })
  it('gives NODE on the same NUMA node and SYS across NUMA nodes', () => {
    expect(cell('GPU0', 'NIC1').text).toBe('NODE')
    expect(cell('GPU0', 'NIC4').text).toBe('SYS')
    expect(cell('NIC0', 'NIC5').text).toBe('SYS')
  })
  it('names the two parts of each cell, and both are on the canvas', () => {
    const ids = new Set(generateServer(DEFAULT_CONFIG, 'su1-n05').nodes.map((n) => n.id))
    expect(cell('GPU2', 'NIC6')).toMatchObject({ a: 'su1-n05/gpu2', b: 'su1-n05/nic6' })
    for (const r of m.rows) for (const c of r.cells) expect(ids.has(c.a) && ids.has(c.b)).toBe(true)
  })
})

describe('topoMatrix of the other platforms', () => {
  it('DGX H100: the NVLink count is not sourced, and the NIC legend has the mlx5 names', () => {
    const h = topoMatrix(withPatch(DEFAULT_CONFIG, { platform: 'h100' })!, 'su1-n05')!
    expect(h.rows[0]!.cells[1]).toMatchObject({ text: 'NV?', status: 'not-sourced' })
    expect(h.nicNames[0]).toBe('NIC0: mlx5_0')
  })
  it('an NVL72 tray has no matrix', () => {
    expect(topoMatrix(withPatch(DEFAULT_CONFIG, { platform: 'gb200-nvl72' })!, 'su1-n05')).toBeNull()
  })
})
