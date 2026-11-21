import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import type { Fact } from '../src/catalog/fact'
import { PAR_FACTS } from '../src/catalog/parallel'
import { DEFAULT_PLAN, groupIndexes, groupLabel, groupNetwork, groupsOf, jobSizes, planGroup, planProblem, rankGpus, sizeChoices, type Plan } from '../src/parallel/plan'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!
const plan = (patch: Partial<Plan>): Plan => ({ ...DEFAULT_PLAN, ...patch })
const range = (from: number, n: number, step = 1) => Array.from({ length: n }, (_, i) => from + i * step)

describe('the plan of a job', () => {
  it('TP 8 × DP 4 on 4 servers: each TP group is one server, each DP group is one rail', () => {
    expect(groupsOf(DEFAULT_PLAN, 32, 'tp')).toEqual([range(0, 8), range(8, 8), range(16, 8), range(24, 8)])
    const dp = groupsOf(DEFAULT_PLAN, 32, 'dp')
    expect(dp).toHaveLength(8)
    expect(dp[3]).toEqual([3, 11, 19, 27])
    const gpus = rankGpus(DEFAULT_CONFIG, DEFAULT_PLAN)!
    expect(dp[3]!.map((r) => gpus[r])).toEqual(['su1-n01/gpu3', 'su1-n02/gpu3', 'su1-n03/gpu3', 'su1-n04/gpu3'])
    expect(groupNetwork(DEFAULT_CONFIG, groupsOf(DEFAULT_PLAN, 32, 'tp')[1]!.map((r) => gpus[r]!))).toBe('server')
    expect(groupNetwork(DEFAULT_CONFIG, dp[3]!.map((r) => gpus[r]!))).toBe('leaf')
    expect(groupsOf(DEFAULT_PLAN, 32, 'pp')).toHaveLength(32) // PP 1: each group has 1 rank
    expect(groupNetwork(DEFAULT_CONFIG, ['su1-n01/gpu0'])).toBe('none')
  })

  it('follows tp-cp-ep-dp-pp: TP varies fastest, then CP, then DP, then PP (Megatron-LM)', () => {
    const p = plan({ tp: 2, cp: 2, dp: 2, pp: 4 })
    expect(planProblem(DEFAULT_CONFIG, p)).toBeNull()
    expect(groupsOf(p, 32, 'tp')[2]).toEqual([4, 5])
    expect(groupsOf(p, 32, 'cp')[0]).toEqual([0, 2])
    expect(groupsOf(p, 32, 'dp')[0]).toEqual([0, 4])
    expect(groupsOf(p, 32, 'pp')[0]).toEqual([0, 8, 16, 24])
    // Rank 5: tp 1, cp 0, dp 1, pp 0. The groups are numbered in the order of their first rank.
    expect(groupIndexes(p, 32, 5)).toEqual({ tp: 2, cp: 3, ep: 5, dp: 1, pp: 5 })
  })

  it('cuts the EP groups from DP × CP, with the same TP and PP rank', () => {
    const p = plan({ tp: 2, dp: 16, ep: 4 })
    const ep = groupsOf(p, 32, 'ep')
    expect(ep).toHaveLength(8)
    expect(ep[0]).toEqual([0, 2, 4, 6])
    expect(ep[1]).toEqual([1, 3, 5, 7])
    expect(groupNetwork(DEFAULT_CONFIG, ep[0]!.map((r) => rankGpus(DEFAULT_CONFIG, p)![r]!))).toBe('server')
  })

  it('a DP group across the rails goes through one leaf with PXN', () => {
    const p = plan({ tp: 1, dp: 32 })
    const gpus = rankGpus(DEFAULT_CONFIG, p)!
    expect(groupNetwork(DEFAULT_CONFIG, groupsOf(p, 32, 'dp')[0]!.map((r) => gpus[r]!))).toBe('pxn')
  })

  it('refuses a product that is not the GPU count, an EP that does not divide DP × CP, and a job larger than SU 1', () => {
    expect(planProblem(DEFAULT_CONFIG, plan({ dp: 2 }))).toMatch(/= 16, but the job has 32 GPUs/)
    expect(planProblem(DEFAULT_CONFIG, plan({ ep: 8 }))).toMatch(/EP must divide DP × CP = 4/)
    const gb200 = cfg({ platform: 'gb200-nvl72' })
    expect(jobSizes(gb200)).toEqual([1, 2, 4, 8, 16])
    expect(planProblem(gb200, plan({ servers: 32 }))).toMatch(/fewer than 32 trays/)
    expect(rankGpus(gb200, plan({ servers: 4, tp: 4, dp: 4 }))![5]).toBe('su1-n02/gpu1')
    expect(planProblem(gb200, plan({ servers: 4, tp: 4, dp: 4 }))).toBeNull()
    expect(sizeChoices(32)).toEqual([1, 2, 4, 8, 16, 32])
  })

  it('a group to play: its GPUs, at most 16, and a label that says so; no group of 1 GPU', () => {
    expect(planGroup(DEFAULT_CONFIG, DEFAULT_PLAN, 'dp', 3)).toEqual({ dim: 'dp', index: 3, gpus: ['su1-n01/gpu3', 'su1-n02/gpu3', 'su1-n03/gpu3', 'su1-n04/gpu3'], total: 4 })
    expect(groupLabel(planGroup(DEFAULT_CONFIG, DEFAULT_PLAN, 'dp', 3)!)).toBe('DP group 3 (4 GPUs)')
    const big = planGroup(DEFAULT_CONFIG, plan({ tp: 1, dp: 32 }), 'dp', 0)!
    expect(big.gpus).toHaveLength(16)
    expect(big.total).toBe(32)
    expect(groupLabel(big)).toBe('DP group 0 (32 GPUs, the first 16 play)')
    expect(planGroup(DEFAULT_CONFIG, DEFAULT_PLAN, 'pp', 0)).toBeNull() // 1 GPU
    expect(planGroup(DEFAULT_CONFIG, DEFAULT_PLAN, 'dp', 8)).toBeNull() // no group 8
    expect(planGroup(DEFAULT_CONFIG, plan({ dp: 2 }), 'dp', 0)).toBeNull() // a bad plan
  })
})

describe('the facts of the parallelism mapper', () => {
  it('has no confirmed fact that describes the app', () => {
    const flat = Object.entries(PAR_FACTS).flatMap(([k, v]) => ('status' in v ? [[k, v as Fact<string>] as const] : Object.entries(v as Record<string, Fact<string>>)))
    expect(flat.filter(([, f]) => f.status === 'confirmed' && /\bthe app\b/.test(f.value)).map(([k]) => k)).toEqual([])
    expect(PAR_FACTS.epRule.status).toBe('assumed')
    expect(PAR_FACTS.rankOrder.status).toBe('assumed')
  })
})

describe('final review fixes', () => {
  const gb300 = cfg({ platform: 'gb300-nvl72', build: 'dgx', fabric: 'ib-xdr', design: 'gb300-xdr', topology: 'rail', planes: 'single', suCount: 2 })

  it('a GB300 job across racks: one leaf on the same rail, PXN across the rails; 2 SU groups: the spine', () => {
    expect(jobSizes(gb300)).toContain(32)
    const same = plan({ servers: 32, tp: 4, dp: 32 })
    const gpus = rankGpus(gb300, same)!
    expect(groupNetwork(gb300, groupsOf(same, 128, 'dp')[0]!.map((r) => gpus[r]!))).toBe('leaf')
    const all = plan({ servers: 32, tp: 1, dp: 128 })
    expect(groupNetwork(gb300, groupsOf(all, 128, 'dp')[0]!.map((r) => rankGpus(gb300, all)![r]!))).toBe('pxn')
    expect(groupNetwork(cfg({ suCount: 2 }), ['su1-n01/gpu7', 'su2-n01/gpu7'])).toBe('spine')
  })

  it('the lesson says that it is the usual plan, not a rule of each plan', () => {
    expect(PAR_FACTS.lesson.value).toMatch(/^in the usual plan, /)
  })
})
