import { describe, expect, it } from 'vitest'
import { DESIGNS, type FabricDesign } from '../src/catalog/designs'
import { RACKS } from '../src/catalog/racks'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateFabric } from '../src/topology/fabric'
import { generateRacks, layoutOf, racksOfSu } from '../src/topology/racks'

const cfg = (patch: Partial<Config>): Config => {
  const c = withPatch(DEFAULT_CONFIG, patch)
  if (!c) throw new Error(`not valid: ${JSON.stringify(patch)}`)
  return c
}
const forDesign = (d: FabricDesign, suCount: number) =>
  cfg({ platform: d.platforms[0]!, build: d.builds?.[0] ?? 'dgx', fabric: d.fabric, design: d.id, planes: d.planes, suCount })
const CASES = DESIGNS.flatMap((d) => d.rows.map((r) => ({ id: d.id, su: r.su, d })))
const roles = (c: Config, su: number) => racksOfSu(c, su).map((r) => r.role)
const inRack = (c: Config, rack: string) => layoutOf(c).devices.filter((x) => x.rack === rack)

describe('the rack layout', () => {
  it('puts the default SU in 18 compute racks, 1 network rack, and 1 spine rack', () => {
    const r = roles(DEFAULT_CONFIG, 1)
    expect(r.filter((x) => x === 'compute')).toHaveLength(18)
    expect(r.filter((x) => x === 'network')).toHaveLength(1)
    expect(r.filter((x) => x === 'spine')).toHaveLength(1)
    expect(r).not.toContain('cdu')
  })
  it('stacks 4 DGX B300 from U1 and puts 3 PDUs at the top, at the rear', () => {
    const k1 = inRack(DEFAULT_CONFIG, 'su1-k1')
    expect(k1.filter((x) => x.kind === 'server').map((x) => [x.id, x.u, x.ru])).toEqual([
      ['su1-n01', 1, 10],
      ['su1-n02', 11, 10],
      ['su1-n03', 21, 10],
      ['su1-n04', 31, 10],
    ])
    expect(k1.filter((x) => x.kind === 'pdu').map((x) => [x.u, x.ru, x.face])).toEqual([
      [47, 2, 'rear'],
      [45, 2, 'rear'],
      [43, 2, 'rear'],
    ])
  })
  it('puts each leaf in the network rack of its group, 4U apart', () => {
    expect(layoutOf(DEFAULT_CONFIG).spot.get('su1-leaf-r3')).toMatchObject({ rack: 'su1-net1', u: 13, ru: 4 })
  })
  it.each(CASES)('$id at $su SU: every device fits its rack, and no two devices share a U', ({ d, su }) => {
    for (const cooling of ['air', 'liquid'] as const) {
      const c = withPatch(forDesign(d, su), { cooling })
      if (!c) continue
      const height = RACKS[d.id].height.value
      const byRack = new Map<string, Set<number>>()
      for (const x of layoutOf(c).devices) {
        if (x.ru === 0) continue
        expect(x.u, x.id).toBeGreaterThanOrEqual(1)
        expect(x.u + x.ru - 1, x.id).toBeLessThanOrEqual(height)
        const taken = byRack.get(x.rack) ?? new Set<number>()
        for (let u = x.u; u < x.u + x.ru; u++) {
          expect(taken.has(u), `${x.id} at U${u}`).toBe(false)
          taken.add(u)
        }
        byRack.set(x.rack, taken)
      }
    }
  })
  it.each(CASES)('$id at $su SU: every server, leaf, and spine of the fabric is in exactly one rack', ({ d, su }) => {
    const c = forDesign(d, su)
    const spot = layoutOf(c).spot
    const parts = generateFabric(c).nodes.filter((n) => ['server', 'leaf', 'spine'].includes(n.kind))
    for (const n of parts) expect(spot.has(n.id), n.id).toBe(true)
    expect(layoutOf(c).devices.filter((x) => ['server', 'leaf', 'spine'].includes(x.kind))).toHaveLength(parts.length)
  })
  it('shares the network rack of the Enterprise RA among the 8 SUs of a group', () => {
    const c = cfg({ build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 16 })
    expect(racksOfSu(c, 5).map((r) => r.id)).toEqual(['su5-k1', 'su1-net1', 'core-k1'])
    expect(racksOfSu(c, 9).map((r) => r.id)).toEqual(['su9-k1', 'su9-net1', 'core-k1'])
  })
  it('puts at most 10 spines in a spine rack', () => {
    expect(roles(cfg({ suCount: 8 }), 1).filter((x) => x === 'spine')).toHaveLength(4) // 36 spines
  })
  it('keeps the NVL72 tray order: 4 power shelves, trays 1-10, 9 switch trays, trays 11-18, 4 power shelves', () => {
    const c = cfg({ platform: 'gb300-nvl72' })
    const k1 = inRack(c, 'su1-k1')
    const at = (id: string) => k1.find((x) => x.id === id)?.u
    expect(at('su1-k1-ps1')).toBe(48)
    expect(at('su1-n01')).toBe(44)
    expect(at('su1-k1-sw1')).toBe(34)
    expect(at('su1-n18')).toBe(18)
    expect(at('su1-k1-ps8')).toBe(14)
    expect(k1.find((x) => x.kind === 'manifold')).toMatchObject({ face: 'rear', ru: 0 })
    expect(roles(c, 1)).toContain('cdu')
  })
  it('draws one compute rack and no network rack for GB200 (no fabric)', () => {
    expect(roles(cfg({ platform: 'gb200-nvl72' }), 1)).toEqual(['compute', 'cdu'])
  })
  it('keeps the racks of a partial last SU, with the empty slots empty', () => {
    const c = cfg({ lastSuEmpty: 36 })
    expect(roles(c, 1).filter((x) => x === 'compute')).toHaveLength(18)
    expect(inRack(c, 'su1-k10').filter((x) => x.kind === 'server')).toHaveLength(0)
    expect(inRack(c, 'su1-k9').filter((x) => x.kind === 'server')).toHaveLength(4)
  })
  it('makes a graph of the racks of one SU, with the devices in their racks', () => {
    const g = generateRacks(DEFAULT_CONFIG, 1)
    const racks = g.nodes.filter((n) => n.kind === 'rack')
    expect(racks).toHaveLength(20)
    expect(racks[0]).toMatchObject({ id: 'su1-k1', rackRole: 'compute', ru: 48 })
    expect(g.nodes.find((n) => n.id === 'su1-n05')).toMatchObject({ parent: 'su1-k2', u: 1, ru: 10, face: 'both' })
    expect(g.nodes).toHaveLength(20 + 72 + 18 * 3 + 8 + 3 + 4 + 3)
    expect(g.edges).toHaveLength(0)
  })
})
