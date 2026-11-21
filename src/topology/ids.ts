import { designById, raRow } from '../catalog/designs'
import type { Config } from '../config/config'

const pad2 = (n: number) => String(n).padStart(2, '0')

export const suId = (su: number) => `su${su}`
export const serverId = (su: number, n: number) => `su${su}-n${pad2(n)}`
// A leaf of the group whose first SU is `su`. A number is a rail (su1-leaf-r3); a string is a leaf tag.
export const leafId = (su: number, key: number | string) => `su${su}-leaf-${typeof key === 'number' ? `r${key}` : key}`
export const spineId = (j: number) => `spine-${pad2(j)}`
export const anchorId = (su: number) => `su${su}-uplinks` // a view-only point where a closed group's uplinks meet
export const rackId = (su: number, rack: number) => `su${su}-k${rack}`
export const partId = (server: string, part: string) => `${server}/${part}`
export const netRackId = (su: number, k: number) => `su${su}-net${k}` // a network rack of the group whose first SU is `su`
export const coreRackId = (k: number) => `core-k${k}` // a spine rack, shared by all SUs
export const cduId = (su: number) => `su${su}-cdu`
const PLANE_TAG = ['A', 'B']
export const serverPortId = (server: string, rail: number, plane: number, planeCount: number) =>
  partId(server, `port-c${rail}${planeCount === 2 ? PLANE_TAG[plane] : ''}`)
export const switchPortId = (sw: string, n: number) => partId(sw, `p${n}`)

export function parseServerId(id: string): { su: number; n: number } | null {
  const m = /^su(\d+)-n(\d{2,3})$/.exec(id)
  return m ? { su: Number(m[1]), n: Number(m[2]) } : null
}

// A rack id, or the id of a part of a rack (su1-k2-sw3/chip0, su1-k2-ps4).
export function parseRackId(id: string): { su: number; rack: number } | null {
  const m = /^su(\d+)-k(\d+)(?:$|[-/])/.exec(id)
  return m ? { su: Number(m[1]), rack: Number(m[2]) } : null
}

// The server of a part id ("su1-n05/gpu3" → "su1-n05"), or null.
export function serverOf(id: string): string | null {
  const head = id.split('/')[0]!
  return parseServerId(head) ? head : null
}

export function suOf(id: string): number | null {
  const m = /^su(\d+)(?:-|=|$)/.exec(id)
  return m ? Number(m[1]) : null
}

export function serverExists(config: Config, id: string): boolean {
  const p = parseServerId(id)
  if (!p) return false
  const d = designById(config.design)
  if (d.reservedSlots.some((r) => r.su === p.su && r.slot === p.n)) return false
  if (p.su === config.suCount && p.n > d.serversPerSu.value - config.lastSuEmpty) return false
  return p.su >= 1 && p.su <= config.suCount && p.n >= 1 && p.n <= d.serversPerSu.value
}

export function elementExists(config: Config, id: string): boolean {
  const server = serverOf(id)
  if (server) return serverExists(config, server)
  const d = designById(config.design)
  const rack = parseRackId(id)
  if (rack) return rack.su >= 1 && rack.su <= config.suCount && rack.rack >= 1 && rack.rack <= d.serversPerSu.value / d.serversPerRack.value
  const su = suOf(id)
  if (su !== null) return su >= 1 && su <= config.suCount
  const spine = /^spine-(\d+)$/.exec(id)
  if (spine) return Number(spine[1]) <= (raRow(d, config.suCount)?.spine ?? 0)
  return false
}
