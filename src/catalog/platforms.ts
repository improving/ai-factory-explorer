import { assumed, confirmed, derived, notSourced, type Fact } from './fact'
import type { BuildId, PlatformId } from './kinds'
import {
  DGX_B_URL,
  DGX_H_URL,
  GB200_COMPONENTS_URL,
  GB200_FABRICS_URL,
  GB200_PAGE_URL,
  GB300_PAGE_URL,
  GB300_RA_URL,
  HGX_PAGE_URL,
  NVL72_UG_URL,
  XDR_FABRICS_URL,
  DGX_B300_UG_URL,
  GB200_HW_URL,
  NVL72_ENT_URL,
} from './urls'

export type FormId = 'hgx8' | 'nvl72-tray'

export type Platform = {
  key: string
  family: PlatformId
  build: BuildId
  form: FormId
  name: string
  gpusPerServer: Fact<number>
  gpuMemory: Fact<number>
  nvlinkPerGpu: Fact<number>
  nvlinkLinksPerGpu: Fact<number | null>
  nvlinkLinkSpeed: Fact<number | null>
  nvswitches: Fact<number> // in the server; for an NVL72 tray, in the rack
  computeNic: { model: Fact<string>; count: Fact<number>; speed: Fact<number> }
  computePorts: Fact<string[]> // the port of GPU i
  computeMlx5?: Fact<string[]> // the mlx5 device of GPU i, when a user guide gives it
  frontNic: { model: Fact<string | null>; count: Fact<number>; portsEach: Fact<number>; speed: Fact<number | null> }
  cpus: Fact<number>
  cpuModel: Fact<string | null>
  numaGpus: Fact<number[][]>
  systemPower: Fact<number | null>
  rackUnits: Fact<number | null>
  cooling: Fact<string | null>
  psus: Fact<string | null>
  fans: Fact<string | null>
  memory: Fact<string | null> // the host memory (DIMMs), or the LPDDR5X of a Grace tray
  dimms: Fact<number | null> // the DIMMs of the server; null for a Grace tray
  nvmeBoot: Fact<string | null>
  nvmeData: Fact<string | null>
  bmc: Fact<string>
  scaleUpFailureDomain: Fact<string>
}

const MOCK = 'The Mokka B300 profile is a hand-made mock (see its header), not a primary source.'
const PORTS = (n: number) => Array.from({ length: n }, (_, i) => `OSFP ${i + 1}`)
// DGX H100 and B200, Table 6: the port of GPU 0, GPU 1, ... GPU 7.
const DGX_TABLE6 = ['OSFP4 P2', 'OSFP3 P2', 'OSFP3 P1', 'OSFP4 P1', 'OSFP1 P2', 'OSFP2 P2', 'OSFP2 P1', 'OSFP1 P1']
const FOUR_PER_CPU = assumed(
  [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
  ],
  undefined,
  'Not on the pages read; the app puts 4 GPUs on each CPU.',
)
const HGX_DOMAIN = confirmed('1 server, 8 GPUs', undefined, 'handbook/hardware-matrix.md:23')
const RACK_DOMAIN = confirmed('Up to 1 rack, 72 GPUs', undefined, 'handbook/hardware-matrix.md:23')

export const DGX_B300: Platform = {
  key: 'b300:dgx',
  family: 'b300',
  build: 'dgx',
  form: 'hgx8',
  name: 'DGX B300',
  gpusPerServer: confirmed(8, 'GPUs', 'handbook/hardware-matrix.md:22'),
  gpuMemory: confirmed(288, 'GB HBM3e', 'handbook/hardware-matrix.md:17', 'Dell quotes 270 GB; the training uses 288 GB (note 2 of the hardware matrix).'),
  nvlinkPerGpu: confirmed(1.8, 'TB/s', 'handbook/hardware-matrix.md:20'),
  nvlinkLinksPerGpu: assumed(18, 'links', `NV18 in nvidia-smi topo -m of the Mokka B300 profile, which its authors set. ${MOCK}`, 'handson/profiles/b300.yaml:283'),
  nvlinkLinkSpeed: derived(
    53.125,
    'GB/s in each direction',
    'bandwidth_per_link_mbps: 53125 of the Mokka B300 mock profile, read as MB/s: the field name says Mb/s, but only GB/s agrees with 1.8 TB/s for each GPU (18 links × 53.125 GB/s × 2 directions ≈ 1.9 TB/s)',
    'handson/profiles/b300.yaml:284',
  ),
  nvswitches: confirmed(2, 'NVSwitch chips', 'https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory/latest/components.html'),
  computeNic: {
    model: confirmed('ConnectX-8 SuperNIC', undefined, 'handbook/hardware-matrix.md:21'),
    count: confirmed(8, 'NICs, one for each GPU', 'handbook/hardware-matrix.md:21'),
    speed: confirmed(800, 'Gb/s', 'handbook/hardware-matrix.md:21'),
  },
  computePorts: assumed(
    PORTS(8),
    undefined,
    'The user guide names the 8 compute OSFP ports OSFP1 to OSFP8 (P1 left, P2 right); the pages read do not map them to GPUs. The app puts GPU k on port k + 1.',
    DGX_B300_UG_URL,
  ),
  frontNic: {
    model: confirmed('BlueField-3', undefined, 'https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html'),
    count: confirmed(2, 'DPUs', 'https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html'),
    portsEach: confirmed(2, 'ports', 'https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html'),
    speed: confirmed(400, 'Gb/s for each port', 'https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html'),
  },
  cpus: confirmed(2, 'CPU sockets', DGX_B300_UG_URL),
  cpuModel: confirmed('Intel Xeon Platinum 6776P', undefined, DGX_B300_UG_URL),
  numaGpus: assumed(
    [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ],
    undefined,
    `GPUs 0 to 3 on NUMA node 0 and GPUs 4 to 7 on NUMA node 1 in the Mokka B300 profile. ${MOCK}`,
    'handson/profiles/b300.yaml:305-319',
  ),
  systemPower: confirmed(14.5, 'kW', 'https://docs.nvidia.com/dgx/dgxb300-user-guide/introduction-to-dgxb300.html'),
  rackUnits: confirmed(10, 'U', DGX_B300_UG_URL),
  cooling: notSourced('The XDR RA pages read do not give the cooling.'),
  psus: confirmed('12 × 3.3 kW, N+N redundancy', undefined, DGX_B300_UG_URL, 'The feature table of the same guide says 12 × 3.2 kW.'),
  fans: notSourced('No page gives the fan count of a DGX B300. The user guide says that the fans are accessible from the rear, and in another place from the front.'),
  memory: confirmed('2 TB, configurable on-site with 128 GB DIMMs', undefined, DGX_B300_UG_URL),
  dimms: derived(16, 'DIMMs', '2 TB ÷ 128 GB for each DIMM', DGX_B300_UG_URL),
  nvmeBoot: confirmed('2 × 1.92 TB M.2', undefined, DGX_B300_UG_URL),
  nvmeData: confirmed('8 × 3.84 TB E1.S', undefined, DGX_B300_UG_URL),
  bmc: confirmed('BMC (RJ45), and the BMCs of both BlueField-3 cards', undefined, XDR_FABRICS_URL),
  scaleUpFailureDomain: HGX_DOMAIN,
}

export const DELL_B300: Platform = {
  ...DGX_B300,
  key: 'b300:oem-hgx',
  build: 'oem-hgx',
  name: 'Dell PowerEdge XE9780 / XE9780L (HGX B300)',
  gpusPerServer: confirmed(8, 'GPUs', 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf'),
  computeNic: {
    model: confirmed('ConnectX-8 SuperNIC', undefined, 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf'),
    count: confirmed(8, 'NICs, one for each GPU', 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf'),
    speed: confirmed(800, 'Gb/s', 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf'),
  },
  computePorts: assumed(PORTS(8), undefined, 'The Dell pages read do not map the 8 OSFP ports to GPUs. The app puts GPU k on port k + 1.', 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf'),
  frontNic: {
    model: notSourced('The north-south NIC of the Dell B300 servers is not in the repository.'),
    count: assumed(0, 'NICs', 'Not in the repository; the app draws none.'),
    portsEach: assumed(0, 'ports', 'Not in the repository.'),
    speed: notSourced('Not in the repository.'),
  },
  cpus: confirmed(2, 'CPU sockets', 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf'),
  cpuModel: confirmed('AMD EPYC 9005 or Intel Xeon 6', undefined, 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf'),
  systemPower: notSourced('The Dell spec sheet gives the power supplies (12 × 3200 W, air), not the system power.'),
  rackUnits: confirmed(10, 'U (XE9780, air)', 'handbook/hardware-matrix.md:19'),
  cooling: confirmed('air (XE9780, XE9785) or liquid (XE9780L, XE9785L)', undefined, 'handbook/hardware-matrix.md:19'),
  psus: confirmed('12 × 3200 W Titanium, hot-swap redundant (XE9780, air)', undefined, 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf', 'The liquid-cooled XE9780L uses 6 × 5500 W in a shared power shelf.'),
  fans: confirmed('15 GPU fans (hot-swap) and 5 CPU fans (cold-swap)', undefined, 'https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-xe-ai-spec-sheet.pdf'),
  memory: notSourced('Not in the repository.'),
  dimms: notSourced('Not in the repository.'),
  nvmeBoot: notSourced('Not in the repository.'),
  nvmeData: notSourced('Not in the repository.'),
  bmc: confirmed('iDRAC10', undefined, 'https://www.dell.com/support/manuals/en-us/idrac10-lifecycle-controller-v2-xx-series/idrac10_1.20.xx_ug/key-features?guid=guid-bf8fa189-3411-448d-867f-a68c09bf37d8&lang=en-us'),
}

export const DGX_B200: Platform = {
  key: 'b200:dgx',
  family: 'b200',
  build: 'dgx',
  form: 'hgx8',
  name: 'DGX B200',
  gpusPerServer: confirmed(8, 'GPUs', DGX_B_URL),
  gpuMemory: derived(180, 'GB HBM3e', '1,440 GB for 8 GPUs ÷ 8', DGX_B_URL),
  nvlinkPerGpu: confirmed(1.8, 'TB/s', HGX_PAGE_URL),
  nvlinkLinksPerGpu: notSourced('Not on the pages read.'),
  nvlinkLinkSpeed: notSourced('Not on the pages read.'),
  nvswitches: confirmed(2, 'NVLink switch chips', DGX_B_URL),
  computeNic: {
    model: confirmed('ConnectX-7 (single port)', undefined, DGX_B_URL),
    count: confirmed(8, 'NICs', DGX_B_URL),
    speed: confirmed(400, 'Gb/s', DGX_B_URL),
  },
  computePorts: confirmed(DGX_TABLE6, undefined, DGX_B_URL, 'Table 6: each OSFP port carries two ConnectX-7 ports.'),
  computeMlx5: confirmed(['mlx5_4', 'mlx5_7', 'mlx5_8', 'mlx5_9', 'mlx5_10', 'mlx5_13', 'mlx5_14', 'mlx5_15'], undefined, DGX_B_URL, 'The port table of the user guide: the mlx5 device of GPU 0 to 7.'),
  frontNic: {
    model: confirmed('BlueField-3 DPU', undefined, DGX_B_URL),
    count: confirmed(2, 'DPUs', DGX_B_URL),
    portsEach: confirmed(2, 'ports', DGX_B_URL),
    speed: confirmed(400, 'Gb/s for each port', DGX_B_URL),
  },
  cpus: confirmed(2, 'CPU sockets', DGX_B_URL),
  cpuModel: confirmed('Intel Xeon 8570', undefined, DGX_B_URL),
  numaGpus: FOUR_PER_CPU,
  systemPower: confirmed(14.3, 'kW (maximum)', DGX_B_URL),
  rackUnits: confirmed(10, 'U', DGX_B_URL),
  cooling: confirmed('air, 1,550 CFM', undefined, DGX_B_URL),
  psus: confirmed('6 × 3.3 kW, 5+1 redundancy', undefined, DGX_B_URL),
  fans: notSourced('No page gives the fan count of a DGX B200.'),
  memory: confirmed('2 TB', undefined, DGX_B_URL),
  dimms: confirmed(32, 'DIMMs', DGX_B_URL),
  nvmeBoot: confirmed('2 × 1.92 TB M.2, RAID 1', undefined, DGX_B_URL),
  nvmeData: confirmed('8 × 3.84 TB U.2 SED, RAID 0', undefined, DGX_B_URL),
  bmc: confirmed('BMC (1 GbE RJ45)', undefined, DGX_B_URL),
  scaleUpFailureDomain: HGX_DOMAIN,
}

export const DGX_H100: Platform = {
  key: 'h100:dgx',
  family: 'h100',
  build: 'dgx',
  form: 'hgx8',
  name: 'DGX H100',
  gpusPerServer: confirmed(8, 'GPUs', DGX_H_URL),
  gpuMemory: confirmed(80, 'GB HBM3', 'handbook/hardware-matrix.md:17'),
  nvlinkPerGpu: confirmed(0.9, 'TB/s', 'handbook/hardware-matrix.md:20'),
  nvlinkLinksPerGpu: notSourced('Not on the pages read.'),
  nvlinkLinkSpeed: notSourced('Not on the pages read.'),
  nvswitches: assumed(4, 'NVSwitch chips', 'A search result says four third-generation NVSwitch chips; no opened page gives the count.'),
  computeNic: {
    model: confirmed('ConnectX-7 (single port)', undefined, DGX_H_URL),
    count: confirmed(8, 'NICs', DGX_H_URL),
    speed: confirmed(400, 'Gb/s', DGX_H_URL),
  },
  computePorts: confirmed(DGX_TABLE6, undefined, DGX_H_URL, 'Table 6: each OSFP port carries two ConnectX-7 ports.'),
  computeMlx5: confirmed(['mlx5_0', 'mlx5_3', 'mlx5_4', 'mlx5_5', 'mlx5_6', 'mlx5_9', 'mlx5_10', 'mlx5_11'], undefined, DGX_H_URL, 'The port table of the user guide: the mlx5 device of GPU 0 to 7.'),
  frontNic: {
    model: confirmed('ConnectX-7 (dual port Ethernet)', undefined, DGX_H_URL),
    count: confirmed(2, 'NICs', DGX_H_URL),
    portsEach: confirmed(2, 'ports', DGX_H_URL),
    speed: notSourced('Not on the pages read.'),
  },
  cpus: confirmed(2, 'CPU sockets', DGX_H_URL),
  cpuModel: confirmed('Intel Xeon 8480C', undefined, DGX_H_URL),
  numaGpus: FOUR_PER_CPU,
  systemPower: confirmed(10.2, 'kW (maximum)', DGX_H_URL),
  rackUnits: confirmed(8, 'U', DGX_H_URL),
  cooling: confirmed('air, 1,105 CFM', undefined, DGX_H_URL),
  psus: confirmed('6 × 3.3 kW, 4+2 redundancy', undefined, DGX_H_URL),
  fans: notSourced('No page gives the fan count of a DGX H100.'),
  memory: confirmed('2 TB', undefined, DGX_H_URL),
  dimms: confirmed(32, 'DIMMs', DGX_H_URL),
  nvmeBoot: confirmed('2 × 1.92 TB M.2, RAID 1', undefined, DGX_H_URL),
  nvmeData: confirmed('8 × 3.84 TB U.2 SED, RAID 0', undefined, DGX_H_URL),
  bmc: confirmed('BMC (1 GbE RJ45)', undefined, DGX_H_URL),
  scaleUpFailureDomain: HGX_DOMAIN,
}

export const DGX_H200: Platform = {
  ...DGX_H100,
  key: 'h200:dgx',
  family: 'h200',
  name: 'DGX H200',
  gpuMemory: confirmed(141, 'GB HBM3e', 'handbook/hardware-matrix.md:17'),
  computeMlx5: assumed(
    ['mlx5_0', 'mlx5_3', 'mlx5_4', 'mlx5_5', 'mlx5_6', 'mlx5_9', 'mlx5_10', 'mlx5_11'],
    undefined,
    'The H200 user guide was not read; the app uses the mlx5 names of the H100.',
    DGX_H_URL,
  ),
}

export const GB200_TRAY: Platform = {
  key: 'gb200-nvl72:dgx',
  family: 'gb200-nvl72',
  build: 'dgx',
  form: 'nvl72-tray',
  name: 'DGX GB200 compute tray (NVL72)',
  gpusPerServer: confirmed(4, 'GPUs for each compute tray', NVL72_UG_URL),
  gpuMemory: derived(186, 'GB HBM3e', '372 GB for each superchip ÷ 2 GPUs (no page gives the value for one GPU)', GB200_PAGE_URL),
  nvlinkPerGpu: confirmed(1.8, 'TB/s', NVL72_UG_URL),
  nvlinkLinksPerGpu: confirmed(18, 'links, one to each NVSwitch chip of the rack', GB200_FABRICS_URL),
  nvlinkLinkSpeed: derived(50, 'GB/s in each direction', '1.8 TB/s for each GPU counts both directions: 1.8 TB/s ÷ 18 links ÷ 2', NVL72_UG_URL),
  nvswitches: derived(18, 'NVSwitch chips in the rack', '9 switch trays × 2 chips', NVL72_UG_URL),
  computeNic: {
    model: confirmed('ConnectX-7 (single port, OSFP)', undefined, NVL72_UG_URL),
    count: confirmed(4, 'NICs', NVL72_UG_URL),
    speed: confirmed(400, 'Gb/s', NVL72_UG_URL),
  },
  computePorts: assumed(PORTS(4), undefined, 'The user guide does not map the 4 OSFP ports to GPUs. The app puts GPU k on port k + 1.'),
  frontNic: {
    model: confirmed('BlueField-3 DPU', undefined, NVL72_UG_URL, 'The GB200 RA says 2 × 200 Gb/s for each DPU.'),
    count: confirmed(2, 'DPUs', NVL72_UG_URL),
    portsEach: confirmed(2, 'ports', NVL72_UG_URL),
    speed: confirmed(400, 'Gb/s for each port', NVL72_UG_URL),
  },
  cpus: confirmed(2, 'Grace CPUs', NVL72_UG_URL),
  cpuModel: confirmed('NVIDIA Grace', undefined, NVL72_UG_URL),
  numaGpus: confirmed(
    [
      [0, 1],
      [2, 3],
    ],
    undefined,
    GB200_COMPONENTS_URL,
    'Each superchip has 1 Grace CPU and 2 GPUs, joined by NVLink-C2C at 900 GB/s.',
  ),
  systemPower: notSourced('The pages give the rack power (about 120 kW), not the tray power.'),
  rackUnits: confirmed(1, 'U', NVL72_UG_URL),
  cooling: confirmed('liquid cold plates for the CPUs and GPUs; air for the network cards', undefined, NVL72_UG_URL),
  psus: confirmed('none in the tray: the power shelves of the rack, N+N redundancy', undefined, GB200_HW_URL, 'The GB200 SuperPOD page says that the power shelves are configured as N redundancy.'),
  fans: notSourced('No page gives the fans of a compute tray; the CPUs and GPUs have liquid cold plates.'),
  memory: confirmed('LPDDR5X, up to 480 GB for each Grace CPU', undefined, GB200_PAGE_URL),
  dimms: notSourced('The pages give LPDDR5X for a Grace CPU, not DIMMs.'),
  nvmeBoot: confirmed('1 × 1.92 TB M.2', undefined, GB200_HW_URL),
  nvmeData: confirmed('4 × 3.84 TB E1.S, software RAID 0', undefined, GB200_HW_URL),
  bmc: confirmed('tray BMC (1 GbE), and the BlueField-3 BMCs', undefined, NVL72_UG_URL),
  scaleUpFailureDomain: RACK_DOMAIN,
}

export const GB300_TRAY: Platform = {
  ...GB200_TRAY,
  key: 'gb300-nvl72:dgx',
  family: 'gb300-nvl72',
  name: 'DGX GB300 compute tray (NVL72)',
  memory: assumed(
    'LPDDR5X, about 1 TB for each tray',
    undefined,
    'The NVL72 RA components page says "1TB aggregated"; the GB300 page gives 17 TB for 18 trays (about 0.94 TB). The app uses the RA.',
    NVL72_ENT_URL,
  ),
  gpuMemory: derived(277.8, 'GB HBM3e', '20 TB for the rack ÷ 72 GPUs (no page gives the value for one GPU; the B300 GPU of an HGX board has 288 GB)', GB300_PAGE_URL),
  nvlinkLinksPerGpu: confirmed(18, 'links, one to each NVSwitch chip of the rack', GB300_RA_URL),
  computeNic: {
    model: confirmed('ConnectX-8 (single port, OSFP)', undefined, NVL72_UG_URL),
    count: confirmed(4, 'NICs', NVL72_UG_URL),
    speed: confirmed(800, 'Gb/s', NVL72_UG_URL),
  },
  frontNic: {
    model: confirmed(
      'BlueField-3 B3240',
      undefined,
      GB300_RA_URL,
      'The user guide says 2 BlueField-3 DPUs for each tray; the GB300 RA says one B3240. The app uses the RA.',
    ),
    count: confirmed(1, 'DPU', GB300_RA_URL),
    portsEach: confirmed(2, 'ports', GB300_RA_URL),
    speed: confirmed(400, 'Gb/s for each port', GB300_RA_URL),
  },
}

export const PLATFORMS: Platform[] = [DGX_B300, DELL_B300, DGX_B200, DGX_H100, DGX_H200, GB200_TRAY, GB300_TRAY]

export function platformFor(c: { platform: PlatformId; build: BuildId }): Platform {
  const p = PLATFORMS.find((x) => x.family === c.platform && x.build === c.build)
  if (!p) throw new Error(`No platform ${c.platform} with build ${c.build}`)
  return p
}
