import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { gpuEnd, leafOf, nicPart, nvswitchesOf, spinesOf } from '../src/routing/ends'
import { generateFabric } from '../src/topology/fabric'
import { generateServer } from '../src/topology/server'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!

describe('gpuEnd', () => {
  it('reads a GPU of the configuration, with its rail, slot, and rack', () => {
    expect(gpuEnd(DEFAULT_CONFIG, 'su1-n05/gpu3')).toEqual({ id: 'su1-n05/gpu3', server: 'su1-n05', gpu: 3, su: 1, group: 1, slot: 5, rack: 2 })
  })
  it('refuses a part that is not a GPU of the configuration', () => {
    expect(gpuEnd(DEFAULT_CONFIG, 'su1-n05/nic3')).toBeNull()
    expect(gpuEnd(DEFAULT_CONFIG, 'su1-n05/gpu8')).toBeNull()
    expect(gpuEnd(DEFAULT_CONFIG, 'su2-n05/gpu0')).toBeNull()
    expect(gpuEnd(cfg({ platform: 'gb200-nvl72' }), 'su1-n05/gpu4')).toBeNull()
  })
  it('puts the SUs of one leaf group in one group (HGX Enterprise RA: 8 SUs of 4 nodes)', () => {
    const ent = cfg({ build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', planes: 'dual', suCount: 8, cooling: 'liquid' })
    expect(gpuEnd(ent, 'su2-n01/gpu4')).toMatchObject({ su: 2, group: 1, slot: 5 })
  })
})

describe('the parts of a path', () => {
  it('names parts that exist in the generated topology', () => {
    const c = cfg({ suCount: 2 })
    const e = gpuEnd(c, 'su2-n10/gpu5')!
    const fabric = new Set(generateFabric(c).nodes.map((n) => n.id))
    const server = new Set(generateServer(c, 'su2-n10').nodes.map((n) => n.id))
    expect(server.has(nicPart(e).id)).toBe(true)
    expect(leafOf(c, e, 0)).toMatchObject({ id: 'su2-leaf-r5', kind: 'leaf' })
    expect(fabric.has(leafOf(c, e, 0)!.id)).toBe(true)
    for (const s of spinesOf(c, 0)) expect(fabric.has(s.id), s.id).toBe(true)
    expect(spinesOf(c, 0)).toHaveLength(8)
    for (const chip of nvswitchesOf(c, e)) expect(server.has(chip.id), chip.id).toBe(true)
  })
  it('gives a dual-plane leaf and spine for each plane', () => {
    const c = cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 })
    const e = gpuEnd(c, 'su1-n05/gpu3')!
    expect(leafOf(c, e, 1)?.label).toMatch(/plane B/)
    expect(spinesOf(c, 1)[0]?.label).toMatch(/plane B/)
  })
  it('gives the 18 NVSwitch chips of the rack to an NVL72 tray, and no leaf to a design with no fabric', () => {
    const gb = cfg({ platform: 'gb200-nvl72' })
    const e = gpuEnd(gb, 'su1-n05/gpu1')!
    const rack = new Set(generateServer(gb, 'su1-n05').nodes.map((n) => n.id))
    const chips = nvswitchesOf(gb, e)
    expect(chips).toHaveLength(18)
    for (const chip of chips) expect(rack.has(chip.id), chip.id).toBe(true)
    expect(leafOf(gb, e, 0)).toBeNull()
  })
})
