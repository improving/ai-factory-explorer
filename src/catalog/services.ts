import { confirmed, type Fact } from './fact'
import type { Platform } from './platforms'
import { FM_GUIDE_URL, GPU_OPERATOR_URL, IMEX_URL } from './urls'

// The software on a GPU node that the node view shows as a band of boxes. Each one links to the parts
// that it manages: the GPUs, the NVSwitch chips, or the driver (the GPU Operator components need it).
export type ServiceId = 'driver' | 'fabric-manager' | 'nvlsm' | 'imex' | 'container-toolkit' | 'device-plugin' | 'dcgm-exporter' | 'mig-manager'
export type NodeService = { id: ServiceId; label: string; fact: Fact<string>; manages: 'gpus' | 'nvswitches' | 'driver' }

const operator = (what: string) => confirmed(`${what}: the GPU Operator deploys it`, undefined, GPU_OPERATOR_URL)

export const NODE_SERVICES: Record<ServiceId, NodeService> = {
  driver: { id: 'driver', label: 'NVIDIA driver', fact: operator('the NVIDIA GPU driver'), manages: 'gpus' },
  'fabric-manager': {
    id: 'fabric-manager',
    label: 'Fabric Manager',
    fact: confirmed('a privileged daemon that configures NVSwitch memory fabrics', undefined, FM_GUIDE_URL),
    manages: 'nvswitches',
  },
  nvlsm: {
    id: 'nvlsm',
    label: 'NVLSM',
    fact: confirmed('the NVLink Subnet Manager: DGX and HGX B200 and B300 require it in addition to Fabric Manager', undefined, FM_GUIDE_URL),
    manages: 'nvswitches',
  },
  imex: { id: 'imex', label: 'IMEX', fact: confirmed('runs exclusively on compute nodes', undefined, IMEX_URL), manages: 'gpus' },
  'container-toolkit': { id: 'container-toolkit', label: 'Container Toolkit', fact: operator('the NVIDIA Container Toolkit'), manages: 'driver' },
  'device-plugin': { id: 'device-plugin', label: 'Device Plugin', fact: operator('the NVIDIA Device Plugin'), manages: 'driver' },
  'dcgm-exporter': { id: 'dcgm-exporter', label: 'DCGM Exporter', fact: operator('DCGM Exporter'), manages: 'driver' },
  'mig-manager': { id: 'mig-manager', label: 'MIG Manager', fact: operator('MIG Manager'), manages: 'driver' },
}

const OPERATOR_PARTS: ServiceId[] = ['container-toolkit', 'device-plugin', 'dcgm-exporter', 'mig-manager']

export function servicesFor(p: Platform): ServiceId[] {
  if (p.form === 'nvl72-tray') return ['driver', 'imex', ...OPERATOR_PARTS] // Fabric Manager runs on the switch trays
  const nvlsm = p.family === 'b200' || p.family === 'b300'
  return ['driver', 'fabric-manager', ...(nvlsm ? (['nvlsm'] as const) : []), ...OPERATOR_PARTS]
}

export function serviceOf(partId: string): NodeService | null {
  const m = /\/svc-([a-z-]+)$/.exec(partId)
  return m && Object.hasOwn(NODE_SERVICES, m[1]!) ? NODE_SERVICES[m[1] as ServiceId] : null
}
