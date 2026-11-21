import type { DocRef } from './component-docs'
import { assumed, confirmed, SITE_REQUIREMENTS, type Fact } from './fact'
import { UFM_HA_URL } from './urls'

// The failure rules of the simulator (spec section 7; sourcing notes of milestone 4). A rule that the repository
// does not state is assumed, with the closest repository line as its source.
export type FailKind =
  | 'gpu'
  | 'nvswitch'
  | 'switch-tray'
  | 'fabric-manager'
  | 'nvlsm'
  | 'imex'
  | 'driver'
  | 'device-plugin'
  | 'nic'
  | 'cable'
  | 'leaf'
  | 'spine'
  | 'storage-net'
  | 'ufm'
  | 'psu'
  | 'bmc'
  | 'cdu'
  | 'pdu'
  | 'vast'
  | 'rafay'
  | 'lb'
  | 'firewall'
  | 'dns'
  | 'ntp'
export type FailMode = 'down' | 'xid79' | 'xid48' | 'xid64' | 'degraded' | 'active' | 'both' | 'cnode'
export type Drain = 'none' | 'node' | 'nvlink-domain' | 'racks'
// One mode of a failure. `floor` is the severity that this failure alone gives (1 is P1).
export type ModeRule = { label: string; effect: Fact<string>; runbook: DocRef | null; command: DocRef; alert: string; drain: Drain; floor: 1 | 2 | 3 | 4 }
export type FailRule = { label: string; who: Fact<string>; modes: Partial<Record<FailMode, ModeRule>> }

const rb = (id: string, title: string, line: number): DocRef => ({ label: `${id}: ${title}`, source: `handbook/runbook-catalog.md:${line}` })
const cr = (label: string, line: number): DocRef => ({ label, source: `handbook/command-reference.md:${line}` })

const L2: Fact<string> = confirmed('L2: L1 does not restart, drain, reboot, delete, or edit anything', undefined, 'handbook/l1-primer.md:16')
const L2_OEM: Fact<string> = confirmed('the OEM case with the evidence, and the part on site (procedures L2, L12)', undefined, 'handbook/runbook-catalog.md:82')
const ONSITE: Fact<string> = confirmed('the remote team dispatches the onsite engineer (procedure L11)', undefined, 'handbook/runbook-catalog.md:215')
const FACILITY: Fact<string> = confirmed('the facility team: power, cooling, leak, access', undefined, 'handbook/shift-discipline.md:69')
const NETWORK: Fact<string> = confirmed('the enterprise network team: DNS, NTP, IPAM, the firewall', undefined, 'handbook/shift-discipline.md:70')
const IB_OPS: Fact<string> = confirmed('L2 reads; L3 changes routing, partitions, firmware (proposed)', undefined, SITE_REQUIREMENTS)
const RAFAY_OPS: Fact<string> = confirmed('L3 only, through the change procedure L7 or the restore runbook R8', undefined, 'handbook/command-reference.md:193')

const down = (r: Omit<ModeRule, 'label'> & { label?: string }): Partial<Record<FailMode, ModeRule>> => ({ down: { label: 'down', ...r } })

export const FAIL_RULES: Record<FailKind, FailRule> = {
  gpu: {
    label: 'GPU',
    who: L2_OEM,
    modes: {
      xid79: {
        label: 'Xid 79 (fell off the bus)',
        effect: confirmed('a Xid 79 makes you drain the node immediately', undefined, 'handbook/b300-nvl72-forum-triage-guide.md:249'),
        runbook: rb('G1', 'GPU fell off the bus (Xid 79)', 82),
        command: cr("dmesg -T | grep -i xid", 21),
        alert: 'Xid 79',
        drain: 'node',
        floor: 3,
      },
      xid48: {
        label: 'Xid 48 (double-bit ECC)',
        effect: confirmed('a double-bit ECC error; if persistent, an RMA candidate', undefined, 'handbook/b300-nvl72-forum-triage-guide.md:240'),
        runbook: rb('G2', 'GPU memory errors: double-bit ECC (Xid 48)', 83),
        command: cr('nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE', 34),
        alert: 'ECC double-bit error (Xid 48)',
        drain: 'node',
        floor: 3,
      },
      xid64: {
        label: 'row remap fails or keeps growing (Xid 64)',
        effect: confirmed('row remap fails or keeps growing', undefined, 'runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md:176'),
        runbook: rb('G2', 'GPU memory errors: row remap event and failure (Xid 63, 64)', 83),
        command: cr('nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE', 34),
        alert: 'row remap failure or growth (Xid 64)',
        drain: 'node',
        floor: 3,
      },
      degraded: {
        label: 'slow, no error (suspected silent defect)',
        effect: confirmed('a slow GPU with no error: a suspected silent defect or silent data corruption', undefined, 'handbook/runbook-catalog.md:89'),
        runbook: rb('G8', 'Slow GPU with no error (suspected silent defect or silent data corruption)', 89),
        command: cr('nvidia-smi -q -d ECC,ROW_REMAPPER,PERFORMANCE', 34),
        alert: 'step time of one rank above the others',
        drain: 'none',
        floor: 3,
      },
    },
  },
  nvswitch: {
    label: 'NVSwitch chip',
    who: L2_OEM,
    modes: down({
      effect: confirmed('the failure domain of one scale-up fault: 1 server, 8 GPUs (HGX); up to 1 rack, 72 GPUs (NVL72)', undefined, 'handbook/hardware-matrix.md:23'),
      runbook: rb('G3', 'NVLink error or NVSwitch fault (Xid 74, 149)', 84),
      command: cr('nvidia-smi nvlink -s', 36),
      alert: 'NVLink error growth',
      drain: 'nvlink-domain',
      floor: 3,
    }),
  },
  'switch-tray': {
    label: 'NVLink switch tray',
    who: L2_OEM,
    modes: down({
      effect: confirmed('a fault in an NVSwitch tray can affect every job in the rack; drain the NVLink domain, not the node', undefined, 'handbook/hardware-matrix.md:55'),
      runbook: rb('G3', 'NVLink error or NVSwitch fault (Xid 74, 149)', 84),
      command: cr('nvidia-smi nvlink -s', 36),
      alert: 'NVLink error growth',
      drain: 'nvlink-domain',
      floor: 2,
    }),
  },
  'fabric-manager': {
    label: 'Fabric Manager',
    who: L2,
    modes: down({
      effect: assumed(
        'the GPUs of the node lose NVLink (the scale-up domain of the server)',
        undefined,
        'The reference architecture gives the failure domain (1 server, 8 GPUs); it does not state the answer.',
        'handbook/runbook-catalog.md:88',
      ),
      runbook: rb('G7', 'Fabric Manager, NVLSM, or IMEX service failure', 88),
      command: cr('systemctl status nvidia-fabricmanager', 58),
      alert: 'Fabric Manager service down',
      drain: 'node',
      floor: 3,
    }),
  },
  nvlsm: {
    label: 'NVLSM',
    who: L2,
    modes: down({
      effect: assumed('the GPUs of the node lose NVLink (NVLSM programs the NVSwitch chips)', undefined, 'The repository does not state the blast radius of NVLSM.', 'handbook/hardware-matrix.md:40'),
      runbook: rb('G7', 'Fabric Manager, NVLSM, or IMEX service failure', 88),
      command: cr('systemctl status nvidia-fabricmanager', 58),
      alert: 'NVLSM service down',
      drain: 'node',
      floor: 3,
    }),
  },
  imex: {
    label: 'IMEX',
    who: L2,
    modes: down({
      effect: confirmed('a fault in an NVSwitch tray, in the NVLink Subnet Manager, or in IMEX can affect every job in the rack (up to 72 GPUs)', undefined, 'handbook/hardware-matrix.md:55'),
      runbook: rb('G7', 'Fabric Manager, NVLSM, or IMEX service failure', 88),
      command: cr('nvidia-imex-ctl', 57),
      alert: 'IMEX service down',
      drain: 'nvlink-domain',
      floor: 2,
    }),
  },
  driver: {
    label: 'NVIDIA driver',
    who: L2,
    modes: down({
      effect: assumed('the GPUs of the node are not usable', undefined, 'NOT FOUND: the blast radius of a driver fault; the runbook is G10.', 'handbook/runbook-catalog.md:91'),
      runbook: rb('G10', 'Driver, CUDA, or firmware mismatch after an upgrade', 91),
      command: cr('kubectl logs -n gpu-operator <driver pod>', 120),
      alert: 'driver pod in a crash loop',
      drain: 'node',
      floor: 3,
    }),
  },
  'device-plugin': {
    label: 'Device plugin',
    who: L2,
    modes: down({
      effect: assumed('the GPUs of the node are not allocatable: a pod is Running but has no GPU', undefined, 'NOT FOUND: the blast radius of the device plugin.', 'handbook/command-reference.md:119'),
      runbook: rb('P1', 'Pod or job cannot get GPUs (device plugin, DRA, or GRES problem)', 144),
      command: cr('kubectl get pods -n gpu-operator', 119),
      alert: 'allocatable nvidia.com/gpu is 0',
      drain: 'none',
      floor: 3,
    }),
  },
  nic: {
    label: 'Compute NIC',
    who: ONSITE,
    modes: down({
      effect: assumed('the GPU of that NIC loses its rail', undefined, 'NOT FOUND: the blast radius of a NIC; the game day maps "one rail disabled" to N2.'),
      runbook: rb('N2', 'High bit error rate, symbol errors, defective cable or transceiver', 117),
      command: cr('ibstat', 72),
      alert: 'ConnectX port down',
      drain: 'none',
      floor: 3,
    }),
  },
  cable: {
    label: 'Compute cable',
    who: ONSITE,
    modes: {
      down: {
        label: 'down',
        effect: assumed('the GPU loses its rail (single plane), or that plane (dual plane: half bandwidth)', undefined, 'The runbook is N1; the effect on the rail is not stated.', 'handbook/runbook-catalog.md:116'),
        runbook: rb('N1', 'Link flap or link down on a compute rail', 116),
        command: cr('iblinkinfo', 73),
        alert: 'IB link down',
        drain: 'none',
        floor: 3,
      },
      degraded: {
        label: 'degraded (high BER)',
        effect: confirmed('one cable with a high error rate slows all jobs that cross it', undefined, 'handbook/runbook-catalog.md:117'),
        runbook: rb('N2', 'High bit error rate, symbol errors, defective cable or transceiver', 117),
        command: cr('perfquery -x', 75),
        alert: 'symbol error growth',
        drain: 'none',
        floor: 3,
      },
    },
  },
  leaf: {
    label: 'Leaf switch',
    who: IB_OPS,
    modes: down({
      effect: assumed(
        'its rail is lost for each server of its group (single plane); with dual plane those servers run at half bandwidth',
        undefined,
        'NOT FOUND in the repository; the half bandwidth is the B300 Spectrum-X RA (m3 sourcing notes, section 1), and a dual-plane design means that "the failure of one leaf switch does not isolate a node".',
      ),
      runbook: rb('N9', 'Switch failure or switch upgrade: blast radius and drain plan', 124),
      command: cr('iblinkinfo', 73),
      alert: 'switch down',
      drain: 'none',
      floor: 2,
    }),
  },
  spine: {
    label: 'Spine switch',
    who: IB_OPS,
    modes: down({
      effect: confirmed('losing one spine degrades bandwidth but does not partition anything', undefined, 'handson/13-ibsim-real-fabric/lab16/README.md:12'),
      runbook: rb('N9', 'Switch failure or switch upgrade: blast radius and drain plan', 124),
      command: cr('iblinkinfo', 73),
      alert: 'switch down',
      drain: 'none',
      floor: 3,
    }),
  },
  'storage-net': {
    label: 'Storage network',
    who: IB_OPS,
    modes: {
      ...down({
        effect: assumed('the GPUs lose their path to storage', undefined, 'NOT FOUND: a storage leaf failure.', 'handbook/command-reference.md:170'),
        runbook: null,
        command: cr('nv show qos roce', 170),
        alert: 'storage switch down',
        drain: 'none',
        floor: 2,
      }),
      degraded: {
        label: 'congested (PFC storm), no link down',
        effect: confirmed('RoCE congestion: PFC storm, ECN marks, packet drops', undefined, 'handbook/runbook-catalog.md:121'),
        runbook: rb('N6', 'RoCE congestion: PFC storm, ECN marks, packet drops', 121),
        command: cr('ethtool -S <nic>', 81),
        alert: 'PFC pause frames above the threshold',
        drain: 'none',
        floor: 2,
      },
    },
  },
  ufm: {
    label: 'UFM',
    who: IB_OPS,
    modes: {
      active: {
        label: 'the active unit (the standby takes over)',
        effect: confirmed('UFM HA runs on two appliances, master and standby; a failover moves the master role to the standby', undefined, UFM_HA_URL),
        runbook: rb('N7', 'Subnet manager failover or routing problem (InfiniBand)', 122),
        command: cr('ufm_ha_cluster status', 169),
        alert: 'a change of the active UFM unit',
        drain: 'none',
        floor: 3,
      },
      both: {
        label: 'both units',
        effect: assumed(
          'no subnet manager: the routing tables freeze where they were, and the running traffic continues',
          undefined,
          'The OpenSM lab gives this; NOT FOUND for UFM.',
          'handson/13-ibsim-real-fabric/lab17/README.md:78',
        ),
        runbook: rb('N7', 'Subnet manager failover or routing problem (InfiniBand)', 122),
        command: cr('ufm_ha_cluster status', 169),
        alert: 'UFM down',
        drain: 'none',
        floor: 2,
      },
      down: {
        label: 'the only unit (no HA)',
        effect: assumed(
          'no subnet manager: the routing tables freeze where they were, and the running traffic continues',
          undefined,
          'The OpenSM lab gives this; NOT FOUND for UFM. With one UFM unit there is no standby.',
          'handson/13-ibsim-real-fabric/lab17/README.md:78',
        ),
        runbook: rb('N7', 'Subnet manager failover or routing problem (InfiniBand)', 122),
        command: cr('ufm_ha_cluster status', 169),
        alert: 'UFM down',
        drain: 'none',
        floor: 2,
      },
    },
  },
  psu: {
    label: 'Power supply (one of N)',
    who: ONSITE,
    modes: down({
      effect: assumed('the redundancy of the power supplies is lost; the server runs', undefined, 'The acceptance check wants each PSU present and redundant; NOT FOUND: the PSU blast radius.', 'handbook/cluster-onboarding.md:123'),
      runbook: null,
      command: cr('ipmitool sensor', 42),
      alert: 'failed power supply',
      drain: 'none',
      floor: 3,
    }),
  },
  bmc: {
    label: 'BMC',
    who: L2,
    modes: down({
      effect: assumed('the out-of-band access to the node is lost; the node runs', undefined, 'The runbook is G9 ("BMC is not reachable"); the effect on the node is not stated.', 'handbook/runbook-catalog.md:90'),
      runbook: rb('G9', 'Node does not boot, or BMC is not reachable', 90),
      command: cr('ipmitool sel list', 43),
      alert: 'BMC does not answer',
      drain: 'none',
      floor: 3,
    }),
  },
  cdu: {
    label: 'CDU',
    who: FACILITY,
    modes: down({
      effect: assumed('the racks of the SU lose cooling: a thermal throttle, then the drain and shutdown sequence', undefined, 'F1 and F3 are separate runbooks; the chain is NOT FOUND.', 'handbook/runbook-catalog.md:199'),
      runbook: rb('F1', 'CDU or coolant loop alarm', 197),
      command: rb('F3', 'Emergency thermal shutdown of a rack or a row: the drain sequence', 199),
      alert: 'CDU alarm',
      drain: 'racks',
      floor: 1,
    }),
  },
  pdu: {
    label: 'PDU or power shelf (one of N)',
    who: FACILITY,
    modes: down({
      effect: assumed('the power redundancy of the rack is lost; the rack runs', undefined, 'NOT FOUND: the blast radius of one PDU.', 'handbook/runbook-catalog.md:198'),
      runbook: rb('F2', 'Rack power event (PDU or power shelf)', 198),
      command: cr('ipmitool sensor', 42),
      alert: 'rack power event',
      drain: 'none',
      floor: 3,
    }),
  },
  vast: {
    label: 'VAST',
    who: L2,
    modes: {
      cnode: {
        label: 'one CNode',
        effect: confirmed('client I/O stops or is slow after a CNode failure: the VIPs move between CNodes', undefined, 'handbook/runbook-catalog.md:177'),
        runbook: rb('V2', 'Client I/O stops or is slow after a CNode failure', 177),
        command: cr('vastpy-cli --json get clusters', 108),
        alert: 'VAST CNode down',
        drain: 'none',
        floor: 3,
      },
      degraded: {
        label: 'one client path slow (VAST healthy)',
        effect: confirmed('low throughput from one client or one tenant', undefined, 'handbook/runbook-catalog.md:176'),
        runbook: rb('V1', 'Low throughput from one client or one tenant', 176),
        command: cr('nfsstat -m', 101),
        alert: 'checkpoint write throughput below the threshold',
        drain: 'none',
        floor: 3,
      },
    },
  },
  rafay: {
    label: 'Rafay controller',
    who: RAFAY_OPS,
    modes: down({
      effect: confirmed('the Rafay console does not open, but all clusters still run jobs', undefined, 'handbook/runbook-catalog.md:161'),
      runbook: rb('R7', 'Self-hosted Rafay Controller is degraded', 167),
      command: rb('R7', 'the controller pods', 167),
      alert: 'Rafay controller down',
      drain: 'none',
      floor: 3,
    }),
  },
  lb: {
    label: 'Control-plane VIP',
    who: L2,
    modes: down({
      effect: confirmed('the API server or the Rafay Controller is not reachable, but the nodes run', undefined, 'handbook/runbook-catalog.md:150'),
      runbook: rb('P7', 'Control-plane VIP or load balancer fault', 150),
      command: rb('P7', 'the health check (/healthz/ready)', 150),
      alert: 'VIP not reachable',
      drain: 'none',
      floor: 2,
    }),
  },
  firewall: {
    label: 'Firewall',
    who: NETWORK,
    modes: down({
      effect: confirmed('the cluster shows "not reachable" in Rafay: the Management Operator cannot connect to the Rafay Controller', undefined, 'handbook/runbook-catalog.md:161'),
      runbook: rb('R1', 'Cluster shows "not reachable" in Rafay', 161),
      command: rb('R1', 'the cluster connection', 161),
      alert: 'cluster not reachable',
      drain: 'none',
      floor: 2,
    }),
  },
  dns: {
    label: 'DNS',
    who: NETWORK,
    modes: down({
      effect: confirmed('a DNS fault on the cluster nodes', undefined, 'handbook/runbook-catalog.md:125'),
      runbook: rb('N10', 'Time sync (NTP) or DNS fault on cluster nodes', 125),
      command: rb('N10', 'the DNS checks', 125),
      alert: 'DNS failure',
      drain: 'none',
      floor: 2,
    }),
  },
  ntp: {
    label: 'NTP',
    who: NETWORK,
    modes: down({
      effect: confirmed('clock skew: a cause of TLS, token, and etcd failures', undefined, 'handbook/runbook-catalog.md:125'),
      runbook: rb('N10', 'Time sync (NTP) or DNS fault on cluster nodes', 125),
      command: cr('chronyc tracking', 167),
      alert: 'clock skew',
      drain: 'none',
      floor: 3,
    }),
  },
}

export const DRAIN_LABEL: Record<Drain, string> = {
  none: 'no drain',
  node: 'drain the node',
  'nvlink-domain': 'drain the NVLink domain (the node, or the NVL72 rack)',
  racks: 'drain the racks',
}
export const DRAIN_COMMANDS: DocRef[] = [cr('kubectl cordon <node>; kubectl drain <node> --ignore-daemonsets', 181), cr('scontrol update NodeName=<node> State=DRAIN Reason="<ticket>"', 183)]

const sd = (line: number) => `handbook/shift-discipline.md:${line}`
export const SIM_FACTS = {
  p1: assumed('P1: a large loss of GPU capacity', undefined, 'The customer gives the P1 and P2 numbers; the app uses the two thresholds of the configuration.', sd(30)),
  p2: assumed('P2: significant degraded capacity or redundancy; many nodes or racks', undefined, 'The customer gives the P1 and P2 numbers; the app uses the two thresholds of the configuration.', sd(31)),
  p3: confirmed('P3: one node or component with a capacity workaround', undefined, sd(32)),
  incident: confirmed('one incident has one ticket: link the alerts to it', undefined, sd(48)),
  lostHours: confirmed('lost GPU hours = GPUs affected × hours outside service, for each incident', undefined, SITE_REQUIREMENTS),
  pool: confirmed('isolate or drain, and keep the largest usable pool', undefined, SITE_REQUIREMENTS),
  pxnOff: assumed('NVLink, or the GPU on the rail of the destination, is down on the source node, so PXN is off: the trace takes the NIC of the source GPU', undefined, 'The sources do not say how NCCL falls back; the app takes the path with no PXN.'),
  otherPlane: assumed('a failure on this plane: the trace takes the other plane, at half bandwidth', undefined, 'The half bandwidth is the B300 Spectrum-X RA (m3 sourcing notes, section 1).'),
  degradedHop: confirmed('a degraded link (high BER) on the path slows the transfer', undefined, 'handbook/runbook-catalog.md:117'),
}
