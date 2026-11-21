import type { DocRef } from './component-docs'
import { assumed, confirmed, notSourced, SITE_REQUIREMENTS, type Fact } from './fact'
import { FM_GUIDE_URL, GB200_FABRICS_URL, GDR_URL, GDS_URL, NCCL_ENV_URL, NCCL_PXN_URL, RAFAY_ZTKA_URL, SPX_FABRICS_URL, XDR_FABRICS_URL } from './urls'

// The facts and the check commands of the path tracer (sourcing notes of milestone 3, sections 1 to 4).
export type LinkKind = 'nvlink' | 'pcie' | 'infiniband' | 'ethernet' | 'c2c' | 'ip' | 'mad' | 'software' | 'nvmeof'

export const LINK_LABEL: Record<LinkKind, string> = {
  nvlink: 'NVLink',
  pcie: 'PCIe',
  infiniband: 'InfiniBand',
  ethernet: 'Ethernet',
  c2c: 'NVLink-C2C',
  ip: 'IP (HTTPS, mTLS, Redfish)',
  mad: 'SM MADs (in-band)',
  software: 'Software',
  nvmeof: 'NVMe-oF',
}

const cr = (label: string, line: number): DocRef => ({ label, source: `handbook/command-reference.md:${line}` })
const rb = (id: string, title: string, line: number): DocRef => ({ label: `${id}: ${title}`, source: `handbook/runbook-catalog.md:${line}` })

// The counter or command to check on a hop of each kind.
export const HOP_CHECKS: Record<LinkKind, DocRef[]> = {
  nvlink: [cr('nvidia-smi nvlink -e', 39), cr('nvidia-smi topo -m', 35)],
  pcie: [cr("lspci -vv -s <bdf> | grep -E 'LnkCap|LnkSta'", 37), cr('lspci -tv', 38)],
  infiniband: [cr('perfquery -x', 75), cr('mlxlink -d <device> -p <port>', 77), cr('ibdiagnet', 76)],
  ethernet: [cr('ethtool -S <nic>', 81), { label: 'nv show interface <swp> counters', source: 'handbook/cli_utilities_layered_gist.md:136' }],
  c2c: [cr('nvidia-smi topo -m', 35)],
  ip: [rb('P7', 'Control-plane VIP or load balancer fault', 150)],
  mad: [cr('ibnetdiscover', 74), cr('ibdiagnet', 76), rb('N7', 'Subnet manager failover or routing problem', 122)],
  software: [cr('systemctl status nvidia-fabricmanager', 58)],
  nvmeof: [rb('V2', 'Client I/O stops or is slow after a CNode failure', 177)],
}

export const IMEX_CHECK: DocRef = { label: 'nvidia-imex-ctl -H -N', source: 'handbook/b300-nvl72-forum-triage-guide.md:315' }

export const PATH_FACTS = {
  oneHop: confirmed('traffic on one rail is always one hop away inside an SU: one leaf', undefined, XDR_FABRICS_URL),
  spine: confirmed('traffic between different racks, or between different rails, traverses the spine layer', undefined, GB200_FABRICS_URL),
  ecmp: assumed(
    'the spines of the plane are equal-cost choices: the trace shows the first one, and the others as a fan',
    undefined,
    'The RA pages name adaptive routing for the storage fabric only, and the repository disagrees about ECMP on InfiniBand (a SimAI lab says ECMP; ibsim lab 6 says that LID forwarding has no ECMP).',
    'handson/13-ibsim-real-fabric/lab06/README.md:10',
  ),
  pxn: confirmed('PXN (PCI × NVLink, NCCL 2.12): the data first moves over NVLink to the GPU on the rail of the destination', undefined, NCCL_PXN_URL),
  pxnDefault: confirmed('NCCL_PXN_DISABLE: default is 0, so PXN is on', undefined, NCCL_ENV_URL),
  dualPlane: confirmed('each GPU has 2 × 400GbE through two different planes; the trace shows one plane', undefined, SPX_FABRICS_URL),
  nvl72: confirmed('the NVLink switch trays give full-mesh connectivity between all 72 GPUs of the rack', undefined, GB200_FABRICS_URL),
  nvl72Domain: confirmed('a fault in an NVSwitch tray, in NVLSM, or in IMEX can affect every job in the rack', undefined, 'handbook/hardware-matrix.md:55'),
  nvlinkParallel: assumed(
    'a GPU has an NVLink link to every NVSwitch chip, and an NVLink hop uses all the chips at the same time: the fan shows the other chips, not other choices',
    undefined,
    'The pages give one NVLink link from each GPU to each NVSwitch chip; they do not say how the traffic is spread over the chips.',
    GB200_FABRICS_URL,
  ),
  gpuDirect: confirmed('GPUDirect RDMA: a direct path between the GPU and a peer device (the NIC) over PCI Express', undefined, GDR_URL),
  pcieBandwidth: notSourced('No source gives the PCIe bandwidth between a GPU and its NIC; the bottleneck is found among the other hops.'),
}

const sec = (line: number) => `handbook/security-operations.md:${line}`

// The facts of the factory paths (sourcing notes of milestone 3, sections 5 to 8).
export const FACTORY_FACTS = {
  gds: confirmed('GPUDirect Storage: a direct DMA path between GPU memory and storage, which avoids a bounce buffer through the CPU', undefined, GDS_URL),
  bounce: confirmed('without GDS, an extra copy through a bounce buffer in the CPU is necessary, which adds latency and lowers the bandwidth', undefined, GDS_URL),
  vastNfs: confirmed('GDS works with network file systems such as VAST-NFS', undefined, GDS_URL),
  vastParts: confirmed('a VAST cluster has CNodes (the servers) and DNodes (the NVMe-oF controllers of a DBox)', undefined, 'https://kb.vastdata.com/documentation/docs/vast-cluster-concepts-and-terminology-55.md'),
  tlsOffload: confirmed('one path with TLS offload for the user interface and the API', undefined, 'handbook/runbook-catalog.md:150'),
  tlsPassthrough: confirmed('one path with TLS passthrough for the mTLS connections from the clusters', undefined, 'handbook/runbook-catalog.md:150'),
  lbOpen: confirmed('the load balancer of the control-plane VIP is an open decision: the firewall at L4, or HAProxy or Nginx on the control nodes', undefined, SITE_REQUIREMENTS),
  pam: confirmed('a separate privileged account, through the PAM and MFA of the customer', undefined, sec(27)),
  approvedPath: confirmed('all support access goes through the connectivity that the customer approves', undefined, sec(29)),
  breakGlass: confirmed('the break-glass accounts: a minimum of two, kept offline, with no dependency on the system that failed', undefined, sec(37)),
  breakGlassTarget: assumed(
    'the break-glass path reaches the BMC of the server on the out-of-band network',
    undefined,
    'The sources give the break-glass accounts, not the system that they open; the app shows the BMC.',
    sec(37),
  ),
  ztka: confirmed('Zero Trust Kubectl Access (ZTKA) of Rafay, and its audit log', undefined, RAFAY_ZTKA_URL),
  ztkaFirewall: confirmed('ZTKA needs no change to the firewall rules of the remote clusters; a cluster can be behind a firewall', undefined, RAFAY_ZTKA_URL),
  bmcOob: confirmed('each BMC is reachable on the out-of-band network', undefined, 'handbook/cluster-onboarding.md:350'),
  redfish: assumed(
    'the BMC exports its telemetry through Redfish to Prometheus',
    undefined,
    'The source gives this path for Dell servers ("On Dell servers, iDRAC telemetry exports through Redfish to Prometheus"); the app uses it for every BMC.',
    'handbook/cluster-onboarding.md:526',
  ),
  routes: confirmed('the routing tree of Alertmanager: to the ITSM and to the SIEM through webhooks', undefined, 'handbook/cli_utilities_layered_gist.md:12'),
  manualTicket: confirmed('the ticket tool has no integration with the monitoring at this stage: L1 opens the ticket by hand', undefined, 'handbook/shift-discipline.md:47'),
  smDiscover: confirmed('the subnet manager discovers the topology by walking the fabric with SMPs (subnet management packets)', undefined, 'handson/13-ibsim-real-fabric/ARCHITECTURE.md:59'),
  smRoutes: confirmed("the subnet manager computes the routes and fills in every switch's linear forwarding table", undefined, 'handson/13-ibsim-real-fabric/ARCHITECTURE.md:63'),
  nvlsm: confirmed('NVLSM configures the NVSwitch routing tables; Fabric Manager handles the GPU-side routing', undefined, FM_GUIDE_URL),
  nvlsmPackage: confirmed('on B200 and B300, the Fabric Manager package installs the NVLink Subnet Manager (NVLSM)', undefined, 'handbook/hardware-matrix.md:40'),
}

// The checks of the factory hops (in the catalog, so the source test checks them).
export const FACTORY_CHECKS = {
  gds: [cr('gdscheck -p', 103)],
  vastMount: [cr('mount -o vers=3,nconnect=<n>,… <vip>:/<export> /mnt/vast', 100), rb('V2', 'Client I/O stops or is slow after a CNode failure', 177)],
  roceLeaf: [cr('nv show qos roce', 170)],
  vip: [rb('P7', 'Control-plane VIP or load balancer fault', 150)],
  access: [{ label: 'Security operations: the approved path only', source: 'handbook/security-operations.md:29' }],
  ztka: [{ label: 'Kubectl access through ZTKA, and the audit log', source: 'handbook/runbook-catalog.md:164' }],
  bmc: [cr('ipmitool sel list', 43), rb('G9', 'Node does not boot, or BMC is not reachable', 90)],
  exporter: [cr('curl -s localhost:9400/metrics | grep DCGM_FI', 156)],
  redfish: [{ label: 'iDRAC telemetry through Redfish to Prometheus', source: 'handbook/cluster-onboarding.md:526' }],
  alerts: [{ label: 'The routing tree of Alertmanager', source: 'handbook/cli_utilities_layered_gist.md:12' }],
  fm: [cr('systemctl status nvidia-fabricmanager', 58), cr('journalctl -u nvidia-fabricmanager', 158), rb('G7', 'Fabric Manager, NVLSM, or IMEX service failure', 88)],
}

// The parts of a path that no view draws. The trace shows them with a dashed border.
export const VIRTUAL_PARTS: Record<string, { label: string; fact: Fact<string> }> = {
  'path-user': { label: 'User (the UI or the API)', fact: FACTORY_FACTS.tlsOffload },
  'path-operator': { label: 'Operator (support engineer)', fact: FACTORY_FACTS.approvedPath },
  'path-pam': { label: 'PAM and MFA of the customer', fact: FACTORY_FACTS.pam },
  'path-breakglass': { label: 'Break-glass account (offline)', fact: FACTORY_FACTS.breakGlass },
  'path-cnode': { label: 'VAST CNode', fact: FACTORY_FACTS.vastParts },
  'path-dnode': { label: 'VAST DNode (DBox)', fact: FACTORY_FACTS.vastParts },
}
