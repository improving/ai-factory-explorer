import { assumed, confirmed, derived, notSourced, type Fact } from './fact'
import { Q3400_SPEC_URL, QM9700_SPEC_URL, QM9700_URL, SN4700_URL, SN5610_URL, XDR_FABRICS_URL } from './urls'

export type SwitchId = 'q3400' | 'qm9700' | 'sn5600' | 'sn4700' | 'sn2201'

// `ports` counts the ports at `portSpeed`, the speed at which the designs use the switch.
export type Switch = {
  id: SwitchId
  model: Fact<string>
  ports: Fact<number>
  portSpeed: Fact<number>
  cages: Fact<number>
  throughput: Fact<number | null>
  formFactor: Fact<string>
  rackUnits: Fact<number>
  typicalPower: Fact<number | null>
}

export const Q3400: Switch = {
  id: 'q3400',
  model: confirmed('NVIDIA Quantum-X800 Q3400', undefined, 'https://networking-docs.nvidia.com/xdrswitcheshw/introduction'),
  ports: confirmed(144, 'XDR ports', 'https://networking-docs.nvidia.com/xdrswitcheshw/introduction'),
  portSpeed: derived(800, 'Gb/s', '115.2 Tb/s ÷ 144 ports', 'https://networking-docs.nvidia.com/xdrswitcheshw/introduction'),
  cages: confirmed(72, 'OSFP cages', 'https://networking-docs.nvidia.com/xdrswitcheshw/introduction'),
  throughput: confirmed(115.2, 'Tb/s', 'https://networking-docs.nvidia.com/xdrswitcheshw/introduction'),
  formFactor: confirmed('4U, air-cooled', undefined, 'https://networking-docs.nvidia.com/xdrswitcheshw/introduction'),
  rackUnits: confirmed(4, 'U', Q3400_SPEC_URL),
  typicalPower: confirmed(2900, 'W (typical, passive cables)', Q3400_SPEC_URL),
}

export const QM9700: Switch = {
  id: 'qm9700',
  model: confirmed('NVIDIA Quantum-2 QM9700', undefined, QM9700_URL),
  ports: confirmed(64, 'NDR ports', QM9700_URL),
  portSpeed: confirmed(400, 'Gb/s', QM9700_URL),
  cages: confirmed(32, 'OSFP cages', QM9700_URL),
  throughput: confirmed(51.2, 'Tb/s', QM9700_URL),
  formFactor: confirmed('1U', undefined, QM9700_URL),
  rackUnits: confirmed(1, 'U', QM9700_SPEC_URL),
  typicalPower: confirmed(747, 'W (typical, passive cables)', QM9700_SPEC_URL),
}

export const SN5600: Switch = {
  id: 'sn5600',
  model: confirmed('NVIDIA Spectrum-4 SN5600 / SN5610', undefined, SN5610_URL, 'The RA pages name this switch SN5600 and SN5610.'),
  ports: derived(128, '400GbE ports', '64 OSFP ports of 800GbE, each split into 2 × 400GbE', SN5610_URL),
  portSpeed: confirmed(400, 'Gb/s (an 800GbE port split in two)', SN5610_URL),
  cages: confirmed(64, 'OSFP ports', SN5610_URL),
  throughput: confirmed(51.2, 'Tb/s', SN5610_URL),
  formFactor: confirmed('2U', undefined, SN5610_URL),
  rackUnits: confirmed(2, 'U', SN5610_URL),
  typicalPower: confirmed(900, 'W (SN5610, typical, passive cables)', SN5610_URL),
}

export const SN4700: Switch = {
  id: 'sn4700',
  model: confirmed('NVIDIA Spectrum-3 SN4700', undefined, SN4700_URL),
  ports: confirmed(32, 'ports (1 to 400GbE)', SN4700_URL),
  portSpeed: confirmed(400, 'Gb/s (the site uses 100G ConnectX-6 on the control nodes)', SN4700_URL),
  cages: confirmed(32, 'QSFP-DD cages', SN4700_URL),
  throughput: confirmed(12.8, 'Tb/s', SN4700_URL, 'The 2a sourcing note gave 25.6 Tb/s from a search result; the specification page and the VAST page give 12.8 Tb/s.'),
  formFactor: derived('1U', undefined, '44 mm high', SN4700_URL),
  rackUnits: derived(1, 'U', '44 mm high', SN4700_URL),
  typicalPower: confirmed(630, 'W (typical, passive cables)', SN4700_URL),
}

export const SN2201: Switch = {
  id: 'sn2201',
  model: confirmed('NVIDIA SN2201', undefined, XDR_FABRICS_URL),
  ports: confirmed(48, '1GbE ports (RJ45)', XDR_FABRICS_URL),
  portSpeed: confirmed(1, 'Gb/s', XDR_FABRICS_URL),
  cages: confirmed(4, 'QSFP28 100GbE uplinks', XDR_FABRICS_URL),
  throughput: notSourced('Not on the pages read.'),
  formFactor: assumed('1U', undefined, 'A search result only; the SN2201 manual page did not open.'),
  rackUnits: assumed(1, 'U', 'A search result only; the SN2201 manual page did not open.'),
  typicalPower: notSourced('Not on the pages read.'),
}

export const SWITCHES: Record<SwitchId, Switch> = { q3400: Q3400, qm9700: QM9700, sn5600: SN5600, sn4700: SN4700, sn2201: SN2201 }
