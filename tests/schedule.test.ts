import { describe, expect, it } from 'vitest'
import { BROADCAST_CHUNKS, buffersAt, changedAt, countOf, fullMask, schedule, sourceOf, stepText, treeDepth, treeParents, type Collective } from '../src/collectives/schedule'

const ranks = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`)
const ALL: Collective[] = ['allreduce', 'allgather', 'reducescatter']
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('the ring schedule', () => {
  it.each([8, 16])('has 2(n-1) steps for AllReduce and n-1 for the others (n = %i)', (n) => {
    expect(schedule('allreduce', 'ring', ranks(n)).steps).toHaveLength(2 * (n - 1))
    expect(schedule('allgather', 'ring', ranks(n)).steps).toHaveLength(n - 1)
    expect(schedule('reducescatter', 'ring', ranks(n)).steps).toHaveLength(n - 1)
  })

  it.each(ALL)('%s: in each step, each rank sends one chunk to the next rank and receives one chunk', (c) => {
    for (const st of schedule(c, 'ring', ranks(8)).steps) {
      expect(st.sends.map((x) => x.from).sort((a, b) => a - b)).toEqual(range(8))
      expect(st.sends.map((x) => x.to).sort((a, b) => a - b)).toEqual(range(8))
      for (const x of st.sends) expect(x.to).toBe((x.from + 1) % 8)
    }
  })

  it('AllReduce: reduce in the first n-1 steps, then copy in the last n-1 steps', () => {
    const s = schedule('allreduce', 'ring', ranks(8))
    expect(s.steps.map((st) => st.phase)).toEqual([...Array(7).fill('reduce-scatter'), ...Array(7).fill('all-gather')])
    expect(s.steps.slice(0, 7).every((st) => st.sends.every((x) => x.op === 'reduce'))).toBe(true)
    expect(s.steps.slice(7).every((st) => st.sends.every((x) => x.op === 'copy'))).toBe(true)
  })

  it('refuses fewer than 2 ranks and more than 16 ranks', () => {
    expect(() => schedule('allreduce', 'ring', ranks(1))).toThrow(/2 to 16/)
    expect(() => schedule('allreduce', 'ring', ranks(17))).toThrow(/2 to 16/)
  })
})

describe('the buffers', () => {
  it('step 0 is the start: AllReduce and ReduceScatter have their own data in each chunk; AllGather has its own chunk only', () => {
    const ar = buffersAt(schedule('allreduce', 'ring', ranks(8)), 0)
    const ag = buffersAt(schedule('allgather', 'ring', ranks(8)), 0)
    for (const r of range(8)) {
      for (const c of range(8)) {
        expect(ar[r]![c]).toBe(1 << r)
        expect(ag[r]![c]).toBe(c === r ? 1 << r : 0)
      }
    }
  })

  it.each([8, 16])('AllReduce ends with the full sum in each cell (n = %i)', (n) => {
    const s = schedule('allreduce', 'ring', ranks(n))
    expect(buffersAt(s, s.steps.length).flat().every((m) => m === fullMask(n))).toBe(true)
  })

  it.each([8, 16])('AllGather ends with all chunks on each rank, each chunk from its own rank (n = %i)', (n) => {
    const s = schedule('allgather', 'ring', ranks(n))
    const b = buffersAt(s, s.steps.length)
    for (const r of range(n)) for (const c of range(n)) expect(b[r]![c]).toBe(1 << c)
  })

  it.each([8, 16])('ReduceScatter gives rank r the chunk r, fully reduced (n = %i)', (n) => {
    const s = schedule('reducescatter', 'ring', ranks(n))
    const b = buffersAt(s, s.steps.length)
    for (const r of range(n)) expect(b[r]![r]).toBe(fullMask(n))
  })

  it('after step 1 of AllReduce, rank 1 holds 2 ranks in chunk 7 (rank 0 sent it)', () => {
    const s = schedule('allreduce', 'ring', ranks(8))
    expect(countOf(buffersAt(s, 1)[1]![7]!)).toBe(2)
  })

  it('clamps a step outside the schedule', () => {
    const s = schedule('allreduce', 'ring', ranks(8))
    expect(buffersAt(s, 99)).toEqual(buffersAt(s, s.steps.length))
    expect(buffersAt(s, -1)).toEqual(buffersAt(s, 0))
  })

  it('changedAt names the n cells that a step writes, and none at the start', () => {
    const s = schedule('allreduce', 'ring', ranks(8))
    expect(changedAt(s, 0).size).toBe(0)
    expect(changedAt(s, 1).size).toBe(8)
    expect(changedAt(s, 1).has('1:7')).toBe(true)
  })
})

describe('the step text', () => {
  it('says the start, the operation of a step, and the end state', () => {
    const ar = schedule('allreduce', 'ring', ranks(8))
    expect(stepText(ar, 0)).toMatch(/^Start/)
    expect(stepText(ar, 1)).toMatch(/adds it/)
    expect(stepText(ar, 8)).toMatch(/keeps a copy/)
    expect(stepText(ar, ar.steps.length)).toMatch(/full sum/)
    const rs = schedule('reducescatter', 'ring', ranks(8))
    expect(stepText(rs, rs.steps.length)).toMatch(/rank r has chunk r/)
  })
})

describe('the algorithms of milestone 11a', () => {
  it.each([4, 8, 16])('Tree: no rank is inside both trees, each tree has one root, and AllReduce ends with the full sum (n = %i)', (n) => {
    const [t1, t2] = treeParents(n)
    const inner = (p: number[]) => new Set(p.filter((x) => x >= 0))
    const i2 = inner(t2)
    expect([...inner(t1)].filter((r) => i2.has(r))).toEqual([])
    expect(t1.filter((x) => x < 0)).toHaveLength(1)
    expect(t2.filter((x) => x < 0)).toHaveLength(1)
    const s = schedule('allreduce', 'tree', ranks(n))
    expect(s.chunks).toBe(2)
    expect(buffersAt(s, s.steps.length).flat().every((m) => m === fullMask(n))).toBe(true)
  })

  it('Tree on 8 ranks: depth 3, so 3 reduce steps and 3 broadcast steps; the odd ranks are the leaves of tree 1', () => {
    const [t1] = treeParents(8)
    expect(Math.max(...t1.map((_, r) => treeDepth(t1, r)))).toBe(3)
    expect([...new Set(t1.filter((x) => x >= 0))].sort((a, b) => a - b)).toEqual([0, 2, 4, 6])
    expect(schedule('allreduce', 'tree', ranks(8)).steps.map((st) => st.phase)).toEqual(['reduce', 'reduce', 'reduce', 'broadcast', 'broadcast', 'broadcast'])
  })

  it('NVLS: 2 steps; after the first one, rank r has chunk r fully added; at the end, each rank has the full sum', () => {
    const s = schedule('allreduce', 'nvls', ranks(8))
    expect(s.steps.map((st) => st.phase)).toEqual(['switch-reduce', 'multicast'])
    expect(buffersAt(s, 1)[3]![3]).toBe(fullMask(8))
    expect(buffersAt(s, 2).flat().every((m) => m === fullMask(8))).toBe(true)
  })

  it.each([4, 8, 16])('PAT: log2 n steps, and the same end state as the ring (n = %i)', (n) => {
    const ag = schedule('allgather', 'pat', ranks(n))
    const rs = schedule('reducescatter', 'pat', ranks(n))
    expect(ag.steps).toHaveLength(Math.log2(n))
    expect(rs.steps).toHaveLength(Math.log2(n))
    expect(buffersAt(ag, ag.steps.length)).toEqual(buffersAt(schedule('allgather', 'ring', ranks(n)), n - 1))
    const b = buffersAt(rs, rs.steps.length)
    for (const r of range(n)) expect(b[r]![r]).toBe(fullMask(n))
  })

  it('AlltoAll: n - 1 steps, and the end state is the transpose', () => {
    const s = schedule('alltoall', 'p2p', ranks(8))
    expect(s.steps).toHaveLength(7)
    const b = buffersAt(s, 7)
    for (const r of range(8)) for (const c of range(8)) expect(b[r]![c]).toBe(1 << c)
    expect(changedAt(s, 1).has('1:0')).toBe(true) // rank 0 writes slot 0 of rank 1
  })

  it('Broadcast: 8 chunks, (n - 1) + 7 steps, and each rank ends with all chunks of rank 0', () => {
    const s = schedule('broadcast', 'ring', ranks(8))
    expect(s.chunks).toBe(BROADCAST_CHUNKS)
    expect(s.steps).toHaveLength(7 + 7)
    expect(buffersAt(s, s.steps.length).flat().every((m) => m === 1)).toBe(true)
    expect(sourceOf(buffersAt(s, 1)[1]![0]!)).toBe(0)
  })

  it('refuses an algorithm that does not run the collective', () => {
    expect(() => schedule('alltoall', 'ring', ranks(8))).toThrow(/does not run/)
    expect(() => schedule('allgather', 'nvls', ranks(8))).toThrow(/does not run/)
  })

  it('gives a step text for each new algorithm', () => {
    expect(stepText(schedule('allreduce', 'nvls', ranks(8)), 1)).toMatch(/NVSwitch/)
    expect(stepText(schedule('allreduce', 'tree', ranks(8)), 1)).toMatch(/parent/)
    expect(stepText(schedule('allgather', 'pat', ranks(8)), 1)).toMatch(/distance/)
    expect(stepText(schedule('alltoall', 'p2p', ranks(8)), 0)).toMatch(/one for each rank/)
    expect(stepText(schedule('broadcast', 'ring', ranks(8)), 0)).toMatch(/root, rank 0/)
    expect(stepText(schedule('alltoall', 'p2p', ranks(8)), 7)).toMatch(/one chunk from each rank/)
  })
})
