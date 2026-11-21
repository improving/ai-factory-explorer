import type { DocRef } from '../catalog/component-docs'
import { derived, type Fact } from '../catalog/fact'
import { HOP_CHECKS, IMEX_CHECK, PATH_FACTS as F, type LinkKind } from '../catalog/paths'
import { SIM_FACTS } from '../catalog/failures'
import { platformFor } from '../catalog/platforms'
import { NVL72_UG_URL } from '../catalog/urls'
import type { Config } from '../config/config'
import { fabricShape } from '../topology/fabric'
import type { Network } from '../topology/graph'
import { partId, serverOf } from '../topology/ids'
import { downIds, type Failure } from '../simulate/failable'
import { impactOf, type GpuEffect } from '../simulate/impact'
import { gpuEnd, gpuPart, leafOf, nicPart, nvswitchesOf, sibling, spinesOf, type GpuEnd, type PathPart } from './ends'

export type TraceKind = 'same-node' | 'one-leaf' | 'cross-rail' | 'cross-su' | 'pxn' | 'nvl72-rack' | 'nvl72-fabric' | 'factory'
export type TraceOptions = { pxn: boolean; plane: 0 | 1 }
// PXN is on by default in NCCL (NCCL_PXN_DISABLE=0).
export const DEFAULT_TRACE_OPTIONS: TraceOptions = { pxn: true, plane: 0 }

// One hop of a path. `fan` holds the equal-cost choices of the part that the hop goes to.
export type Hop = { from: PathPart; to: PathPart; link: LinkKind; network: Network; bandwidth: Fact<number | null>; rail?: number; plane?: number; checks: DocRef[]; fan: PathPart[]; degraded?: boolean }
export type Trace = { kind: TraceKind; title: string; hops: Hop[]; bottleneck: number | null; notes: Fact<string>[] }
export type TraceResult = { ok: true; trace: Trace } | { ok: false; reason: string }

export const TRACE_KIND_LABEL: Record<TraceKind, string> = {
  'same-node': 'Same node: NVLink through the NVSwitch chips, no NIC',
  'one-leaf': 'One leaf: the same rail (or a rail pair), one hop',
  'cross-rail': 'Different rails, PXN off: through a spine',
  'cross-su': 'Different groups of SUs: through a spine',
  pxn: 'PXN: NVLink to the GPU on the rail of the destination, then its NIC',
  'nvl72-rack': 'NVL72, same rack: NVLink through the switch trays',
  'nvl72-fabric': 'NVL72, another rack: the compute fabric',
  factory: 'A factory path',
}

// The path of one GPU-to-GPU transfer, by the rules of spec section 6 (not a generic shortest path). With
// failures, it takes another spine, chip, or plane, or it says "no path" and the reason.
export function traceGpus(config: Config, src: string, dst: string, opts: TraceOptions = DEFAULT_TRACE_OPTIONS, failures: Failure[] = []): TraceResult {
  const a = gpuEnd(config, src)
  const b = gpuEnd(config, dst)
  if (!a || !b) return { ok: false, reason: 'The source and the destination must be GPUs of this configuration.' }
  if (a.id === b.id) return { ok: false, reason: 'The source and the destination are the same GPU.' }
  const p = platformFor(config)
  const shape = fabricShape(config)
  const d = shape.design
  const nvl72 = p.form === 'nvl72-tray'
  const down = downIds(failures)
  const degraded = new Set(failures.filter((f) => f.mode === 'degraded').map((f) => f.id))
  const xid79 = new Set(failures.filter((f) => f.mode === 'xid79').map((f) => serverOf(f.id)))
  // The effect of the failures on each GPU, as the impact panel gives it: the tracer and the panel agree.
  const fx = failures.length > 0 ? impactOf(config, failures).effects : new Map<string, GpuEffect>()
  const out = (id: string) => fx.get(id) === 'lost' || fx.get(id) === 'unschedulable'
  for (const e of [a, b]) {
    if (down.has(e.id) || out(e.id) || xid79.has(e.server) || down.has(partId(e.server, 'svc-driver'))) {
      return { ok: false, reason: `${e.id} is not usable: a failure in the simulator takes it out.` }
    }
  }
  const notes: Fact<string>[] = []

  // NVLink: GPU → the first working NVSwitch chip (the other chips are the fan) → GPU, in each direction.
  const nvlinkBw = derived(
    p.nvlinkPerGpu.value * 4000,
    'Gb/s in each direction',
    `${p.nvlinkPerGpu.value} TB/s for each GPU (${p.nvlinkPerGpu.source}) counts both directions, as the NVL72 user guide gives it: ÷ 2, then × 8000 Gb/s for each TB/s`,
    NVL72_UG_URL,
  )
  const nvChecks = nvl72 ? [...HOP_CHECKS.nvlink, IMEX_CHECK] : HOP_CHECKS.nvlink
  const chipsOf = (x: GpuEnd) => nvswitchesOf(config, x).filter((c) => !down.has(c.id) && !down.has(c.id.split('/')[0]!))
  const nvlinkDown = (x: GpuEnd): string | null => {
    if (fx.get(x.id) === 'no-nvlink') return `${x.id} has no NVLink (its scale-up domain has a failure)`
    if (nvl72 && down.has(partId(x.server, 'imex'))) return `IMEX is down on ${x.server}`
    if (!nvl72 && down.has(partId(x.server, 'svc-fabric-manager'))) return `Fabric Manager is down on ${x.server}`
    if (!nvl72 && down.has(partId(x.server, 'svc-nvlsm'))) return `NVLSM is down on ${x.server}`
    return chipsOf(x).length === 0 ? `every NVSwitch chip of ${x.server} is down` : null
  }
  const nvlink = (x: GpuEnd, y: GpuEnd): Hop[] => {
    const [chip, ...fan] = chipsOf(x)
    return [
      { from: gpuPart(x), to: chip!, link: 'nvlink', network: 'nvlink', bandwidth: nvlinkBw, checks: nvChecks, fan },
      { from: chip!, to: gpuPart(y), link: 'nvlink', network: 'nvlink', bandwidth: nvlinkBw, checks: nvChecks, fan: [] },
    ]
  }
  const sameDomain = nvl72 ? a.su === b.su && a.rack === b.rack : a.server === b.server
  if (sameDomain) {
    const why = nvlinkDown(a) ?? nvlinkDown(b)
    if (why) return { ok: false, reason: `No NVLink path: ${why}.` }
    return finishTrace(nvl72 ? 'nvl72-rack' : 'same-node', nvlink(a, b), nvl72 ? [F.nvl72, F.nvl72Domain, F.nvlinkParallel] : [F.nvlinkParallel])
  }

  if (!leafOf(config, b, 0)) return { ok: false, reason: 'This design has no compute fabric between racks.' }
  const hops: Hop[] = []
  // PXN: the GPU of the source node on the rail of the destination sends, after an NVLink hop. With NVLink down, PXN is off.
  const nvDown = nvlinkDown(a)
  const mate = sibling(a, b.gpu)
  const mateOk = !out(mate.id) && fx.get(mate.id) !== 'no-rail'
  const pxn = opts.pxn && a.gpu !== b.gpu && !nvDown && mateOk
  if (opts.pxn && a.gpu !== b.gpu && !pxn) notes.push(SIM_FACTS.pxnOff)
  const from = pxn ? mate : a
  if (pxn) {
    hops.push(...nvlink(a, from))
    notes.push(F.pxn, F.pxnDefault, F.nvlinkParallel)
  }
  // The plane: the option, or the other plane when a rail of an end is down on it (dual plane).
  const cable = (e: GpuEnd, pl: number) => `${e.server}~r${e.gpu}${shape.planeCount === 2 ? (['A', 'B'] as const)[pl] : ''}`
  const railDown = (e: GpuEnd, pl: number) => down.has(nicPart(e).id) || down.has(cable(e, pl)) || down.has(leafOf(config, e, pl)!.id)
  let plane = shape.planeCount === 2 ? opts.plane : 0
  if (railDown(from, plane) || railDown(b, plane)) {
    const other: 0 | 1 = plane === 0 ? 1 : 0
    if (shape.planeCount === 2 && !railDown(from, other) && !railDown(b, other)) {
      plane = other
      notes.push(SIM_FACTS.otherPlane)
    } else {
      const end = railDown(from, plane) ? from : b
      return { ok: false, reason: `No path: rail ${end.gpu} of ${end.server} is down (its NIC, its cable, or its leaf).` }
    }
  }
  const link: LinkKind = d.fabric === 'spectrum-x' ? 'ethernet' : 'infiniband'
  const net = (x: PathPart, y: PathPart, rail: number | undefined, bandwidth: Fact<number>, fan: PathPart[] = [], slow = false): Hop => ({
    from: x,
    to: y,
    link,
    network: 'compute',
    bandwidth,
    rail,
    plane: shape.planeCount === 2 ? plane : undefined,
    checks: HOP_CHECKS[link],
    fan,
    ...(slow ? { degraded: true } : {}),
  })
  const pcie = (x: PathPart, y: PathPart): Hop => ({ from: x, to: y, link: 'pcie', network: 'pcie', bandwidth: F.pcieBandwidth, checks: HOP_CHECKS.pcie, fan: [] })
  const leafA = leafOf(config, from, plane)!
  const leafB = leafOf(config, b, plane)!
  hops.push(pcie(gpuPart(from), nicPart(from)), net(nicPart(from), leafA, from.gpu, d.linkSpeed, [], degraded.has(cable(from, plane))))
  if (leafA.id === leafB.id) notes.push(F.oneHop)
  else {
    const spines = spinesOf(config, plane).filter((s) => !down.has(s.id))
    if (spines.length === 0) return { ok: false, reason: 'No path: every spine of the plane is down.' }
    const [spine, ...fan] = spines
    hops.push(net(leafA, spine!, undefined, d.leafSwitch.portSpeed, fan), net(spine!, leafB, undefined, d.leafSwitch.portSpeed))
    notes.push(F.spine, F.ecmp)
  }
  hops.push(net(leafB, nicPart(b), b.gpu, d.linkSpeed, [], degraded.has(cable(b, plane))), pcie(nicPart(b), gpuPart(b)))
  if (hops.some((h) => h.degraded)) notes.push(SIM_FACTS.degradedHop)
  if (shape.planeCount === 2) notes.push(F.dualPlane)
  notes.push(F.gpuDirect)
  const kind: TraceKind = nvl72 ? 'nvl72-fabric' : pxn ? 'pxn' : leafA.id === leafB.id ? 'one-leaf' : a.group !== b.group ? 'cross-su' : 'cross-rail'
  return finishTrace(kind, hops, notes)
}

// The bottleneck: the first hop with the lowest sourced bandwidth (a hop with no sourced bandwidth is left out). The factory paths use it too.
export function finishTrace(kind: TraceKind, hops: Hop[], notes: Fact<string>[], title: string = TRACE_KIND_LABEL[kind]): TraceResult {
  let bottleneck: number | null = null
  let low = Infinity
  for (let i = 0; i < hops.length; i++) {
    const v = hops[i]!.bandwidth.value
    if (v !== null && v < low) {
      low = v
      bottleneck = i
    }
  }
  return { ok: true, trace: { kind, title, hops, bottleneck, notes } }
}
