import { RUNBOOKS } from '../catalog/runbooks'
import { DOCS } from '../docs/content'
import { headingText } from '../docs/slug'
import type { Config } from '../config/config'
import { designOf, generateFabric } from '../topology/fabric'
import { serverExists, serverId, suOf } from '../topology/ids'
import { generateOverview } from '../topology/overview'
import { layoutOf, rackOf } from '../topology/racks'
import { generateServer } from '../topology/server'

// The view that shows a part: search opens it, then selects the part.
// fabric.su: the SU whose group to open (the fabric draws a server only in an open group).
export type Where =
  | { level: 'overview' }
  | { level: 'fabric'; su: number | null }
  | { level: 'node'; serverId: string }
  | { level: 'racks'; su: number }
  | { level: 'link'; source: string } // a written runbook: it opens in a new tab, not in a view

// One search result. A rail result has no part: it highlights the rail in the fabric.
export type Hit = { id: string; label: string; kind: string; where: Where; rail?: number }

type Entry = { hit: Hit; words: string[] }

// The sections of a document that the search indexes: a document of 169 headings does not flood the list.
const SECTIONS_MAX = 50

// Lower-case words; a word with a number also gets the form without the leading zeros (n05 → n5, 01 → 1).
export function wordsOf(text: string): string[] {
  const out = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const short = out.map((w) => w.replace(/(^|\D)0+(?=\d)/g, '$1')).filter((w, i) => w !== out[i])
  return [...out, ...short]
}

const entry = (hit: Hit): Entry => ({ hit, words: wordsOf(`${hit.id} ${hit.label} ${hit.kind}`) })

// A config object never changes, so the index is cached for each one (the telemetry blocks change it).
const cache = new WeakMap<Config, Map<boolean, Entry[]>>()

function indexOf(config: Config, telemetry: boolean): Entry[] {
  const byTelemetry = cache.get(config) ?? new Map<boolean, Entry[]>()
  cache.set(config, byTelemetry)
  const hit = byTelemetry.get(telemetry)
  if (hit) return hit
  const out: Entry[] = []
  const seen = new Set<string>()
  const add = (h: Hit) => {
    if (seen.has(h.id)) return
    seen.add(h.id)
    out.push(entry(h))
  }
  for (const n of generateOverview(config, { telemetry }).nodes) add({ id: n.id, label: n.label, kind: n.kind, where: { level: 'overview' } })
  const fabric = generateFabric(config).nodes
  for (const kind of ['spine', 'su', 'leaf', 'server'] as const) {
    for (const n of fabric.filter((x) => x.kind === kind)) add({ id: n.id, label: n.label, kind, where: { level: 'fabric', su: kind === 'server' ? suOf(n.id) : null } })
  }
  const layout = layoutOf(config)
  // A spine rack serves all SUs (su 0): it opens the racks view of SU 1.
  const racksSu = (su: number) => (su === 0 ? 1 : su)
  for (const r of layout.racks) add({ id: r.id, label: r.label, kind: 'rack', where: { level: 'racks', su: racksSu(r.su) } })
  for (const d of layout.devices) {
    const rack = rackOf(config, d.rack)
    if (rack) add({ id: d.id, label: d.label, kind: d.kind, where: { level: 'racks', su: racksSu(rack.su) } })
  }
  const rails = designOf(config).rails.value
  for (let r = 0; r < rails; r++) add({ id: `rail-${r}`, label: `Rail ${r}`, kind: 'rail highlight', where: { level: 'fabric', su: null }, rail: r })
  // The written runbooks: a result opens the reader, not a view.
  for (const r of RUNBOOKS) {
    add({ id: r.id, label: r.rows.length > 0 ? `${r.top.label} (${r.rows.join(', ')})` : r.top.label, kind: 'runbook', where: { level: 'link', source: r.top.source } })
  }
  // The documents of the Library and their sections: a result opens the reader at that section. The sections
  // come last in the index, so a part of the fabric still comes first in the list of results.
  for (const d of DOCS) {
    add({ id: `doc-${d.id}`, label: d.title, kind: 'document', where: { level: 'link', source: d.path } })
    for (const h of d.headings.filter((x) => x.level >= 2).slice(0, SECTIONS_MAX)) {
      add({ id: `doc-${d.id}#${h.slug}`, label: `${d.title}: ${headingText(h.text)}`, kind: 'section', where: { level: 'link', source: `${d.path}:${h.line}` } })
    }
  }
  byTelemetry.set(telemetry, out)
  return out
}

// The parts inside one server (an NVL72 tray: its whole rack), or none when the server is not in the configuration.
function partsOf(config: Config, id: string): Entry[] {
  if (!serverExists(config, id)) return []
  return generateServer(config, id).nodes.map((n) => entry({ id: n.id, label: n.label, kind: n.kind, where: { level: 'node', serverId: id } }))
}

// The server that the query names ("su2 n05 gpu3" → su2-n05), or null.
function namedServer(query: string): string | null {
  const m = /su(\d+)\D*n(\d+)/.exec(query.toLowerCase())
  return m ? serverId(Number(m[1]), Number(m[2])) : null
}

// `context` is the server of the open node view: its parts come first, with or without a server name in the query.
export function findParts(config: Config, query: string, telemetry: boolean, limit = 10, context: string | null = null): { hits: Hit[]; total: number } {
  const q = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (q.length === 0) return { hits: [], total: 0 }
  // Each id once: the open server first, then the index, then the parts of the server that the query names.
  const known = new Set<string>()
  const all: Entry[] = []
  const push = (entries: Entry[]) => {
    for (const e of entries) {
      if (known.has(e.hit.id)) continue
      known.add(e.hit.id)
      all.push(e)
    }
  }
  if (context) {
    // An NVL72 tray gives its whole rack: the parts of the open tray come first.
    const parts = partsOf(config, context)
    const own = (e: Entry) => e.hit.id === context || e.hit.id.startsWith(`${context}/`)
    push([...parts.filter(own), ...parts.filter((e) => !own(e))])
  }
  push(indexOf(config, telemetry))
  const named = namedServer(query)
  if (named) push(partsOf(config, named))
  const matches = all.filter((e) => q.every((w) => e.words.some((x) => x.startsWith(w))))
  const whole = q.join(' ')
  const label = query.trim().toLowerCase()
  // 0: the id is the query (su2-n05 for "su2 n05"); 1: the label is the query ("Rail 3"); 2: any other match.
  const rank = (h: Hit) => (h.id.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(' ') === whole ? 0 : h.label.toLowerCase() === label ? 1 : 2)
  // In each rank, the hits of one kind stay together (the list shows a heading for each kind), in the order of the first hit of each kind.
  const firstOfKind = new Map<string, number>()
  matches.forEach((e, i) => firstOfKind.has(e.hit.kind) || firstOfKind.set(e.hit.kind, i))
  const sorted = matches
    .map((e, i) => ({ h: e.hit, i, r: rank(e.hit), k: firstOfKind.get(e.hit.kind)! }))
    .sort((a, b) => a.r - b.r || a.k - b.k || a.i - b.i)
  return { hits: sorted.slice(0, limit).map((x) => x.h), total: sorted.length }
}
