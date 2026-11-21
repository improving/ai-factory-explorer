import { platformFor } from '../catalog/platforms'
import type { Config } from '../config/config'
import type { Failure } from '../simulate/failable'
import { partId } from '../topology/ids'
import type { Channel } from './busbw'
import { pairPaths } from './load'
import { schedule, type Schedule } from './schedule'
import { pairServers, type Scope } from './scope'

// The GPUs of channel c of a ring on 2 nodes: node A from GPU c to GPU c + 7, then node B from GPU c + 7 down to
// GPU c. So channel c crosses to node B on rail c + 7 and back on rail c; channel 0 is the ring of the scope. The
// orders are the model of the app (COLL_FACTS.channelLimit).
export function channelRanks(config: Config, scope: '2n' | '2s', c: number): string[] | null {
  const servers = pairServers(config, scope)
  if (!servers) return null
  const g = platformFor(config).gpusPerServer.value
  return [...Array.from({ length: g }, (_, i) => partId(servers[0], `gpu${(c + i) % g}`)), ...Array.from({ length: g }, (_, i) => partId(servers[1], `gpu${(c + g - 1 - i) % g}`))]
}

// The channels of a schedule: a ring on 2 nodes (also in different SUs) has one channel for each compute NIC of a
// node, each with 1/count of the data; the other scopes and algorithms have one channel.
export function channelsOf(config: Config, scope: Scope, sc: Schedule, failures: Failure[] = []): Channel[] {
  if ((scope !== '2n' && scope !== '2s') || sc.algorithm !== 'ring') return [{ sc, paths: pairPaths(config, sc, failures) }]
  return Array.from({ length: platformFor(config).computeNic.count.value }, (_, c) => {
    const s = schedule(sc.collective, sc.algorithm, channelRanks(config, scope, c)!)
    return { sc: s, paths: pairPaths(config, s, failures) }
  })
}
