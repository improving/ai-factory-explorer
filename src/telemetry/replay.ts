import type { Config } from '../config/config'
import { assignments, type NodeState } from '../topology/assign'
import type { TelEvent } from './events'

// The state of one host at a minute of the log, and the signals of the window up to that minute.
export type HostAt = { state: NodeState; xids: number; flaps: number; throttles: number }

// The replay: the configuration gives the state of today, and the events of the log run forward from it.
// Every chain of events closes, so the state at the end of the log is the state of the configuration.
export function replayAt(config: Config, events: TelEvent[], at: number): Map<string, HostAt> {
  const out = new Map<string, HostAt>()
  for (const [id, a] of assignments(config)) out.set(id, { state: a.state, xids: 0, flaps: 0, throttles: 0 })
  for (const e of events) {
    if (e.at > at) break
    const h = out.get(e.host)
    if (!h) continue
    if (e.to !== undefined) h.state = e.to
    if (e.kind === 'xid') h.xids++
    else if (e.kind === 'flap') h.flaps++
    else if (e.kind === 'throttle') h.throttles++
  }
  return out
}

// The state of the host that the configuration gives, when the time view is off.
export const stateOf = (config: Config, host: string): NodeState | null => assignments(config).get(host)?.state ?? null
