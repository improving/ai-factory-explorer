import { describe, expect, it } from 'vitest'
import { DESIGNS, type FabricDesign } from '../src/catalog/designs'
import { Q3400, QM9700, SN5600 } from '../src/catalog/switches'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateFabric } from '../src/topology/fabric'
import type { GraphEdge } from '../src/topology/graph'
import { cableEnds, switchOf, switchPortLabel } from '../src/topology/ports'

const cfg = (patch: Partial<Config>): Config => {
  const c = withPatch(DEFAULT_CONFIG, patch)
  if (!c) throw new Error(`not valid: ${JSON.stringify(patch)}`)
  return c
}
const forDesign = (d: FabricDesign, suCount: number, topology: Config['topology'] = 'rail') =>
  withPatch(DEFAULT_CONFIG, { platform: d.platforms[0]!, build: d.builds?.[0] ?? 'dgx', fabric: d.fabric, design: d.id, planes: d.planes, suCount, topology })
const CASES = DESIGNS.filter((d) => d.leafRule.kind !== 'none').flatMap((d) =>
  d.rows.flatMap((r) => (['rail', 'tor'] as const).map((topology) => ({ id: d.id, su: r.su, topology, d }))),
)
const edge = (c: Config, id: string): GraphEdge => generateFabric(c).edges.find((e) => e.id === id)!

describe('switchPortLabel', () => {
  it('names the ports as the switch guides do', () => {
    expect(switchPortLabel(Q3400, 1)).toBe('sw1p1')
    expect(switchPortLabel(Q3400, 144)).toBe('sw72p2')
    expect(switchPortLabel(QM9700, 3)).toBe('1/2/1')
    expect(switchPortLabel(SN5600, 2)).toBe('swp1s1')
  })
})

describe('cableEnds', () => {
  it.each(CASES)('$id at $su SU ($topology): every switch port takes one cable, within the switch', ({ d, su, topology }) => {
    const c = forDesign(d, su, topology)
    if (!c) return // the design does not take this topology
    const used = new Map<string, string>()
    for (const e of generateFabric(c).edges) {
      const { a, b } = cableEnds(c, e)
      for (const end of [a, b]) {
        const sw = switchOf(c, end.device)
        if (!sw) continue
        expect(end.n, end.id).toBeGreaterThanOrEqual(1)
        expect(end.n, end.id).toBeLessThanOrEqual(sw.ports.value)
        expect(used.get(end.id), `${end.id} on ${e.id}`).toBeUndefined()
        used.set(end.id, e.id)
      }
    }
  })
  it('gives a DGX H100 cable its OSFP port, its mlx5 name, and the first port of its leaf', () => {
    const c = cfg({ platform: 'h100' })
    const { a, b } = cableEnds(c, edge(c, 'su1-n01~r0'))
    expect(a).toMatchObject({ device: 'su1-n01', id: 'su1-n01/port-c0', label: 'OSFP4 P2', name: 'mlx5_0' })
    expect(b).toMatchObject({ device: 'su1-leaf-r0', id: 'su1-leaf-r0/p1', label: '1/1/1', n: 1 })
  })
  it('puts plane B on P2 of the same OSFP port (dual plane)', () => {
    const c = cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 })
    const { a, b } = cableEnds(c, edge(c, 'su1-n02~r3B'))
    expect(a).toMatchObject({ id: 'su1-n02/port-c3B', label: 'OSFP 4 P2', name: null })
    expect(b).toMatchObject({ device: 'su1-leaf-pB-r3', n: 2 })
  })
  it('numbers the uplinks after the downlinks, and the spine ports in leaf order', () => {
    const c = DEFAULT_CONFIG // B300 XDR, 1 SU: 72 downlinks, 18 cables to each of 4 spines
    const first = cableEnds(c, edge(c, 'su1-leaf-r0~spine-01~1'))
    expect(first.a).toMatchObject({ id: 'su1-leaf-r0/p73', label: 'sw37p1' })
    expect(first.b).toMatchObject({ id: 'spine-01/p1', label: 'sw1p1' })
    const second = cableEnds(c, edge(c, 'su1-leaf-r1~spine-02~1'))
    expect(second.a.n).toBe(91)
    expect(second.b.n).toBe(19)
  })
  it('uses all 144 ports of a B300 XDR leaf at 1 SU', () => {
    const ports = new Set(
      generateFabric(DEFAULT_CONFIG)
        .edges.map((e) => cableEnds(DEFAULT_CONFIG, e))
        .flatMap(({ a, b }) => [a, b])
        .filter((p) => p.device === 'su1-leaf-r0')
        .map((p) => p.n),
    )
    expect(ports.size).toBe(144)
  })
})
