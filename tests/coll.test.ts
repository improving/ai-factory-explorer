import { describe, expect, it } from 'vitest'
import { DEFAULT_COLL, channelCount, collSchedule, parsePair, setColl, setCollPair, setCollStep } from '../src/state/coll'
import { INITIAL, goTo, select, setMode, setTrace, toggleRail, up, withConfig } from '../src/state/transitions'
import type { Hit } from '../src/search/search'

const on = () => setMode(INITIAL, 'collectives')

describe('Collectives mode', () => {
  it('starts with the default state, and drops it when the mode changes', () => {
    const s = on()
    expect(s.mode).toBe('collectives')
    expect(s.coll).toEqual(DEFAULT_COLL)
    expect(setMode(s, 'explore').coll).toBeNull()
    expect(setMode(s, 'trace').coll).toBeNull()
  })

  it('drops the trace when it starts, and a trace drops it', () => {
    const t = setTrace(INITIAL, 'su1-n01/gpu0', 'su1-n01/gpu1')
    expect(setMode(t, 'collectives').trace).toBeNull()
    const back = setTrace(on(), 'su1-n01/gpu0', 'su1-n01/gpu1')
    expect(back.mode).toBe('trace')
    expect(back.coll).toBeNull()
  })

  it('keeps the step inside the schedule (0 to 14 for an AllReduce on 1 node)', () => {
    const s = on()
    expect(setCollStep(s, 5).coll!.step).toBe(5)
    expect(setCollStep(s, 99).coll!.step).toBe(14)
    expect(setCollStep(setCollStep(s, 5), -3).coll!.step).toBe(0)
    expect(setCollStep(s, 1.5)).toBe(s)
    expect(setCollStep(s, 0)).toBe(s)
  })

  it('goes back to step 0 when the collective, the algorithm, or the scope changes, and keeps the step for a new size', () => {
    const s = setCollStep(on(), 5)
    expect(setColl(s, { collective: 'allgather' }).coll!.step).toBe(0)
    expect(setColl(s, { scope: '2n' }).coll!.step).toBe(0)
    expect(setColl(s, { algorithm: 'nvls' }).coll).toMatchObject({ algorithm: 'nvls', step: 0 })
    expect(setColl(s, { size: '4g' }).coll).toMatchObject({ step: 5, size: '4g' })
    expect(setColl(s, { collective: 'allreduce' })).toBe(s)
  })

  it('selects a valid algorithm when the collective or the scope changes', () => {
    const nvls = setColl(on(), { algorithm: 'nvls' })
    expect(setColl(nvls, { scope: '2n' }).coll!.algorithm).toBe('ring')
    expect(setColl(on(), { collective: 'alltoall' }).coll!.algorithm).toBe('p2p')
    expect(setColl(on(), { algorithm: 'tree' }).coll!.algorithm).toBe('ring') // Tree is for N nodes, 1 GPU each
    expect(setColl(setColl(on(), { scope: 'n8' }), { algorithm: 'tree' }).coll!.algorithm).toBe('tree')
  })

  it('selects a pair of the schedule only', () => {
    const s = on()
    expect(setCollPair(s, '7>0').coll!.pair).toBe('7>0')
    expect(setCollPair(s, '8>9')).toBe(s)
    expect(setCollPair(s, '0>2')).toBe(s) // not a pair of the ring
    expect(setCollPair(setCollPair(s, '3>4'), null).coll!.pair).toBeNull()
  })

  it('a new configuration keeps the mode, goes back to step 0, and fits the scope: NVL72 gets "1 tray"', () => {
    const s = setCollStep(on(), 5)
    const bigger = withConfig(s, { suCount: 2 })
    expect(bigger.mode).toBe('collectives')
    expect(bigger.coll!.step).toBe(0)
    const nvl = withConfig(setColl(s, { algorithm: 'nvls' }), { platform: 'gb200-nvl72' })
    expect(nvl.coll).toMatchObject({ scope: '1t', algorithm: 'ring', step: 0 })
    expect(collSchedule(nvl.config, nvl.coll!)!.ranks).toHaveLength(4)
    expect(setMode(withConfig(INITIAL, { platform: 'gb200-nvl72' }), 'collectives').coll!.scope).toBe('1t')
  })

  it('Esc clears the pair, then the selection, and keeps the mode', () => {
    const s = select(setCollPair(on(), '3>4'), 'su1-n01/gpu0')
    const a = up(s)
    expect(a.coll!.pair).toBeNull()
    expect(a.selected).toBe('su1-n01/gpu0')
    const b = up(a)
    expect(b.selected).toBeNull()
    expect(b.mode).toBe('collectives')
    expect(up(b)).toBe(b)
  })

  it('search goes back to Explore mode when it finds the part, and keeps Collectives mode when it does not', () => {
    const found: Hit = { id: 'su1-n01', label: 'su1-n01', kind: 'server', where: { level: 'fabric', su: 1 } } as Hit
    const r = goTo(on(), found)
    expect(r.mode).toBe('explore')
    expect(r.selected).toBe('su1-n01')
    const missing: Hit = { id: 'su9-n01', label: 'su9-n01', kind: 'server', where: { level: 'node', serverId: 'su9-n01' } } as Hit
    const s = on()
    expect(goTo(s, missing)).toBe(s)
  })

  it('clears a lit rail, and a rail key does nothing in the mode (the ring parts have no rail class)', () => {
    const lit = toggleRail(INITIAL, 3)
    expect(lit.rail).toBe(3)
    const s = setMode(lit, 'collectives')
    expect(s.rail).toBeNull()
    expect(toggleRail(s, 3)).toBe(s)
  })

  it('has 8 channels for a ring on 2 nodes, and one otherwise; a channel picks the ring of that channel', () => {
    const two = setColl(on(), { scope: '2n' })
    expect(channelCount(two.config, two.coll!)).toBe(8)
    expect(channelCount(two.config, { scope: '1n', algorithm: 'ring' })).toBe(1)
    expect(channelCount(two.config, { scope: '2n', algorithm: 'p2p' })).toBe(1)
    const c3 = setColl(two, { channel: 3 })
    expect(c3.coll!.channel).toBe(3)
    expect(collSchedule(c3.config, c3.coll!)!.ranks[0]).toBe('su1-n01/gpu3')
    expect(collSchedule(setColl(two, { channel: 'all' }).config, setColl(two, { channel: 'all' }).coll!)!.ranks[0]).toBe('su1-n01/gpu0')
    expect(setColl(c3, { scope: '1n' }).coll!.channel).toBe(0) // a scope with one channel
    expect(setColl(two, { channel: 9 }).coll!.channel).toBe(0)
  })

  it('selects a pair of a channel with the "channel:" form', () => {
    expect(parsePair('3:7>8')).toEqual({ channel: 3, key: '7>8' })
    expect(parsePair('7>8')).toEqual({ channel: 0, key: '7>8' })
    const all = setColl(setColl(on(), { scope: '2n' }), { channel: 'all' })
    expect(setCollPair(all, '3:7>8').coll!.pair).toBe('3:7>8')
    expect(setCollPair(all, '9:7>8')).toBe(all)
  })
})
