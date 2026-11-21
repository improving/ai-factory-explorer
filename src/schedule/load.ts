import { platformFor } from '../catalog/platforms'
import { KAI_METRICS_URL } from '../catalog/urls'
import { assumed, confirmed, type Fact } from '../catalog/fact'
import type { Config } from '../config/config'
import { designOf } from '../topology/fabric'
import { QUEUES, type Priority, type QueueId } from './plan'
import { intBetween, makeRng, pickWeighted, type Rng } from './rng'

// The load of a fleet over 30 minutes of scheduler time. One tick is one second, so a latency is in the unit of
// e2e_scheduling_latency_milliseconds, and a run of 1800 ticks is the half hour of a busy site.
export const TICKS = 1800
export const SNAP = 30 // the fleet is saved every 30 ticks: the tiles show the state at the nearest snapshot

// The metric names of M5, so the panel and the module use the same words.
export const QUEUE_METRIC: Fact<string> = confirmed('queue_deserved_gpus and queue_allocated_gpus', undefined, KAI_METRICS_URL)
export const LATENCY_METRIC: Fact<string> = confirmed('e2e_scheduling_latency_milliseconds', undefined, KAI_METRICS_URL)
export const EVICTION_METRIC: Fact<string> = confirmed('pod_group_evicted_pods_total', undefined, KAI_METRICS_URL)

// The sources give the metrics and the rules of the scheduler, not the load of a site. The app draws the load.
export const LOAD_MODEL_NOTE: Fact<string> = assumed(
  'the arrival rate, the durations, and the mix of the jobs',
  undefined,
  'The sources give the rules of the scheduler and the names of its metrics, not the load of a site. The app draws the load, so the panel gives a shape and not a forecast.',
  KAI_METRICS_URL,
)

export type LoadSpec = { seed: number; nodes: number; perMinute: number }
export const DEFAULT_LOAD: LoadSpec = { seed: 7, nodes: 4608, perMinute: 120 }
export const NODE_CHOICES = [288, 576, 1152, 2304, 4608] as const
export const RATE_CHOICES = [10, 30, 60, 120, 240] as const
export const SEED_MAX = 9999

// The nearest choice of a list: a link that names a value that the panel does not offer takes the one next to it.
export function nearest(choices: readonly number[], value: number): number {
  const v = Number.isFinite(value) ? value : choices[0]!
  return choices.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best), choices[0]!)
}

// A level of the load model: a node holds one job of a small gang only, so the model stops at the SU.
export type LoadLevel = 'any' | 'rack' | 'su'
const QUEUE_ORDER: QueueId[] = ['team-a', 'team-b', 'team-c']
const ATTEMPTS = 8 // the jobs of one list that the scheduler tries in one tick
const VICTIMS = 8 // the victims that a preemption tries, at most
const SIZES = [8, 16, 32, 64, 128, 256]

export type Rack = { index: number; su: number; gpus: number }
export type Fleet = {
  racks: Rack[]
  gpusPerServer: number
  gpusPerRack: number
  gpusPerSu: number
  racksPerSu: number
  suCount: number
  servers: number
  total: number
}

// The fleet of the model: whole racks, from the shape of the configuration. The node count is a control of the
// model, not a change of the configuration, so the fabric above the panel stays the fabric of the site.
export function fleetOf(config: Config, nodes: number): Fleet {
  const design = designOf(config)
  const gpusPerServer = platformFor(config).gpusPerServer.value
  const perRack = Math.max(1, design.serversPerRack.value)
  const racksPerSu = Math.max(1, Math.ceil(design.serversPerSu.value / perRack))
  const rackCount = Math.max(1, Math.ceil(Math.max(1, Math.round(nodes)) / perRack))
  const suCount = Math.ceil(rackCount / racksPerSu)
  const gpusPerRack = perRack * gpusPerServer
  const racks: Rack[] = Array.from({ length: rackCount }, (_, i) => ({ index: i, su: Math.floor(i / racksPerSu), gpus: gpusPerRack }))
  return { racks, gpusPerServer, gpusPerRack, gpusPerSu: gpusPerRack * racksPerSu, racksPerSu, suCount, servers: rackCount * perRack, total: rackCount * gpusPerRack }
}

export type Hold = { rack: number; gpus: number }
export type LoadJob = {
  id: number
  queue: QueueId
  gpus: number
  priority: Priority
  required: LoadLevel
  arrive: number // the tick of the arrival (a job that loses its pods keeps it: the wait is the whole wait)
  duration: number // ticks of a run
  end: number | null
  hold: Hold[]
}

export type LoadTick = {
  t: number
  pending: Record<QueueId, number> // GPUs that wait
  pendingJobs: Record<QueueId, number>
  allocated: Record<QueueId, number> // GPUs that run
  allocatedBuild: Record<QueueId, number> // the part of the allocation that is non-preemptible: it stays in quota
  free: number
  placed: number
  latency: number | null // the p95 of the placements of this tick, in ms
  evicted: number
}

export type LoadRun = {
  spec: LoadSpec
  fleet: Fleet
  ticks: LoadTick[]
  snaps: number[][] // the free GPUs of each rack, every SNAP ticks
  quota: Record<QueueId, number>
  limit: Record<QueueId, number>
  jobs: number
  placed: number
  evicted: number
  evictedBy: Record<QueueId, number>
  p95: number | null
  maxPending: number
  maxPendingAt: number
}

export function p95(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]!
}

const percent = (total: number, pct: number) => Math.max(1, Math.round((total * pct) / 100))

// The size and the level of a job. The size comes first, then a level that can hold it, so that a pending job is
// always a capacity or a quota answer, and never a job that no domain could ever hold.
export function mixOf(rng: Rng, fleet: Fleet): { gpus: number; required: LoadLevel } {
  const sizes = SIZES.filter((s) => s <= fleet.total)
  const gpus = pickWeighted(rng, sizes.map((s) => ({ v: s, w: s <= 64 ? 3 : 1 })))
  const levels: { v: LoadLevel; w: number }[] = [{ v: 'any', w: 55 }]
  if (gpus <= fleet.gpusPerRack) levels.push({ v: 'rack', w: 30 })
  if (gpus <= fleet.gpusPerSu) levels.push({ v: 'su', w: 15 })
  return { gpus, required: pickWeighted(rng, levels) }
}

// The run of the fleet: the arrivals, the placement, the preemption, the reclaim, and the metrics of each tick.
// The whole run is computed at once, so Play is a cursor and a link gives the same numbers.
export function runLoad(config: Config, spec: LoadSpec): LoadRun {
  const fleet = fleetOf(config, spec.nodes)
  const rng = makeRng(spec.seed)
  const free = fleet.racks.map((r) => r.gpus)
  const suFree = Array.from({ length: fleet.suCount }, () => 0)
  for (const r of fleet.racks) suFree[r.su]! += r.gpus
  const zero = (): Record<QueueId, number> => ({ 'team-a': 0, 'team-b': 0, 'team-c': 0 })
  const allocated = zero()
  const allocatedBuild = zero()
  const pendingGpus = zero()
  const quota = zero()
  const limit = zero()
  for (const q of QUEUES) {
    quota[q.id] = percent(fleet.total, q.quotaPct)
    limit[q.id] = Math.max(quota[q.id]!, percent(fleet.total, q.limitPct))
  }
  const pending: Record<QueueId, { build: LoadJob[]; train: LoadJob[] }> = {
    'team-a': { build: [], train: [] },
    'team-b': { build: [], train: [] },
    'team-c': { build: [], train: [] },
  }
  const running: LoadJob[] = []
  const ticks: LoadTick[] = []
  const snaps: number[][] = []
  const latencies: number[] = []
  const evictedBy = zero()
  let jobs = 0
  let placed = 0
  let evicted = 0
  let nextId = 1
  let maxPending = 0
  let maxPendingAt = 0

  const unhold = (job: LoadJob) => {
    for (const h of job.hold) {
      free[h.rack]! += h.gpus
      suFree[fleet.racks[h.rack]!.su]! += h.gpus
    }
  }
  const rehold = (job: LoadJob) => {
    for (const h of job.hold) {
      free[h.rack]! -= h.gpus
      suFree[fleet.racks[h.rack]!.su]! -= h.gpus
    }
  }
  const release = (job: LoadJob) => {
    unhold(job)
    allocated[job.queue] -= job.gpus
    if (job.priority === 'build') allocatedBuild[job.queue] -= job.gpus
  }
  const take = (job: LoadJob, hold: Hold[], t: number) => {
    for (const h of hold) {
      free[h.rack]! -= h.gpus
      suFree[fleet.racks[h.rack]!.su]! -= h.gpus
    }
    allocated[job.queue] += job.gpus
    if (job.priority === 'build') allocatedBuild[job.queue] += job.gpus
    job.hold = hold
    job.end = t + job.duration
    running.push(job)
  }
  // The racks that hold a job of gpus GPUs, inside a set of racks: the domain with the least free capacity that
  // fits, as the domain selection of KAI. A level of "any" takes the racks in index order.
  const spread = (racks: number[], gpus: number): Hold[] | null => {
    const hold: Hold[] = []
    let left = gpus
    for (const i of racks) {
      if (left <= 0) break
      const take = Math.min(left, free[i]!)
      if (take > 0) {
        hold.push({ rack: i, gpus: take })
        left -= take
      }
    }
    return left <= 0 ? hold : null
  }
  const findHold = (job: LoadJob): Hold[] | null => {
    if (job.required === 'rack') {
      let best = -1
      for (let i = 0; i < free.length; i++) if (free[i]! >= job.gpus && (best < 0 || free[i]! < free[best]!)) best = i
      return best < 0 ? null : [{ rack: best, gpus: job.gpus }]
    }
    if (job.required === 'su') {
      let best = -1
      for (let s = 0; s < suFree.length; s++) if (suFree[s]! >= job.gpus && (best < 0 || suFree[s]! < suFree[best]!)) best = s
      if (best < 0) return null
      const racks = fleet.racks.filter((r) => r.su === best).map((r) => r.index).sort((a, b) => free[a]! - free[b]!)
      return spread(racks, job.gpus)
    }
    return spread(fleet.racks.map((r) => r.index), job.gpus)
  }
  const capOf = (queue: QueueId, priority: Priority) => (priority === 'build' ? quota[queue]! : limit[queue]!)

  // The placement of one job: the quota gate, then the capacity. A job that a preemption can make room for is not
  // a "capacity" answer: the caller asks for the victims.
  const tryPlace = (job: LoadJob, t: number): 'ok' | 'quota' | 'capacity' => {
    if (allocated[job.queue] + job.gpus > capOf(job.queue, job.priority)) return 'quota'
    const hold = findHold(job)
    if (!hold) return 'capacity'
    take(job, hold, t)
    return 'ok'
  }

  // A non-preemptible job that no capacity holds: preemption inside the queue, then reclaim from a queue that is
  // above its quota. The victims are the smallest train jobs, and the fewest of them that make room.
  const evictFor = (job: LoadJob, t: number): boolean => {
    const cands = running.filter((r) => r.priority === 'train' && (r.queue === job.queue || allocated[r.queue] > quota[r.queue]!))
    if (cands.length === 0) return false
    cands.sort((a, b) => a.gpus - b.gpus || a.id - b.id)
    for (let n = 1; n <= Math.min(VICTIMS, cands.length); n++) {
      const victims = cands.slice(0, n)
      for (const v of victims) unhold(v)
      const hold = findHold(job)
      if (hold) {
        for (const v of victims) {
          allocated[v.queue] -= v.gpus
          const at = running.indexOf(v)
          if (at >= 0) running.splice(at, 1)
          v.hold = []
          v.end = null
          evicted++
          evictedBy[v.queue]++
          // The pods of the victim go back to the queue of their job group, and their wait starts at their arrival.
          pending[v.queue].train.push(v)
          pendingGpus[v.queue] += v.gpus
        }
        take(job, hold, t)
        return true
      }
      for (const v of victims) rehold(v)
    }
    return false
  }

  for (let t = 0; t < TICKS; t++) {
    for (let i = running.length - 1; i >= 0; i--) {
      const r = running[i]!
      if (r.end !== null && r.end <= t) {
        release(r)
        running.splice(i, 1)
      }
    }
    const rate = spec.perMinute / 60
    let n = Math.floor(rate)
    if (rng() < rate - n) n++
    for (let k = 0; k < n; k++) {
      const mix = mixOf(rng, fleet)
      const queue = pickWeighted<QueueId>(rng, [
        { v: 'team-a', w: 50 },
        { v: 'team-b', w: 30 },
        { v: 'team-c', w: 20 },
      ])
      const job: LoadJob = {
        id: nextId++,
        queue,
        gpus: mix.gpus,
        priority: rng() < 0.4 ? 'build' : 'train',
        required: mix.required,
        arrive: t,
        duration: intBetween(rng, 60, 600),
        end: null,
        hold: [],
      }
      jobs++
      pending[queue][job.priority === 'build' ? 'build' : 'train'].push(job)
      pendingGpus[queue] += job.gpus
    }
    let placedNow = 0
    let evictedNow = 0
    const lat: number[] = []
    for (const q of QUEUE_ORDER) {
      for (const kind of ['build', 'train'] as const) {
        const list = pending[q][kind]
        let tries = 0
        let evictTried = false
        for (let i = 0; i < list.length && tries < ATTEMPTS; ) {
          const job = list[i]!
          tries++
          const r = tryPlace(job, t)
          if (r === 'ok') {
            list.splice(i, 1)
            pendingGpus[q] -= job.gpus
            placedNow++
            placed++
            lat.push((t - job.arrive) * 1000)
            continue
          }
          if (r === 'capacity' && job.priority === 'build' && !evictTried) {
            evictTried = true
            const before = evicted
            if (evictFor(job, t)) {
              list.splice(i, 1)
              pendingGpus[q] -= job.gpus
              placedNow++
              placed++
            placed++
              lat.push((t - job.arrive) * 1000)
              evictedNow += evicted - before
              continue
            }
          }
          i++
        }
      }
    }
    latencies.push(...lat)
    const pendingTotal = QUEUE_ORDER.reduce((sum, q) => sum + pendingGpus[q], 0)
    ticks.push({
      t,
      pending: { ...pendingGpus },
      pendingJobs: { 'team-a': pending['team-a'].build.length + pending['team-a'].train.length, 'team-b': pending['team-b'].build.length + pending['team-b'].train.length, 'team-c': pending['team-c'].build.length + pending['team-c'].train.length },
      allocated: { ...allocated },
      allocatedBuild: { ...allocatedBuild },
      free: free.reduce((sum, f) => sum + f, 0),
      placed: placedNow,
      latency: p95(lat),
      evicted: evictedNow,
    })
    if (t % SNAP === 0) snaps.push([...free])
    if (pendingTotal > maxPending) {
      maxPending = pendingTotal
      maxPendingAt = t
    }
  }
  return { spec, fleet, ticks, snaps, quota, limit, jobs, placed, evicted, evictedBy, p95: p95(latencies), maxPending, maxPendingAt }
}

// The tick at the cursor, and the snapshot of the fleet that it shows.
export const tickAt = (run: LoadRun, cursor: number): LoadTick => run.ticks[Math.min(run.ticks.length - 1, Math.max(0, Math.round(cursor)))]!
export const snapAt = (run: LoadRun, cursor: number): number[] =>
  run.snaps[Math.min(run.snaps.length - 1, Math.max(0, Math.floor(Math.round(cursor) / SNAP)))] ?? run.snaps[run.snaps.length - 1]!
export const clockOf = (t: number): string => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`

// The queue percentages of the model are the demo values of the decision view.
export const queueName = (id: QueueId): string => QUEUES.find((q) => q.id === id)?.label ?? id
