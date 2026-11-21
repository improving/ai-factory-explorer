import type { Config } from '../config/config'
import type { PathId } from './factory'
import type { TraceKind, TraceOptions } from './trace'

export type Scenario = {
  id: string
  label: string
  group: 'gpu' | 'factory'
  patch: Partial<Config>
  src: string
  dst: string | null
  options: TraceOptions
  kind: TraceKind
  path: PathId | null
}

const PXN_ON: TraceOptions = { pxn: true, plane: 0 }
const PXN_OFF: TraceOptions = { pxn: false, plane: 0 }
const GB300: Partial<Config> = { platform: 'gb300-nvl72', suCount: 2 }

// The rows of the tracer table of spec section 6: the GPU-to-GPU rows, then the factory rows. Each one sets its own
// configuration (from the defaults), so that its parts exist. A factory row traces from the server of su1-n05/gpu2.
export const SCENARIOS: Scenario[] = [
  { id: 'same-node', group: 'gpu', path: null, label: 'GPU to GPU, same node (NVLink only)', patch: {}, src: 'su1-n05/gpu2', dst: 'su1-n05/gpu5', options: PXN_ON, kind: 'same-node' },
  { id: 'same-rail', group: 'gpu', path: null, label: 'Same rail, same SU (one leaf)', patch: {}, src: 'su1-n05/gpu3', dst: 'su1-n40/gpu3', options: PXN_ON, kind: 'one-leaf' },
  { id: 'cross-rail', group: 'gpu', path: null, label: 'Different rail, PXN off (through a spine)', patch: {}, src: 'su1-n05/gpu2', dst: 'su1-n40/gpu5', options: PXN_OFF, kind: 'cross-rail' },
  { id: 'pxn', group: 'gpu', path: null, label: 'Different rail, PXN on (NVLink, then one leaf)', patch: {}, src: 'su1-n05/gpu2', dst: 'su1-n40/gpu5', options: PXN_ON, kind: 'pxn' },
  { id: 'cross-su', group: 'gpu', path: null, label: 'Different SU (through a spine, equal-cost spines)', patch: { suCount: 2 }, src: 'su1-n05/gpu3', dst: 'su2-n10/gpu3', options: PXN_ON, kind: 'cross-su' },
  {
    id: 'dual-plane',
    group: 'gpu',
    path: null,
    label: 'Dual plane (Spectrum-X: plane A of 2 × 400G)',
    patch: { fabric: 'spectrum-x', planes: 'dual', suCount: 4 },
    src: 'su1-n05/gpu3',
    dst: 'su1-n40/gpu3',
    options: PXN_ON,
    kind: 'one-leaf',
  },
  { id: 'nvl72-rack', group: 'gpu', path: null, label: 'NVL72, same rack (NVLink switch trays)', patch: GB300, src: 'su1-n05/gpu1', dst: 'su1-n12/gpu2', options: PXN_ON, kind: 'nvl72-rack' },
  { id: 'nvl72-fabric', group: 'gpu', path: null, label: 'NVL72, another rack (InfiniBand)', patch: GB300, src: 'su1-n05/gpu1', dst: 'su2-n10/gpu1', options: PXN_ON, kind: 'nvl72-fabric' },
  ...(
    [
      ['gpu-vast-gds', 'GPU to VAST, GDS on (direct DMA)', 'storage', { gds: 'on' }],
      ['gpu-vast-bounce', 'GPU to VAST, GDS off (bounce buffer in CPU memory)', 'storage', { gds: 'off' }],
      ['user-ui', 'User to service: the Rafay UI and API (TLS offload)', 'user-ui', {}],
      ['cluster-mtls', 'Cluster to the Rafay controller (mTLS, TLS passthrough)', 'cluster-mtls', {}],
      ['operator-bmc', 'Operator access: PAM, out-of-band network, BMC', 'operator-bmc', {}],
      ['operator-ztka', 'Operator access: kubectl through Rafay ZTKA', 'operator-ztka', {}],
      ['break-glass', 'Operator access: break-glass', 'break-glass', {}],
      ['telemetry-itsm', 'Telemetry: GPU metrics to a ticket', 'telemetry-itsm', {}],
      ['telemetry-siem', 'Telemetry: a BMC event (Redfish) to the SIEM', 'telemetry-siem', {}],
      ['control-sm', 'Control: UFM programs the switches (SM MADs)', 'control-sm', {}],
      ['control-nvlink', 'Control: Fabric Manager and NVLSM program the NVSwitch chips', 'control-nvlink', {}],
    ] as const
  ).map(([id, label, path, patch]): Scenario => ({ id, label, group: 'factory', patch, src: 'su1-n05/gpu2', dst: null, options: PXN_ON, kind: 'factory', path })),
]
