import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateServer } from '../src/topology/server'

const gb200 = withPatch(DEFAULT_CONFIG, { platform: 'gb200-nvl72' })!
const gb300 = withPatch(DEFAULT_CONFIG, { platform: 'gb300-nvl72' })!
const rack = generateServer(gb200, 'su1-n05')
const of = (kind: string) => rack.nodes.filter((n) => n.kind === kind)

describe('generateRack (GB200 NVL72)', () => {
  it('has the parts of one rack', () => {
    expect(of('rack')).toHaveLength(1)
    expect(of('tray')).toHaveLength(18)
    expect(of('switch-tray')).toHaveLength(9)
    expect(of('nvswitch')).toHaveLength(18)
    expect(of('power-shelf')).toHaveLength(8)
    expect(of('gpu')).toHaveLength(72)
    expect(of('cpu')).toHaveLength(36)
    expect(of('dpu')).toHaveLength(36)
    expect(rack.nodes).toHaveLength(297)
    expect(rack.edges).toHaveLength(1476)
  })
  it('links each GPU to all 18 NVSwitch chips, and to its Grace CPU over C2C', () => {
    const gpu = 'su1-n05/gpu2'
    const chips = rack.edges.filter((e) => e.source === gpu && e.network === 'nvlink').map((e) => e.target)
    expect(new Set(chips).size).toBe(18)
    expect(rack.edges.find((e) => e.source === gpu && e.network === 'c2c')?.target).toBe('su1-n05/cpu1')
  })
  it('only has edges between parts that exist', () => {
    const ids = new Set(rack.nodes.map((n) => n.id))
    for (const e of rack.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
  })
})

describe('generateRack (GB300 NVL72)', () => {
  it('opens the rack of the tray: tray 20 is in rack 2 with trays 19 to 36', () => {
    const r2 = generateServer(gb300, 'su1-n20')
    expect(r2.nodes.find((n) => n.kind === 'rack')?.id).toBe('su1-k2')
    const trays = r2.nodes.filter((n) => n.kind === 'tray').map((n) => n.id)
    expect(trays[0]).toBe('su1-n19')
    expect(trays.at(-1)).toBe('su1-n36')
  })
  it('has one BlueField-3 for each tray (the GB300 RA)', () => {
    expect(generateServer(gb300, 'su1-n01').nodes.filter((n) => n.kind === 'dpu')).toHaveLength(18)
  })
})
