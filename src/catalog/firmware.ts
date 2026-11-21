import { assumed, confirmed, type Fact } from './fact'

// The components of the firmware baseline of M10. The baseline is a site value: the module gives the gate and the
// inventory, not the versions, so the two that a source names are confirmed and the rest are assumed.
const GATE_SRC = 'runbooks/RB-12-host-not-allocatable-lifecycle.md:72'
const MATRIX_SRC = 'runbooks/RB-12-host-not-allocatable-lifecycle.md:104'

export type FirmwareId = 'uefi' | 'driver' | 'cuda' | 'fm' | 'ufm' | 'nic' | 'nvswitch'

export type FirmwareComponent = {
  id: FirmwareId
  label: string
  expected: Fact<string>
  where: string
  scope: 'host' | 'fabric' // the host carries its own version; the fabric has one for the site
}

export const FIRMWARE: FirmwareComponent[] = [
  {
    id: 'uefi',
    label: 'UEFI and BMC',
    expected: assumed('the site baseline', undefined, 'No source gives a UEFI or a BMC version. The firmware baseline inventories both, and the site sets the version.', GATE_SRC),
    where: 'The server board and the BMC, in the Redfish inventory of the host.',
    scope: 'host',
  },
  {
    id: 'driver',
    label: 'GPU driver',
    expected: confirmed('570', undefined, 'handson/README.md:69'),
    where: 'The kernel driver of the host, and the CUDA user-mode driver that it carries.',
    scope: 'host',
  },
  {
    id: 'cuda',
    label: 'CUDA',
    expected: confirmed('12.8', undefined, 'https://docs.nvidia.com/datacenter/tesla/drivers/latest/cuda-toolkit-driver-and-architecture-matrix.html', 'or later: Blackwell is supported from CUDA 12.0, and the sources name 12.8 or later.'),
    where: 'The toolkit of the container images, and of the Fabric Manager.',
    scope: 'host',
  },
  {
    id: 'fm',
    label: 'Fabric Manager',
    expected: assumed('the site baseline', undefined, 'No source gives a Fabric Manager version. It moves with the driver, so a site pins the two together (the compatibility matrix of the fleet lifecycle).', MATRIX_SRC),
    where: 'The service that configures the NVSwitch fabric of the host.',
    scope: 'host',
  },
  {
    id: 'nic',
    label: 'NIC firmware',
    expected: assumed('the site baseline', undefined, 'No source gives a ConnectX firmware version. The site pins the NIC firmware and the OFED stack together.', MATRIX_SRC),
    where: 'The ConnectX firmware of the NICs, and the OFED stack that matches it.',
    scope: 'host',
  },
  {
    id: 'nvswitch',
    label: 'NVSwitch firmware',
    expected: assumed('the site baseline', undefined, 'No source gives an NVSwitch firmware version. The site pins it with the Fabric Manager.', GATE_SRC),
    where: 'The NVSwitch chips inside the server, or inside the NVL72 tray.',
    scope: 'host',
  },
  {
    id: 'ufm',
    label: 'UFM',
    expected: assumed('the site baseline', undefined, 'No source gives a UFM version. It is the fabric, not the host: one version for the site, on the management hosts.', MATRIX_SRC),
    where: 'The subnet manager of the InfiniBand fabric, on the management hosts.',
    scope: 'fabric',
  },
]

export const HOST_FIRMWARE = FIRMWARE.filter((c) => c.scope === 'host')
export const FIRMWARE_BY_ID = new Map(FIRMWARE.map((c) => [c.id, c] as const))

export const BASELINE_GATE = assumed(
  'that a host below the baseline is quarantined, and that a host is behind on one component',
  undefined,
  'The fleet lifecycle gives the gate: the firmware baseline inventories UEFI and BMC firmware and updates a host that is below it; a host that cannot reach the baseline is quarantined. The app gives one host of every sixteen a component behind the baseline, so that the gate is visible; the drift of a site comes from its own compare.',
  GATE_SRC,
)
