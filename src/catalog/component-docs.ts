import type { BlockRole } from './factory'
import type { DocKind } from './kinds'
import type { RackRole } from './racks'
import { XDR_FABRICS_URL, XDR_RA_URL } from './urls'

export type DocRef = { label: string; source: string }

export type ComponentDoc = {
  summary: string
  learn: DocRef[] // modules, hands-on labs, reference architectures
  runbooks: DocRef[]
  signals: DocRef[] // what an operator sees when the part fails
  commands: DocRef[] // what to run to check the part
  blastRadius?: DocRef
}

// The operator documents of the portal: a customer reads these, and not our course.
const HW: DocRef = { label: 'Hardware matrix', source: 'handbook/hardware-matrix.md' }
const CMDS: DocRef = { label: 'Command reference', source: 'handbook/command-reference.md' }
const CONCEPTS: DocRef = { label: 'Concepts checklist', source: 'handbook/concepts.md' }
const LAB_DCGM: DocRef = { label: 'DCGM and the NVLink fabric (hands-on)', source: 'handson/11-dcgm-nvlink-fabric/README.md' }
const LAB_IB: DocRef = { label: 'InfiniBand fabric tooling (hands-on)', source: 'handson/12-infiniband-fabric/README.md' }
const LAB_OPENSM: DocRef = { label: 'OpenSM on a simulated fabric (hands-on)', source: 'handson/13-ibsim-real-fabric/README.md' }
const RA: DocRef = { label: 'NVIDIA DGX SuperPOD B300 XDR architecture', source: XDR_RA_URL }
const RA_FABRICS: DocRef = { label: 'NVIDIA DGX SuperPOD B300 XDR network fabrics', source: XDR_FABRICS_URL }

const rb = (id: string, title: string, line: number): DocRef => ({
  label: `${id}: ${title}`,
  source: `handbook/runbook-catalog.md:${line}`,
})
const cmd = (command: string, source: string): DocRef => ({ label: command, source })

const G1 = rb('G1', 'GPU fell off the bus (Xid 79)', 82)
const G2 = rb('G2', 'GPU memory errors', 83)
const G3 = rb('G3', 'NVLink error or NVSwitch fault', 84)
const G6 = rb('G6', 'Thermal or power throttle', 87)
const G7 = rb('G7', 'Fabric Manager, NVLSM, or IMEX service failure', 88)
const G8 = rb('G8', 'Slow GPU with no error', 89)
const G9 = rb('G9', 'Node does not boot, or BMC is not reachable', 90)
const G10 = rb('G10', 'Driver, CUDA, or firmware mismatch after an upgrade', 91)
const S5 = rb('S5', 'Local NVMe failure or wear', 136)
const P1 = rb('P1', 'Pod or job cannot get GPUs (device plugin, DRA, or GRES problem)', 144)
const P2 = rb('P2', 'GPU Operator or Network Operator component in a crash loop', 145)
const N1 = rb('N1', 'Link flap or link down on a compute rail', 116)
const N2 = rb('N2', 'High bit error rate, defective cable or transceiver', 117)
const N5 = rb('N5', 'GPUDirect RDMA not in use', 120)
const N7 = rb('N7', 'Subnet manager failover or routing problem', 122)
const N9 = rb('N9', 'Switch failure or upgrade: blast radius and drain plan', 124)
const F2 = rb('F2', 'Rack power event (PDU or power shelf)', 198)
const N6 = rb('N6', 'RoCE congestion: PFC storm, ECN marks, packet drops', 121)
const N10 = rb('N10', 'Time sync (NTP) or DNS fault on cluster nodes', 125)
const N11 = rb('N11', 'Network automation drift or failure', 126)
const P4 = rb('P4', 'Node is NotReady, or slurmd does not respond', 147)
const P6 = rb('P6', 'Control plane overload at scale', 149)
const P7 = rb('P7', 'Control-plane VIP or load balancer fault', 150)
const R1 = rb('R1', 'Cluster shows "not reachable" in Rafay', 161)
const R7 = rb('R7', 'Self-hosted Rafay Controller is degraded', 167)
const R8 = rb('R8', 'Restore the self-hosted Rafay Controller from backup', 168)
const V1 = rb('V1', 'Low throughput from one client or one tenant', 176)
const V2 = rb('V2', 'Client I/O stops or is slow after a CNode failure', 177)
const V4 = rb('V4', 'PersistentVolumeClaim stays in Pending', 179)
const V6 = rb('V6', 'VMS is not available, or must move to a different CNode', 181)
const F1 = rb('F1', 'CDU or coolant loop alarm', 197)
const F3 = rb('F3', 'Emergency thermal shutdown of a rack or a row', 199)
const L9 = rb('L9', 'Physical check of a node or a rack', 213)
const L11 = rb('L11', 'Optic and cable work: find both ends, then the counters and the port map', 215)
const L14 = rb('L14', 'As-built update after a physical change: port map, rack layout, CMDB', 218)
const IBNETDISCOVER = cmd('ibnetdiscover', 'handbook/command-reference.md:74')
const LLDP = cmd('lldpctl; nv show interface <port> lldp', 'handbook/command-reference.md:79')
const ONSITE: DocRef = { label: 'Onsite procedures L11 and L14', source: 'handbook/onsite-procedures.md:65' }
const IMEX_CTL = cmd('nvidia-imex-ctl -H -N', 'handbook/b300-nvl72-forum-triage-guide.md:315')
const FM_STATUS = cmd('systemctl status nvidia-fabricmanager', 'handbook/b300-nvl72-forum-triage-guide.md:12')
const RACK_BLAST: DocRef = { label: 'A fault in an NVSwitch tray, NVLSM, or IMEX can take up to 1 rack, 72 GPUs', source: 'handbook/hardware-matrix.md:23' }

const TOPO = cmd('nvidia-smi topo -m', 'handbook/command-reference.md:35')
const IBSTAT = cmd('ibstat', 'handbook/command-reference.md:72')
const IBLINKINFO = cmd('iblinkinfo', 'handbook/command-reference.md:73')
const PERFQUERY = cmd('perfquery -x', 'handbook/command-reference.md:75')
const IBDIAGNET = cmd('ibdiagnet', 'handbook/command-reference.md:76')
const MLXLINK = cmd('mlxlink -d <device> -p <port>', 'handbook/command-reference.md:77')
const LSTOPO = cmd('lstopo', 'handbook/command-reference.md:41')
const IPMI_SENSOR = cmd('ipmitool sensor', 'handbook/command-reference.md:42')
const IPMI_SEL = cmd('ipmitool sel list', 'handbook/command-reference.md:43')
const NVME_CMD = cmd('nvme list; nvme smart-log /dev/nvme0', 'handbook/command-reference.md:45')
const OPERATOR_PODS = cmd('kubectl get pods -n gpu-operator', 'handbook/command-reference.md:119')
const DCGM_METRICS = cmd('curl -s localhost:9400/metrics | grep DCGM_FI', 'handbook/command-reference.md:156')
// The blast radius of a scale-up service only (Fabric Manager, NVLSM, IMEX, NVOS): inspect() adds it to those parts.
export const SCALE_UP_BLAST: DocRef = {
  label: 'Failure domain of one scale-up fault: 1 server, 8 GPUs, on HGX; up to 1 rack, 72 GPUs, on NVL72',
  source: 'handbook/hardware-matrix.md:23',
}
const FAN_SWAP: DocRef = { label: 'Onsite: GPU fans are hot-swap, CPU fans are cold-swap (XE9780)', source: 'handbook/onsite-procedures.md:57' }

export const COMPONENT_DOCS: Record<DocKind, ComponentDoc> = {
  su: {
    summary: 'A scalable unit: the servers (or NVL72 trays) that share one set of leaf switches. The specs show its reference design and the notes of the RA.',
    learn: [CONCEPTS, RA, RA_FABRICS],
    runbooks: [],
    signals: [],
    commands: [IBDIAGNET],
  },
  server: {
    summary: 'One server (or NVL72 compute tray): its GPUs on NVLink, one compute NIC for each GPU, the front NICs or DPUs, and a BMC.',
    learn: [HW, LAB_DCGM],
    runbooks: [G9, G10],
    signals: [{ label: 'Node does not boot, or BMC is not reachable', source: 'handbook/runbook-catalog.md:90' }],
    commands: [TOPO, cmd('dcgmi diag -r 1', 'handbook/command-reference.md:52')],
    blastRadius: { label: 'An NVLink fault takes 1 server, 8 GPUs', source: 'handbook/hardware-matrix.md:23' },
  },
  leaf: {
    summary: 'A leaf switch of the compute fabric. In a rail-optimized design it takes the same rail from every server of its group, so same-rail traffic is one hop.',
    learn: [CONCEPTS, LAB_IB, LAB_OPENSM, RA_FABRICS],
    runbooks: [N1, N9, N7],
    signals: [{ label: 'Port down or link flap on a compute rail', source: 'handbook/runbook-catalog.md:116' }],
    commands: [IBDIAGNET, IBLINKINFO],
    blastRadius: { label: 'The servers of the group lose their one-hop path on this rail', source: XDR_FABRICS_URL },
  },
  spine: {
    summary: 'A spine switch. Traffic between groups, or between rails, crosses the spine layer.',
    learn: [CONCEPTS, LAB_OPENSM, RA_FABRICS],
    runbooks: [N9, N7],
    signals: [{ label: 'Switch failure: the affected nodes list', source: 'handbook/runbook-catalog.md:124' }],
    commands: [IBDIAGNET],
    blastRadius: { label: 'Less spine capacity for cross-rail and cross-SU traffic; no server is cut off', source: XDR_FABRICS_URL },
  },
  cable: {
    summary: 'A compute fabric cable. One cable with a high error rate slows every job that crosses it.',
    learn: [CONCEPTS, LAB_IB],
    runbooks: [N1, N2],
    signals: [
      { label: 'Symbol errors and the link downed counter', source: 'handbook/runbook-catalog.md:116-117' },
      { label: 'Link flap in the subnet manager log', source: 'handbook/command-reference.md:24' },
    ],
    commands: [PERFQUERY, MLXLINK, IBLINKINFO],
    blastRadius: { label: 'Every job that crosses this cable', source: 'handbook/hardware-matrix.md:23' },
  },
  gpu: {
    summary: 'A GPU: its HBM, its NVLink links to the NVSwitch chips, and PCIe to its own compute NIC.',
    learn: [HW, LAB_DCGM],
    runbooks: [G1, G2, G6, G8],
    signals: [
      { label: 'Xid 79: GPU fell off the bus', source: 'handbook/b300-nvl72-forum-triage-guide.md:249' },
      { label: 'Xid 48: double-bit ECC error', source: 'handbook/b300-nvl72-forum-triage-guide.md:240' },
      { label: 'Xid 63 and 64: row remap events', source: 'handbook/b300-nvl72-forum-triage-guide.md:241-242' },
      { label: 'Xid 94 and 95: contained and uncontained ECC errors', source: 'handbook/b300-nvl72-forum-triage-guide.md:243-244' },
    ],
    commands: [
      cmd('nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE', 'handbook/b300-nvl72-forum-triage-guide.md:14'),
      cmd('dcgmi diag -r 3', 'handbook/command-reference.md:53'),
    ],
  },
  nvswitch: {
    summary: 'An NVSwitch chip: it joins the NVLink links of the GPUs of one server, or of one NVL72 rack.',
    learn: [HW, LAB_DCGM],
    runbooks: [G3, G7],
    signals: [
      { label: 'Xid 74 and 149: NVLink errors', source: 'handbook/b300-nvl72-forum-triage-guide.md:248' },
      { label: 'Xid 137: NVLink receiver fault', source: 'handbook/b300-nvl72-forum-triage-guide.md:246' },
    ],
    commands: [
      cmd('nvidia-smi nvlink -s', 'handbook/command-reference.md:36'),
      cmd('nvidia-smi nvlink -e', 'handbook/command-reference.md:39'),
      cmd('systemctl status nvidia-fabricmanager', 'handbook/b300-nvl72-forum-triage-guide.md:12'),
    ],
    blastRadius: {
      label: '1 server, 8 GPUs. A restart of Fabric Manager kills all CUDA contexts: drain first',
      source: 'handbook/b300-nvl72-forum-triage-guide.md:211',
    },
  },
  nic: {
    summary: 'A NIC. A compute NIC k connects to the rail-k leaf of its group; a front NIC carries storage and in-band traffic.',
    learn: [CONCEPTS, LAB_IB],
    runbooks: [N1, N2, N5],
    signals: [{ label: 'Port down or link flap on a compute rail', source: 'handbook/runbook-catalog.md:116' }],
    commands: [IBSTAT, MLXLINK, PERFQUERY],
  },
  dpu: {
    summary: 'A BlueField-3 DPU for the converged network (storage and in-band management).',
    learn: [CONCEPTS],
    runbooks: [],
    signals: [
      { label: 'wait_fw_init timeout: firmware did not finish its start', source: 'handbook/b300-nvl72-forum-triage-guide.md:284' },
      { label: 'mlx5_load_one failed with error code -16', source: 'handbook/b300-nvl72-forum-triage-guide.md:285' },
    ],
    commands: [],
  },
  cpu: {
    summary: 'A host CPU. Each CPU is one NUMA node; the specs show the GPUs on each node.',
    learn: [HW],
    runbooks: [],
    signals: [],
    commands: [TOPO, LSTOPO],
  },
  nvme: {
    summary: 'The local NVMe drives: the boot drives (M.2) and the data drives (the local cache).',
    learn: [HW],
    runbooks: [S5],
    signals: [
      { label: 'NVMe messages in the kernel log', source: 'handbook/command-reference.md:44' },
      { label: 'Media errors at acceptance', source: 'handbook/cluster-onboarding.md:174-176' },
    ],
    commands: [NVME_CMD],
  },
  bmc: {
    summary: 'The baseboard management controller, on the out-of-band network.',
    learn: [HW],
    runbooks: [G9],
    signals: [{ label: 'BMC is not reachable', source: 'handbook/runbook-catalog.md:90' }],
    commands: [],
  },
  psu: {
    summary: 'The power supplies of the server: their count and their redundancy. A failed PSU shows in the BMC sensors and the system event log.',
    learn: [HW, CMDS],
    runbooks: [G9, L9],
    signals: [{ label: 'A PSU is not present or not redundant (acceptance check)', source: 'handbook/cluster-onboarding.md:123' }],
    commands: [IPMI_SENSOR, IPMI_SEL],
  },
  fan: {
    summary: 'The fans of the server. A fan fault raises the temperatures, and the GPUs can throttle.',
    learn: [HW],
    runbooks: [G6, L9, FAN_SWAP],
    signals: [{ label: 'The PSUs, fans, or temperatures are out of range (acceptance check)', source: 'handbook/cluster-onboarding.md:149' }],
    commands: [IPMI_SENSOR],
  },
  dimm: {
    summary: 'The host memory (DIMMs) of a CPU. The repository has no runbook for host memory errors; G2 is for GPU memory.',
    learn: [HW],
    runbooks: [],
    signals: [],
    commands: [],
  },
  actor: {
    summary: 'A part of a path that the views do not draw: a user, an operator, the PAM, a break-glass account, or a VAST CNode or DNode. The specs give its source.',
    learn: [CMDS, HW],
    runbooks: [],
    signals: [],
    commands: [],
  },
  port: {
    summary: 'A port on the edge of a server or a switch. Compute port k of a server carries rail k to the rail-k leaf; the port map names both ends of its cable.',
    learn: [CONCEPTS],
    runbooks: [N1, L11],
    signals: [],
    commands: [IBSTAT, IBNETDISCOVER],
  },
  rack: {
    summary: 'An NVL72 rack: 18 compute trays and 9 NVLink switch trays form one NVLink domain of 72 GPUs.',
    learn: [HW, LAB_DCGM],
    runbooks: [G7],
    signals: [{ label: 'IMEX or multi-node NVLink fault: cliqueId state', source: 'handbook/b300-nvl72-forum-triage-guide.md:273' }],
    commands: [IMEX_CTL],
    blastRadius: RACK_BLAST,
  },
  tray: {
    summary: 'An NVL72 compute tray: 2 Grace CPUs and 4 GPUs (two superchips), 4 compute NICs, BlueField-3, and a BMC.',
    learn: [HW, LAB_DCGM],
    runbooks: [G1, G7, G9],
    signals: [{ label: 'Xid 79: GPU fell off the bus', source: 'handbook/b300-nvl72-forum-triage-guide.md:249' }],
    commands: [cmd('nvidia-imex-ctl', 'handbook/command-reference.md:57'), TOPO],
  },
  'switch-tray': {
    summary: 'An NVLink switch tray: 2 NVSwitch chips. It runs NVOS with the NVLink Subnet Manager, Fabric Manager, and NMX.',
    learn: [HW, LAB_DCGM],
    runbooks: [G3, G7],
    signals: [{ label: 'Xid 74 and 149: NVLink errors', source: 'handbook/b300-nvl72-forum-triage-guide.md:248' }],
    commands: [cmd('nvidia-smi nvlink -s', 'handbook/command-reference.md:36')],
    blastRadius: RACK_BLAST,
  },
  'power-shelf': {
    summary: 'A power shelf with six 5.5 kW power supplies; 8 shelves feed one NVL72 rack.',
    learn: [HW],
    runbooks: [F2],
    signals: [{ label: 'Rack power event (PDU or power shelf)', source: 'handbook/runbook-catalog.md:198' }],
    commands: [],
  },
  service: {
    summary:
      'A software service: the driver and the GPU Operator components on a node; Fabric Manager and NVLSM for the NVSwitch chips; IMEX on an NVL72 compute tray; NVOS on a switch tray.',
    learn: [HW, CMDS],
    runbooks: [G7, G10, P1, P2],
    signals: [
      { label: 'Fabric Manager, NVLSM, or IMEX service failure', source: 'handbook/runbook-catalog.md:88' },
      { label: 'The device plugin reports 0 GPUs (drill 2)', source: 'handson/03-troubleshooting/README.md:39' },
    ],
    commands: [FM_STATUS, IMEX_CTL, OPERATOR_PODS, DCGM_METRICS],
  },
  block: {
    summary: 'A part of the factory. The specs show its sourced facts and the values that you set.',
    learn: [CONCEPTS],
    runbooks: [],
    signals: [],
    commands: [],
  },
  pdu: {
    summary: 'A rack PDU. The PDUs at the top of the rack feed its servers and switches.',
    learn: [HW],
    runbooks: [F2, L9],
    signals: [{ label: 'Rack power event (PDU or power shelf)', source: 'handbook/runbook-catalog.md:198' }],
    commands: [],
  },
  manifold: {
    summary: 'The coolant manifold at the rear of a liquid-cooled rack. It takes coolant from the CDU to the cold plates.',
    learn: [HW],
    runbooks: [F1, F3],
    signals: [{ label: 'CDU or coolant loop alarm', source: 'handbook/runbook-catalog.md:197' }],
    commands: [],
  },
}

const docs = (summary: string, learn: DocRef[], runbooks: DocRef[], commands: DocRef[] = []): ComponentDoc => ({
  summary,
  learn,
  runbooks,
  signals: [],
  commands,
})
const CHRONY = cmd('chronyc tracking, chronyc sources', 'handbook/command-reference.md:167')
const UFM_HA = cmd('ufm_ha_cluster status', 'handbook/command-reference.md:169')
const ROCE = cmd('nv show qos roce', 'handbook/command-reference.md:170')
const VELERO = cmd('kubectl get backups -n velero', 'handbook/command-reference.md:171')
const VASTPY = cmd('vastpy-cli --json get clusters', 'handbook/command-reference.md:108')

// The docs of each block of the factory overview.
export const BLOCK_DOCS: Record<BlockRole, ComponentDoc> = {
  internet: docs('The internet and the ISP links: the north-south ingress and egress of the factory.', [CONCEPTS], []),
  router: docs('The edge routers: BGP peering with the customer network. The enterprise network team owns them.', [CONCEPTS], [N10]),
  firewall: docs('The firewall at the edge. Users and tenants come in through it; it can also hold the control-plane VIP at L4.', [CONCEPTS], [P7]),
  lb: docs('The load balancer of the control-plane VIP: SSL offload for the Rafay UI, passthrough for the mTLS backends.', [CMDS], [P7]),
  dns: docs('DNS, owned by the enterprise network team. The Rafay controller needs its names; a DNS cutover restores it.', [CONCEPTS], [N10]),
  ntp: docs('NTP time. A node with clock skew fails TLS, tokens, and etcd, and goes NotReady.', [CONCEPTS], [N10], [CHRONY]),
  ipam: docs('IP address management, owned by the enterprise network team.', [CONCEPTS], [N10]),
  frontend: docs('The frontend (in-band) Ethernet: users, the control plane, and, when converged, storage.', [CONCEPTS], [N6], [ROCE]),
  'storage-net': docs('A storage network apart from the frontend: Ethernet RoCE or NDR InfiniBand, to VAST.', [HW], [N6, V1], [ROCE]),
  'control-net': docs('The control-plane network: the controller, Kubernetes, Slurm, BCM, and UFM nodes.', [CMDS], [P6, P7]),
  'oob-net': docs('The out-of-band network: the BMCs, the BlueField BMCs, and the switch management ports, at 1GbE.', [HW], [G9]),
  'compute-fabric': docs('The compute fabric (east-west): leaf and spine switches. Double-click to open it.', [CONCEPTS], [N1, N7, N9]),
  pods: docs('The servers or NVL72 trays of the scalable units. Double-click to open the fabric.', [HW, CONCEPTS], [G9]),
  spares: docs('Cold spare servers, outside the fabric until a replacement.', [CONCEPTS], []),
  rafay: docs('The self-hosted Rafay controller: the platform that operates the Kubernetes clusters and the tenants.', [CMDS], [R1, R7, R8], [VELERO]),
  'rafay-saas': docs('The Rafay controller as a service, reached over the internet; a Management Operator runs in each cluster.', [CMDS], [R1]),
  k8s: docs('The Kubernetes control plane and the GPU and Network Operators.', [CMDS], [P4, P6], [cmd('kubectl get pods -n gpu-operator', 'handbook/command-reference.md:119')]),
  slurm: docs('Slurm: slurmctld, the login nodes, and the accounting.', [CONCEPTS], [P4, P6]),
  bcm: docs('NVIDIA Base Command Manager: provisioning and lifecycle, with two head nodes in HA.', [CONCEPTS], []),
  'mission-control': docs('NVIDIA Mission Control: provisioning, lifecycle, and health of the cluster.', [CONCEPTS], []),
  ufm: docs('UFM: the subnet manager and the telemetry of the InfiniBand fabric, active and standby.', [CONCEPTS], [N7], [UFM_HA]),
  netris: docs('Netris: network automation for the switches; the switches keep their configuration when it is down.', [CONCEPTS], [N11]),
  vast: docs('VAST Data: CBoxes (CNodes) and DBoxes (DNodes and NVMe flash); NFS over RDMA, GPUDirect Storage, S3.', [HW], [V1, V2, V4, V6], [VASTPY]),
  ceph: docs('Ceph: 3 nodes in the bill of quantities; its role is not decided.', [HW], []),
  linstor: docs('Linstor: 3 nodes in the bill of quantities; its role is not decided.', [HW], []),
  utility: docs('The utility power of the site. The facility team owns it.', [HW], [F2]),
  generator: docs('The generators behind the UPS. The facility team owns them.', [HW], [F2]),
  ups: docs('The UPS of the data hall. The facility team owns it.', [HW], [F2]),
  pdu: docs('The PDUs (and the power shelves of an NVL72 rack). One PDU fault can take a rack.', [HW], [F2]),
  cdu: docs('The CDUs of the liquid cooling: coolant loops, supply and return temperature, leak detection.', [HW, CMDS], [F1, F3]),
  bms: docs('The building management system: it watches the UPS and the cooling. The facility team owns it.', [HW, CMDS], [F1, F3]),
  prometheus: docs('Prometheus: it scrapes the metrics of the GPUs, the nodes, the fabric, the BMCs, and VAST.', [CMDS], []),
  alertmanager: docs('Alertmanager: it groups the alerts and sends them to the ITSM and to the SIEM.', [CMDS], []),
  itsm: docs('The ITSM (ServiceNow). With no integration, L1 opens the ticket by hand.', [CMDS], []),
  siem: docs('The SIEM of the site: it takes the audit logs and the security alerts.', [CMDS], []),
}

// The racks of the rack elevation. An NVL72 compute rack uses COMPONENT_DOCS.rack.
export const RACK_DOCS: Record<RackRole, ComponentDoc> = {
  compute: {
    summary: 'A compute rack of the SU: its servers, the power feed, and the compute ports. Open it to see each cable to its leaf and the port map.',
    learn: [HW, CONCEPTS, ONSITE],
    runbooks: [L9, L11, L14, F2],
    signals: [],
    commands: [IBNETDISCOVER, IBLINKINFO],
  },
  network: {
    summary: 'A network rack: the leaf switches of one group. Each leaf takes one rail from every server of the group, and has its uplinks to the spines.',
    learn: [CONCEPTS, ONSITE],
    runbooks: [N9, L11, L14],
    signals: [],
    commands: [IBNETDISCOVER, LLDP],
  },
  spine: {
    summary: 'A spine rack: spine switches that all SUs share.',
    learn: [CONCEPTS, ONSITE],
    runbooks: [N9, L11, L14],
    signals: [],
    commands: [IBNETDISCOVER],
  },
  cdu: {
    summary: 'The in-row CDU of the SU: it moves the heat from the coolant of the racks to the facility water.',
    learn: [HW],
    runbooks: [F1, F3],
    signals: [{ label: 'CDU or coolant loop alarm', source: 'handbook/runbook-catalog.md:197' }],
    commands: [],
  },
}
