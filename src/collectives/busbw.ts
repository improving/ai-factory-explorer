import { COLL_FACTS } from '../catalog/collectives'
import type { Fact } from '../catalog/fact'
import type { Hop, TraceResult } from '../routing/trace'
import type { Collective, Schedule } from './schedule'
import { linkLoads, type LinkLoad } from './load'

export { toGBps } from './load'

export type SizeId = '1m' | '16m' | '256m' | '1g' | '4g' | '16g'
export const SIZES: { id: SizeId; bytes: number; label: string }[] = [
  { id: '1m', bytes: 2 ** 20, label: '1 MiB' },
  { id: '16m', bytes: 2 ** 24, label: '16 MiB' },
  { id: '256m', bytes: 2 ** 28, label: '256 MiB' },
  { id: '1g', bytes: 2 ** 30, label: '1 GiB' },
  { id: '4g', bytes: 2 ** 32, label: '4 GiB' },
  { id: '16g', bytes: 2 ** 34, label: '16 GiB' },
]

// nccl-tests PERFORMANCE.md: busbw = algbw × this factor.
export const busFactor = (c: Collective, n: number): number => (c === 'allreduce' ? (2 * (n - 1)) / n : c === 'broadcast' ? 1 : (n - 1) / n)


// The limit of any algorithm (design, section 3): the time is the load of the busiest link ÷ its bandwidth (the first
// one when two are equal); busbw = S ÷ time × the bus factor. GB is 10^9 bytes, as in nccl-tests.
// channels: the rings that NCCL runs at the same time (COLL_FACTS.channelLimit); degraded: the pairs of GPUs whose path
// has a degraded hop (their bandwidth stays the sourced value, SIM_FACTS.degradedHop).
export type BusBw = { factor: number; factorFact: Fact<string>; link: LinkLoad; hop: Hop; channels: number; limitGBps: number; algbwGBps: number; timeS: number; degraded: string[] }
export type BusBwResult = { ok: true; bw: BusBw } | { ok: false; reason: string }

// A channel: one schedule and the paths of its pairs. Each channel carries 1/channels of the data, and the loads of
// all channels add up on each link.
export type Channel = { sc: Schedule; paths: Map<string, TraceResult> }

export function busbwChannels(chs: Channel[], sizeBytes: number): BusBwResult {
  const merged = new Map<string, LinkLoad>()
  for (const ch of chs) {
    const loads = linkLoads(ch.sc, ch.paths, sizeBytes / chs.length)
    if (!loads.ok) return loads
    for (const l of loads.links) {
      const m = merged.get(l.key)
      if (!m) merged.set(l.key, { ...l })
      else {
        m.bytes += l.bytes
        m.sends += l.sends
        m.timeS = m.bytes / (m.gbps * 1e9)
      }
    }
  }
  if (merged.size === 0) return { ok: false, reason: 'No link of the schedule has a sourced bandwidth.' }
  const link = [...merged.values()].reduce((a, b) => (b.timeS > a.timeS ? b : a))
  const sc = chs[0]!.sc
  const factor = busFactor(sc.collective, sc.ranks.length)
  const algbw = sizeBytes / link.timeS / 1e9
  const degraded = new Set<string>()
  for (const ch of chs) {
    for (const r of ch.paths.values()) {
      if (r.ok && r.trace.hops.some((h) => h.degraded)) degraded.add(`${r.trace.hops[0]!.from.label} → ${r.trace.hops[r.trace.hops.length - 1]!.to.label}`)
    }
  }
  return { ok: true, bw: { factor, factorFact: COLL_FACTS.busFactor[sc.collective], link, hop: link.hop, channels: chs.length, limitGBps: algbw * factor, algbwGBps: algbw, timeS: link.timeS, degraded: [...degraded] } }
}

// The limit of one schedule (one channel).
export const busbw = (sc: Schedule, sizeBytes: number, paths: Map<string, TraceResult>): BusBwResult => busbwChannels([{ sc, paths }], sizeBytes)
