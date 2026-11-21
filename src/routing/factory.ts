import type { DocRef } from '../catalog/component-docs'
import { userSet, type BlockRole } from '../catalog/factory'
import { notSourced, type Fact } from '../catalog/fact'
import { FACTORY_CHECKS as CHECK, FACTORY_FACTS as G, HOP_CHECKS, PATH_FACTS as F, VIRTUAL_PARTS, type LinkKind } from '../catalog/paths'
import { platformFor } from '../catalog/platforms'
import { NODE_SERVICES, servicesFor } from '../catalog/services'
import type { Config } from '../config/config'
import { fabricShape, leavesOf } from '../topology/fabric'
import type { Network } from '../topology/graph'
import { leafId, partId, rackId } from '../topology/ids'
import { generateOverview } from '../topology/overview'
import { downIds, type Failure } from '../simulate/failable'
import { impactOf } from '../simulate/impact'
import { gpuEnd, gpuPart, nvswitchesOf, spinesOf, type PathPart } from './ends'
import { finishTrace, type Hop, type TraceResult } from './trace'

// The factory rows of the tracer table of spec section 6.
export type PathId = 'storage' | 'user-ui' | 'cluster-mtls' | 'operator-bmc' | 'operator-ztka' | 'break-glass' | 'telemetry-itsm' | 'telemetry-siem' | 'control-sm' | 'control-nvlink'
export const PATH_IDS: PathId[] = ['storage', 'user-ui', 'cluster-mtls', 'operator-bmc', 'operator-ztka', 'break-glass', 'telemetry-itsm', 'telemetry-siem', 'control-sm', 'control-nvlink']
export const PATH_LABEL: Record<PathId, string> = {
  storage: 'GPU to VAST',
  'user-ui': 'User to the Rafay controller (the UI and API, TLS offload)',
  'cluster-mtls': 'Cluster to the Rafay controller (mTLS, TLS passthrough)',
  'operator-bmc': 'Operator to a BMC (PAM, out-of-band network)',
  'operator-ztka': 'Operator to kubectl (Rafay ZTKA)',
  'break-glass': 'Operator break-glass access',
  'telemetry-itsm': 'Telemetry: GPU metrics to a ticket',
  'telemetry-siem': 'Telemetry: a BMC event to the SIEM',
  'control-sm': 'Control: the subnet manager programs the switches',
  'control-nvlink': 'Control: Fabric Manager and NVLSM program the NVSwitch chips',
}

const NO_BW = notSourced('The sources give no bandwidth for this hop.')

const no = (reason: string): TraceResult => ({ ok: false, reason })
const virt = (id: string): PathPart => ({ id, label: VIRTUAL_PARTS[id]!.label, kind: 'actor', virtual: true })
const hop = (from: PathPart, to: PathPart, link: LinkKind, network: Network, checks: DocRef[] = HOP_CHECKS[link], bandwidth: Fact<number | null> = NO_BW, fan: PathPart[] = []): Hop => ({
  from,
  to,
  link,
  network,
  bandwidth,
  checks,
  fan,
})

// One factory path. `src` is a GPU: it gives the server of the path (its NIC, its BMC, its exporter, its Fabric Manager).
function tracePath(config: Config, path: PathId, src: string): TraceResult {
  const e = gpuEnd(config, src)
  if (!e) return no('The path needs a GPU of this configuration (it gives the server of the path).')
  const blocks = new Map(generateOverview(config, { telemetry: true }).nodes.map((n) => [n.role, n]))
  const blk = (role: BlockRole): PathPart | null => {
    const n = blocks.get(role)
    return n ? { id: n.id, label: n.label, kind: 'block' } : null
  }
  const p = platformFor(config)
  const nvl72 = p.form === 'nvl72-tray'
  const bmc: PathPart = nvl72 ? { id: e.server, label: `${e.server} (tray BMC)`, kind: 'tray' } : { id: partId(e.server, 'bmc'), label: `${e.server} BMC`, kind: 'bmc' }
  const operator = virt('path-operator')
  const pam = virt('path-pam')
  const done = (hops: Hop[], notes: Fact<string>[], title: string = PATH_LABEL[path]) => finishTrace('factory', hops, notes, title)

  switch (path) {
    case 'storage': {
      if (p.frontNic.count.value === 0) return no('This platform has no sourced front NIC for the storage traffic.')
      const front = !nvl72 && !(p.frontNic.model.value ?? '').includes('BlueField') ? 'fnic0' : 'dpu0'
      const nic: PathPart = { id: partId(e.server, front), label: `${e.server} ${p.frontNic.model.value} 0`, kind: front === 'dpu0' ? 'dpu' : 'nic' }
      const leaf = blk(config.storageFabric === 'converged' ? 'frontend' : 'storage-net')!
      const link: LinkKind = config.storageFabric === 'infiniband' ? 'infiniband' : 'ethernet'
      const leafChecks = link === 'ethernet' ? [...HOP_CHECKS.ethernet, ...CHECK.roceLeaf] : HOP_CHECKS.infiniband
      const cnode = virt('path-cnode')
      const tail = [
        hop(nic, leaf, link, 'storage', leafChecks, p.frontNic.speed),
        hop(leaf, cnode, link, 'storage', CHECK.vastMount),
        hop(cnode, virt('path-dnode'), 'nvmeof', 'storage'),
      ]
      if (config.gds === 'on') return done([hop(gpuPart(e), nic, 'pcie', 'pcie', CHECK.gds), ...tail], [G.gds, G.vastNfs, G.vastParts], 'GPU to VAST, GDS on: direct DMA')
      const numa = p.numaGpus.value.findIndex((g) => g.includes(e.gpu))
      const cpu: PathPart = { id: partId(e.server, `cpu${numa}`), label: `${e.server} CPU ${numa} (bounce buffer)`, kind: 'cpu' }
      const toCpu = nvl72 ? hop(gpuPart(e), cpu, 'c2c', 'c2c') : hop(gpuPart(e), cpu, 'pcie', 'pcie')
      return done([toCpu, hop(cpu, nic, 'pcie', 'pcie'), ...tail], [G.bounce, G.vastParts], 'GPU to VAST, GDS off: a bounce buffer in CPU memory')
    }
    case 'user-ui': {
      const internet = blk('internet')!
      const user = virt('path-user')
      const uplink = userSet(config.uplink === '2x100g' ? 200 : 800, 'Gb/s (the uplink to the ISPs)')
      const saas = blk('rafay-saas')
      // A SaaS controller is on the internet: the path does not use the uplink of the site or a VIP, and the sources give no check for it.
      if (saas) return done([hop(user, internet, 'ip', 'north-south', []), hop(internet, saas, 'ip', 'management', [])], [])
      const rafay = blk('rafay')
      if (!rafay) return no('This configuration has no Rafay controller.')
      const lb = blk('lb')
      if (!lb) return no('This configuration has no control-plane VIP.')
      const fw = blk('firewall')!
      const toLb = config.lb === 'firewall-l4' ? [hop(fw, lb, 'ip', 'north-south', CHECK.vip)] : [hop(fw, blk('frontend')!, 'ip', 'north-south', CHECK.vip), hop(blk('frontend')!, lb, 'ip', 'north-south', CHECK.vip)]
      return done(
        [hop(user, internet, 'ip', 'north-south', CHECK.vip), hop(internet, blk('router')!, 'ip', 'north-south', CHECK.vip, uplink), hop(blk('router')!, fw, 'ip', 'north-south', CHECK.vip), ...toLb, hop(lb, rafay, 'ip', 'north-south', CHECK.vip)],
        [G.tlsOffload, G.lbOpen],
      )
    }
    case 'cluster-mtls': {
      const k8s = blk('k8s')
      const rafay = blk('rafay')
      const lb = blk('lb')
      if (!k8s || !rafay || !lb) return no('This path needs Kubernetes, a self-hosted Rafay controller, and a control-plane VIP.')
      const frontend = blk('frontend')!
      const fw = blk('firewall')!
      const toLb = config.lb === 'firewall-l4' ? [hop(frontend, fw, 'ip', 'north-south', CHECK.vip), hop(fw, lb, 'ip', 'north-south', CHECK.vip)] : [hop(frontend, lb, 'ip', 'north-south', CHECK.vip)]
      return done(
        [hop(k8s, blk('control-net')!, 'ip', 'in-band', CHECK.vip), hop(blk('control-net')!, frontend, 'ip', 'in-band', CHECK.vip), ...toLb, hop(lb, rafay, 'ip', 'north-south', CHECK.vip)],
        [G.tlsPassthrough, G.lbOpen],
      )
    }
    case 'operator-bmc':
      return done(
        [hop(operator, pam, 'ip', 'management', CHECK.access), hop(pam, blk('oob-net')!, 'ip', 'oob', CHECK.access), hop(blk('oob-net')!, bmc, 'ethernet', 'oob', CHECK.bmc)],
        [G.approvedPath, G.pam, G.bmcOob],
      )
    case 'operator-ztka': {
      const k8s = blk('k8s')
      const rafay = blk('rafay') ?? blk('rafay-saas')
      if (!k8s || !rafay) return no('This path needs Kubernetes and a Rafay controller.')
      return done([hop(operator, pam, 'ip', 'management', CHECK.access), hop(pam, rafay, 'ip', 'management', CHECK.ztka), hop(rafay, k8s, 'ip', 'management', CHECK.ztka)], [G.ztka, G.ztkaFirewall, G.pam])
    }
    case 'break-glass': {
      const account = virt('path-breakglass')
      return done(
        [hop(operator, account, 'ip', 'oob', CHECK.access), hop(account, blk('oob-net')!, 'ip', 'oob', CHECK.access), hop(blk('oob-net')!, bmc, 'ethernet', 'oob', CHECK.bmc)],
        [G.breakGlass, G.breakGlassTarget],
      )
    }
    case 'telemetry-itsm': {
      const exporter: PathPart = nvl72 ? { id: e.server, label: `${e.server} (DCGM Exporter)`, kind: 'tray' } : { id: partId(e.server, 'svc-dcgm-exporter'), label: `${e.server} DCGM Exporter`, kind: 'service' }
      const hops = [hop(exporter, blk('prometheus')!, 'ip', 'telemetry', CHECK.exporter), hop(blk('prometheus')!, blk('alertmanager')!, 'software', 'telemetry', CHECK.alerts), hop(blk('alertmanager')!, blk('itsm')!, 'ip', 'telemetry', CHECK.alerts)]
      return config.itsm === 'on'
        ? done(hops, [G.routes], 'Telemetry: GPU metrics to an ITSM ticket (webhook)')
        : done(hops, [G.routes, G.manualTicket], 'Telemetry: GPU metrics to an alert; L1 opens the ticket by hand')
    }
    case 'telemetry-siem':
      return done(
        [
          hop(bmc, blk('oob-net')!, 'ethernet', 'oob', CHECK.bmc),
          hop(blk('oob-net')!, blk('prometheus')!, 'ip', 'telemetry', CHECK.redfish),
          hop(blk('prometheus')!, blk('alertmanager')!, 'software', 'telemetry', CHECK.alerts),
          hop(blk('alertmanager')!, blk('siem')!, 'ip', 'telemetry', CHECK.alerts),
        ],
        [G.redfish, G.routes],
      )
    case 'control-sm': {
      const ufm = blk('ufm')
      const shape = fabricShape(config)
      if (!ufm || shape.leavesPerGroup === 0) return no('This fabric has no InfiniBand subnet manager (UFM).')
      const [leaf, ...leafFan] = leavesOf(shape, config.topology, 1).map((l): PathPart => ({ id: leafId(1, l.tag), label: l.label, kind: 'leaf' }))
      const [spine, ...spineFan] = spinesOf(config, 0)
      const hops = [hop(ufm, leaf!, 'mad', 'compute', HOP_CHECKS.mad, NO_BW, leafFan)]
      if (spine) hops.push(hop(leaf!, spine, 'mad', 'compute', HOP_CHECKS.mad, NO_BW, spineFan))
      return done(hops, [G.smDiscover, G.smRoutes])
    }
    case 'control-nvlink': {
      const [chip, ...fan] = nvswitchesOf(config, e)
      if (nvl72) {
        const nvos: PathPart = { id: partId(`${rackId(e.su, e.rack)}-sw1`, 'nvos'), label: 'NVOS: NVLSM, FM, NMX (switch tray 1)', kind: 'service' }
        return done([hop(nvos, chip!, 'software', 'nvlink', CHECK.fm, NO_BW, fan)], [G.nvlsm, F.nvl72Domain], 'Control: NVOS (NVLSM and FM) on a switch tray programs the NVSwitch chips of the rack')
      }
      const fm: PathPart = { id: partId(e.server, 'svc-fabric-manager'), label: `${e.server} Fabric Manager`, kind: 'service' }
      if (!servicesFor(p).includes('nvlsm')) return done([hop(fm, chip!, 'software', 'nvlink', CHECK.fm, NO_BW, fan)], [NODE_SERVICES['fabric-manager'].fact], 'Control: Fabric Manager alone programs the NVSwitch chips')
      const nvlsm: PathPart = { id: partId(e.server, 'svc-nvlsm'), label: `${e.server} NVLSM`, kind: 'service' }
      return done([hop(fm, nvlsm, 'software', 'nvlink', CHECK.fm), hop(nvlsm, chip!, 'software', 'nvlink', CHECK.fm, NO_BW, fan)], [G.nvlsm, G.nvlsmPackage])
    }
  }
}

// One factory path, with the failures of the simulator: a failed part on the path means "no path"
// (a UFM failover, one VAST CNode, a degraded link, a slow GPU, a PFC storm (a degraded storage network), and a slow VAST client path keep the path).
export function traceFactory(config: Config, path: PathId, src: string, failures: Failure[] = []): TraceResult {
  const r = tracePath(config, path, src)
  if (!r.ok || failures.length === 0) return r
  const down = downIds(failures)
  const parts = [r.trace.hops[0]!.from, ...r.trace.hops.map((h) => h.to)]
  const failed = parts.find((x) => down.has(x.id))
  if (failed) return { ok: false, reason: `No path: ${failed.label} has failed (a failure in the simulator).` }
  if (path === 'storage') {
    const fx = impactOf(config, failures).effects.get(src)
    if (fx === 'lost' || fx === 'unschedulable') return { ok: false, reason: `No path: ${src} is not usable (a failure in the simulator).` }
  }
  return r
}
