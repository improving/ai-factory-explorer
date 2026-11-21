import type { Config } from '../config/config'
import { assumed, confirmed, derived, notSourced, SITE_REQUIREMENTS, type Fact } from './fact'
import type { BlockRole } from './factory'
import type { DocKind } from './kinds'
import type { RackRole } from './racks'

// Who owns a part, which tools show it, and who operates them: from the scope, the handoff rules,
// and the tool table of section 3 of the requirements map. The repository has no part → owner
// table; the app maps each part kind to the owner that the handoff rules give.
export type OwnerId = 'partner' | 'facility' | 'enterprise' | 'rafay' | 'vast' | 'oem' | 'workload' | 'customer-it'

export const OWNERS: Record<OwnerId, { label: string; fact: Fact<string> }> = {
  partner: {
    label: 'Partner (managed service)',
    fact: confirmed(
      'the managed-service partner: the cluster health across compute, GPU, InfiniBand, Ethernet, storage integration, the OS, cluster management, and orchestration',
      undefined,
      SITE_REQUIREMENTS,
    ),
  },
  facility: {
    label: 'Facility team',
    fact: confirmed('the facility team of the customer: power, cooling, access, and environment', undefined, SITE_REQUIREMENTS),
  },
  enterprise: {
    label: 'Enterprise network team',
    fact: confirmed('the enterprise network team: DNS, NTP, IPAM, the firewall, upstream routing', undefined, 'handbook/shift-discipline.md:70'),
  },
  rafay: { label: 'Rafay', fact: confirmed("Rafay: the public portal for external customers (Rafay's responsibility)", undefined, SITE_REQUIREMENTS) },
  vast: {
    label: 'VAST (open)',
    fact: assumed(
      'VAST array administration: an open decision',
      undefined,
      'The requirements disagree: bullet 1 puts it in scope; bullet 5 and section 14 exclude array administration ("Ask the customer").',
      SITE_REQUIREMENTS,
    ),
  },
  oem: {
    label: 'OEM or platform vendor (L4)',
    fact: confirmed('the OEM or the platform vendor (L4): defects, firmware, RMA; the partner manages the case to closure', undefined, SITE_REQUIREMENTS),
  },
  workload: {
    label: 'Customer workload',
    fact: confirmed('the customer: the workload above the managed boundary', undefined, SITE_REQUIREMENTS),
  },
  'customer-it': {
    label: 'Customer service management and security',
    fact: confirmed('the service management of the customer owns the ITSM side; the SIEM is site-specific', undefined, SITE_REQUIREMENTS),
  },
}

export type LayerKey = 'gpu' | 'cluster' | 'infiniband' | 'ethernet' | 'hardware' | 'kubernetes' | 'observability' | 'automation' | 'storage' | 'facility' | 'edge'

const PROPOSED = 'The "who operates" column is a proposal; it is not in the RFP (proposed).'
const ops = (text: string) => confirmed(text, undefined, SITE_REQUIREMENTS, PROPOSED)

export const TOOL_LAYERS: Record<LayerKey, { label: string; tools: Fact<string | null>; operatedBy: Fact<string> }> = {
  gpu: { label: 'GPU', tools: confirmed('DCGM, the fleet health and capacity view', undefined, SITE_REQUIREMENTS), operatedBy: ops('L2 runs; L3 sets the diagnostics levels and the RMA thresholds') },
  cluster: {
    label: 'Cluster management',
    tools: confirmed('Base Command Manager, Mission Control, or an approved equivalent', undefined, SITE_REQUIREMENTS),
    operatedBy: ops('L2 runs; L3 owns the images and the upgrade flow'),
  },
  infiniband: { label: 'InfiniBand', tools: confirmed('UFM and switch telemetry', undefined, SITE_REQUIREMENTS), operatedBy: ops('L2 reads; L3 changes routing, partitions, firmware') },
  ethernet: {
    label: 'Ethernet',
    tools: confirmed('NetQ; NMX for the NVLink switches of rack-scale systems', undefined, SITE_REQUIREMENTS),
    operatedBy: ops('L2 reads; L3 changes'),
  },
  hardware: { label: 'Server hardware', tools: confirmed('iDRAC, OpenManage, or the OEM suite', undefined, SITE_REQUIREMENTS), operatedBy: ops('Onsite and L2') },
  kubernetes: {
    label: 'Kubernetes',
    tools: confirmed('Rafay: the primary monitoring tool (Prometheus metrics, logs, events)', undefined, SITE_REQUIREMENTS),
    operatedBy: ops('L2 runs; L3 platform SME owns the operators'),
  },
  observability: {
    label: 'Enterprise observability',
    tools: confirmed('Alertmanager, ServiceNow (no integration at this stage), the SIEM', undefined, SITE_REQUIREMENTS),
    operatedBy: ops('L2 configures the routes; service management owns the ITSM side'),
  },
  automation: { label: 'Automation', tools: confirmed('NVSentinel, GPUd', undefined, SITE_REQUIREMENTS), operatedBy: ops('L3 defines the allow-list; L2 operates') },
  storage: {
    label: 'Storage',
    tools: confirmed('VMS and vastpy-cli', undefined, 'handbook/command-reference.md:108'),
    operatedBy: assumed('open', undefined, 'The tool table has no storage row, and VAST array administration is an open decision.', SITE_REQUIREMENTS),
  },
  facility: {
    label: 'Facility',
    tools: assumed('the BMS (a BMS engineer role is planned)', undefined, 'The sources name no facility tool; a BMS engineer role is planned.', SITE_REQUIREMENTS),
    operatedBy: confirmed('the facility team', undefined, 'handbook/shift-discipline.md:69'),
  },
  edge: {
    label: 'Edge and enterprise services',
    tools: notSourced('The sources name no tool of the enterprise network team.'),
    operatedBy: confirmed('the enterprise network team (handoff, runbook N10)', undefined, 'handbook/shift-discipline.md:70'),
  },
}

export const L1_RULE = confirmed(
  'L1 uses all these tools through dashboards, alerts, and read-only views, and runs only the runbook steps that the runbook permits (proposed)',
  undefined,
  SITE_REQUIREMENTS,
)

export type PartRef = { kind: DocKind; role?: BlockRole; rackRole?: RackRole }

const FACILITY_BLOCKS: BlockRole[] = ['utility', 'generator', 'ups', 'pdu', 'cdu', 'bms']
const EDGE_BLOCKS: BlockRole[] = ['internet', 'router', 'firewall', 'dns', 'ntp', 'ipam']
const HARDWARE: DocKind[] = ['server', 'tray', 'gpu', 'nvswitch', 'nic', 'dpu', 'cpu', 'nvme', 'bmc', 'psu', 'fan', 'dimm', 'switch-tray', 'power-shelf', 'leaf', 'spine']

const kindRule = (owner: OwnerId, why: string): { id: OwnerId; fact: Fact<string> } => ({
  id: owner,
  fact: derived(OWNERS[owner].fact.value, undefined, why, OWNERS[owner].fact.source),
})

export function ownerOf(config: Config, part: PartRef): { id: OwnerId; fact: Fact<string> } {
  if (part.kind === 'block' && part.role) {
    const role = part.role
    if (FACILITY_BLOCKS.includes(role)) return kindRule('facility', 'a facility system (power, cooling, environment)')
    if (EDGE_BLOCKS.includes(role)) return kindRule('enterprise', 'an edge device or an enterprise service')
    if (role === 'lb') {
      return config.lb === 'firewall-l4'
        ? kindRule('enterprise', 'the VIP is on the firewall')
        : { id: 'partner', fact: assumed(OWNERS.partner.fact.value, undefined, 'The VIP is on the control nodes; the load balancer is an open decision.', SITE_REQUIREMENTS) }
    }
    if (role === 'rafay-saas') {
      return { id: 'rafay', fact: assumed(OWNERS.rafay.fact.value, undefined, 'The source gives the public portal to Rafay; the app assumes that Rafay also runs its SaaS controller.', SITE_REQUIREMENTS) }
    }
    if (role === 'vast') return { id: 'vast', fact: OWNERS.vast.fact }
    if (role === 'itsm' || role === 'siem') return kindRule('customer-it', 'a system of the customer')
    return kindRule('partner', 'a part of the cluster that the partner operates')
  }
  if (part.kind === 'rack' && part.rackRole === 'cdu') return kindRule('facility', 'the CDU moves the heat to the facility water')
  if (part.kind === 'pdu' || part.kind === 'manifold') {
    return { id: 'facility', fact: assumed(OWNERS.facility.fact.value, undefined, 'The facility team keeps power and cooling; the sources do not say who owns the rack PDUs and manifolds.', SITE_REQUIREMENTS) }
  }
  return kindRule('partner', 'a part of the cluster that the partner operates')
}

// A hardware part: its defects, firmware, and RMA go to the OEM or the platform vendor (L4).
export function escalationOf(part: PartRef): Fact<string> | null {
  return HARDWARE.includes(part.kind) ? OWNERS.oem.fact : null
}

export function layersOf(config: Config, part: PartRef): LayerKey[] {
  const net: LayerKey = config.fabric === 'spectrum-x' ? 'ethernet' : 'infiniband'
  if (part.kind === 'block' && part.role) {
    const role = part.role
    if (FACILITY_BLOCKS.includes(role)) return ['facility']
    // The VIP of the Kubernetes control plane: on the firewall (edge), or on the control nodes (Kubernetes).
    if (role === 'lb') return config.lb === 'firewall-l4' ? ['edge'] : ['kubernetes']
    if (EDGE_BLOCKS.includes(role)) return ['edge']
    switch (role) {
      case 'frontend':
      case 'control-net':
      case 'oob-net':
      case 'netris':
        return ['ethernet']
      case 'storage-net':
        return [config.storageFabric === 'infiniband' ? 'infiniband' : 'ethernet']
      case 'compute-fabric':
      case 'ufm':
        return [role === 'ufm' ? 'infiniband' : net]
      case 'pods':
      case 'spares':
        return ['hardware', 'gpu', 'cluster']
      case 'rafay':
      case 'rafay-saas':
      case 'k8s':
        return ['kubernetes']
      case 'slurm':
      case 'bcm':
      case 'mission-control':
        return ['cluster']
      case 'vast':
      case 'ceph':
      case 'linstor':
        return ['storage']
      default:
        return ['observability'] // prometheus, alertmanager, itsm, siem
    }
  }
  switch (part.kind) {
    case 'server':
    case 'tray':
      return ['hardware', 'gpu', 'cluster']
    case 'gpu':
    case 'nvswitch':
    case 'service':
      return ['gpu']
    case 'leaf':
    case 'spine':
    case 'su':
    case 'cable':
    case 'nic':
    case 'port':
      return [net]
    case 'dpu':
      return ['ethernet']
    case 'switch-tray':
      return ['ethernet'] // NMX
    case 'rack':
      return part.rackRole === 'cdu' ? ['facility'] : part.rackRole === 'network' || part.rackRole === 'spine' ? [net] : ['hardware']
    case 'pdu':
    case 'manifold':
      return ['facility']
    case 'power-shelf':
      return ['hardware'] // a part of the rack system, with the OEM escalation
    default:
      return ['hardware']
  }
}
