import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { channelsOf } from '../src/collectives/channels'
import { pairPaths } from '../src/collectives/load'
import { schedule, type Algorithm, type Collective } from '../src/collectives/schedule'
import { scopeRanks, type Scope } from '../src/collectives/scope'
import { collElements, collElementsOf } from '../src/views/collView'
import { railColor } from '../src/views/palette'

const setup = (scope: Scope, collective: Collective = 'allreduce', algorithm: Algorithm = 'ring', config: Config = DEFAULT_CONFIG) => {
  const sc = schedule(collective, algorithm, scopeRanks(config, scope)!)
  return { sc, paths: pairPaths(config, sc) }
}
const nodesOf = (els: ReturnType<typeof collElements>) => els.filter((e) => e.group === 'nodes')
const edgesOf = (els: ReturnType<typeof collElements>) => els.filter((e) => e.group === 'edges')

describe('the real paths of a schedule', () => {
  it('a ring on 1 node: 8 GPUs and one NVSwitch chip, one edge for each of the 16 links', () => {
    const { sc, paths } = setup('1n')
    const els = collElements(sc, paths, 0)
    expect(nodesOf(els)).toHaveLength(9)
    expect(edgesOf(els)).toHaveLength(16)
  })

  it('no edge is lit at the start; at step 1 each edge of a ring has the colour of its chunk', () => {
    const { sc, paths } = setup('1n')
    expect(edgesOf(collElements(sc, paths, 0)).some((e) => e.classes?.includes('ring-on'))).toBe(false)
    const lit = edgesOf(collElements(sc, paths, 1))
    expect(lit.every((e) => e.classes?.includes('ring-on'))).toBe(true)
    // At step 1, rank 0 sends chunk 7.
    expect(lit.filter((e) => e.data.pair === '0>1').every((e) => e.data.color === railColor(7))).toBe(true)
  })

  it('a ring on 2 nodes: 16 GPUs, 2 chips, 4 NICs, and the 2 leaves in the middle column', () => {
    const { sc, paths } = setup('2n')
    const els = collElements(sc, paths, 0)
    expect(nodesOf(els)).toHaveLength(24)
    expect(edgesOf(els)).toHaveLength(36)
    const x = (id: string) => nodesOf(els).find((e) => e.data.id === id)!.position!.x
    expect(x('su1-leaf-r7')).toBe(x('su1-leaf-r0'))
    expect(x('su1-n01/gpu0')).toBeLessThan(x('su1-leaf-r0'))
    expect(x('su1-n02/gpu0')).toBeGreaterThan(x('su1-leaf-r0'))
  })

  it('leaves out the links of a pair with no path', () => {
    const { sc, paths } = setup('1n')
    const broken = new Map(paths)
    broken.set('3>4', { ok: false, reason: 'x' })
    const edges = edgesOf(collElements(sc, broken, 1))
    expect(edges).toHaveLength(14)
    expect(edges.some((e) => e.data.pair === '3>4')).toBe(false)
  })

  it('AlltoAll on 2 nodes with a NIC down: the pairs with no path have no edge; the other pairs keep theirs', () => {
    const sc = schedule('alltoall', 'p2p', scopeRanks(DEFAULT_CONFIG, '2n')!)
    const paths = pairPaths(DEFAULT_CONFIG, sc, [{ id: 'su1-n01/nic7', mode: 'down' }])
    const broken = [...paths].filter(([, r]) => !r.ok).map(([k]) => k)
    expect(broken.length).toBeGreaterThan(0)
    const edges = edgesOf(collElements(sc, paths, 1))
    expect(edges.length).toBeGreaterThan(0)
    expect(edges.some((e) => broken.includes(String(e.data.pair)))).toBe(false)
  })

  it('NVLS step 1: the link out of each GPU carries 7 chunks; the link into GPU r has the colour of chunk r', () => {
    const { sc, paths } = setup('1n', 'allreduce', 'nvls')
    const edges = edgesOf(collElements(sc, paths, 1))
    const out0 = edges.find((e) => e.data.source === 'su1-n01/gpu0')!
    expect(out0.classes).toContain('ring-multi')
    expect(out0.data.label).toBe('×7')
    expect(edges.find((e) => e.data.target === 'su1-n01/gpu3')!.data.color).toBe(railColor(3))
  })

  it('8 nodes, 1 GPU each: 8 GPUs, 8 NICs, and one leaf between the two columns', () => {
    const { sc, paths } = setup('n8')
    const nodes = nodesOf(collElements(sc, paths, 0))
    expect(nodes).toHaveLength(17)
    const at = (id: string) => nodes.find((e) => e.data.id === id)!.position!
    expect(at('su1-n01/gpu0').x).toBeLessThan(at('su1-leaf-r0').x)
    expect(at('su1-n08/gpu0').x).toBeGreaterThan(at('su1-leaf-r0').x)
    expect(at('su1-leaf-r0').y).toBeGreaterThan(at('su1-n01/gpu0').y)
  })

  it('2 nodes in different SUs: the two leaves of a rail are apart, and the spine is between them', () => {
    const { sc, paths } = setup('2s', 'allreduce', 'ring', withPatch(DEFAULT_CONFIG, { suCount: 2 })!)
    const nodes = nodesOf(collElements(sc, paths, 0))
    const at = (id: string) => nodes.find((e) => e.data.id === id)!.position!
    expect(at('su1-leaf-r7').x).toBeLessThan(at('su2-leaf-r7').x)
    const spine = nodes.find((e) => e.data.kind === 'spine')!.position!
    expect(spine.x).toBeGreaterThan(at('su1-leaf-r7').x)
    expect(spine.x).toBeLessThan(at('su2-leaf-r7').x)
  })

  it('4 trays of an NVL72 rack: the switch-tray chip is in the middle, between the two columns of trays', () => {
    const { sc, paths } = setup('4t', 'allreduce', 'ring', withPatch(DEFAULT_CONFIG, { platform: 'gb200-nvl72' })!)
    const nodes = nodesOf(collElements(sc, paths, 0))
    const chip = nodes.find((e) => e.data.kind === 'nvswitch')!.position!
    const x = (id: string) => nodes.find((e) => e.data.id === id)!.position!.x
    expect(chip.x).toBe((x('su1-n01/gpu0') + x('su1-n04/gpu0')) / 2)
  })

  it('all channels of a ring on 2 nodes: 96 links; each NIC link carries one chunk; the pairs name their channel', () => {
    const { sc } = setup('2n')
    const chs = channelsOf(DEFAULT_CONFIG, '2n', sc)
    const edges = edgesOf(collElementsOf(chs, 1))
    expect(edges).toHaveLength(96)
    const nicLinks = edges.filter((e) => e.data.network === 'compute')
    expect(nicLinks).toHaveLength(32)
    expect(nicLinks.every((e) => e.classes?.includes('ring-on') && !e.classes?.includes('ring-multi'))).toBe(true)
    expect(edges.every((e) => /^\d+:\d+>\d+$/.test(String(e.data.pair)))).toBe(true)
  })
})
