import { designById } from '../catalog/designs'
import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import { gpuEnd } from '../routing/ends'
import { partId, serverExists, serverId } from '../topology/ids'
import { isPerNode, type Scope } from './algorithms'

export { isPerNode, type Scope }
export const SCOPES: Scope[] = ['1n', '2n', '2s', '1t', '4t', 'n4', 'n8', 'n16']
const LABEL: Record<Scope, string> = {
  '1n': '1 node',
  '2n': '2 nodes',
  '2s': '2 nodes, different SUs',
  '1t': '1 tray (4 GPUs)',
  '4t': '4 trays (16 GPUs)',
  n4: '4 nodes, 1 GPU each',
  n8: '8 nodes, 1 GPU each',
  n16: '16 nodes, 1 GPU each',
  group: 'a group of the plan',
}
const HGX: Scope[] = ['1n', '2n', '2s', 'n4', 'n8', 'n16']
const NVL72: Scope[] = ['1t', '4t', 'n4', 'n8', 'n16']
const COUNT: Record<Scope, number> = { '1n': 1, '2n': 2, '2s': 2, '1t': 1, '4t': 4, n4: 4, n8: 8, n16: 16, group: 0 }
const isNvl72 = (config: Config) => platformFor(config).form === 'nvl72-tray'

// The label of a scope; on an NVL72 rack, a node of the N-node scopes is a tray.
export function scopeLabel(config: Config, s: Scope): string {
  return isNvl72(config) && isPerNode(s) ? LABEL[s].replace('nodes', 'trays') : LABEL[s]
}

// The first `count` servers or trays of SU 1 (an empty or reserved slot is skipped); null when SU 1 has fewer.
export function firstServers(config: Config, count: number): string[] | null {
  const out: string[] = []
  const last = designById(config.design).serversPerSu.value
  for (let n = 1; n <= last && out.length < count; n++) if (serverExists(config, serverId(1, n))) out.push(serverId(1, n))
  return out.length === count ? out : null
}

// The first server of SU 1 and the first server of the first SU in another group of SUs (another set of leaves);
// null when the configuration has one group.
export function crossSuServers(config: Config): [string, string] | null {
  const a = firstServers(config, 1)?.[0]
  if (!a) return null
  const group = gpuEnd(config, partId(a, 'gpu0'))!.group
  const last = designById(config.design).serversPerSu.value
  for (let su = 2; su <= config.suCount; su++) {
    for (let n = 1; n <= last; n++) {
      const b = serverId(su, n)
      if (!serverExists(config, b)) continue
      if (gpuEnd(config, partId(b, 'gpu0'))!.group !== group) return [a, b]
      break // the servers of one SU are in one group
    }
  }
  return null
}

// The two servers of a 2-node scope.
export function pairServers(config: Config, scope: '2n' | '2s'): [string, string] | null {
  if (scope === '2s') return crossSuServers(config)
  const s = firstServers(config, 2)
  return s ? [s[0]!, s[1]!] : null
}

// The GPUs of a scope, in ring order. 2 nodes: GPU 0 to 7 on node A, then GPU 7 to 0 on node B, so each crossing
// stays on one rail (COLL_FACTS.ringOrder). N nodes or trays, 1 GPU each: GPU 0 of each. Trays: the GPUs of each
// tray in turn (all in one NVLink domain).
export function scopeRanks(config: Config, scope: Scope): string[] | null {
  if (!(isNvl72(config) ? NVL72 : HGX).includes(scope)) return null
  const g = platformFor(config).gpusPerServer.value
  const up = Array.from({ length: g }, (_, i) => i)
  const gpus = (server: string, order: number[]) => order.map((i) => partId(server, `gpu${i}`))
  if (scope === '2n' || scope === '2s') {
    const s = pairServers(config, scope)
    return s ? [...gpus(s[0], up), ...gpus(s[1], [...up].reverse())] : null
  }
  const servers = firstServers(config, COUNT[scope])
  if (!servers) return null
  return isPerNode(scope) ? servers.map((s) => partId(s, 'gpu0')) : servers.flatMap((s) => gpus(s, up))
}

// The scopes that have ranks in this configuration (the bar offers only these).
export const availableScopes = (config: Config): Scope[] => SCOPES.filter((s) => scopeRanks(config, s) !== null)

// Why a scope has no ranks in this configuration, or null when it has them.
export function scopeProblem(config: Config, scope: Scope): string | null {
  if (scopeRanks(config, scope)) return null
  if (scope === 'group') return 'This link has no group of the plan. Select a GPU in the Parallelism view, then "Play this group".'
  if (isNvl72(config) && !NVL72.includes(scope)) return 'This scope uses 8-GPU HGX servers; on an NVL72 rack, select a tray scope.'
  if (!isNvl72(config) && !HGX.includes(scope)) return 'This scope uses the trays of an NVL72 rack.'
  const d = designById(config.design)
  if (scope === '2s') return `This scope needs a second group of SUs: this design has ${d.susPerGroup} SU in each group, and the configuration has ${config.suCount} SU.`
  let have = 0
  for (let n = 1; n <= d.serversPerSu.value; n++) if (serverExists(config, serverId(1, n))) have++
  return `SU 1 of this design has ${have} ${isNvl72(config) ? 'trays' : 'servers'}; this scope needs ${COUNT[scope]}. Select a smaller scope.`
}
