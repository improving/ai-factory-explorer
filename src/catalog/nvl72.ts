import { assumed, confirmed, notSourced } from './fact'
import { GB200_ARCH_URL, GB200_PAGE_URL, GB300_PAGE_URL, MC_NVLINK_URL, NVL72_UG_URL } from './urls'

// The rack of a GB200 or GB300 NVL72: one NVLink domain of 72 GPUs.
export const NVL72 = {
  computeTrays: confirmed(18, 'compute trays (1RU)', NVL72_UG_URL),
  switchTrays: confirmed(9, 'NVLink switch trays (1RU)', NVL72_UG_URL),
  chipsPerSwitchTray: confirmed(2, 'NVSwitch chips', NVL72_UG_URL),
  portsPerChip: confirmed(72, 'NVLink ports', NVL72_UG_URL),
  rackNvlink: confirmed(130, 'TB/s', GB200_PAGE_URL),
  powerShelves: confirmed(8, 'power shelves', NVL72_UG_URL),
  psusPerShelf: confirmed(6, 'power supplies of 5.5 kW', GB200_ARCH_URL),
  shelfPower: confirmed(33, 'kW for each shelf', GB200_ARCH_URL),
  rackPower: confirmed(120, 'kW (approximately)', NVL72_UG_URL),
  suPower: confirmed(1.2, 'MW for 8 racks (one SU)', GB200_ARCH_URL),
  hbm: {
    'gb200-nvl72': confirmed(13.4, 'TB HBM3e', GB200_PAGE_URL),
    'gb300-nvl72': confirmed(20, 'TB HBM3e', GB300_PAGE_URL),
  },
  cooling: confirmed('liquid cold plates for CPUs and GPUs; air for the network cards; manifolds with leak detection', undefined, NVL72_UG_URL),
  cdu: notSourced('No page read names the CDU.'),
  switchTraySoftware: confirmed('NVOS with the NVLink Subnet Manager, Fabric Manager, NMX-C, and NMX-T', undefined, NVL72_UG_URL),
  nmxLeader: confirmed('NMX-C runs on one leader switch tray', undefined, MC_NVLINK_URL),
  computeTraySoftware: confirmed('IMEX', undefined, NVL72_UG_URL),
  layout: assumed(
    '10 compute trays, the 9 switch trays, then 8 compute trays',
    undefined,
    'The pages read do not give the order of the trays in the rack; the app draws this order for the picture.',
  ),
}
