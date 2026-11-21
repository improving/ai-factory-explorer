import { assumed, confirmed, type Fact } from '../catalog/fact'
import type { Config } from '../config/config'
import { makeRng } from '../schedule/rng'
import { assignments, type NodeState } from '../topology/assign'
import { idHash } from './hash'

// The log of the fleet: seven days of events, one tick for each minute. The window of the bar shows the last day or
// the whole log, so a switch of the window keeps the same events.
export const SPAN = 7 * 1440
export type WindowId = '24h' | '7d'
export const WINDOW_MIN: Record<WindowId, number> = { '24h': 1440, '7d': SPAN }
export const WINDOW_LABEL: Record<WindowId, string> = { '24h': '24 hours', '7d': '7 days' }
export const WINDOW_IDS: WindowId[] = ['24h', '7d']

// The minute of the log that a cursor of the window names: the window ends now, so a switch keeps the clock.
// The last minute of the log is SPAN - 1, and the end of the window is that minute.
export const atOf = (window: WindowId, cursor: number): number => Math.min(SPAN - 1, SPAN - WINDOW_MIN[window] + Math.min(WINDOW_MIN[window], Math.max(0, cursor)))
export const clockOf = (at: number): string => `day ${Math.floor(at / 1440) + 1}, ${String(Math.floor((at % 1440) / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`
export const clockShort = (at: number): string => `${String(Math.floor((at % 1440) / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`

// A state change (drain, release, xid, repair) or a signal (throttle, flap).
export type TelKind = 'drain' | 'release' | 'xid' | 'repair' | 'throttle' | 'flap'
export type TelEvent = {
  at: number // the minute of the log
  host: string
  kind: TelKind
  to?: NodeState // the state that the event sets; absent for a signal
  note: string
}

export const KIND_LABEL: Record<TelKind, string> = {
  drain: 'drained',
  release: 'back in the pool',
  xid: 'Xid 79',
  repair: 'repaired',
  throttle: 'throttle',
  flap: 'link flap',
}

// The sources give the signals of a host and the states of the lifecycle, not the history of a site.
export const EVENTS_NOTE: Fact<string> = assumed(
  'the events of the seven days, and the state that each one sets',
  undefined,
  'The sources give the signals of a host, the states of the lifecycle, and the metric families of the platform, not the history of a site. The app draws a week with the shape of a busy fleet: a firmware window for every host on day 3, a hot afternoon each day, a failover on day 5, and a few Xids with their repair.',
  'runbooks/RB-12-host-not-allocatable-lifecycle.md:18',
)
export const XID_SOURCE: Fact<string> = confirmed('Xid 79, the GPU that fell off the bus', undefined, 'handbook/b300-nvl72-forum-triage-guide.md:249')
export const STATE_SOURCE: Fact<string> = confirmed('the node state machine: healthy, degraded, quarantined, in repair', undefined, 'runbooks/RB-12-host-not-allocatable-lifecycle.md:18')

const DAY = 1440
const minutes = (day: number, hour: number, minute = 0) => day * DAY + hour * 60 + minute

// The week of one host. Every chain closes: a drain returns the host to the state that it had, and a quarantine is
// repaired, so the state at the end of the log is the state of the configuration.
export function eventsOfHost(id: string, start: NodeState): TelEvent[] {
  const rng = makeRng(idHash(id))
  const out: TelEvent[] = []
  let state = start
  const push = (at: number, kind: TelKind, to: NodeState | undefined, note: string) => {
    out.push({ at: Math.round(at), host: id, kind, ...(to === undefined ? {} : { to }), note })
    if (to !== undefined) state = to
  }
  const down = (at: number, drainNote: string, releaseNote: string) => {
    const before = state
    push(at, 'drain', 'maintenance', drainNote)
    push(at + 15 + Math.floor(rng() * 25), 'release', before, releaseNote)
  }

  // Day 3: the firmware window. Every host leaves the pool, and it comes back on the new baseline.
  down(minutes(2, 2, Math.floor(rng() * 50)), 'drained for the firmware window', 'the new firmware is up')

  // Each day, a hot afternoon on a quarter of the hosts: the inlet is above the limit, and the GPU throttles.
  for (let d = 0; d < 7; d++) {
    if (rng() >= 0.25) continue
    const at = minutes(d, 13, Math.floor(rng() * 120))
    const n = 1 + Math.floor(rng() * 3)
    for (let k = 0; k < n; k++) push(at + k * (10 + Math.floor(rng() * 20)), 'throttle', undefined, 'the inlet is above 32 C')
  }

  // Day 5: the UFM failover. A third of the hosts see a link flap.
  if (rng() < 0.35) {
    const at = minutes(4, 9, Math.floor(rng() * 30))
    const n = 1 + Math.floor(rng() * 3)
    for (let k = 0; k < n; k++) push(at + k * (2 + Math.floor(rng() * 8)), 'flap', undefined, 'a link flap during the UFM failover')
  }

  // A few Xids: the host is quarantined, and a repair returns it to the state that it had.
  if (rng() < 0.08) {
    const at = minutes(Math.floor(rng() * 6), 6 + Math.floor(rng() * 10), Math.floor(rng() * 60))
    const before = state
    push(at, 'xid', 'quarantined', 'Xid 79: the GPU fell off the bus')
    push(at + 60 + Math.floor(rng() * 180), 'repair', before, 'the host passed the health check after the reset')
  }
  return out.sort((a, b) => a.at - b.at)
}

// The whole fleet, in time order.
export function eventsOf(config: Config): TelEvent[] {
  const out: TelEvent[] = []
  for (const [id, a] of assignments(config)) out.push(...eventsOfHost(id, a.state))
  return out.sort((a, b) => a.at - b.at || a.host.localeCompare(b.host))
}

// The events of one host, in time order.
export function hostEvents(events: TelEvent[], host: string): TelEvent[] {
  return events.filter((e) => e.host === host)
}

// The strip of the bar: the count of each bucket, and the worst kind in it.
export type StripKind = 'xid' | 'signal' | 'state' | 'none'
export type StripBucket = { at: number; count: number; kind: StripKind }
const RANK: Record<StripKind, number> = { none: 0, state: 1, signal: 2, xid: 3 }
const kindOf = (e: TelEvent): StripKind => (e.kind === 'xid' ? 'xid' : e.kind === 'throttle' || e.kind === 'flap' ? 'signal' : 'state')

export function stripOf(events: TelEvent[], from: number, to: number, buckets = 160): StripBucket[] {
  const n = Math.max(1, Math.round(buckets))
  const step = Math.max(1, (to - from) / n)
  const out: StripBucket[] = Array.from({ length: n }, (_, i) => ({ at: Math.round(from + i * step), count: 0, kind: 'none' }))
  for (const e of events) {
    if (e.at < from || e.at >= to) continue
    const i = Math.min(n - 1, Math.floor((e.at - from) / step))
    const b = out[i]!
    b.count++
    const k = kindOf(e)
    if (RANK[k] > RANK[b.kind]) b.kind = k
  }
  return out
}
