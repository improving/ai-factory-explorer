import { describe, expect, it } from 'vitest'
import { validAlgorithms } from '../src/collectives/algorithms'
import { busFactor } from '../src/collectives/busbw'

describe('the valid algorithms (design, section 4.1)', () => {
  it('AllReduce: NVLS on 1 node only, Tree on N nodes with 1 GPU each only', () => {
    expect(validAlgorithms('allreduce', '1n')).toEqual(['ring', 'nvls'])
    expect(validAlgorithms('allreduce', '2n')).toEqual(['ring'])
    expect(validAlgorithms('allreduce', 'n8')).toEqual(['ring', 'tree'])
  })

  it('AllGather and ReduceScatter: PAT on N nodes with 1 GPU each only', () => {
    expect(validAlgorithms('allgather', '1n')).toEqual(['ring'])
    expect(validAlgorithms('reducescatter', 'n16')).toEqual(['ring', 'pat'])
  })

  it('AlltoAll: send/receive; Broadcast: ring', () => {
    expect(validAlgorithms('alltoall', '2n')).toEqual(['p2p'])
    expect(validAlgorithms('broadcast', 'n4')).toEqual(['ring'])
  })
})

describe('the bus factor of the new collectives (nccl-tests)', () => {
  it('is (n-1)/n for AlltoAll and 1 for Broadcast', () => {
    expect(busFactor('alltoall', 8)).toBeCloseTo(0.875)
    expect(busFactor('broadcast', 16)).toBe(1)
  })
})
