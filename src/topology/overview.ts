import type { BlockRole } from '../catalog/factory'
import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { emptySlotsOf, fabricShape } from './fabric'
import type { Graph, GraphEdge, GraphNode, Network } from './graph'

export const blockId = (role: BlockRole) => `blk-${role}`
const UPLINK = { '2x100g': '2 × 100GbE', '2x400g': '2 × 400GbE' } as const

// The whole factory as blocks: the edge, the enterprise services, the networks, the compute pods,
// the control plane, the storage, and the facility. Each link names what flows on it; the direction
// of a north-south link is from the internet into the factory.
export function generateOverview(config: Config, opts: { telemetry?: boolean } = {}): Graph {
  const shape = fabricShape(config)
  const d = shape.design
  const emptySlots = emptySlotsOf(config)
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const has = (role: BlockRole) => nodes.some((n) => n.role === role)
  const add = (role: BlockRole, label: string) => nodes.push({ id: blockId(role), kind: 'block', role, label })
  const link = (a: BlockRole, b: BlockRole, network: Network, label: string) => {
    if (!has(a) || !has(b)) return
    edges.push({ id: `${blockId(a)}~${blockId(b)}`, kind: 'physical', network, source: blockId(a), target: blockId(b), label })
  }
  const kubernetes = config.orchestration !== 'slurm'
  const slurm = config.orchestration !== 'kubernetes'
  const converged = config.storageFabric === 'converged'

  add('internet', `Internet and ISPs (${UPLINK[config.uplink]})`)
  add('router', `Edge routers × ${config.edgeRouters}`)
  add('firewall', 'Firewall')
  if (config.lb !== 'none') add('lb', config.lb === 'firewall-l4' ? 'Control-plane VIP (firewall, L4)' : 'Control-plane VIP (HAProxy or Nginx)')
  add('dns', 'DNS')
  add('ntp', 'NTP')
  add('ipam', 'IPAM')

  add('frontend', `Frontend Ethernet: ${config.frontendSpines} spines, ${config.frontendLeaves} leaves (${converged ? 'in-band and storage' : 'in-band'})`)
  if (!converged) add('storage-net', config.storageFabric === 'infiniband' ? 'Storage network: InfiniBand (NDR)' : 'Storage network: Ethernet (RoCE)')
  add('control-net', 'Control-plane network (SN4700)')
  add('oob-net', `Out-of-band network: ${config.oobSwitches} × SN2201`)
  add('compute-fabric', shape.leavesPerGroup === 0 ? 'No scale-out fabric (one rack)' : `Compute fabric: ${shape.row.leaf} leaves, ${shape.row.spine} spines`)
  const scale = d.leafRule.kind === 'none' ? '1 rack' : `${config.suCount} SU`
  add('pods', `${scale}: ${shape.row.nodes - emptySlots} ${d.serverWord}`)
  if (config.spares > 0) add('spares', `Spare pool: ${config.spares} ${d.serverWord}`)

  if (config.rafay === 'self-hosted') add('rafay', 'Rafay controller (3 masters + 1 worker)')
  if (config.rafay === 'saas') add('rafay-saas', 'Rafay controller (SaaS)')
  if (kubernetes) add('k8s', 'Kubernetes control plane (3 nodes)')
  if (slurm) add('slurm', 'Slurm (slurmctld, 2 login nodes)')
  if (config.clusterManager === 'bcm') add('bcm', 'Base Command Manager (2 head nodes, HA)')
  if (config.clusterManager === 'mission-control') add('mission-control', 'Mission Control')
  if (config.ufm !== 'none') add('ufm', config.ufm === 'ha' ? 'UFM (2 units, active and standby)' : 'UFM (1 unit)')
  if (config.automation === 'netris') add('netris', 'Netris controller (3 nodes)')

  add('vast', `VAST: ${config.cboxes} CBoxes (${config.cboxes * 4} CNodes), ${config.dboxes} DBoxes`)
  if (config.ceph === 'on') add('ceph', 'Ceph (3 nodes)')
  if (config.linstor === 'on') add('linstor', 'Linstor (3 nodes)')

  add('utility', 'Utility power')
  add('generator', 'Generators')
  add('ups', 'UPS')
  add('pdu', platformFor(config).form === 'nvl72-tray' ? 'PDUs and power shelves' : 'PDUs')
  if (config.cooling === 'liquid') add('cdu', 'CDUs (liquid cooling)')
  add('bms', 'BMS')

  // North-south: users and tenants come in through the edge.
  link('internet', 'router', 'north-south', 'uplink')
  link('router', 'firewall', 'north-south', 'ingress and egress')
  link('firewall', 'frontend', 'north-south', 'ingress and egress')
  if (config.lb === 'firewall-l4') link('firewall', 'lb', 'north-south', 'VIP')
  if (config.lb === 'haproxy') link('frontend', 'lb', 'north-south', 'VIP')
  link('lb', 'rafay', 'north-south', 'UI: SSL offload; clusters: passthrough')
  link('internet', 'rafay-saas', 'management', 'SaaS over the internet')
  link('rafay-saas', 'k8s', 'management', 'Management Operator')
  link('dns', 'frontend', 'management', 'DNS')
  link('ntp', 'frontend', 'management', 'NTP')
  link('ipam', 'frontend', 'management', 'IPAM')

  // In-band management.
  link('frontend', 'control-net', 'in-band', 'in-band')
  for (const r of ['rafay', 'k8s', 'slurm', 'bcm', 'mission-control', 'ufm', 'netris'] as const) link('control-net', r, 'in-band', 'in-band')
  link('frontend', 'pods', 'in-band', 'in-band')

  // Storage.
  const protocols = `${config.gds === 'on' ? 'GPUDirect Storage, ' : ''}NFS over RDMA, S3`
  if (converged) link('frontend', 'vast', 'storage', protocols)
  else {
    link('pods', 'storage-net', 'storage', protocols)
    link('storage-net', 'vast', 'storage', 'storage')
  }
  link('ceph', 'frontend', 'storage', 'storage')
  link('linstor', 'frontend', 'storage', 'storage')

  // Compute (east-west) and its managers.
  link('pods', 'compute-fabric', 'compute', 'east-west (rails)')
  link('ufm', 'compute-fabric', 'management', 'subnet manager')
  link('netris', 'frontend', 'management', 'switch configuration')

  // Out-of-band.
  link('oob-net', 'pods', 'oob', 'BMC')
  link('oob-net', 'frontend', 'oob', 'switch management')
  link('oob-net', 'vast', 'oob', 'BMC')

  // The facility.
  link('utility', 'ups', 'power', 'power')
  link('generator', 'ups', 'power', 'backup power')
  link('ups', 'pdu', 'power', 'power')
  link('pdu', 'pods', 'power', 'power')
  link('cdu', 'pods', 'cooling', 'coolant')
  link('bms', 'ups', 'management', 'monitors')
  link('bms', 'cdu', 'management', 'monitors')

  // The telemetry overlay: each source → Prometheus → Alertmanager → the ITSM (or a manual ticket) and the SIEM.
  if (opts.telemetry) {
    add('prometheus', config.rafay === 'none' ? 'Prometheus' : 'Prometheus (Rafay managed, namespace rafay-infra)')
    add('alertmanager', 'Alertmanager')
    add('itsm', config.itsm === 'on' ? 'ServiceNow (ITSM), integrated' : 'ServiceNow (ITSM), no integration')
    add('siem', 'SIEM (site-specific)')
    const nmx = platformFor(config).form === 'nvl72-tray' ? ', NMX (NVL72)' : ''
    link('pods', 'prometheus', 'telemetry', `dcgm-exporter :9400, node exporter :9100${nmx}`)
    link('ufm', 'prometheus', 'telemetry', 'UFM telemetry')
    link('frontend', 'prometheus', 'telemetry', 'NetQ')
    link('oob-net', 'prometheus', 'telemetry', 'BMC Redfish')
    link('vast', 'prometheus', 'telemetry', 'VMS exporter')
    link('prometheus', 'alertmanager', 'telemetry', 'alert rules')
    link('alertmanager', 'itsm', 'telemetry', config.itsm === 'on' ? 'webhook' : 'no integration: L1 opens the ticket by hand')
    link('alertmanager', 'siem', 'telemetry', 'webhook')
  }

  return { nodes, edges }
}
