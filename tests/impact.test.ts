import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { EFFECT_LABEL, impactOf } from '../src/simulate/impact'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!

describe('the lessons of spec 9.5', () => {
  it('Fabric Manager down: the 8 GPUs of the node lose NVLink; P3', () => {
    const i = impactOf(DEFAULT_CONFIG, [{ id: 'su1-n05/svc-fabric-manager', mode: 'down' }])
    expect(i.counts['no-nvlink']).toBe(8)
    expect(i.nodes).toEqual(['su1-n05'])
    expect(i.severity.level).toBe(3)
    expect(i.incidents[0]!.rule.drain).toBe('node')
  })
  it('IMEX down: up to 72 GPUs (the NVL72 rack)', () => {
    const i = impactOf(cfg({ platform: 'gb200-nvl72' }), [{ id: 'su1-n05/imex', mode: 'down' }])
    expect(i.counts['no-nvlink']).toBe(72)
    expect(i.racks).toBe(1)
  })
  it('a leaf down: rail 3 lost in single plane; half bandwidth in dual plane', () => {
    const single = impactOf(DEFAULT_CONFIG, [{ id: 'su1-leaf-r3', mode: 'down' }])
    expect(single.counts['no-rail']).toBe(72)
    expect(single.counts.half).toBe(0)
    expect(single.severity.level).toBe(2)
    const dual = cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 })
    const two = impactOf(dual, [{ id: 'su1-leaf-pA-r3', mode: 'down' }])
    expect(two.counts['no-rail']).toBe(0)
    expect(two.counts.half).toBe(64)
  })
  it('the UFM master fails over: no GPU lost, P3; both units down: P2', () => {
    const active = impactOf(DEFAULT_CONFIG, [{ id: 'blk-ufm', mode: 'active' }])
    expect(active.affected).toBe(0)
    expect(active.severity.level).toBe(3)
    expect(impactOf(DEFAULT_CONFIG, [{ id: 'blk-ufm', mode: 'both' }]).severity.level).toBe(2)
  })
  it('groups the alerts of one failure into one incident: a leaf and its 72 links', () => {
    const i = impactOf(DEFAULT_CONFIG, [{ id: 'su1-leaf-r3', mode: 'down' }])
    expect(i.incidents).toHaveLength(1)
    expect(i.alertCount).toBe(73)
    expect(i.incidents[0]!.alerts[0]).toMatch(/switch down: su1-leaf-r3/)
  })
})

describe('many failures at once', () => {
  it('counts each GPU once, with its worst effect, and keeps the incidents apart', () => {
    const i = impactOf(DEFAULT_CONFIG, [
      { id: 'su1-n05/gpu2', mode: 'xid48' },
      { id: 'su1-n05/svc-fabric-manager', mode: 'down' },
      { id: 'su1-n30~r6', mode: 'degraded' },
      { id: 'su1-n50/psu', mode: 'down' },
    ])
    expect(i.effects.get('su1-n05/gpu2')).toBe('lost')
    expect(i.counts['no-nvlink']).toBe(7)
    expect(i.counts.slow).toBe(1)
    expect(i.incidents.map((x) => x.kind)).toEqual(['gpu', 'fabric-manager', 'cable', 'psu'])
    expect(i.services).toContain('su1-n50: the redundancy of the power supplies')
  })
  it('gives the capacity: the available GPUs and the largest pool of whole nodes', () => {
    const i = impactOf(DEFAULT_CONFIG, [{ id: 'su1-n05/gpu2', mode: 'xid79' }])
    expect(i.counts.lost).toBe(8)
    expect(i.available).toBe(568)
    expect(i.largestPool).toBe(568)
    expect(i.poolUnit).toMatch(/whole nodes/)
  })
  it('P1 from the threshold of the configuration: a CDU takes the racks of the SU', () => {
    const c = cfg({ cooling: 'liquid' })
    const i = impactOf(c, [{ id: 'su1-cdu', mode: 'down' }])
    expect(i.counts.lost).toBe(576)
    expect(i.severity.level).toBe(1)
  })
  it('gives the tenants and the services that a failure hits', () => {
    expect(impactOf(DEFAULT_CONFIG, [{ id: 'su1-n01/svc-driver', mode: 'down' }]).tenants).toEqual(['UAT'])
    expect(impactOf(DEFAULT_CONFIG, [{ id: 'blk-rafay', mode: 'down' }]).services[0]).toMatch(/console/)
  })
  it('leaves out a failure that the configuration does not have', () => {
    expect(impactOf(DEFAULT_CONFIG, [{ id: 'su2-n05/gpu2', mode: 'xid79' }]).incidents).toHaveLength(0)
  })
})

describe('the fixes of the final review (impact)', () => {
  it('takes the rail when both planes of it are down (dual plane)', () => {
    const dual = cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 })
    const i = impactOf(dual, [
      { id: 'su1-leaf-pA-r3', mode: 'down' },
      { id: 'su1-leaf-pB-r3', mode: 'down' },
    ])
    expect(i.counts['no-rail']).toBe(64)
    expect(i.counts.half).toBe(0)
    expect(i.affected).toBe(64)
  })
})

describe('the modes of the interview scenarios', () => {
  it('a row-remap failure takes one GPU out; a slow GPU stays in the pool', () => {
    const i = impactOf(DEFAULT_CONFIG, [
      { id: 'su1-n05/gpu2', mode: 'xid64' },
      { id: 'su1-n06/gpu1', mode: 'degraded' },
    ])
    expect(i.effects.get('su1-n05/gpu2')).toBe('lost')
    expect(i.counts.lost).toBe(1)
    expect(i.effects.get('su1-n06/gpu1')).toBe('slow')
    expect(i.degraded).toBe(1)
    expect(i.available).toBe(575)
  })
  it('a PFC storm and a slow VAST path take no GPU, and name the storage path', () => {
    const storm = impactOf(cfg({ storageFabric: 'ethernet' }), [{ id: 'blk-storage-net', mode: 'degraded' }])
    expect(storm.affected).toBe(0)
    expect(storm.severity.level).toBe(2)
    expect(storm.services[0]).toMatch(/PFC/)
    const vast = impactOf(DEFAULT_CONFIG, [{ id: 'blk-vast', mode: 'degraded' }])
    expect(vast.affected).toBe(0)
    expect(vast.services[0]).toMatch(/client path/)
  })
  it('labels the slow effect for a GPU and a link', () => {
    expect(EFFECT_LABEL.slow).toBe('slow (degraded)')
  })
})
