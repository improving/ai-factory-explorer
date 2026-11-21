import { assumed, confirmed, type Fact } from './fact'
import { NVSMI_URL } from './urls'

// The legend of nvidia-smi topo -m, from the nvidia-smi documentation.
const code = (c: string, meaning: string) => ({ code: c, fact: confirmed(meaning, undefined, NVSMI_URL) })

export const TOPO_CODES: { code: string; fact: Fact<string> }[] = [
  code('X', 'the same device'),
  code('NV#', 'a bonded set of # NVLinks'),
  code('PIX', 'PCIe through a single PCIe switch'),
  code('PXB', 'PCIe through multiple PCIe switches'),
  code('PHB', 'PCIe through a PCIe Host Bridge (typically the CPU)'),
  code('NODE', 'PCIe and the interconnect between PCIe Host Bridges in one NUMA node'),
  code('SYS', 'PCIe and the SMP interconnect between NUMA nodes'),
]

export const PIX_NOTE = assumed(
  'PIX for GPU i and NIC i',
  undefined,
  'No published GPU-NIC matrix for a DGX H100, B200, or B300. The onboarding check wants each GPU and its NIC under the same PCIe switch (PIX or PXB) on the same NUMA node; the app shows PIX.',
  'handbook/cluster-onboarding.md:161',
)
