import { describe, expect, it } from 'vitest'
import { DESIGNS, type FabricDesign } from '../src/catalog/designs'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { fabricShape, generateFabric } from '../src/topology/fabric'
import { elementExists, serverExists } from '../src/topology/ids'

const cfg = (patch: Partial<Config>): Config => {
  const c = withPatch(DEFAULT_CONFIG, patch)
  if (!c) throw new Error(`not valid: ${JSON.stringify(patch)}`)
  return c
}
const forDesign = (d: FabricDesign, suCount: number) =>
  cfg({ platform: d.platforms[0]!, build: d.builds?.[0] ?? 'dgx', fabric: d.fabric, design: d.id, planes: d.planes, suCount })
const CASES = DESIGNS.flatMap((d) => d.rows.map((r) => ({ id: d.id, su: r.su, design: d })))

describe('generateFabric', () => {
  it('refuses a configuration that is not valid', () => {
    expect(() => generateFabric({ ...DEFAULT_CONFIG, suCount: 3 })).toThrow(/not valid/)
  })

  it.each(CASES)('$id at $su SU: the RA counts, the switch ports, and every spine', ({ design, su }) => {
    const config = forDesign(design, su)
    const g = generateFabric(config)
    const shape = fabricShape(config)
    const ids = new Set(g.nodes.map((n) => n.id))
    expect(ids.size).toBe(g.nodes.length)
    for (const e of g.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
    expect(g.nodes.filter((n) => n.kind === 'server')).toHaveLength(shape.row.nodes)
    expect(g.nodes.filter((n) => n.kind === 'leaf')).toHaveLength(shape.row.leaf)
    const leaf = g.nodes.find((n) => n.kind === 'leaf')
    if (!leaf) return
    const down = g.edges.filter((e) => e.target === leaf.id).length
    const up = g.edges.filter((e) => e.source === leaf.id)
    expect(down + up.length).toBeLessThanOrEqual(design.leafSwitch.ports.value)
    expect(new Set(up.map((e) => e.target)).size).toBe(shape.spinesPerPlane)
    expect(up.length).toBe(shape.perPair * shape.spinesPerPlane)
  })

  it('B300 XDR: port k of each server goes to the rail-k leaf of its SU', () => {
    const g = generateFabric(cfg({ suCount: 2 }))
    const nodes = new Map(g.nodes.map((n) => [n.id, n]))
    for (const e of g.edges.filter((x) => x.tier === 'node-leaf')) {
      const server = nodes.get(e.source)!
      const leaf = nodes.get(e.target)!
      expect(leaf.su).toBe(server.su)
      expect(leaf.rails).toEqual([e.rail])
    }
  })

  it('B300 Spectrum-X: each GPU has one cable to the rail leaf of each plane', () => {
    const g = generateFabric(cfg({ fabric: 'spectrum-x' }))
    const cables = g.edges.filter((e) => e.source === 'su1-n01')
    expect(cables).toHaveLength(16)
    expect(cables.filter((e) => e.rail === 3).map((e) => e.target).sort()).toEqual(['su1-leaf-pA-r3', 'su1-leaf-pB-r3'])
  })

  it('Enterprise RA: a leaf serves rails r and r + 4 of 32 nodes in each plane', () => {
    const g = generateFabric(cfg({ build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 8 }))
    const down = g.edges.filter((e) => e.target === 'su1-leaf-pA-r0+4')
    expect(down).toHaveLength(64)
    expect(new Set(down.map((e) => e.rail))).toEqual(new Set([0, 4]))
    expect(new Set(down.map((e) => e.source)).size).toBe(32)
  })

  it('GB300: racks 1-4 use leaf a and racks 5-8 use leaf b of each rail', () => {
    const g = generateFabric(cfg({ platform: 'gb300-nvl72', suCount: 2 }))
    const target = (tray: string) => g.edges.find((e) => e.source === tray && e.rail === 0)?.target
    expect(target('su1-n01')).toBe('su1-leaf-r0a')
    expect(target('su1-n72')).toBe('su1-leaf-r0a')
    expect(target('su1-n73')).toBe('su1-leaf-r0b')
    expect(target('su1-n144')).toBe('su1-leaf-r0b')
  })

  it('B200: SU 1 has no slot 32 (the UFM)', () => {
    const g = generateFabric(cfg({ platform: 'b200' }))
    expect(g.nodes.find((n) => n.id === 'su1-n32')).toBeUndefined()
    expect(g.edges.filter((e) => e.target === 'su1-leaf-r0')).toHaveLength(31)
  })

  it('GB200: one rack of 18 trays, no leaves, no cables', () => {
    const g = generateFabric(cfg({ platform: 'gb200-nvl72' }))
    expect(g.nodes.filter((n) => n.kind === 'server')).toHaveLength(18)
    expect(g.nodes.filter((n) => n.kind === 'leaf' || n.kind === 'spine')).toHaveLength(0)
    expect(g.edges).toHaveLength(0)
  })

  it('top-of-rack: each XDR leaf takes all the rails of 9 servers', () => {
    const g = generateFabric(cfg({ topology: 'tor' }))
    const down = g.edges.filter((e) => e.target === 'su1-leaf-tor1')
    expect(down).toHaveLength(72)
    expect(new Set(down.map((e) => e.source))).toEqual(new Set(['su1-n01', 'su1-n02', 'su1-n03', 'su1-n04', 'su1-n05', 'su1-n06', 'su1-n07', 'su1-n08', 'su1-n09']))
  })

  it('puts 4 servers in each rack, so 18 racks in a B300 XDR SU', () => {
    const g = generateFabric(cfg({}))
    expect(new Set(g.nodes.filter((n) => n.kind === 'server').map((n) => n.rack)).size).toBe(18)
  })
})

describe('ids', () => {
  it('knows which servers exist', () => {
    expect(serverExists(DEFAULT_CONFIG, 'su1-n72')).toBe(true)
    expect(serverExists(DEFAULT_CONFIG, 'su1-n73')).toBe(false)
    expect(serverExists(DEFAULT_CONFIG, 'su2-n01')).toBe(false)
    expect(serverExists(cfg({ platform: 'b200' }), 'su1-n32')).toBe(false)
    expect(serverExists(cfg({ platform: 'gb300-nvl72' }), 'su2-n144')).toBe(true)
  })
  it('knows which elements exist', () => {
    expect(elementExists(DEFAULT_CONFIG, 'spine-04')).toBe(true)
    expect(elementExists(DEFAULT_CONFIG, 'spine-05')).toBe(false)
    expect(elementExists(DEFAULT_CONFIG, 'su1-leaf-r7')).toBe(true)
    expect(elementExists(DEFAULT_CONFIG, 'su2-leaf-r0')).toBe(false)
    expect(elementExists(DEFAULT_CONFIG, 'su1-n05/gpu3')).toBe(true)
    expect(elementExists(DEFAULT_CONFIG, 'nonsense')).toBe(false)
    expect(elementExists(cfg({ platform: 'gb200-nvl72' }), 'su1-k1-sw3/chip0')).toBe(true)
    expect(elementExists(cfg({ platform: 'gb200-nvl72' }), 'su1-k2-sw3')).toBe(false)
  })
})

describe('dual plane: two independent fabrics', () => {
  it('Spectrum-X: a plane A leaf reaches only the 16 spines of plane A, and plane B the other 16', () => {
    const g = generateFabric(cfg({ fabric: 'spectrum-x' }))
    const spinesOf = (leaf: string) => new Set(g.edges.filter((e) => e.source === leaf).map((e) => e.target))
    const a = spinesOf('su1-leaf-pA-r0')
    const b = spinesOf('su1-leaf-pB-r0')
    expect(a.size).toBe(16)
    expect(b.size).toBe(16)
    expect([...a].filter((s) => b.has(s))).toEqual([])
    expect(g.nodes.find((n) => n.id === 'spine-17')?.plane).toBe(1)
  })
  it('Enterprise RA at 32 nodes: 2 spines in each plane', () => {
    const g = generateFabric(cfg({ build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 8 }))
    expect(new Set(g.edges.filter((e) => e.source === 'su1-leaf-pB-r0+4').map((e) => e.target))).toEqual(new Set(['spine-03', 'spine-04']))
  })
})
describe('the last SU fill', () => {
  it('has no server in the empty slots, and the leaves keep their port budget', () => {
    const c = cfg({ lastSuEmpty: 36 })
    expect(serverExists(c, 'su1-n36')).toBe(true)
    expect(serverExists(c, 'su1-n37')).toBe(false)
    const g = generateFabric(c)
    expect(g.nodes.find((n) => n.id === 'su1-n37')).toBeUndefined()
    expect(g.edges.filter((e) => e.target === 'su1-leaf-r0')).toHaveLength(36)
  })
})
