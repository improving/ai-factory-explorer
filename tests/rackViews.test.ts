import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateRackPorts } from '../src/topology/rackPorts'
import { generateRacks } from '../src/topology/racks'
import { rackPortsElements, racksElements } from '../src/views/rackViews'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!
const nodes = (els: ReturnType<typeof racksElements>) => els.filter((e) => e.group === 'nodes')

describe('racksElements', () => {
  it('draws the racks of SU 1 from the front: racks, U marks, servers, leaves, and spines', () => {
    expect(racksElements(generateRacks(DEFAULT_CONFIG, 1), 'front')).toHaveLength(20 + 40 + 72 + 8 + 4)
  })
  it('shows the PDUs from the rear only', () => {
    const rear = racksElements(generateRacks(DEFAULT_CONFIG, 1), 'rear')
    expect(rear).toHaveLength(20 + 40 + 72 + 8 + 4 + 20 * 3)
    expect(rear.find((e) => e.data.id === 'su1-k1-pdu1')?.classes).toBe('device pdu')
  })
  it('stacks the devices of a rack with no overlap', () => {
    const devs = nodes(racksElements(generateRacks(DEFAULT_CONFIG, 1), 'rear')).filter((e) => e.data.parent === 'su1-k1' && String(e.classes).startsWith('device'))
    const spans = devs.map((e) => [e.position!.y - Number(e.data.h) / 2, e.position!.y + Number(e.data.h) / 2]).sort((a, b) => a[0]! - b[0]!)
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]!).toBeGreaterThanOrEqual(spans[i - 1]![1]!)
  })
  it('draws the CDU of a liquid-cooled SU, and the manifolds from the rear', () => {
    const g = generateRacks(cfg({ platform: 'gb300-nvl72' }), 1)
    expect(racksElements(g, 'front').find((e) => e.data.id === 'su1-cdu')?.classes).toBe('cdu-rack')
    expect(racksElements(g, 'front').find((e) => e.data.id === 'su1-k1-manifold')).toBeUndefined()
    expect(racksElements(g, 'rear').find((e) => e.data.id === 'su1-k1-manifold')).toBeDefined()
  })
  it('makes the U marks not selectable', () => {
    const mark = racksElements(generateRacks(DEFAULT_CONFIG, 1), 'front').find((e) => e.data.id === 'su1-k1/u-top')
    expect(mark).toMatchObject({ selectable: false, classes: 'umark' })
  })
})

describe('rackPortsElements', () => {
  it('draws a B300 compute rack from the front with its ports, cables, and far leaves', () => {
    const els = rackPortsElements(generateRackPorts(DEFAULT_CONFIG, 'su1-k1'), 'front')
    expect(els).toHaveLength(1 + 2 + 4 + 32 + 8 + 32 + 32)
    expect(els.find((e) => e.data.id === 'su1-n01~r0')?.classes).toBe('cable rail-0')
    expect(els.find((e) => e.data.id === 'su1-n01/port-c3')?.classes).toBe('rport rail-3')
  })
  it('hides the ports, the cables, and the far leaves on the other side', () => {
    expect(rackPortsElements(generateRackPorts(DEFAULT_CONFIG, 'su1-k1'), 'rear')).toHaveLength(1 + 2 + 4 + 3)
    const h100 = generateRackPorts(cfg({ platform: 'h100' }), 'su1-k1')
    const local = (e: { classes?: string | string[] }) => String(e.classes).startsWith('rport') && !String(e.classes).includes('far')
    expect(rackPortsElements(h100, 'front').filter(local)).toHaveLength(0)
    expect(rackPortsElements(h100, 'rear').filter(local)).toHaveLength(4 * 8)
  })
  it('labels each server port with its rail, and a plane letter only for dual plane', () => {
    const label = (c: Config, id: string) => rackPortsElements(generateRackPorts(c, 'su1-k1'), 'rear').find((e) => e.data.id === id)?.data.label
    const h100 = cfg({ platform: 'h100' })
    expect(label(h100, 'su1-n01/port-c0')).toBe('r0') // the port is OSFP4 P2: P2 is a sub-port, not plane B
    expect(label(h100, 'su1-n01/port-c2')).toBe('r2')
    const spx = cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 })
    expect(rackPortsElements(generateRackPorts(spx, 'su1-k1'), 'front').find((e) => e.data.id === 'su1-n01/port-c3B')?.data.label).toBe('r3B')
  })
  it('puts each switch port inside its switch', () => {
    const els = rackPortsElements(generateRackPorts(DEFAULT_CONFIG, 'su1-net1'), 'front')
    const leaf = els.find((e) => e.data.id === 'su1-leaf-r0')!
    const top = leaf.position!.y - Number(leaf.data.h) / 2
    const bottom = leaf.position!.y + Number(leaf.data.h) / 2
    for (const p of els.filter((e) => e.data.device === 'su1-leaf-r0')) {
      expect(p.position!.y).toBeGreaterThan(top)
      expect(p.position!.y).toBeLessThan(bottom)
    }
  })
})

describe('the label sizes of the rack views', () => {
  it('gives each label a font of at least 12 px, except a 1U device of the elevation (it hides at a small zoom)', () => {
    const small = (els: ReturnType<typeof racksElements>) =>
      els.filter((e) => e.group === 'nodes' && e.data.label && typeof e.data.fs === 'number' && e.data.fs < 12)
    const racks = small(racksElements(generateRacks(DEFAULT_CONFIG, 1), 'front'))
    expect(racks.every((e) => e.data.fs! >= 9.6)).toBe(true) // 1U: 12 px × 0.8
    expect(small(rackPortsElements(generateRackPorts(DEFAULT_CONFIG, 'su1-k1'), 'rear'))).toEqual([])
  })
})
