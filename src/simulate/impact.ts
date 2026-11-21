import { FAIL_RULES, type FailKind, type ModeRule } from '../catalog/failures'
import type { Fact } from '../catalog/fact'
import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { assignments } from '../topology/assign'
import { fabricShape, generateFabric } from '../topology/fabric'
import { parseRackId, parseServerId, partId, serverOf } from '../topology/ids'
import { failKind, validFailure, type Failure } from './failable'

export type GpuEffect = 'lost' | 'unschedulable' | 'no-nvlink' | 'no-rail' | 'half' | 'slow'
const RANK: GpuEffect[] = ['lost', 'unschedulable', 'no-nvlink', 'no-rail', 'half', 'slow']
// The effects that take a GPU out of the usable pool; half bandwidth and a slow link or GPU keep it in.
const OUT: GpuEffect[] = ['lost', 'unschedulable', 'no-nvlink', 'no-rail']
export const EFFECT_LABEL: Record<GpuEffect, string> = {
  lost: 'lost (drained)',
  unschedulable: 'not schedulable',
  'no-nvlink': 'no NVLink',
  'no-rail': 'no compute rail',
  half: 'half bandwidth',
  slow: 'slow (degraded)',
}

export type Incident = { failure: Failure; kind: FailKind; label: string; rule: ModeRule; who: Fact<string>; alerts: string[]; gpus: number; services: string[] }
export type Impact = {
  total: number
  effects: Map<string, GpuEffect>
  counts: Record<GpuEffect, number>
  affected: number
  affectedPct: number
  degraded: number
  nodes: string[]
  racks: number
  sus: number
  tenants: string[]
  services: string[]
  available: number
  availablePct: number
  largestPool: number
  poolUnit: string
  severity: { level: 1 | 2 | 3 | 4; why: string }
  incidents: Incident[]
  alertCount: number
}

// The impact of the failures on the GPUs, the services, the capacity, and the severity (spec section 7).
export function impactOf(config: Config, failures: Failure[]): Impact {
  const p = platformFor(config)
  const shape = fabricShape(config)
  const fabric = generateFabric(config)
  const servers = fabric.nodes.filter((n) => n.kind === 'server').map((n) => n.id)
  const per = p.gpusPerServer.value
  const total = servers.length * per
  const nvl72 = p.form === 'nvl72-tray'
  const rackOfServer = (s: string) => {
    const { su, n } = parseServerId(s)!
    return `su${su}-k${Math.ceil(n / shape.perRack)}`
  }
  const gpusOf = (s: string) => Array.from({ length: per }, (_, i) => partId(s, `gpu${i}`))
  const serversOfRack = (rack: string) => servers.filter((s) => rackOfServer(s) === rack)
  const domain = (s: string) => (nvl72 ? serversOfRack(rackOfServer(s)) : [s])
  const half = shape.planeCount === 2

  const effects = new Map<string, GpuEffect>()
  const incidents: Incident[] = []
  // Dual plane: the planes that each GPU lost on its rail; with both planes lost, the rail is lost.
  const planesLost = new Map<string, Set<number>>()
  const losePlane = (gpu: string, plane: number) => planesLost.set(gpu, (planesLost.get(gpu) ?? new Set<number>()).add(plane))
  for (const f of failures) {
    if (!validFailure(config, f)) continue
    const kind = failKind(config, f.id)!
    const rule = FAIL_RULES[kind].modes[f.mode]!
    const touched = new Set<string>()
    const hit = (gpu: string, e: GpuEffect) => {
      touched.add(gpu)
      const old = effects.get(gpu)
      if (!old || RANK.indexOf(e) < RANK.indexOf(old)) effects.set(gpu, e)
    }
    const alerts = [`${rule.alert}: ${f.id}`]
    const services: string[] = []
    const server = serverOf(f.id)
    switch (kind) {
      case 'gpu':
        if (f.mode === 'xid79') {
          for (const g of gpusOf(server!)) hit(g, 'lost')
          alerts.push(`node tainted (Node Problem Detector): ${server}`)
        } else hit(f.id, f.mode === 'degraded' ? 'slow' : 'lost')
        break
      case 'nvswitch':
      case 'switch-tray': {
        const targets = server ? domain(server) : serversOfRack(`su${parseRackId(f.id)!.su}-k${parseRackId(f.id)!.rack}`)
        for (const s of targets) for (const g of gpusOf(s)) hit(g, 'no-nvlink')
        break
      }
      case 'fabric-manager':
      case 'nvlsm':
        for (const g of gpusOf(server!)) hit(g, 'no-nvlink')
        break
      case 'imex':
        for (const s of domain(server!)) for (const g of gpusOf(s)) hit(g, 'no-nvlink')
        break
      case 'driver':
        for (const g of gpusOf(server!)) hit(g, 'lost')
        break
      case 'device-plugin':
        for (const g of gpusOf(server!)) hit(g, 'unschedulable')
        break
      case 'nic':
        hit(partId(server!, `gpu${f.id.split('/nic')[1]}`), 'no-rail')
        break
      case 'cable': {
        const e = fabric.edges.find((x) => x.id === f.id)!
        hit(partId(e.source, `gpu${e.rail}`), f.mode === 'degraded' ? 'slow' : half ? 'half' : 'no-rail')
        if (f.mode === 'down' && half) losePlane(partId(e.source, `gpu${e.rail}`), e.plane ?? 0)
        break
      }
      case 'leaf':
        for (const e of fabric.edges.filter((x) => x.target === f.id && x.tier === 'node-leaf')) {
          hit(partId(e.source, `gpu${e.rail}`), half ? 'half' : 'no-rail')
          if (half) losePlane(partId(e.source, `gpu${e.rail}`), e.plane ?? 0)
          alerts.push(`IB link down: ${e.id}`)
        }
        break
      case 'spine':
        services.push(`the bisection bandwidth: 1 of ${shape.spinesPerPlane} spines of the plane is out`)
        break
      case 'storage-net':
        services.push(f.mode === 'degraded' ? 'the storage path of every GPU is slow: a PFC storm, no link down' : 'the storage path of every GPU')
        break
      case 'ufm':
        services.push(f.mode === 'active' ? 'UFM: the standby unit becomes the master' : 'the subnet manager: the routing tables freeze')
        break
      case 'psu':
        services.push(`${server}: the redundancy of the power supplies`)
        break
      case 'bmc':
        services.push(`${server}: the out-of-band access`)
        break
      case 'cdu': {
        const su = Number(/^su(\d+)-cdu$/.exec(f.id)![1])
        for (const s of servers.filter((x) => parseServerId(x)!.su === su)) for (const g of gpusOf(s)) hit(g, 'lost')
        alerts.push(`thermal throttle: the racks of SU ${su}`)
        break
      }
      case 'pdu':
        services.push(`${f.id.replace(/-(pdu|ps)\d+$/, '')}: the power redundancy of the rack`)
        break
      case 'vast':
        services.push(
          f.mode === 'degraded'
            ? 'storage: one client path is slow while VAST reports healthy (mount options, VIPs, QoS)'
            : 'storage: the VIPs move to the other CNodes; client I/O stalls or slows',
        )
        break
      case 'rafay':
        services.push('the Rafay console and the control actions (the jobs continue)')
        break
      case 'lb':
        services.push('the Kubernetes API and the Rafay console through the VIP (the nodes run)')
        break
      case 'firewall':
        services.push('the clusters are "not reachable" in Rafay; ingress and egress')
        break
      case 'dns':
        services.push('name resolution on the cluster nodes')
        break
      case 'ntp':
        services.push('time sync: TLS, tokens, and etcd')
        break
    }
    incidents.push({ failure: f, kind, label: `${FAIL_RULES[kind].label}: ${rule.label}`, rule, who: FAIL_RULES[kind].who, alerts, gpus: touched.size, services })
  }

  for (const [gpu, planes] of planesLost) {
    const old = effects.get(gpu)
    if (planes.size >= 2 && (!old || RANK.indexOf('no-rail') < RANK.indexOf(old))) effects.set(gpu, 'no-rail')
  }

  const counts = Object.fromEntries(RANK.map((e) => [e, 0])) as Record<GpuEffect, number>
  for (const e of effects.values()) counts[e]++
  const affected = OUT.reduce((n, e) => n + counts[e], 0)
  const degraded = counts.half + counts.slow
  const hitServers = [...new Set([...effects.keys()].map((g) => serverOf(g)!))].sort()
  const out = (s: string) => gpusOf(s).some((g) => OUT.includes(effects.get(g) as GpuEffect))
  const units = nvl72 ? [...new Set(servers.map(rackOfServer))].map(serversOfRack) : servers.map((s) => [s])
  const largestPool = units.filter((u) => !u.some(out)).reduce((n, u) => n + u.length * per, 0)
  const available = total - affected // the GPUs out of the usable pool are not available
  const tenants = [...new Set(hitServers.map((s) => assignments(config).get(s)?.tenant).filter((t): t is string => !!t))].sort()

  const pct = total === 0 ? 0 : (affected / total) * 100
  const dpct = total === 0 ? 0 : (degraded / total) * 100
  let level: 1 | 2 | 3 | 4 = incidents.length === 0 ? 4 : (Math.min(...incidents.map((i) => i.rule.floor)) as 1 | 2 | 3 | 4)
  if (incidents.length > 0 && (pct >= config.p2Threshold || dpct >= config.p2Threshold)) level = Math.min(level, 2) as 1 | 2 | 3 | 4
  if (pct >= config.p1Threshold) level = 1
  const why =
    incidents.length === 0
      ? 'no failure'
      : `${pct.toFixed(1)} % of the GPUs out, ${dpct.toFixed(1)} % degraded (P1 from ${config.p1Threshold} %, P2 from ${config.p2Threshold} %: assumed thresholds), and the floor of each failure`

  return {
    total,
    effects,
    counts,
    affected,
    affectedPct: pct,
    degraded,
    nodes: hitServers,
    racks: new Set(hitServers.map(rackOfServer)).size,
    sus: new Set(hitServers.map((s) => parseServerId(s)!.su)).size,
    tenants,
    services: incidents.flatMap((i) => i.services),
    available,
    availablePct: total === 0 ? 0 : (available / total) * 100,
    largestPool,
    poolUnit: nvl72 ? 'GPUs in whole NVL72 racks' : 'GPUs in whole nodes',
    severity: { level, why },
    incidents,
    alertCount: incidents.reduce((n, i) => n + i.alerts.length, 0),
  }
}
