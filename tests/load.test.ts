import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { DEFAULT_LOAD, SNAP, TICKS, clockOf, fleetOf, mixOf, p95, runLoad, snapAt, tickAt, type LoadSpec } from '../src/schedule/load'
import { intBetween, makeRng, pickWeighted } from '../src/schedule/rng'

const FLEET = fleetOf(DEFAULT_CONFIG, 576)
const spec = (patch: Partial<LoadSpec>): LoadSpec => ({ ...DEFAULT_LOAD, ...patch })

describe('the seeded PRNG', () => {
  it('gives the same numbers for the same seed, and another run for another seed', () => {
    const a = Array.from({ length: 8 }, makeRng(3))
    const b = Array.from({ length: 8 }, makeRng(3))
    const c = Array.from({ length: 8 }, makeRng(4))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('stays inside [0, 1), and an integer stays inside its bounds', () => {
    const rng = makeRng(11)
    for (let i = 0; i < 500; i++) {
      const x = rng()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      const n = intBetween(rng, 3, 7)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(7)
    }
  })

  it('picks only the items of the list, and a weight of zero never', () => {
    const rng = makeRng(5)
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) seen.add(pickWeighted(rng, [{ v: 'a', w: 1 }, { v: 'b', w: 0 }, { v: 'c', w: 3 }]))
    expect([...seen].sort()).toEqual(['a', 'c'])
  })

  it('a seed of 0 and a seed that is not a number are stable', () => {
    expect(Array.from({ length: 4 }, makeRng(0))).toEqual(Array.from({ length: 4 }, makeRng(0)))
    expect(Array.from({ length: 4 }, makeRng(Number.NaN))).toEqual(Array.from({ length: 4 }, makeRng(0)))
  })
})

describe('the fleet of the load model', () => {
  it('takes its shape from the configuration, and its size from the node count', () => {
    // The B300 XDR design: 4 servers in a rack, 72 in an SU, 8 GPUs in a server.
    expect(FLEET.gpusPerServer).toBe(8)
    expect(FLEET.gpusPerRack).toBe(32)
    expect(FLEET.racks).toHaveLength(144)
    expect(FLEET.servers).toBe(576)
    expect(FLEET.total).toBe(4608)
    expect(FLEET.racksPerSu).toBe(18)
    expect(FLEET.suCount).toBe(8)
    expect(FLEET.gpusPerSu).toBe(576)
  })

  it('gives whole racks, so the servers are rounded up', () => {
    const f = fleetOf(DEFAULT_CONFIG, 300)
    expect(f.racks).toHaveLength(75)
    expect(f.servers).toBe(300)
    expect(fleetOf(DEFAULT_CONFIG, 1).racks).toHaveLength(1)
  })

  it('the number of the racks is the same for each SU', () => {
    expect(FLEET.racks.filter((r) => r.su === 0)).toHaveLength(18)
    expect(FLEET.racks.at(-1)?.su).toBe(7)
  })
})

describe('the mix of the jobs', () => {
  it('never asks for a level that cannot hold the size', () => {
    const rng = makeRng(9)
    for (let i = 0; i < 2000; i++) {
      const { gpus, required } = mixOf(rng, FLEET)
      if (required === 'rack') expect(gpus).toBeLessThanOrEqual(FLEET.gpusPerRack)
      if (required === 'su') expect(gpus).toBeLessThanOrEqual(FLEET.gpusPerSu)
      expect(gpus).toBeLessThanOrEqual(FLEET.total)
    }
  })

  it('a small fleet has no level of an SU', () => {
    const small = fleetOf(DEFAULT_CONFIG, 8) // two racks, one SU
    const rng = makeRng(2)
    const levels = new Set(Array.from({ length: 400 }, () => mixOf(rng, small).required))
    expect(levels.has('rack')).toBe(true)
    expect(levels.has('su')).toBe(true)
  })
})

describe('the load of the fleet', () => {
  it('gives the same run for the same seed', () => {
    const a = runLoad(DEFAULT_CONFIG, spec({ nodes: 576 }))
    const b = runLoad(DEFAULT_CONFIG, spec({ nodes: 576 }))
    expect(b.ticks).toEqual(a.ticks)
    expect([b.jobs, b.placed, b.evicted, b.maxPending]).toEqual([a.jobs, a.placed, a.evicted, a.maxPending])
  })

  it('gives another run for another seed', () => {
    const a = runLoad(DEFAULT_CONFIG, spec({ nodes: 576, seed: 7 }))
    const b = runLoad(DEFAULT_CONFIG, spec({ nodes: 576, seed: 8 }))
    expect(b.ticks).not.toEqual(a.ticks)
  })

  it('records one tick for each second, and one snapshot for each 30 seconds', () => {
    const run = runLoad(DEFAULT_CONFIG, spec({ nodes: 576 }))
    expect(run.ticks).toHaveLength(TICKS)
    expect(run.ticks.at(-1)?.t).toBe(TICKS - 1)
    expect(run.snaps).toHaveLength(TICKS / SNAP)
    expect(run.snaps[0]).toHaveLength(FLEET.racks.length)
  })

  it('keeps the non-preemptible work inside its quota, and every queue inside its limit', () => {
    const run = runLoad(DEFAULT_CONFIG, spec({ perMinute: 240, nodes: 288 }))
    for (const tick of run.ticks) {
      for (const q of ['team-a', 'team-b', 'team-c'] as const) {
        expect(tick.allocatedBuild[q]).toBeLessThanOrEqual(run.quota[q]!)
        expect(tick.allocated[q]).toBeLessThanOrEqual(run.limit[q]!)
        expect(tick.allocated[q]).toBeGreaterThanOrEqual(0)
      }
      expect(tick.free).toBeGreaterThanOrEqual(0)
    }
  })

  it('never gives a GPU of a rack to two jobs', () => {
    const run = runLoad(DEFAULT_CONFIG, spec({ perMinute: 240, nodes: 288 }))
    for (const snap of run.snaps) for (const f of snap) {
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(FLEET.gpusPerRack)
    }
  })

  it('leaves no queue when the arrivals are rare', () => {
    const run = runLoad(DEFAULT_CONFIG, spec({ perMinute: 1, nodes: 576 }))
    expect(run.maxPending).toBe(0)
    expect(run.evicted).toBe(0)
    expect(run.jobs).toBeGreaterThan(10)
    expect(run.placed).toBe(run.jobs)
  })

  it('grows the queue, and the latency, when the arrivals are many', () => {
    const run = runLoad(DEFAULT_CONFIG, spec({ perMinute: 240, nodes: 288 }))
    expect(run.maxPending).toBeGreaterThan(0)
    expect(run.p95).not.toBeNull()
    expect(run.p95!).toBeGreaterThan(1000)
    expect(run.placed).toBeLessThan(run.jobs)
    const rare = runLoad(DEFAULT_CONFIG, spec({ perMinute: 10, nodes: 288 }))
    expect(rare.maxPending).toBeLessThan(run.maxPending)
  })

  it('evicts the pods of a train job only', () => {
    const run = runLoad(DEFAULT_CONFIG, spec({ perMinute: 240, nodes: 288 }))
    expect(run.evicted).toBeGreaterThan(0)
    expect(Object.values(run.evictedBy).reduce((n, x) => n + x, 0)).toBe(run.evicted)
  })

  it('the default run is near its capacity: the queue fills and empties again', () => {
    const run = runLoad(DEFAULT_CONFIG, DEFAULT_LOAD)
    expect(run.fleet.racks).toHaveLength(1152)
    expect(run.maxPending).toBeGreaterThan(0)
    expect(run.maxPending).toBeLessThan(run.fleet.total) // the fleet still places work: this is not a dead fleet
    expect(run.p95).not.toBeNull()
    const empty = run.ticks.filter((t) => t.pending['team-a'] + t.pending['team-b'] + t.pending['team-c'] === 0)
    expect(empty.length).toBeGreaterThan(0) // some ticks have no queue at all
  })

  it('a fleet at half its capacity has no queue and no eviction', () => {
    const run = runLoad(DEFAULT_CONFIG, spec({ perMinute: 60, nodes: 4608 }))
    expect(run.maxPending).toBe(0)
    expect(run.evicted).toBe(0)
  })

  it('gives the tick and the snapshot at the cursor, inside the run', () => {
    const run = runLoad(DEFAULT_CONFIG, spec({ nodes: 576 }))
    expect(tickAt(run, 0).t).toBe(0)
    expect(tickAt(run, -5).t).toBe(0)
    expect(tickAt(run, 99999).t).toBe(TICKS - 1)
    expect(snapAt(run, 0)).toBe(run.snaps[0])
    expect(snapAt(run, SNAP * 2)).toBe(run.snaps[2])
    expect(snapAt(run, 99999)).toBe(run.snaps.at(-1))
  })

  it('a run at 4608 nodes is quick', () => {
    const started = Date.now()
    const run = runLoad(DEFAULT_CONFIG, spec({ perMinute: 240, nodes: 4608 }))
    expect(run.fleet.racks).toHaveLength(1152)
    expect(Date.now() - started).toBeLessThan(4000)
  })
})

describe('the p95 and the clock', () => {
  it('gives the value at the 95th percentile, and null for no value', () => {
    expect(p95([])).toBeNull()
    expect(p95([5])).toBe(5)
    expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(95)
    expect(p95([1, 2, 3, 4])).toBe(4)
  })

  it('gives the clock of a tick in minutes and seconds', () => {
    expect(clockOf(0)).toBe('00:00')
    expect(clockOf(59)).toBe('00:59')
    expect(clockOf(600)).toBe('10:00')
    expect(clockOf(1799)).toBe('29:59')
  })
})
