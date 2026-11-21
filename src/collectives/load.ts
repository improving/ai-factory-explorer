import type { Fact } from '../catalog/fact'
import type { Config } from '../config/config'
import { DEFAULT_TRACE_OPTIONS, traceGpus, type Hop, type TraceResult } from '../routing/trace'
import type { Failure } from '../simulate/failable'
import type { Schedule } from './schedule'

export const pairKey = (from: number, to: number): string => `${from}>${to}`
export const linkKey = (h: Hop): string => `${h.from.id}>${h.to.id}`

// A hop bandwidth in Gb/s for one direction, in GB/s. Another unit is a defect of the catalog.
export function toGBps(f: Fact<number | null>): number | null {
  if (f.value === null) return null
  if (!f.unit?.startsWith('Gb/s')) throw new Error(`A hop bandwidth must be in Gb/s, not ${f.unit ?? 'no unit'}.`)
  return f.value / 8
}

// The pairs of ranks that the schedule uses, each once, in the order of their first send.
export function schedulePairs(sc: Schedule): [number, number][] {
  const seen = new Map<string, [number, number]>()
  for (const st of sc.steps) for (const x of st.sends) if (!seen.has(pairKey(x.from, x.to))) seen.set(pairKey(x.from, x.to), [x.from, x.to])
  return [...seen.values()]
}

// The path of each pair, by the rules of the tracer, with the failures of the simulator.
export function pairPaths(config: Config, sc: Schedule, failures: Failure[] = []): Map<string, TraceResult> {
  return new Map(schedulePairs(sc).map(([a, b]): [string, TraceResult] => [pairKey(a, b), traceGpus(config, sc.ranks[a]!, sc.ranks[b]!, DEFAULT_TRACE_OPTIONS, failures)]))
}

export type LinkLoad = { key: string; hop: Hop; bytes: number; gbps: number; timeS: number; sends: number }
export type LoadResult = { ok: true; links: LinkLoad[] } | { ok: false; reason: string }

// The bytes on each link (a directed hop) over all steps: each send puts S / chunks bytes on each hop of its path. A
// hop with no sourced bandwidth (PCIe) is left out. An NVLS send (`via`) loads a link once for each step and chunk:
// the switch adds the chunks of a reduce, and copies the chunk of a multicast (COLL_FACTS.nvlsLimit).
export function linkLoads(sc: Schedule, paths: Map<string, TraceResult>, sizeBytes: number): LoadResult {
  const chunk = sizeBytes / sc.chunks
  const links = new Map<string, LinkLoad>()
  for (const st of sc.steps) {
    const once = new Set<string>()
    for (const x of st.sends) {
      const r = paths.get(pairKey(x.from, x.to))
      if (!r || !r.ok) return { ok: false, reason: `No path from rank ${x.from} to rank ${x.to}.${r && !r.ok ? ` ${r.reason}` : ''}` }
      for (const h of r.trace.hops) {
        const key = linkKey(h)
        if (x.via) {
          if (once.has(`${key}|${x.chunk}`)) continue
          once.add(`${key}|${x.chunk}`)
        }
        const gbps = toGBps(h.bandwidth)
        if (gbps === null) continue
        const l = links.get(key) ?? { key, hop: h, bytes: 0, gbps, timeS: 0, sends: 0 }
        l.bytes += chunk
        l.sends += 1
        l.timeS = l.bytes / (gbps * 1e9)
        links.set(key, l)
      }
    }
  }
  return { ok: true, links: [...links.values()] }
}
