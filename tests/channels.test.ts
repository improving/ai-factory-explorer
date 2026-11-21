import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { busbwChannels } from '../src/collectives/busbw'
import { channelRanks, channelsOf } from '../src/collectives/channels'
import { schedule, type Algorithm, type Collective } from '../src/collectives/schedule'
import { scopeRanks, type Scope } from '../src/collectives/scope'
import type { Failure } from '../src/simulate/failable'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!
const GIB = 2 ** 30
const sched = (c: Config, collective: Collective, algorithm: Algorithm, scope: Scope) => schedule(collective, algorithm, scopeRanks(c, scope)!)
const limitOf = (c: Config, collective: Collective, algorithm: Algorithm, scope: Scope, failures: Failure[] = []) => {
  const r = busbwChannels(channelsOf(c, scope, sched(c, collective, algorithm, scope), failures), GIB)
  if (!r.ok) throw new Error(r.reason)
  return r.bw
}

describe('the channels of a ring on 2 nodes', () => {
  it('channel 0 is the ring of the scope; channel c starts at GPU c and crosses on rails c + 7 and c', () => {
    expect(channelRanks(DEFAULT_CONFIG, '2n', 0)).toEqual(scopeRanks(DEFAULT_CONFIG, '2n'))
    for (let c = 0; c < 8; c++) {
      const r = channelRanks(DEFAULT_CONFIG, '2n', c)!
      expect(r[0]).toBe(`su1-n01/gpu${c}`)
      expect(r[7]).toBe(`su1-n01/gpu${(c + 7) % 8}`)
      expect(r[8]).toBe(`su1-n02/gpu${(c + 7) % 8}`)
      expect(r[15]).toBe(`su1-n02/gpu${c}`)
    }
  })

  it('has one channel for each compute NIC; the other scopes and algorithms have one channel', () => {
    expect(channelsOf(DEFAULT_CONFIG, '2n', sched(DEFAULT_CONFIG, 'allreduce', 'ring', '2n'))).toHaveLength(8)
    expect(channelsOf(DEFAULT_CONFIG, '1n', sched(DEFAULT_CONFIG, 'allreduce', 'ring', '1n'))).toHaveLength(1)
    expect(channelsOf(DEFAULT_CONFIG, 'n8', sched(DEFAULT_CONFIG, 'allreduce', 'ring', 'n8'))).toHaveLength(1)
    expect(channelsOf(DEFAULT_CONFIG, '2n', sched(DEFAULT_CONFIG, 'alltoall', 'p2p', '2n'))).toHaveLength(1)
  })

  it('gives 8 × the NIC speed on 2 nodes: 800 GB/s on B300, 400 GB/s on H100 and on one Spectrum-X plane', () => {
    const bw = limitOf(DEFAULT_CONFIG, 'allreduce', 'ring', '2n')
    expect(bw.channels).toBe(8)
    expect(bw.hop.link).toBe('infiniband')
    expect(bw.link.gbps).toBe(100)
    expect(bw.limitGBps).toBeCloseTo(800)
    expect(limitOf(DEFAULT_CONFIG, 'broadcast', 'ring', '2n').limitGBps).toBeCloseTo(800)
    expect(limitOf(cfg({ platform: 'h100', fabric: 'ib-ndr', design: 'ndr-h100' }), 'allgather', 'ring', '2n').limitGBps).toBeCloseTo(400)
    expect(limitOf(cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 }), 'allreduce', 'ring', '2n').limitGBps).toBeCloseTo(400)
  })

  it('keeps the limits of one channel for the other scopes and algorithms', () => {
    expect(limitOf(DEFAULT_CONFIG, 'allreduce', 'ring', '1n').limitGBps).toBeCloseTo(900)
    expect(limitOf(DEFAULT_CONFIG, 'allreduce', 'ring', 'n8').limitGBps).toBeCloseTo(100)
    expect(limitOf(DEFAULT_CONFIG, 'alltoall', 'p2p', '2n').limitGBps).toBeCloseTo(187.5)
    expect(limitOf(DEFAULT_CONFIG, 'allreduce', 'nvls', '1n').limitGBps).toBeCloseTo(1575)
  })

  it('names each pair of GPUs whose path has a degraded hop, in all channels', () => {
    const bw = limitOf(DEFAULT_CONFIG, 'allreduce', 'ring', '2n', [{ id: 'su1-n01~r7', mode: 'degraded' }])
    expect(bw.degraded).toEqual(['su1-n01 GPU 7 → su1-n02 GPU 7', 'su1-n02 GPU 7 → su1-n01 GPU 7'])
    expect(bw.limitGBps).toBeCloseTo(800)
  })

  it('2 nodes in different SUs: 8 channels through the spines, 800 GB/s; 4 trays of GB200: NVLink, 900 GB/s', () => {
    const twoSu = cfg({ suCount: 2 })
    const bw = limitOf(twoSu, 'allreduce', 'ring', '2s')
    expect(bw.channels).toBe(8)
    expect(bw.limitGBps).toBeCloseTo(800)
    expect(channelRanks(twoSu, '2s', 3)![8]).toBe('su2-n01/gpu2')
    expect(limitOf(cfg({ platform: 'gb200-nvl72' }), 'allreduce', 'ring', '4t').limitGBps).toBeCloseTo(900)
  })
})
