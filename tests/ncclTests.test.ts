import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { assess, formatSize, parseNcclTests, readerLimit, runScope } from '../src/collectives/ncclTests'
import { ncclSample } from '../src/collectives/ncclSample'

const run = (text: string) => {
  const r = parseNcclTests(text)
  if (!r.ok) throw new Error(r.reason)
  return r.run
}

describe('the parser of nccl-tests output', () => {
  it('reads the test, the ranks and the hosts, each row, and the footer', () => {
    const r = run(ncclSample())
    expect(r.testName).toBe('all_reduce_perf')
    expect(r.collective).toBe('allreduce')
    expect(r.ranks).toBe(16)
    expect(r.hosts).toEqual(['node-a', 'node-b'])
    expect(r.gpusPerHost).toBe(8)
    expect(r.rows.map((x) => x.size)).toEqual([8, 1048576, 16777216, 268435456, 1073741824, 8589934592])
    expect(r.rows[5]!.out.busbw).toBeCloseTo(671, 1)
    expect(r.rows[5]!.inp.wrong).toBe(0)
    expect(r.rows[5]!.type).toBe('float')
    expect(r.outOfBounds).toEqual({ count: 0, ok: true })
    expect(r.avgBusbw).toBeCloseTo(335.5)
  })

  it('maps each test binary to its collective; another test has no collective', () => {
    expect(run(ncclSample({ test: 'all_gather_perf' })).collective).toBe('allgather')
    expect(run(ncclSample({ test: 'reduce_scatter_perf' })).collective).toBe('reducescatter')
    expect(run(ncclSample({ test: 'alltoall_perf' })).collective).toBe('alltoall')
    expect(run(ncclSample({ test: 'broadcast_perf' })).collective).toBe('broadcast')
    expect(run(ncclSample({ test: 'sendrecv_perf' })).collective).toBeNull()
  })

  it('reads an output with no test line: the collective is unknown', () => {
    const r = run(ncclSample({ test: null }))
    expect(r.testName).toBeNull()
    expect(r.collective).toBeNull()
    expect(r.rows).toHaveLength(6)
  })

  it('reads #wrong = N/A (validation off) as no value', () => {
    expect(run(ncclSample({ validation: false })).rows.every((x) => x.out.wrong === null && x.inp.wrong === null)).toBe(true)
  })

  it('refuses optional columns with a clear message', () => {
    expect(parseNcclTests(ncclSample({ extraColumns: true }))).toMatchObject({ ok: false, reason: /default columns only.*i_min, i_max/ })
  })

  it('reads "cputime" as the time column', () => {
    expect(run(ncclSample().replace('   time   algbw', 'cputime   algbw')).rows).toHaveLength(6)
  })

  it('refuses an output with repeated sizes (more than one test, or more than one data type)', () => {
    const two = ncclSample()
    expect(parseNcclTests(`${two}\n${two}`)).toMatchObject({ ok: false, reason: /more than one result table/ })
  })

  it('refuses a text that is not nccl-tests output', () => {
    expect(parseNcclTests('node-a:1234:1234 [0] NCCL INFO Channel 00/08 :    0   1   2   3')).toMatchObject({ ok: false, reason: /No result table/ })
    expect(parseNcclTests('')).toMatchObject({ ok: false })
  })
})

describe('the assessment of a run', () => {
  it('passes a run whose largest size is at or above the threshold', () => {
    const a = assess(run(ncclSample({ busbwPeak: 671 })), 800, 80)
    expect(a.largest.size).toBe(8589934592)
    expect(a.best).toBeCloseTo(671, 1)
    expect(a.percent).toBeCloseTo(83.9, 1)
    expect(a.below).toBe(false)
    expect(a.wrong).toEqual([])
    expect(a.failed).toBe(false)
  })

  it('marks a slow run, data errors, and a FAILED footer', () => {
    expect(assess(run(ncclSample({ busbwPeak: 400 })), 800, 80).below).toBe(true)
    const bad = assess(run(ncclSample({ wrongAt: 16777216, failed: true })), 800, 80)
    expect(bad.wrong.map((x) => x.size)).toEqual([16777216])
    expect(bad.failed).toBe(true)
  })

  it('has no percentage with no limit', () => {
    const a = assess(run(ncclSample()), null, 80)
    expect(a.percent).toBeNull()
    expect(a.below).toBe(false)
  })

  it('formats the sizes in binary units', () => {
    expect([8, 1048576, 268435456, 8589934592].map(formatSize)).toEqual(['8 B', '1 MiB', '256 MiB', '8 GiB'])
    expect(formatSize(1536)).toBe('1.5 KiB')
  })
})

describe('the limit of a run', () => {
  it('finds the scope of the app that has the ranks of the run', () => {
    expect(runScope(run(ncclSample({ hosts: 1 })), 8, false)).toBe('1n')
    expect(runScope(run(ncclSample({ hosts: 2 })), 8, false)).toBe('2n')
    expect(runScope(run(ncclSample({ hosts: 8, gpusPerHost: 1 })), 8, false)).toBe('n8')
    expect(runScope(run(ncclSample({ hosts: 3 })), 8, false)).toBeNull()
    expect(runScope(run(ncclSample({ hosts: 1, gpusPerHost: 4 })), 4, true)).toBe('1t')
    expect(runScope(run(ncclSample({ hosts: 4, gpusPerHost: 4 })), 4, true)).toBe('4t')
  })

  it('gives the limit of the model for the collective and the scope: 800 GB/s for AllReduce on 2 nodes of B300', () => {
    expect(readerLimit(DEFAULT_CONFIG, run(ncclSample()), 'allreduce')).toMatchObject({ scope: '2n', algorithm: 'ring' })
    expect(readerLimit(DEFAULT_CONFIG, run(ncclSample()), 'allreduce')!.limitGBps).toBeCloseTo(800)
    expect(readerLimit(DEFAULT_CONFIG, run(ncclSample({ hosts: 3 })), 'allreduce')).toBeNull()
    expect(readerLimit(withPatch(DEFAULT_CONFIG, { platform: 'gb200-nvl72' })!, run(ncclSample()), 'allreduce')).toBeNull()
  })
})

describe('real output variants (final review)', () => {
  it('drops the rows of size 0 (the count is rounded down to a multiple of the ranks)', () => {
    const zero = '           0             0     float    none      -1     0.13    0.00    0.00      0     0.12    0.00    0.00      0'
    const text = ncclSample({ test: 'all_gather_perf' }).replace(/(\n#\s+\(B\)[^\n]*)/, `$1\n${zero}\n${zero}`)
    const r = run(text)
    expect(r.rows).toHaveLength(6)
    expect(r.rows.every((x) => x.size > 0)).toBe(true)
  })

  it('maps a binary name with a suffix (all_reduce_perf_mpi) to its collective', () => {
    expect(run(ncclSample({ test: 'all_reduce_perf_mpi' })).collective).toBe('allreduce')
  })

  it('reads the rank lines of older versions, with no "Group"', () => {
    const r = run(ncclSample().replace(/Group\s+0\s+/g, ''))
    expect(r.ranks).toBe(16)
    expect(r.hosts).toEqual(['node-a', 'node-b'])
  })

  it('reads lines with an mpirun --tag-output or an srun -l prefix', () => {
    for (const prefix of ['[1,0]<stdout>:', '0: ']) {
      const r = run(ncclSample().split('\n').map((l) => prefix + l).join('\n'))
      expect(r.rows).toHaveLength(6)
      expect(r.ranks).toBe(16)
    }
  })
})
