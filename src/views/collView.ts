import type cytoscape from 'cytoscape'
import type { Channel } from '../collectives/busbw'
import { linkKey, pairKey } from '../collectives/load'
import type { Schedule } from '../collectives/schedule'
import type { PathPart } from '../routing/ends'
import type { TraceResult } from '../routing/trace'
import { railColor } from './palette'

type El = cytoscape.ElementDefinition
type Pos = { x: number; y: number }
const ROW = 120 // the space between two GPUs, NICs, or servers in a column (a part is 96 px high)
// The x of each kind on the side of the first servers; the other servers are the mirror; the leaves are in the middle.
const X: Record<string, number> = { gpu: 0, nvswitch: 320, nic: 640, leaf: 960, spine: 960 }

// The real paths of a schedule: each part once, and one edge for each link that a pair of ranks uses. The servers are
// in two columns (the first half on the left), with the leaves between them; a leaf or a spine is at the mean height of
// its neighbours. In a step, a link is lit in the colour of its chunk, or, with more than one chunk, in the select
// colour with the count. A link keeps the first pair that uses it (in the step, else in the schedule), for the hop table.
// With more than one channel, the links of all channels show, and a pair names its channel ("3:7>8").
export function collElementsOf(chs: Channel[], step: number): El[] {
  const sc = chs[0]!.sc // the servers and the GPUs of all channels are the same
  const tag = (i: number, key: string) => (chs.length > 1 ? `${i}:${key}` : key)
  const servers = [...new Set(sc.ranks.map((id) => id.split('/')[0]!))]
  const half = Math.ceil(servers.length / 2)
  const gpus = [...new Set(sc.ranks.map((id) => Number(/gpu(\d+)$/.exec(id)?.[1] ?? 0)))].sort((a, b) => a - b)
  const index = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? 0) // the GPU, NIC, or chip number
  const place = (p: PathPart): Pos | null => {
    const k = servers.indexOf(p.id.split('/')[0]!)
    if (k < 0) return null // a leaf or a spine
    const row = k < half ? k : k - half
    const at = (slot: number) => (row * gpus.length + slot) * ROW
    const y = p.kind === 'nvswitch' ? at((gpus.length - 1) / 2 + index(p.id)) : at(Math.max(0, gpus.indexOf(index(p.id))))
    const x = X[p.kind] ?? X.nic!
    return { x: k < half ? x : 2 * X.leaf! - x, y }
  }

  const parts = new Map<string, PathPart>()
  const links = new Map<string, { from: string; to: string; network: string; pair: string; degraded: boolean }>()
  chs.forEach((ch, i) => {
    for (const [key, r] of ch.paths) {
      if (!r.ok) continue
      for (const h of r.trace.hops) {
        parts.set(h.from.id, h.from)
        parts.set(h.to.id, h.to)
        if (!links.has(linkKey(h))) links.set(linkKey(h), { from: h.from.id, to: h.to.id, network: h.network, pair: tag(i, key), degraded: Boolean(h.degraded) })
      }
    }
  })
  // The links of the step: the chunks on each one, and the first pair that uses it.
  const lit = new Map<string, { chunks: Set<number>; pair: string }>()
  chs.forEach((ch, i) => {
    for (const x of step >= 1 ? (ch.sc.steps[step - 1]?.sends ?? []) : []) {
      const key = pairKey(x.from, x.to)
      const r = ch.paths.get(key)
      if (!r?.ok) continue
      for (const h of r.trace.hops) {
        const l = lit.get(linkKey(h)) ?? { chunks: new Set<number>(), pair: tag(i, key) }
        l.chunks.add(x.chunk)
        lit.set(linkKey(h), l)
      }
    }
  })

  const pos = new Map<string, Pos>()
  for (const p of parts.values()) {
    const at = place(p)
    if (at) pos.set(p.id, at)
  }
  // A part of no server of the scope: a leaf (between the two columns, moved half way to the side of its NICs), a
  // spine (between its leaves, above them), or a chip of an NVL72 switch tray (in the middle, at the height of its GPUs).
  // The spines go last: a spine is placed between its leaves, so the leaves need their places first.
  for (const p of [...parts.values()].sort((a, b) => Number(a.kind === 'spine') - Number(b.kind === 'spine'))) {
    if (pos.has(p.id)) continue
    const near = [...links.values()]
      .flatMap((l) => (l.from === p.id ? [l.to] : l.to === p.id ? [l.from] : []))
      .map((id) => pos.get(id))
      .filter((q): q is Pos => q !== undefined)
    const mean = (k: 'x' | 'y', d: number) => (near.length > 0 ? near.reduce((a, q) => a + q[k], 0) / near.length : d)
    const x = p.kind === 'leaf' ? X.leaf! + (mean('x', X.leaf!) - X.leaf!) / 2 : p.kind === 'spine' ? mean('x', X.leaf!) : X.leaf!
    pos.set(p.id, { x, y: p.kind === 'spine' ? mean('y', 0) - 2 * ROW : mean('y', 0) })
  }


  const out: El[] = [...parts.values()].map((p): El => ({ group: 'nodes', data: { id: p.id, label: p.label, kind: p.kind }, position: pos.get(p.id)!, classes: `part ${p.kind} trace-part` }))
  for (const [key, l] of links) {
    const on = lit.get(key)
    const multi = on !== undefined && on.chunks.size > 1
    const color = on && !multi ? railColor([...on.chunks][0]!) : undefined
    out.push({
      group: 'edges',
      data: { id: `link-${key}`, source: l.from, target: l.to, kind: 'cable', network: l.network, pair: on?.pair ?? l.pair, ...(color ? { color } : {}), ...(multi ? { label: `×${on.chunks.size}` } : {}) },
      classes: `ring ${l.network}${on ? ' ring-on' : ''}${multi ? ' ring-multi' : ''}${l.degraded ? ' degraded' : ''}`,
    })
  }
  return out
}

// The real paths of one schedule (one channel).
export const collElements = (sc: Schedule, paths: Map<string, TraceResult>, step: number): El[] => collElementsOf([{ sc, paths }], step)
