import { FAIL_RULES, type FailKind, type FailMode } from '../catalog/failures'
import { NVL72 } from '../catalog/nvl72'
import { platformFor } from '../catalog/platforms'
import { servicesFor } from '../catalog/services'
import type { Config } from '../config/config'
import { generateFabric } from '../topology/fabric'
import { parseServerId, serverExists, serverId, serverOf } from '../topology/ids'
import { generateOverview } from '../topology/overview'
import { layoutOf } from '../topology/racks'

// A failure of the simulator: the element that fails, and how.
export type Failure = { id: string; mode: FailMode }

const BLOCKS: Partial<Record<string, FailKind>> = {
  'blk-storage-net': 'storage-net',
  'blk-ufm': 'ufm',
  'blk-vast': 'vast',
  'blk-rafay': 'rafay',
  'blk-lb': 'lb',
  'blk-firewall': 'firewall',
  'blk-dns': 'dns',
  'blk-ntp': 'ntp',
}
const SERVICES: Partial<Record<string, FailKind>> = {
  'svc-fabric-manager': 'fabric-manager',
  'svc-nvlsm': 'nvlsm',
  'svc-driver': 'driver',
  'svc-device-plugin': 'device-plugin',
}

// The failure kind of an element of the configuration, or null when it cannot fail (or does not exist).
export function failKind(config: Config, id: string): FailKind | null {
  const block = BLOCKS[id]
  if (block) return generateOverview(config).nodes.some((n) => n.id === id) ? block : null
  if (/^su\d+-k\d+-sw\d+\/chip\d+$/.test(id) || /^su\d+-k\d+-sw\d+$/.test(id)) {
    if (platformFor(config).form !== 'nvl72-tray') return null
    const [tray, chip] = id.split('/') as [string, string | undefined]
    if (!layoutOf(config).spot.has(tray)) return null // a switch tray of a rack of the configuration (canonical id)
    if (chip === undefined) return 'switch-tray'
    const c = chip.slice('chip'.length)
    return String(Number(c)) === c && Number(c) < NVL72.chipsPerSwitchTray.value ? 'nvswitch' : null
  }
  if (/^su\d+-cdu$/.test(id)) return layoutOf(config).racks.some((r) => r.id === id) ? 'cdu' : null
  if (/-(pdu|ps)\d+$/.test(id)) return layoutOf(config).spot.has(id) ? 'pdu' : null
  const fabric = generateFabric(config)
  if (id.includes('~')) return fabric.edges.some((e) => e.id === id && e.tier === 'node-leaf') ? 'cable' : null
  const node = fabric.nodes.find((n) => n.id === id)
  if (node?.kind === 'leaf') return 'leaf'
  if (node?.kind === 'spine') return 'spine'
  const server = serverOf(id)
  if (!server || server === id || !serverExists(config, server)) return null
  const ps = parseServerId(server)
  if (!ps || serverId(ps.su, ps.n) !== server) return null // the canonical id only (su1-n05, not su01-n05)
  const p = platformFor(config)
  const part = id.slice(server.length + 1)
  const index = (prefix: string) => {
    const x = part.slice(prefix.length)
    return part.startsWith(prefix) && /^\d+$/.test(x) && String(Number(x)) === x ? Number(x) : -1 // gpu1, not gpu01
  }
  const hgx = p.form === 'hgx8'
  if (index('gpu') >= 0) return index('gpu') < p.gpusPerServer.value ? 'gpu' : null
  if (index('nic') >= 0) return index('nic') < p.gpusPerServer.value ? 'nic' : null
  if (hgx && index('nvswitch') >= 0) return index('nvswitch') < p.nvswitches.value ? 'nvswitch' : null
  if (part === 'imex') return hgx ? null : 'imex'
  if (hgx && (part === 'psu' || part === 'bmc')) return part
  const service = SERVICES[part]
  if (service && hgx && servicesFor(p).includes(part.slice('svc-'.length) as never)) return service
  return null
}

export function validFailure(config: Config, f: Failure): boolean {
  const kind = failKind(config, f.id)
  if (kind === null || !Object.hasOwn(FAIL_RULES[kind].modes, f.mode)) return false // not `in`: every object has toString
  // UFM: a failover needs a standby; a single unit can only go down.
  if (kind === 'ufm') return config.ufm === 'single' ? f.mode === 'down' : f.mode !== 'down'
  return true
}

// The failures that take a part out: a degraded part (a link, a GPU, the storage network, a VAST client path), the UFM failover, and one VAST CNode keep the part in service.
export function downIds(failures: Failure[]): Set<string> {
  return new Set(failures.filter((f) => f.mode !== 'degraded' && f.mode !== 'active' && f.mode !== 'cnode').map((f) => f.id))
}
