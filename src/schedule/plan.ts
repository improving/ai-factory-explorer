import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { fabricShape, generateFabric } from '../topology/fabric'
import { parseServerId } from '../topology/ids'
import { assignments } from '../topology/assign'

export type QueueId = 'team-a' | 'team-b' | 'team-c'
export type Priority = 'train' | 'build'
export type Level = 'any' | 'su' | 'rack' | 'node'
export type Gang = 'all' | 'half'

export type Job = {
  queue: QueueId
  gpus: number
  priority: Priority
  gang: Gang
  required: Level
  preferred: Level
  segments: number
}

export const DEFAULT_JOB: Job = { queue: 'team-a', gpus: 32, priority: 'build', gang: 'all', required: 'any', preferred: 'rack', segments: 1 }

// The three queues are a demo model: the percentages of the fleet are assumed, and the site sets its own.
export type QueueInfo = { id: QueueId; label: string; quotaPct: number; limitPct: number }
export const QUEUES: QueueInfo[] = [
  { id: 'team-a', label: 'Team A', quotaPct: 50, limitPct: 70 },
  { id: 'team-b', label: 'Team B', quotaPct: 30, limitPct: 45 },
  { id: 'team-c', label: 'Team C', quotaPct: 20, limitPct: 100 },
]
export const QUEUE_BY_ID = new Map(QUEUES.map((q) => [q.id, q] as const))

export const LEVEL_LABEL: Record<Level, string> = { any: 'any domain', su: 'one SU', rack: 'one rack', node: 'one node' }
export const PRIORITY_LABEL: Record<Priority, string> = { train: 'Train (preemptible)', build: 'Build (non-preemptible)' }
export const GANG_LABEL: Record<Gang, string> = { all: 'All GPUs at once', half: 'At least half' }

export type Conclusion = 'pass' | 'blocked' | 'note'
export type Step = { id: string; label: string; observation: string; conclusion: Conclusion }
export type Domain = { key: string; label: string; free: number; servers: ServerInfo[] }
export type ServerInfo = { id: string; su: number; rack: number; free: number; state: string }
export type Segment = { index: number; domain: string; label: string; gpus: number; servers: string[] }

export type Plan = {
  job: Job
  ok: boolean
  reason: string | null
  steps: Step[]
  chosen: string[]
  blocked: string[]
  domains: { key: string; label: string; free: number }[]
  segments: Segment[]
  quota: number
  limit: number
  freeTotal: number
  total: number
  gpusPerServer: number
}

const percent = (total: number, pct: number) => Math.max(1, Math.round((total * pct) / 100))

// The servers of the fabric, with the free GPUs of each one. A degraded host is free: its health is a warning.
export function serversOf(config: Config): ServerInfo[] {
  const g = platformFor(config).gpusPerServer.value
  const shape = fabricShape(config)
  const a = assignments(config)
  return generateFabric(config)
    .nodes.filter((n) => n.kind === 'server')
    .map((n) => {
      const p = parseServerId(n.id)!
      const state = a.get(n.id)?.state ?? 'available'
      const free = state === 'available' || state === 'degraded' ? g : 0
      return { id: n.id, su: p.su, rack: Math.ceil(p.n / shape.perRack), free, state }
    })
}

const domainKey = (s: ServerInfo, level: Exclude<Level, 'any'>): string =>
  level === 'su' ? `su${s.su}` : level === 'rack' ? `su${s.su}-k${s.rack}` : s.id

const domainLabel = (key: string, level: Exclude<Level, 'any'>): string =>
  level === 'su' ? `SU ${key.slice(2)}` : level === 'rack' ? `SU ${key.slice(2).split('-k')[0]} rack ${key.split('-k')[1]}` : key

// The domains at a level, and the free GPUs of each one. "any" is the whole cluster.
export function domainsOf(config: Config, level: Level, servers = serversOf(config)): Domain[] {
  if (level === 'any') return [{ key: 'cluster', label: 'the cluster', free: servers.reduce((n, s) => n + s.free, 0), servers }]
  const map = new Map<string, Domain>()
  for (const s of servers) {
    const key = domainKey(s, level)
    const d = map.get(key) ?? { key, label: domainLabel(key, level), free: 0, servers: [] }
    d.free += s.free
    d.servers.push(s)
    map.set(key, d)
  }
  return [...map.values()]
}

// The order of the servers inside a domain: the preferred sub-domain with more free GPUs first, then the server
// with more free GPUs. This is the node ordering of KAI: it packs a job into as few preferred sub-domains as it can.
function ordered(servers: ServerInfo[], preferred: Level): ServerInfo[] {
  const key = (s: ServerInfo) => (preferred === 'any' ? '' : domainKey(s, preferred))
  const groups = new Map<string, ServerInfo[]>()
  for (const s of servers) {
    const k = key(s)
    groups.set(k, [...(groups.get(k) ?? []), s])
  }
  const free = (list: ServerInfo[]) => list.reduce((n, s) => n + s.free, 0)
  return [...groups.values()].sort((a, b) => free(b) - free(a)).flatMap((list) => [...list].sort((a, b) => b.free - a.free))
}

const takeServers = (servers: ServerInfo[], gpus: number, gpusPerServer: number): string[] => {
  const out: string[] = []
  let left = gpus
  for (const s of servers) {
    if (left <= 0) break
    if (s.free === 0) continue
    out.push(s.id)
    left -= Math.min(s.free, gpusPerServer)
  }
  return left <= 0 ? out : []
}

// The decision path of one job, against the free capacity of the fabric.
export function planOf(config: Config, job: Job): Plan {
  const servers = serversOf(config)
  const g = platformFor(config).gpusPerServer.value
  const total = servers.length * g
  const freeTotal = servers.reduce((n, s) => n + s.free, 0)
  const q = QUEUE_BY_ID.get(job.queue)!
  const quota = percent(total, q.quotaPct)
  const limit = Math.max(quota, percent(total, q.limitPct))
  const minGang = job.gang === 'all' ? job.gpus : Math.ceil(job.gpus / 2)
  const steps: Step[] = []
  const done = (ok: boolean, reason: string | null, extra: Partial<Plan> = {}): Plan => ({
    job,
    ok,
    reason,
    steps,
    chosen: [],
    blocked: [],
    domains: [],
    segments: [],
    quota,
    limit,
    freeTotal,
    total,
    gpusPerServer: g,
    ...extra,
  })

  steps.push({
    id: 'queue',
    label: 'Queue limit',
    observation: `${q.label} may use up to ${limit} GPUs (quota ${quota}). The job asks for ${job.gpus}.`,
    conclusion: job.gpus <= limit ? 'pass' : 'blocked',
  })
  if (job.gpus > limit) return done(false, `${q.label} has a limit of ${limit} GPUs, and the job asks for ${job.gpus}.`)

  steps.push({
    id: 'priority',
    label: 'Priority and quota',
    observation:
      job.priority === 'build'
        ? `A non-preemptible job uses only the ${quota}-GPU quota. The job asks for ${job.gpus}.`
        : `A preemptible job may use the ${limit}-GPU limit, also over the quota.`,
    conclusion: job.priority === 'build' && job.gpus > quota ? 'blocked' : 'pass',
  })
  if (job.priority === 'build' && job.gpus > quota)
    return done(false, `Non-preemptible work stays in quota: the job asks for ${job.gpus} GPUs, and the quota is ${quota}.`)

  steps.push({
    id: 'capacity',
    label: 'Free GPUs',
    observation: `${freeTotal} of ${total} GPUs are free. The minimum gang is ${minGang}.`,
    conclusion: minGang <= freeTotal ? 'pass' : 'blocked',
  })
  if (minGang > freeTotal) return done(false, `Only ${freeTotal} GPUs are free, and the minimum gang is ${minGang}.`)

  const level: Level = job.required === 'any' && job.segments > 1 ? 'rack' : job.required
  const domains = domainsOf(config, level, servers)
  const perSegment = Math.ceil(job.gpus / job.segments)
  const need = job.segments > 1 ? perSegment : minGang
  const fits = domains.filter((d) => d.free >= need)
  const largest = [...domains].sort((a, b) => b.free - a.free)[0]
  steps.push({
    id: 'topology',
    label: `Topology: ${LEVEL_LABEL[level]}`,
    observation: `${fits.length} of ${domains.length} domains have ${need} free GPUs${largest ? `; the largest is ${largest.label} with ${largest.free}` : ''}.`,
    conclusion: fits.length > 0 ? 'pass' : 'blocked',
  })
  if (fits.length === 0)
    return done(false, `No ${LEVEL_LABEL[level]} has ${need} free GPUs; the largest domain has ${largest?.free ?? 0}.`)

  const segments: Segment[] = []
  const used = new Set<string>()
  for (let i = 1; i <= job.segments; i++) {
    const want = job.segments === 1 ? minGang : i === job.segments ? job.gpus - perSegment * (job.segments - 1) : perSegment
    const pool = domains.filter((d) => d.free >= want)
    const fresh = pool.filter((d) => !used.has(d.key))
    const pick = [...(fresh.length > 0 ? fresh : pool)].sort((a, b) => a.free - b.free)[0]
    if (!pick) {
      steps.push({ id: `segment-${i}`, label: `Segment ${i}`, observation: `No domain has ${want} free GPUs.`, conclusion: 'blocked' })
      return done(false, `Segment ${i} needs ${want} GPUs in ${LEVEL_LABEL[level]}, and no domain has them.`)
    }
    used.add(pick.key)
    const picked = takeServers(ordered(pick.servers, job.preferred), want, g)
    steps.push({
      id: `segment-${i}`,
      label: `Segment ${i}`,
      observation: `${want} GPUs in ${pick.label}${fresh.length === 0 && pool.length > 0 ? ' (a domain is reused)' : ''}.`,
      conclusion: picked.length > 0 ? 'pass' : 'blocked',
    })
    if (picked.length === 0) return done(false, `Segment ${i} could not be placed in ${pick.label}.`)
    segments.push({ index: i, domain: pick.key, label: pick.label, gpus: want, servers: picked })
  }

  const chosen = segments.flatMap((s) => s.servers)
  const chosenDomains = new Set(segments.map((s) => s.domain))
  const blocked = servers
    .filter((s) => chosenDomains.has(level === 'any' ? 'cluster' : domainKey(s, level as Exclude<Level, 'any'>)) && s.free === 0 && (s.state === 'quarantined' || s.state === 'maintenance'))
    .map((s) => s.id)
  steps.push({
    id: 'placement',
    label: 'Placement',
    observation: `${chosen.length} servers in ${segments.map((s) => s.label).join(', ')}; ${blocked.length} servers in the same domain cannot be used.`,
    conclusion: 'note',
  })
  return done(true, null, {
    chosen,
    blocked,
    segments,
    domains: [...domains].sort((a, b) => b.free - a.free).slice(0, 6).map((d) => ({ key: d.key, label: d.label, free: d.free })),
  })
}

// The queue of the job, for the bar.
export const queueOf = (job: Job): QueueInfo => QUEUE_BY_ID.get(job.queue)!
