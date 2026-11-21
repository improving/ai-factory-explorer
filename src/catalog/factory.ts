import { assumed, confirmed, notSourced, SITE_REQUIREMENTS, type Fact } from './fact'
import { SN2201, SN4700, SN5600 } from './switches'
import {
  BCM_HA_URL,
  ENT_LOGICAL_URL,
  RAFAY_PREREQ_URL,
  UFM_HA_URL,
  VAST_CBOX6_URL,
  VAST_DBOX_URL,
  VAST_NET_URL,
  XDR_BOM_URL,
  XDR_FABRICS_URL,
  XDR_MGMT_URL,
  XDR_STORAGE_URL,
} from './urls'

export const BLOCK_ROLES = [
  'internet',
  'router',
  'firewall',
  'lb',
  'dns',
  'ntp',
  'ipam',
  'frontend',
  'storage-net',
  'control-net',
  'oob-net',
  'compute-fabric',
  'pods',
  'spares',
  'rafay',
  'rafay-saas',
  'k8s',
  'slurm',
  'bcm',
  'mission-control',
  'ufm',
  'netris',
  'vast',
  'ceph',
  'linstor',
  'utility',
  'generator',
  'ups',
  'pdu',
  'cdu',
  'bms',
  'prometheus',
  'alertmanager',
  'itsm',
  'siem',
] as const

export type BlockRole = (typeof BLOCK_ROLES)[number]
export type BlockRow = { label: string; fact: Fact<unknown> }

const FABRIC_SPEC = 'handbook/concepts.md:13'
const ENTERPRISE = confirmed('the enterprise network team', undefined, FABRIC_SPEC)
const FACILITY_TEAM = confirmed('the facility team of the customer', undefined, 'handbook/onsite-procedures.md:14')
const POWER_PATH = confirmed('substation, UPS, generators', undefined, 'handbook/concepts.md:13')
const row = (label: string, fact: Fact<unknown>): BlockRow => ({ label, fact })

// The sourced facts of each block of the factory overview. The values that the user sets in the
// configuration panels are added by the inspector; they are not here.
export const BLOCK_FACTS: Record<BlockRole, BlockRow[]> = {
  internet: [
    row('RA uplink', confirmed('at least 2 × 100GbE, DR1 single-mode', undefined, XDR_FABRICS_URL)),
    row('Routing', confirmed('BGP peering; the in-band and out-of-band routes are announced', undefined, XDR_FABRICS_URL)),
    row('Site uplink', confirmed('a 200G uplink to the ISPs', undefined, SITE_REQUIREMENTS)),
  ],
  router: [
    row('Role', confirmed('BGP peering with the customer network', undefined, XDR_FABRICS_URL)),
    row('No DR1', confirmed('a pair of border leaf switches, not part of the SuperPOD', undefined, XDR_FABRICS_URL)),
    row('Owner', ENTERPRISE),
  ],
  firewall: [row('Site', confirmed('a firewall and 2 edge routers', undefined, SITE_REQUIREMENTS)), row('Owner', ENTERPRISE)],
  lb: [
    row('Paths', confirmed('path 1: SSL offload for the UI names; path 2: SSL/TCP passthrough for the mTLS backends', undefined, 'https://docs.rafay.co/selfhosted/airgapped/pre-requisites/')),
    row('Health check', confirmed('/healthz/ready', undefined, 'handbook/runbook-catalog.md:150')),
    row('Site choice', confirmed('the firewall at L4, or HAProxy or Nginx on the control nodes (open)', undefined, SITE_REQUIREMENTS)),
  ],
  dns: [row('Owner', ENTERPRISE), row('Rafay names', confirmed('console, ops-console, api, fluentd-aggr', undefined, 'https://docs.rafay.co/selfhosted/airgapped/dns_settings/'))],
  ntp: [
    row('Owner', ENTERPRISE),
    row('Client', confirmed('chrony', undefined, 'https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/configuring_time_synchronization/using-chrony')),
    row('Clock skew', confirmed('a node goes NotReady (TLS, tokens, etcd)', undefined, 'https://labs.iximiuz.com/courses/kubelings-dbd840c8/module-11/node-clock-skew')),
  ],
  ipam: [row('Owner', ENTERPRISE)],
  frontend: [
    row('Switch', SN5600.model),
    row('Site', confirmed('SN5610 leaf-spine with a storage leaf pair and a control-plane leaf pair', undefined, SITE_REQUIREMENTS)),
    row('RA in-band at 8 SU', confirmed('6 leaf and 2 spine switches (SN5610)', undefined, XDR_BOM_URL)),
    row('Enterprise RA converged', confirmed('32 nodes: 2 leaf; 64: 4 leaf, 2 spine; 128: 8 leaf, 4 spine', undefined, ENT_LOGICAL_URL)),
    row('RoCE QoS', confirmed('PFC on priority 3, ECN on TC3, CNP on priority 6', undefined, 'https://docs.nvidia.com/networking-ethernet-software/cumulus-linux-59/Layer-1-and-Switch-Ports/Quality-of-Service/RDMA-over-Converged-Ethernet-RoCE/')),
  ],
  'storage-net': [
    row('RA InfiniBand at 8 SU', confirmed('16 + 8 leaf and 8 spine switches (NDR)', undefined, XDR_BOM_URL)),
    row('RA Ethernet at 8 SU', confirmed('16 + 4 leaf and 12 spine switches (SN5610)', undefined, XDR_BOM_URL)),
    row('Oversubscription', confirmed('near 4:3 on the DGX side; 1:1 on the storage side', undefined, XDR_FABRICS_URL)),
    row('RA performance, 1 SU', confirmed('80 GB/s read, 40 GB/s write (standard)', undefined, XDR_STORAGE_URL)),
  ],
  'control-net': [
    row('Switch', SN4700.model),
    row('Site', confirmed('SN4700; the control nodes use ConnectX-6 at 100G', undefined, SITE_REQUIREMENTS)),
  ],
  'oob-net': [
    row('Switch', SN2201.model),
    row('RA at 8 SU', confirmed(69, 'SN2201 switches', XDR_BOM_URL)),
    row('What connects', confirmed('All devices connect to OOB with 1GbE for IPMI/Redfish', undefined, XDR_MGMT_URL)),
    row('Routing', confirmed('a dedicated VXLAN in the aggregation layer of each SU', undefined, XDR_FABRICS_URL)),
  ],
  'compute-fabric': [],
  pods: [],
  spares: [],
  rafay: [
    row('HA', confirmed('3 masters and at least 1 worker', undefined, 'https://docs.rafay.co/selfhosted/architecture/')),
    row('Vendor minimum', confirmed('3 nodes for production', undefined, RAFAY_PREREQ_URL)),
    row('DNS names', confirmed('console, ops-console, api, fluentd-aggr', undefined, 'https://docs.rafay.co/selfhosted/airgapped/dns_settings/')),
    row('Backup', confirmed('Velero to an S3 store; restore, then a DNS cutover', undefined, 'https://docs.rafay.co/selfhosted/airgapped/backup-restore-aws/')),
  ],
  'rafay-saas': [
    row('Parts', confirmed('the controller (SaaS or self-hosted) and a Management Operator in each cluster', undefined, 'https://docs.rafay.co/intro/architecture/')),
  ],
  k8s: [
    row('RA management nodes', confirmed(3, 'nodes', XDR_MGMT_URL)),
    row('GPU Operator', confirmed('driver, toolkit, device plugin, DCGM exporter; namespace gpu-operator', undefined, 'handbook/command-reference.md:119')),
  ],
  slurm: [
    row('RA login nodes', confirmed(2, 'nodes', XDR_MGMT_URL)),
    row('Parts', confirmed('slurmctld, slurmd, accounting, GRES, topology, prolog and epilog', undefined, 'handbook/runbook-catalog.md:149')),
  ],
  bcm: [
    row('RA head nodes', confirmed(2, 'nodes (HA)', XDR_MGMT_URL)),
    row('HA', confirmed('a primary and a secondary head node, an external and an internal VIP, a NAS for /cm/shared and /home', undefined, BCM_HA_URL)),
    row('Documentation', confirmed('NVIDIA Base Command Manager: cluster provisioning and lifecycle', undefined, 'https://docs.nvidia.com/base-command-manager/index.html')),
  ],
  'mission-control': [row('Documentation', confirmed('NVIDIA Mission Control: cluster provisioning and lifecycle', undefined, 'https://www.nvidia.com/en-us/data-center/mission-control/'))],
  ufm: [
    row('Site', confirmed(2, 'UFM units, active and standby', SITE_REQUIREMENTS)),
    row('HA', confirmed('Pacemaker and DRBD; ufm_ha_cluster failover and takeover', undefined, 'https://networking-docs.nvidia.com/ufmxdrenterpriseappsw/241/high-availability')),
    row('Virtual IP', confirmed('a virtual management IP for the master', undefined, UFM_HA_URL)),
    row('Switch port', confirmed('a dedicated OSFP port on the Q3400 for UFM', undefined, 'https://networking-docs.nvidia.com/xdrswitcheshw/introduction')),
    row('Telemetry', confirmed('about 30 counters each 30 s; about 120 counters each 300 s', undefined, 'https://networking-docs.nvidia.com/ufmenterpriseum/6.26.1/telemetry')),
  ],
  netris: [
    row('Parts', confirmed('a controller of 3 or more nodes, an agent on each switch, an optional SoftGate', undefined, 'https://docs.netris.io/en/latest/netris-architecture.html')),
    row('Controller lost', confirmed('the switches keep their configuration', undefined, 'https://docs.netris.io/en/latest/netris-architecture.html')),
    row('Scope', confirmed('open', undefined, SITE_REQUIREMENTS)),
  ],
  vast: [
    row(
      'CNodes in each CBox',
      confirmed(4, 'CNodes', 'https://kb.vastdata.com/documentation/docs/vast-cluster-concepts-and-terminology-55.md', 'The 6th-generation CBox datasheet describes a 1U single-server node with 4 × 200GbE.'),
    ),
    row('6th-generation CBox', confirmed('1U, one server node, 4 × 200GbE or NDR200', undefined, VAST_CBOX6_URL)),
    row('DBox', confirmed('NVMe-oF flash enclosure; its DNodes are the controller cards', undefined, 'https://kb.vastdata.com/documentation/docs/vast-cluster-concepts-and-terminology-55.md')),
    row('DBox Ceres', confirmed('1U; 4 × 200GbE; 22 E1.L SSDs and 8 SCM SSDs', undefined, VAST_DBOX_URL)),
    row('Client protocols', confirmed('NFS over TCP or RDMA (multipath), GPUDirect Storage, S3, SMB', undefined, 'https://kb.vastdata.com/documentation/docs/vast-cluster-concepts-and-terminology-55.md')),
    row('nconnect', confirmed('about 8 TCP or 2 RDMA connections for each 100 Gb/s', undefined, 'https://kb.vastdata.com/docs/7-vast-client-nfs-multipathing.md')),
    row('VIP pools', confirmed('load balancing, failover, tenant scope, VLAN, BGP', undefined, 'https://kb.vastdata.com/documentation/docs/managing-nfs-mount-options-1.md')),
    row('L3 mode', confirmed('BGP with FRR', undefined, VAST_NET_URL)),
    row('Call Home', confirmed('outbound TCP 443', undefined, 'https://kb.vastdata.com/docs/how-to-allow-vast-call-home-and-support-web-pages-through-a-firewall.md')),
    row('Port layout', notSourced('The VAST port layout on the switches is not in the sources; the app draws the CNodes on the storage network.')),
  ],
  ceph: [row('Site', confirmed('3 nodes; role not decided', undefined, SITE_REQUIREMENTS))],
  linstor: [row('Site', confirmed('3 nodes; role not decided', undefined, SITE_REQUIREMENTS))],
  utility: [
    row('Power path', POWER_PATH),
    row('Facility', confirmed('Tier III; a 24x7 facility team', undefined, SITE_REQUIREMENTS)),
    row('Owner', FACILITY_TEAM),
    row('Site power', notSourced('No source gives the power of the site.')),
  ],
  generator: [row('Power path', POWER_PATH), row('Model and power', notSourced('Not in the sources.')), row('Owner', FACILITY_TEAM)],
  ups: [row('Power path', POWER_PATH), row('Model and power', notSourced('Not in the sources.')), row('Owner', FACILITY_TEAM)],
  pdu: [
    row('Blast radius', confirmed('one PDU, CDU, or row', undefined, 'handbook/concepts.md:16')),
    row('Model and count', notSourced('Not in the sources.')),
    row('Owner', FACILITY_TEAM),
  ],
  cdu: [
    row('Basics', confirmed('coolant loops, supply and return temperature, leak detection', undefined, 'handbook/concepts.md:15')),
    row('Model and count', notSourced('Not in the sources; the NVL72 pages read do not name the CDU either.')),
    row('Owner', FACILITY_TEAM),
  ],
  bms: [
    row('Site', confirmed('a BMS engineer is planned for the UPS and the cooling', undefined, SITE_REQUIREMENTS)),
    row('Owner', FACILITY_TEAM),
  ],
  prometheus: [
    row('GPU metrics', confirmed('dcgm-exporter on port 9400 (as installed)', undefined, 'handbook/command-reference.md:156')),
    row('Node metrics', confirmed('node exporter on port 9100', undefined, 'handbook/command-reference.md:157')),
    row('Rafay', confirmed('Rafay managed Prometheus scrapes the GPU metrics', undefined, 'https://docs.rafay.co/dashboard/gpu_dashboard/')),
    row('BMC', confirmed('iDRAC telemetry exports through Redfish to Prometheus', undefined, 'handbook/cluster-onboarding.md:526')),
    row('VAST', confirmed('VMS has a built-in Prometheus exporter (4.7+)', undefined, 'https://kb.vastdata.com/docs/vast-grafana-dashboard.md')),
    row('Network devices in Rafay', notSourced('The sources do not say how Rafay takes the network device telemetry.')),
  ],
  alertmanager: [row('Routing', confirmed('the routing tree: to the ITSM and to the SIEM through webhooks', undefined, 'handbook/cli_utilities_layered_gist.md:12'))],
  itsm: [
    row('ITSM', confirmed('ServiceNow; no integration with Rafay at this stage', undefined, SITE_REQUIREMENTS)),
    row('Tickets', confirmed('L1 opens the tickets by hand', undefined, SITE_REQUIREMENTS)),
  ],
  siem: [row('SIEM', confirmed('site-specific', undefined, SITE_REQUIREMENTS))],
}

// The rows of a value that the user sets: the panels give the value, not the sources.
export const userSet = <T,>(value: T, unit?: string): Fact<T> =>
  assumed(value, unit, 'You set this value in the configuration panel; the sources do not give it for this site.')
