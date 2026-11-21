import { HOST_FIRMWARE, type FirmwareId } from '../catalog/firmware'
import type { Config } from '../config/config'
import { assignments } from '../topology/assign'
import { idHash } from './hash'

// The firmware of the hosts against the site baseline. The model gives one host of every sixteen a component that
// is behind the baseline, and the component comes from the id of the host, so the matrix is the same on every load.
export const BEHIND_EVERY = 16

export type FirmwareRow = { id: FirmwareId; actual: string; ok: boolean }
export type HostFirmware = { host: string; behind: FirmwareId | null; rows: FirmwareRow[] }

// The version that a host runs. A component that is behind the baseline is one release back; the two confirmed
// components have a number, so the reader sees the gap.
function actualOf(id: FirmwareId, behind: boolean): string {
  if (id === 'driver') return behind ? '569' : '570'
  if (id === 'cuda') return behind ? '12.6' : '12.8'
  return behind ? 'one release behind' : 'the baseline'
}

export function firmwareOf(host: string): HostFirmware {
  const h = idHash(host)
  const behind = h % BEHIND_EVERY === 0 ? HOST_FIRMWARE[(h >>> 8) % HOST_FIRMWARE.length]!.id : null
  const rows = HOST_FIRMWARE.map((c) => ({ id: c.id, actual: actualOf(c.id, c.id === behind), ok: c.id !== behind }))
  return { host, behind, rows }
}

export type FleetFirmware = {
  hosts: number
  behind: { host: string; component: FirmwareId }[]
  byComponent: { id: FirmwareId; hosts: string[] }[]
}

// The fleet against the baseline, for the roll-up of the panel.
export function fleetFirmware(config: Config): FleetFirmware {
  const ids = [...assignments(config).keys()]
  const byComponent = HOST_FIRMWARE.map((c) => ({ id: c.id, hosts: [] as string[] }))
  const behind: { host: string; component: FirmwareId }[] = []
  for (const host of ids) {
    const f = firmwareOf(host)
    if (f.behind === null) continue
    behind.push({ host, component: f.behind })
    byComponent.find((c) => c.id === f.behind)!.hosts.push(host)
  }
  return { hosts: ids.length, behind, byComponent }
}
