import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { confirmed } from '../src/catalog/fact'
import { COLL_FACTS } from '../src/catalog/collectives'
import { SIZES, busFactor, busbw, toGBps } from '../src/collectives/busbw'
import { pairPaths } from '../src/collectives/load'
import { schedule, type Algorithm, type Collective } from '../src/collectives/schedule'
import { scopeRanks, type Scope } from '../src/collectives/scope'
import type { Failure } from '../src/simulate/failable'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!
const GIB = 2 ** 30
const run = (c: Config, collective: Collective, algorithm: Algorithm, scope: Scope, failures: Failure[] = []) => {
  const sc = schedule(collective, algorithm, scopeRanks(c, scope)!)
  return busbw(sc, GIB, pairPaths(c, sc, failures))
}
const limitOf = (...a: Parameters<typeof run>) => {
  const r = run(...a)
  if (!r.ok) throw new Error(r.reason)
  return r.bw
}

describe('the bus factor (nccl-tests PERFORMANCE.md)', () => {
  it('is 2(n-1)/n for AllReduce, (n-1)/n for AllGather, ReduceScatter, and AlltoAll, and 1 for Broadcast', () => {
    expect(busFactor('allreduce', 8)).toBeCloseTo(1.75)
    expect(busFactor('allreduce', 16)).toBeCloseTo(1.875)
    expect(busFactor('allgather', 8)).toBeCloseTo(0.875)
    expect(busFactor('reducescatter', 16)).toBeCloseTo(0.9375)
    expect(busFactor('alltoall', 8)).toBeCloseTo(0.875)
    expect(busFactor('broadcast', 8)).toBe(1)
  })
})

describe('the units', () => {
  it('converts Gb/s to GB/s, and refuses another unit', () => {
    expect(toGBps(confirmed(800, 'Gb/s', 'handbook/hardware-matrix.md:21'))).toBe(100)
    expect(toGBps(confirmed(7200, 'Gb/s in each direction', 'handbook/hardware-matrix.md:20'))).toBe(900)
    expect(toGBps({ value: null, status: 'not-sourced', note: 'x' })).toBeNull()
    expect(() => toGBps(confirmed(1.8, 'TB/s', 'handbook/hardware-matrix.md:20'))).toThrow(/Gb\/s/)
  })
})

describe('the busbw of a ring (the milestone 10 numbers)', () => {
  it('1 node of DGX B300: NVLink is the limit, 900 GB/s in one direction', () => {
    const bw = limitOf(DEFAULT_CONFIG, 'allreduce', 'ring', '1n')
    expect(bw.hop.link).toBe('nvlink')
    expect(bw.limitGBps).toBeCloseTo(900)
    expect(bw.algbwGBps).toBeCloseTo(900 / 1.75)
    expect(bw.timeS).toBeCloseTo((GIB * 1.75) / 900e9, 9)
    expect(bw.factorFact).toBe(COLL_FACTS.busFactor.allreduce)
  })

  it('2 nodes of DGX B300: the NIC is the limit, 800 Gb/s = 100 GB/s, first on the NIC of GPU 7', () => {
    const bw = limitOf(DEFAULT_CONFIG, 'allreduce', 'ring', '2n')
    expect(bw.hop.link).toBe('infiniband')
    expect(bw.hop.from.label).toMatch(/NIC 7/)
    expect(bw.limitGBps).toBeCloseTo(100)
  })

  it('DGX H100: 450 GB/s on 1 node, 50 GB/s on 2 nodes', () => {
    const h100 = cfg({ platform: 'h100', fabric: 'ib-ndr', design: 'ndr-h100' })
    expect(limitOf(h100, 'allgather', 'ring', '1n').limitGBps).toBeCloseTo(450)
    expect(limitOf(h100, 'allgather', 'ring', '2n').limitGBps).toBeCloseTo(50)
  })

  it('a dual-plane fabric: the limit is for one plane, 400 Gb/s = 50 GB/s', () => {
    expect(limitOf(cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 }), 'allreduce', 'ring', '2n').limitGBps).toBeCloseTo(50)
  })

  it('names the pairs with a degraded hop, and keeps the sourced limit', () => {
    const bw = limitOf(DEFAULT_CONFIG, 'allreduce', 'ring', '2n', [{ id: 'su1-n01~r7', mode: 'degraded' }])
    expect(bw.degraded).toEqual(['su1-n01 GPU 7 → su1-n02 GPU 7'])
    expect(bw.limitGBps).toBeCloseTo(100)
  })

  it('says which pair has no path', () => {
    expect(run(DEFAULT_CONFIG, 'allreduce', 'ring', '2n', [{ id: 'su1-n01/nic7', mode: 'down' }])).toMatchObject({ ok: false, reason: /^No path from rank 7 to rank 8/ })
  })

  it('has the six message sizes of the panel, 1 GiB among them', () => {
    expect(SIZES.map((s) => s.id)).toEqual(['1m', '16m', '256m', '1g', '4g', '16g'])
    expect(SIZES.find((s) => s.id === '1g')!.bytes).toBe(GIB)
  })
})

describe('the limits of the other algorithms (the link-load model)', () => {
  it('NVLS on 1 node: 2(n-1)/n × 900 = 1575 GB/s, above the NVLink speed', () => {
    expect(limitOf(DEFAULT_CONFIG, 'allreduce', 'nvls', '1n').limitGBps).toBeCloseTo(1575)
  })

  it('Tree on 8 nodes: 87.5 GB/s, below the ring (100 GB/s), because an inner rank carries 2 × S', () => {
    expect(limitOf(DEFAULT_CONFIG, 'allreduce', 'tree', 'n8').limitGBps).toBeCloseTo(87.5)
    expect(limitOf(DEFAULT_CONFIG, 'allreduce', 'ring', 'n8').limitGBps).toBeCloseTo(100)
  })

  it('PAT on 8 nodes: the same limit as the ring', () => {
    expect(limitOf(DEFAULT_CONFIG, 'allgather', 'pat', 'n8').limitGBps).toBeCloseTo(100)
    expect(limitOf(DEFAULT_CONFIG, 'reducescatter', 'pat', 'n8').limitGBps).toBeCloseTo(100)
  })

  it('AlltoAll: 900 GB/s on 1 node; 187.5 GB/s on 2 nodes, where half of the data stays on NVLink', () => {
    expect(limitOf(DEFAULT_CONFIG, 'alltoall', 'p2p', '1n').limitGBps).toBeCloseTo(900)
    const two = limitOf(DEFAULT_CONFIG, 'alltoall', 'p2p', '2n')
    expect(two.limitGBps).toBeCloseTo(187.5)
    expect(two.hop.link).toBe('infiniband')
  })

  it('Broadcast on 1 node: 900 GB/s (bus factor 1)', () => {
    expect(limitOf(DEFAULT_CONFIG, 'broadcast', 'ring', '1n').limitGBps).toBeCloseTo(900)
  })
})
