import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateRackPorts, portMapCsv, portMapRows } from '../src/topology/rackPorts'
import { rackDiff } from '../src/topology/sources'

const cfg = (patch: Partial<Config>): Config => {
  const c = withPatch(DEFAULT_CONFIG, patch)
  if (!c) throw new Error(`not valid: ${JSON.stringify(patch)}`)
  return c
}
const kinds = (rack: string, c: Config = DEFAULT_CONFIG) => {
  const g = generateRackPorts(c, rack)
  const count = (f: (n: (typeof g.nodes)[number]) => boolean) => g.nodes.filter(f).length
  return { g, count }
}

describe('generateRackPorts', () => {
  it('draws a B300 compute rack with 32 compute ports, each cabled to a leaf port in the network rack', () => {
    const { g, count } = kinds('su1-k1')
    expect(count((n) => n.kind === 'port' && !n.far)).toBe(32)
    expect(count((n) => n.kind === 'leaf' && n.far === true)).toBe(8)
    expect(count((n) => n.kind === 'port' && n.far === true)).toBe(32)
    expect(g.edges).toHaveLength(32)
    expect(g.edges[0]).toMatchObject({ id: 'su1-n01~r0', source: 'su1-n01/port-c0', target: 'su1-leaf-r0/p1' })
    expect(g.nodes.find((n) => n.id === 'su1-n01/port-c0')).toMatchObject({ device: 'su1-n01', face: 'front', used: true, rail: 0 })
  })
  it('draws every port of the leaves of a network rack, with no cable lines', () => {
    const { g, count } = kinds('su1-net1')
    expect(count((n) => n.kind === 'port')).toBe(8 * 144)
    expect(count((n) => n.kind === 'port' && n.used === true)).toBe(8 * 144)
    expect(g.edges).toHaveLength(0)
  })
  it('stays under 2,000 elements in the largest spine rack', () => {
    for (const c of [cfg({ suCount: 18 }), cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 }), cfg({ platform: 'gb300-nvl72', suCount: 16 })]) {
      const g = generateRackPorts(c, 'core-k1')
      expect(g.nodes.length + g.edges.length).toBeLessThan(2000)
    }
  })
  it('gives a GB200 rack its tray ports and no cable', () => {
    const { g, count } = kinds('su1-k1', cfg({ platform: 'gb200-nvl72' }))
    expect(count((n) => n.kind === 'port')).toBe(18 * 4)
    expect(g.edges).toHaveLength(0)
  })
  it('refuses a rack that the configuration does not have', () => {
    expect(() => generateRackPorts(DEFAULT_CONFIG, 'su1-k19')).toThrow(/No rack/)
  })
})

describe('the port map', () => {
  it('lists each cable of a compute rack with both ends, the rack and U of each end, and the cable parts', () => {
    const rows = portMapRows(DEFAULT_CONFIG, 'su1-k1')
    expect(rows).toHaveLength(32)
    expect(rows[0]).toMatchObject({
      cable: 'su1-n01~r0',
      a: { device: 'su1-n01', rack: 'su1-k1', u: 1, port: 'OSFP 1', nic: '' },
      b: { device: 'su1-leaf-r0', rack: 'su1-net1', u: 1, port: 'sw1p1', nic: '' },
    })
    expect(rows[0]!.type).toMatch(/980-9IATO-00XM00/)
  })
  it('puts the end in the open rack first', () => {
    const rows = portMapRows(DEFAULT_CONFIG, 'su1-net1')
    expect(rows).toHaveLength(8 * 144)
    for (const r of rows) expect(r.a.rack).toBe('su1-net1')
  })
  it('gives the mlx5 name of a DGX H100 port', () => {
    const r = portMapRows(cfg({ platform: 'h100' }), 'su1-k1')[0]!
    expect(r.a).toMatchObject({ port: 'OSFP4 P2', nic: 'mlx5_0' })
    expect(r.b.port).toBe('1/1/1')
  })
  it('has no row for an empty slot of a partial last SU', () => {
    const c = cfg({ lastSuEmpty: 36 })
    expect(portMapRows(c, 'su1-k10')).toHaveLength(0)
    expect(portMapRows(c, 'su1-net1')).toHaveLength(8 * (36 + 72))
  })
  it('writes CSV with a header, and quotes a cell that has a comma', () => {
    const csv = portMapCsv(portMapRows(DEFAULT_CONFIG, 'su1-k1'))
    const lines = csv.trimEnd().split('\n')
    expect(lines[0]).toBe('Cable,A device,A rack,A U,A port,A NIC,B device,B rack,B U,B port,B NIC,Cable and optics')
    expect(lines).toHaveLength(33)
    expect(lines[1]).toMatch(/^su1-n01~r0,su1-n01,su1-k1,1,OSFP 1,,su1-leaf-r0,su1-net1,1,sw1p1,,"twin-port/)
  })
})

describe('the port map with a view of the fabric', () => {
  const rows = portMapRows(DEFAULT_CONFIG, 'su1-k1')
  const discovered = rackDiff(DEFAULT_CONFIG, 'su1-k1', 'discovered')
  const intent = rackDiff(DEFAULT_CONFIG, 'su1-k1', 'intent')

  it('keeps the CSV of the design as it was', () => {
    expect(portMapCsv(rows).split('\n')[0]).not.toContain('Difference')
    expect(portMapCsv(rows, null)).toBe(portMapCsv(rows))
  })

  it('adds the finding and the far end of the source to the CSV', () => {
    const lines = portMapCsv(rows, discovered).trimEnd().split('\n')
    expect(lines[0]).toBe('Cable,A device,A rack,A U,A port,A NIC,B device,B rack,B U,B port,B NIC,Cable and optics,Difference,Source far end')
    expect(lines).toHaveLength(33)
    const missing = lines.find((l) => l.startsWith('su1-n01~r5,'))!
    expect(missing).toContain(',missing,')
    const moved = lines.find((l) => l.startsWith('su1-n02~r1,'))!
    expect(moved).toContain(',moved,su1-leaf-r2/p2')
    expect(lines.filter((l) => l.includes(',same,')).length).toBe(29)
  })

  it('names the wrong rail of the intent, and the far end of the source', () => {
    const lines = portMapCsv(rows, intent).trimEnd().split('\n')
    const wrong = lines.find((l) => l.startsWith('su1-n02~r4,'))!
    expect(wrong).toContain(',wrong rail,')
    expect(wrong).toContain(',su1-leaf-r4/p2')
  })

  it('finds the difference of a cable of a network rack, whose local end is the leaf', () => {
    const net = portMapRows(DEFAULT_CONFIG, 'su1-net1')
    const lines = portMapCsv(net, rackDiff(DEFAULT_CONFIG, 'su1-net1', 'discovered')).trimEnd().split('\n')
    expect(lines.filter((l) => l.includes(',missing,')).length).toBe(1)
    expect(lines.filter((l) => l.includes(',moved,')).length).toBe(2)
  })

  it('finds the row of a cable of the rack for each difference', () => {
    expect(discovered.rows.filter((r) => r.finding !== 'same')).toHaveLength(3)
    expect(intent.rows.filter((r) => r.finding !== 'same')).toHaveLength(2)
  })
})

describe('the port-map rows', () => {
  it('gives the port id of each end of a port-map row', () => {
    const rows = portMapRows(DEFAULT_CONFIG, 'su1-k1')
    expect(rows[0]!.a.id).toMatch(/^su1-n\d+\/port-c\d/)
    expect(rows[0]!.b.id).toMatch(/\/p\d+$/)
  })
})
