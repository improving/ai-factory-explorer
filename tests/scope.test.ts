import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { pairPaths } from '../src/collectives/load'
import { schedule } from '../src/collectives/schedule'
import { availableScopes, firstServers, pairServers, scopeLabel, scopeProblem, scopeRanks, type Scope } from '../src/collectives/scope'
import type { Failure } from '../src/simulate/failable'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!
const gpus = (server: string, order: number[]) => order.map((g) => `${server}/gpu${g}`)
const ringPaths = (scope: Scope, failures: Failure[] = []) => pairPaths(DEFAULT_CONFIG, schedule('allreduce', 'ring', scopeRanks(DEFAULT_CONFIG, scope)!), failures)

describe('the ranks of a scope', () => {
  it('1 node: GPU 0 to 7 of the first server of SU 1', () => {
    expect(firstServers(DEFAULT_CONFIG, 1)).toEqual(['su1-n01'])
    expect(scopeRanks(DEFAULT_CONFIG, '1n')).toEqual(gpus('su1-n01', [0, 1, 2, 3, 4, 5, 6, 7]))
  })

  it('2 nodes: GPU 0 to 7 on node A, then GPU 7 to 0 on node B', () => {
    expect(scopeRanks(DEFAULT_CONFIG, '2n')).toEqual([...gpus('su1-n01', [0, 1, 2, 3, 4, 5, 6, 7]), ...gpus('su1-n02', [7, 6, 5, 4, 3, 2, 1, 0])])
  })

  it('N nodes, 1 GPU each: GPU 0 of the first N servers', () => {
    expect(scopeRanks(DEFAULT_CONFIG, 'n4')).toEqual(['su1-n01/gpu0', 'su1-n02/gpu0', 'su1-n03/gpu0', 'su1-n04/gpu0'])
    expect(scopeRanks(DEFAULT_CONFIG, 'n16')).toHaveLength(16)
  })

  it('has no ranks on an NVL72 tray', () => {
    expect(scopeRanks(cfg({ platform: 'gb200-nvl72' }), '1n')).toBeNull()
  })
})

describe('the paths of a ring', () => {
  it('1 node: each pair is NVLink through the NVSwitch chips', () => {
    const paths = ringPaths('1n')
    expect(paths.size).toBe(8)
    expect([...paths.values()].every((r) => r.ok && r.trace.kind === 'same-node')).toBe(true)
  })

  it('2 nodes: the two crossings go through one leaf on the same rail (7 out, 0 back)', () => {
    const paths = ringPaths('2n')
    const out = paths.get('7>8')!
    const back = paths.get('15>0')!
    expect(out.ok && out.trace.hops.map((h) => h.to.id)).toEqual(['su1-n01/nic7', 'su1-leaf-r7', 'su1-n02/nic7', 'su1-n02/gpu7'])
    expect(back.ok && back.trace.hops.map((h) => h.to.id)).toEqual(['su1-n02/nic0', 'su1-leaf-r0', 'su1-n01/nic0', 'su1-n01/gpu0'])
  })

  it('N nodes, 1 GPU each: each pair goes through the leaf of rail 0', () => {
    expect([...ringPaths('n8').values()].every((r) => r.ok && r.trace.kind === 'one-leaf' && r.trace.hops.some((h) => h.to.id === 'su1-leaf-r0'))).toBe(true)
  })

  it('gives "no path" for the pair whose NIC is down', () => {
    const paths = ringPaths('2n', [{ id: 'su1-n01/nic7', mode: 'down' }])
    expect(paths.get('7>8')).toMatchObject({ ok: false, reason: /rail 7/ })
    expect([...paths.values()].filter((r) => !r.ok)).toHaveLength(1)
  })
})

describe('the scopes that a configuration offers', () => {
  const ent = cfg({ build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', planes: 'dual', suCount: 8, cooling: 'liquid' })

  it('offers each scope on a DGX B300 SU, and only the scopes that fit in SU 1 of the Enterprise RA (4 servers)', () => {
    expect(availableScopes(DEFAULT_CONFIG)).toEqual(['1n', '2n', 'n4', 'n8', 'n16'])
    expect(availableScopes(ent)).toEqual(['1n', '2n', 'n4'])
    expect(scopeProblem(ent, 'n4')).toBeNull()
  })

  it('gives the reason when a scope has no ranks: the size of SU 1, or a platform that is not an 8-GPU HGX server', () => {
    expect(scopeProblem(ent, 'n8')).toMatch(/SU 1 of this design has 4 servers; this scope needs 8/)
    expect(scopeProblem(cfg({ platform: 'gb200-nvl72' }), '1n')).toMatch(/8-GPU HGX servers/)
    expect(availableScopes(cfg({ platform: 'gb200-nvl72' }))).toEqual(['1t', '4t', 'n4', 'n8', 'n16'])
  })
})

describe('the scopes of 2 SU groups and of an NVL72 rack', () => {
  const twoSu = cfg({ suCount: 2 })
  const gb200 = cfg({ platform: 'gb200-nvl72' })

  it('2 nodes, different SUs: the first server of SU 1 and the first server of the next group of SUs', () => {
    expect(scopeRanks(DEFAULT_CONFIG, '2s')).toBeNull()
    expect(scopeProblem(DEFAULT_CONFIG, '2s')).toMatch(/second group of SUs/)
    expect(pairServers(twoSu, '2s')).toEqual(['su1-n01', 'su2-n01'])
    expect(scopeRanks(twoSu, '2s')).toEqual([...gpus('su1-n01', [0, 1, 2, 3, 4, 5, 6, 7]), ...gpus('su2-n01', [7, 6, 5, 4, 3, 2, 1, 0])])
    expect(availableScopes(twoSu)).toEqual(['1n', '2n', '2s', 'n4', 'n8', 'n16'])
  })

  it('NVL72: 1 tray (4 GPUs), 4 trays (16 GPUs), and N trays with 1 GPU each; no HGX scope', () => {
    expect(scopeRanks(gb200, '1t')).toEqual(gpus('su1-n01', [0, 1, 2, 3]))
    expect(scopeRanks(gb200, '4t')).toEqual([...gpus('su1-n01', [0, 1, 2, 3]), ...gpus('su1-n02', [0, 1, 2, 3]), ...gpus('su1-n03', [0, 1, 2, 3]), ...gpus('su1-n04', [0, 1, 2, 3])])
    expect(scopeRanks(gb200, 'n16')).toHaveLength(16)
    expect(scopeRanks(gb200, '2n')).toBeNull()
    expect(scopeProblem(gb200, '2n')).toMatch(/select a tray scope/)
    expect(scopeProblem(DEFAULT_CONFIG, '4t')).toMatch(/trays of an NVL72 rack/)
  })

  it('says "trays" for the N-node scopes on an NVL72 rack', () => {
    expect(scopeLabel(gb200, 'n8')).toBe('8 trays, 1 GPU each')
    expect(scopeLabel(DEFAULT_CONFIG, 'n8')).toBe('8 nodes, 1 GPU each')
    expect(scopeLabel(gb200, '4t')).toBe('4 trays (16 GPUs)')
  })

  it('2 SUs: each crossing goes through a spine; 4 trays: each pair is NVLink in the rack', () => {
    const paths = pairPaths(twoSu, schedule('allreduce', 'ring', scopeRanks(twoSu, '2s')!))
    const out = paths.get('7>8')!
    expect(out.ok && out.trace.kind).toBe('cross-su')
    expect(out.ok && out.trace.hops.some((h) => h.to.kind === 'spine')).toBe(true)
    const trays = pairPaths(gb200, schedule('allreduce', 'ring', scopeRanks(gb200, '4t')!))
    expect([...trays.values()].every((r) => r.ok && r.trace.kind === 'nvl72-rack')).toBe(true)
  })
})
