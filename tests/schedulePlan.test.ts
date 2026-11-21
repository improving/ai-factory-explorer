import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { DEFAULT_JOB, domainsOf, planOf, serversOf, type Job } from '../src/schedule/plan'

const job = (patch: Partial<Job>): Job => ({ ...DEFAULT_JOB, ...patch })

describe('the schedule model', () => {
  it('counts the free GPUs of the fabric, and a degraded host is free', () => {
    const servers = serversOf(DEFAULT_CONFIG)
    expect(servers).toHaveLength(72)
    expect(servers.find((s) => s.id === 'su1-n72')?.free).toBe(8) // degraded
    expect(servers.find((s) => s.id === 'su1-n71')?.free).toBe(0) // quarantined
    expect(servers.find((s) => s.id === 'su1-n70')?.free).toBe(0) // maintenance
    expect(servers.reduce((n, s) => n + s.free, 0)).toBe(280)
  })

  it('groups the servers by SU, by rack, and by node', () => {
    expect(domainsOf(DEFAULT_CONFIG, 'su')).toHaveLength(1)
    expect(domainsOf(DEFAULT_CONFIG, 'rack')).toHaveLength(18)
    expect(domainsOf(DEFAULT_CONFIG, 'node')).toHaveLength(72)
    expect(domainsOf(DEFAULT_CONFIG, 'any')[0]?.free).toBe(280)
    expect(domainsOf(DEFAULT_CONFIG, 'rack').at(-1)?.free).toBe(16)
  })

  it('places a job inside the quota on free servers', () => {
    const p = planOf(DEFAULT_CONFIG, job({ gpus: 32 }))
    expect(p.ok).toBe(true)
    expect(p.chosen).toHaveLength(4)
    expect(p.steps.map((s) => s.conclusion)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'note'])
  })

  it('blocks a job over the queue limit', () => {
    const p = planOf(DEFAULT_CONFIG, job({ gpus: 500 }))
    expect(p.ok).toBe(false)
    expect(p.reason).toContain('limit of 403')
    expect(p.steps.at(-1)?.id).toBe('queue')
  })

  it('blocks a non-preemptible job over the quota, and lets a preemptible one pass', () => {
    const build = planOf(DEFAULT_CONFIG, job({ gpus: 400, priority: 'build' }))
    expect(build.ok).toBe(false)
    expect(build.reason).toContain('Non-preemptible work stays in quota')
    const train = planOf(DEFAULT_CONFIG, job({ gpus: 400, priority: 'train' }))
    expect(train.ok).toBe(false)
    expect(train.reason).toContain('Only 280 GPUs are free')
  })

  it('blocks a job when the free GPUs are less than the minimum gang', () => {
    const p = planOf(DEFAULT_CONFIG, job({ gpus: 300, priority: 'train', gang: 'all' }))
    expect(p.ok).toBe(false)
    expect(p.reason).toContain('minimum gang is 300')
  })

  it('lets a half gang start with half of the GPUs', () => {
    const p = planOf(DEFAULT_CONFIG, job({ gpus: 400, priority: 'train', gang: 'half' }))
    expect(p.steps.find((s) => s.id === 'capacity')?.observation).toContain('minimum gang is 200')
    expect(p.ok).toBe(true)
    expect(p.chosen).toHaveLength(Math.ceil(200 / 8))
  })

  it('blocks a job that needs more GPUs than one node has', () => {
    const p = planOf(DEFAULT_CONFIG, job({ gpus: 16, required: 'node' }))
    expect(p.ok).toBe(false)
    expect(p.reason).toContain('No one node has 16 free GPUs')
  })

  it('places a job in one rack, and names the domain', () => {
    const p = planOf(DEFAULT_CONFIG, job({ gpus: 32, required: 'rack' }))
    expect(p.ok).toBe(true)
    expect(p.segments[0]?.label).toMatch(/rack/)
    expect(p.chosen).toHaveLength(4)
    expect(p.domains.length).toBeGreaterThan(0)
  })

  it('splits a job into segments, each in its own rack', () => {
    const p = planOf(DEFAULT_CONFIG, job({ gpus: 32, required: 'rack', segments: 2 }))
    expect(p.ok).toBe(true)
    expect(p.segments).toHaveLength(2)
    expect(p.segments[0]?.domain).not.toBe(p.segments[1]?.domain)
    expect(p.chosen).toHaveLength(4)
  })

  it('marks the servers of the chosen domain that are not free', () => {
    const p = planOf(DEFAULT_CONFIG, job({ gpus: 16, required: 'rack', segments: 1 }))
    expect(p.ok).toBe(true)
    // The least free rack that fits is the last one, which holds the quarantined and maintenance hosts.
    expect(p.blocked).toEqual(expect.arrayContaining(['su1-n71', 'su1-n70']))
  })
})
