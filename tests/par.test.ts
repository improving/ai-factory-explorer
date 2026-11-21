import { describe, expect, it } from 'vitest'
import { DEFAULT_COLL, collSchedule, setColl, setCollPair } from '../src/state/coll'
import { playGroup, playProblem, setCollView, setParCell, setParDim, setPlan } from '../src/state/par'
import { INITIAL, setMode, withConfig } from '../src/state/transitions'
import { decodeState, encodeState } from '../src/state/url'

const par = () => setCollView(setMode(INITIAL, 'collectives'), 'parallelism')

describe('the Parallelism view', () => {
  it('starts on Collective view with the default plan; the switch keeps the plan', () => {
    const s = setMode(INITIAL, 'collectives')
    expect(s.coll).toMatchObject({ view: 'collective', group: null, par: { servers: 4, tp: 8, cp: 1, ep: 1, dp: 4, pp: 1, dim: 'tp', cell: null } })
    expect(par().coll!.view).toBe('parallelism')
    expect(setCollView(setPlan(par(), { pp: 2, dp: 2 }), 'collective').coll!.par).toMatchObject({ pp: 2, dp: 2 })
    expect(DEFAULT_COLL.view).toBe('collective')
  })

  it('selects a GPU only in a plan that fits; a new plan drops a GPU that the job does not have', () => {
    expect(setParCell(par(), 11).coll!.par.cell).toBe(11)
    expect(setParCell(par(), 32).coll!.par.cell).toBeNull()
    expect(setParCell(setPlan(par(), { dp: 2 }), 3).coll!.par.cell).toBeNull() // the product is 16, not 32
    const s = setParCell(par(), 30)
    expect(setPlan(s, { servers: 2, dp: 2 }).coll!.par.cell).toBeNull()
    expect(setParDim(s, 'dp').coll!.par).toMatchObject({ dim: 'dp', cell: 30 })
  })

  it('"Play this group": DP group 3 of TP 8 × DP 4 is a Ring AllReduce on GPU 3 of 4 servers', () => {
    const s = playGroup(setParCell(setParDim(par(), 'dp'), 11))
    expect(s.coll).toMatchObject({ view: 'collective', collective: 'allreduce', algorithm: 'ring', scope: 'group', step: 0, channel: 0 })
    expect(s.coll!.group).toEqual({ dim: 'dp', index: 3, gpus: ['su1-n01/gpu3', 'su1-n02/gpu3', 'su1-n03/gpu3', 'su1-n04/gpu3'], total: 4 })
    const sc = collSchedule(s.config, s.coll!)!
    expect(sc.ranks).toHaveLength(4)
    expect(sc.steps).toHaveLength(6)
    expect(setCollPair(s, '0>1').coll!.pair).toBe('0>1')
    expect(playGroup(setParCell(setParDim(par(), 'ep'), 0)).coll!.view).toBe('parallelism') // EP 1: a group of 1 GPU does not play
  })

  it('says why a group cannot play', () => {
    expect(playProblem(par().config, par().coll!.par)).toMatch(/Click a GPU/)
    expect(playProblem(par().config, setParCell(setParDim(par(), 'pp'), 0).coll!.par)).toMatch(/send and receive/)
    expect(playProblem(par().config, setParCell(setParDim(par(), 'cp'), 0).coll!.par)).toMatch(/1 GPU/)
    expect(playProblem(par().config, setParCell(par(), 0).coll!.par)).toBeNull()
  })

  it('an EP group plays AlltoAll; a group of 32 GPUs plays its first 16', () => {
    const ep = playGroup(setParCell(setParDim(setPlan(par(), { tp: 2, dp: 16, ep: 4 }), 'ep'), 0))
    expect(ep.coll).toMatchObject({ collective: 'alltoall', algorithm: 'p2p', scope: 'group' })
    const big = playGroup(setParCell(setParDim(setPlan(par(), { tp: 1, dp: 32 }), 'dp'), 0))
    expect(big.coll!.group!.gpus).toHaveLength(16)
    expect(collSchedule(big.config, big.coll!)!.ranks).toHaveLength(16)
  })

  it('another scope drops the group; a configuration change keeps it only when the plan gives the same GPUs', () => {
    const s = playGroup(setParCell(setParDim(par(), 'dp'), 11))
    expect(setColl(s, { scope: '2n' }).coll).toMatchObject({ scope: '2n', group: null })
    expect(withConfig(s, { platform: 'h100', fabric: 'ib-ndr', design: 'ndr-h100' }).coll).toMatchObject({ scope: 'group' })
    expect(withConfig(s, { platform: 'gb200-nvl72' }).coll).toMatchObject({ scope: '1t', group: null })
  })

  it('a plan change after Play keeps the group only when the new plan gives the same GPUs; the URL gives the same state', () => {
    const played = setCollView(playGroup(setParCell(setParDim(par(), 'dp'), 11)), 'parallelism')
    const s = setPlan(played, { dp: 2, pp: 2 })
    expect(s.coll).toMatchObject({ scope: '1n', group: null })
    expect(decodeState(encodeState(s)).coll).toEqual(s.coll)
    expect(setPlan(played, { cp: 1 }).coll!.scope).toBe('group')
  })

  it('a configuration change drops a selected GPU that the job does not have', () => {
    expect(withConfig(setParCell(par(), 30), { platform: 'gb200-nvl72' }).coll!.par.cell).toBeNull()
    expect(withConfig(setParCell(par(), 30), { suCount: 2 }).coll!.par.cell).toBe(30)
  })
})

describe('final review fixes', () => {
  it('a plan change keeps a group of more than 16 GPUs only when its size stays the same', () => {
    const played = playGroup(setParCell(setParDim(setPlan(par(), { servers: 32, tp: 4, dp: 32, pp: 2 }), 'dp'), 0))
    expect(played.coll!.group!.total).toBe(32)
    const s = setPlan(setCollView(played, 'parallelism'), { dp: 64, pp: 1 })
    expect(s.coll!.scope).not.toBe('group')
    expect(decodeState(encodeState(s)).coll).toEqual(s.coll)
  })

  it('a bad group link on NVL72 gives the first scope of NVL72', () => {
    expect(decodeState('#platform=gb200-nvl72&mode=collectives&par=4.4.1.1.4.1.tp&coll=allreduce.ring.group.0.1g.gdp99').coll).toMatchObject({ scope: '1t', group: null })
  })
})
