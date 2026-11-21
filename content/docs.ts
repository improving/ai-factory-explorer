// The operator documents that the Explorer reads inside the portal.
//
// The allowlist holds a path and a reader-facing title, and never text: the build reads the file from disk
// (content/plugin.ts), so an edit of a document reaches the portal with no step to remember.
// A new document must join this list to be readable, and that is the only way in.
//
// The list holds the operator documents only: a runbook, a reference page, or a lab.
// The training material that these documents were written for is not part of this repository.

export type DocGroup = 'runbooks' | 'reference' | 'practice'

export type DocEntry = {
  id: string // the address in a link: doc=rb-03
  path: string // the file, from the root of the repository
  title: string // the words that a reader sees: no course code, no programme vocabulary
  group: DocGroup
}

export const DOC_GROUPS: { id: DocGroup; label: string }[] = [
  { id: 'runbooks', label: 'Runbooks' },
  { id: 'reference', label: 'Reference' },
  { id: 'practice', label: 'Practice' },
]

export const DOCS: DocEntry[] = [
  // The written runbooks: the procedure of each row of the catalogue.
  { id: 'rb-01', path: 'runbooks/RB-01-nvlink-fabric-fm-imex.md', group: 'runbooks', title: 'NVLink, NVSwitch, Fabric Manager, IMEX, and NVLSM failures' },
  { id: 'rb-02', path: 'runbooks/RB-02-nccl-init-hang-slow-transport.md', group: 'runbooks', title: 'NCCL init hang, slow collective, wrong transport, and a mid-run hang' },
  { id: 'rb-03', path: 'runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md', group: 'runbooks', title: 'GPU ECC, Xid, thermal, power, and row remap' },
  { id: 'rb-04', path: 'runbooks/RB-04-ib-roce-link-switch-ufm.md', group: 'runbooks', title: 'InfiniBand or RoCE link down, slow, or flaky' },
  { id: 'rb-05', path: 'runbooks/RB-05-firmware-driver-bmc-bios-dkms-doca.md', group: 'runbooks', title: 'Firmware, driver, BMC, BIOS, DKMS, and DOCA-OFED regression' },
  { id: 'rb-06', path: 'runbooks/RB-06-bluefield-dpu-boot-mlx5-eswitch.md', group: 'runbooks', title: 'BlueField and DPU boot, mlx5 init, and the eSwitch datapath' },
  { id: 'rb-07', path: 'runbooks/RB-07-storage-checkpoint-slow-stuck.md', group: 'runbooks', title: 'Storage or checkpoint slow or stuck' },
  { id: 'rb-08', path: 'runbooks/RB-08-platform-scheduling-slurm-k8s-bcm-power.md', group: 'runbooks', title: 'Platform and scheduling: Slurm, Kubernetes, BCM, and power policy' },
  { id: 'rb-09', path: 'runbooks/RB-09-cuda-toolchain-dcgm-false-positive.md', group: 'runbooks', title: 'CUDA toolchain errors and DCGM false positives' },
  { id: 'rb-10', path: 'runbooks/RB-10-facility-cooling-power-emergency.md', group: 'runbooks', title: 'Facility emergency: cooling, power, and the drain before a shutdown' },
  { id: 'rb-11', path: 'runbooks/RB-11-job-pending-queue-gang-topology.md', group: 'runbooks', title: 'Job pending: queue quota, gang, topology, or node eligibility' },
  { id: 'rb-12', path: 'runbooks/RB-12-host-not-allocatable-lifecycle.md', group: 'runbooks', title: 'Host not allocatable: lifecycle state, health, SKU, or firmware baseline' },

  // The operator reference.
  { id: 'hb-runbook-catalogue', path: 'handbook/runbook-catalog.md', group: 'reference', title: 'Runbook catalogue' },
  { id: 'hb-l1-primer', path: 'handbook/l1-primer.md', group: 'reference', title: 'Before your first shift' },
  { id: 'hb-command-reference', path: 'handbook/command-reference.md', group: 'reference', title: 'Command reference' },
  { id: 'hb-concepts', path: 'handbook/concepts.md', group: 'reference', title: 'Concepts checklist' },
  { id: 'hb-hardware-matrix', path: 'handbook/hardware-matrix.md', group: 'reference', title: 'Hardware matrix' },
  { id: 'hb-triage-guide', path: 'handbook/b300-nvl72-forum-triage-guide.md', group: 'reference', title: 'B300, NVL72, and GB300 triage guide' },
  { id: 'hb-cluster-onboarding', path: 'handbook/cluster-onboarding.md', group: 'reference', title: 'New cluster onboarding checklist' },
  { id: 'hb-onsite-procedures', path: 'handbook/onsite-procedures.md', group: 'reference', title: 'Onsite procedures' },
  { id: 'hb-shift-discipline', path: 'handbook/shift-discipline.md', group: 'reference', title: 'Shift discipline' },
  { id: 'hb-security-operations', path: 'handbook/security-operations.md', group: 'reference', title: 'Security operations for infrastructure engineers' },
  { id: 'hb-cli-utilities', path: 'handbook/cli_utilities_layered_gist.md', group: 'reference', title: 'SRE command-line utilities' },

  // The labs: the practice that a reader can run against a simulated fleet.
  { id: 'lab-troubleshooting', path: 'handson/03-troubleshooting/README.md', group: 'practice', title: 'Troubleshooting drills: break it and fix it' },
  { id: 'lab-dcgm-nvlink', path: 'handson/11-dcgm-nvlink-fabric/README.md', group: 'practice', title: 'DCGM, the NVLink fabric, and NUMA topology' },
  { id: 'lab-infiniband', path: 'handson/12-infiniband-fabric/README.md', group: 'practice', title: 'InfiniBand fabric tooling' },
  { id: 'lab-ibsim', path: 'handson/13-ibsim-real-fabric/README.md', group: 'practice', title: 'A simulated InfiniBand fabric' },
  { id: 'lab-ibsim-fabric', path: 'handson/13-ibsim-real-fabric/lab16/README.md', group: 'practice', title: 'Build a larger data center fabric' },
  { id: 'lab-simai-simccl', path: 'handson/SimAI_SimCCL_55_B300_Reference_Architecture_Labs.md', group: 'practice', title: 'SimAI and SimCCL labs for the B300 architecture' },
]

const BY_PATH = new Map(DOCS.map((d) => [d.path, d] as const))
const BY_ID = new Map(DOCS.map((d) => [d.id, d] as const))

// The document of a repository path, or null when the path is not in the portal.
export const docOfPath = (path: string): DocEntry | null => BY_PATH.get(path) ?? null

export const docOfId = (id: string): DocEntry | null => BY_ID.get(id) ?? null
