import type { DocRef } from '../catalog/component-docs'
import { assumed, type Fact } from '../catalog/fact'
import type { Config } from '../config/config'
import { generateFabric } from './fabric'
import { cableEnds } from './ports'
import { layoutOf } from './racks'
import { XDR_RA_URL } from '../catalog/urls'

// The three views of the fabric of M3: the design (the reference architecture), the intent (the low-level
// design of the site, with the cable and port map), and the discovery (what the hardware reports today).
export type SourceId = 'design' | 'intent' | 'discovered'
export const SOURCE_IDS: SourceId[] = ['design', 'intent', 'discovered']

export type SourceInfo = { id: SourceId; label: string; short: string; note: string; how: DocRef }

export const SOURCES: SourceInfo[] = [
  {
    id: 'design',
    label: 'The reference design',
    short: 'Design',
    note: 'The rail plan and the leaf and spine counts of the reference architecture: the map that the app draws.',
    how: { label: 'The design is the reference architecture', source: XDR_RA_URL },
  },
  {
    id: 'intent',
    label: 'The site intent (LLD)',
    short: 'Intent',
    note: 'The low-level design of the site: a table of cables, with a rail label for each row.',
    how: { label: 'The intent is the low-level design of the site', source: 'handbook/runbook-catalog.md:218' },
  },
  {
    id: 'discovered',
    label: 'The discovery (ibnetdiscover)',
    short: 'Discovery',
    note: 'What the hardware reports today: the nodes, the ports, and the links. It gives no U position.',
    how: { label: 'The discovery is what the hardware reports today', source: 'handbook/cli_utilities_layered_gist.md:104' },
  },
]

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s] as const))

// The app makes the differences of a site by a fixed rule; they are examples, not a reading of a site.
export const SOURCE_NOTE: Fact<string> = assumed(
  'the differences of the intent and of the discovery',
  undefined,
  'No site gives its LLD or its discovery output. The app makes the differences by a fixed rule: the sixth node-leaf cable is missing, two cables are crossed, and the intent gives one rail a wrong label.',
  'handbook/runbook-catalog.md:218',
)

// A cable of a source: the near end (the port of the server, or of the leaf for an uplink), the far end, and
// the rail label that the source gives (the intent has a label; the design and the discovery take it from the port).
export type CablePair = { cable: string; near: string; far: string; rail: number | null; tier: 'node-leaf' | 'leaf-spine' }
export type SourceCable = { near: string; far: string; rail: number | null }

// The findings of a comparison. A difference is either a documentation error or an unrecorded change (M3).
export type Finding = 'same' | 'missing' | 'moved' | 'wrong-rail' | 'extra'
export const FINDINGS: Finding[] = ['same', 'missing', 'moved', 'wrong-rail', 'extra']
export const FINDING_LABEL: Record<Finding, string> = {
  same: 'same',
  missing: 'missing',
  moved: 'moved',
  'wrong-rail': 'wrong rail',
  extra: 'extra',
}

export type DiffRow = {
  cable: string | null // the cable of the design; null for a cable that only the source has
  near: string
  far: string | null // the far end of the design
  sourceFar: string | null // the far end of the source
  rail: number | null
  sourceRail: number | null
  finding: Finding
  why: string
}
export type Diff = { source: SourceId; rows: DiffRow[]; counts: Record<Finding, number>; total: number; differs: number }

const deviceOf = (port: string): string => port.split('/')[0]!

// The cables of the reference design, in the order of the fabric.
export function designCables(config: Config): CablePair[] {
  return generateFabric(config).edges.map((e) => {
    const { a, b } = cableEnds(config, e)
    return { cable: e.id, near: a.id, far: b.id, rail: e.rail ?? null, tier: e.tier === 'node-leaf' ? 'node-leaf' : 'leaf-spine' }
  })
}

// The example differences of a site. The rule uses the position of a cable in the node-leaf list, so it holds
// for every configuration with at least 13 node-leaf cables.
const MISSING = 5 // the sixth node-leaf cable: this source does not name it
const CROSSED = [9, 10] // two cables that are crossed at their far ends
const WRONG_RAIL = 12 // the intent gives this cable another rail label

// The cables of a source: the design, with the example differences of the source.
export function sourceCables(config: Config, id: SourceId): SourceCable[] {
  const design = designCables(config)
  const cables: SourceCable[] = design.map((c) => ({ near: c.near, far: c.far, rail: id === 'intent' ? c.rail : null }))
  if (id === 'design') return cables
  const nodeLeaf = design.map((c, i) => ({ c, i })).filter(({ c }) => c.tier === 'node-leaf')
  if (nodeLeaf.length < 13) return cables
  const at = (k: number) => nodeLeaf[k]!.i
  const missing = id === 'discovered' ? MISSING : 21
  cables[at(missing)] = { ...cables[at(missing)]!, far: '' } // an empty far end: the source does not name the cable
  if (id === 'discovered') {
    const [x, y] = CROSSED.map(at) as [number, number]
    const fx = cables[x]!.far
    cables[x] = { ...cables[x]!, far: cables[y]!.far }
    cables[y] = { ...cables[y]!, far: fx }
  } else {
    const x = at(WRONG_RAIL)
    const rails = new Set(nodeLeaf.map(({ c }) => c.rail)).size
    const rail = cables[x]!.rail
    if (rail !== null && rails > 0) cables[x] = { ...cables[x]!, rail: (rail + 2) % rails }
  }
  return cables.filter((c) => c.far !== '')
}

const WHY: Record<Finding, (source: SourceInfo) => string> = {
  same: () => '',
  missing: (s) =>
    s.id === 'discovered'
      ? 'The design has this cable, and the discovery does not name it: an unrecorded removal, a cable that the switch does not see, or a port that is down.'
      : 'The design has this cable, and the intent does not name it: a row that the LLD lacks.',
  moved: () => 'Both name the near end, and the far end differs: an unrecorded move, or a documentation error.',
  'wrong-rail': () => 'Both ends agree, and the rail label differs: a documentation error in the LLD.',
  extra: () => 'The source names a cable that the design does not have: an unrecorded addition, or a documentation error.',
}

const countsOf = (rows: DiffRow[], source: SourceId): Diff => {
  const counts = Object.fromEntries(FINDINGS.map((f) => [f, 0])) as Record<Finding, number>
  for (const r of rows) counts[r.finding]++
  return { source, rows, counts, total: rows.length, differs: rows.length - counts.same }
}

// The comparison of the design with a source. The key of a cable is its near end: a source that names the near
// end with another far end is a move, and a near end that the design does not have is an extra.
export function diffOf(config: Config, id: SourceId): Diff {
  const design = designCables(config)
  const cables = id === 'design' ? design.map((c) => ({ near: c.near, far: c.far, rail: c.rail })) : sourceCables(config, id)
  return compareOf(design, cables, id)
}

// The comparison of a cable list with the cables of the design: the engine, without the example of a site.
export function compareOf(design: CablePair[], cables: SourceCable[], id: SourceId): Diff {
  const source = SOURCE_BY_ID.get(id)!
  const byNear = new Map<string, SourceCable[]>()
  for (const c of cables) byNear.set(c.near, [...(byNear.get(c.near) ?? []), c])
  const used = new Set<SourceCable>()
  const rows: DiffRow[] = []
  const row = (c: CablePair, s: SourceCable | null, finding: Finding): DiffRow => ({
    cable: c.cable,
    near: c.near,
    far: c.far,
    sourceFar: s ? s.far : null,
    rail: c.rail,
    sourceRail: s ? s.rail : null,
    finding,
    why: WHY[finding](source),
  })
  for (const c of design) {
    const candidates = byNear.get(c.near) ?? []
    const same = candidates.find((s) => s.far === c.far && !used.has(s))
    if (same) {
      used.add(same)
      const wrongRail = c.rail !== null && same.rail !== null && same.rail !== c.rail
      rows.push(row(c, same, wrongRail ? 'wrong-rail' : 'same'))
      continue
    }
    const other = candidates.find((s) => !used.has(s))
    if (other) {
      used.add(other)
      rows.push(row(c, other, 'moved'))
      continue
    }
    rows.push(row(c, null, 'missing'))
  }
  for (const s of cables) if (!used.has(s)) rows.push({ cable: null, near: s.near, far: null, sourceFar: s.far, rail: null, sourceRail: s.rail, finding: 'extra', why: WHY.extra(source) })
  return countsOf(rows, id)
}

// The rows of the cables of one rack: the near end or the far end of the cable is a device of the rack.
export function rackDiff(config: Config, rackId: string, id: SourceId): Diff {
  const here = new Set(layoutOf(config).devices.filter((x) => x.rack === rackId).map((x) => x.id))
  const all = diffOf(config, id)
  const inRack = (r: DiffRow) => here.has(deviceOf(r.near)) || (r.far !== null && here.has(deviceOf(r.far))) || (r.sourceFar !== null && here.has(deviceOf(r.sourceFar)))
  return countsOf(all.rows.filter(inRack), id)
}

// The cables of each finding, in one line: the answer of the M3 check, which asks for the name of the cable.
export function diffNames(d: Diff): string {
  return FINDINGS.filter((f) => f !== 'same' && d.counts[f] > 0)
    .map((f) => {
      const names = d.rows.filter((r) => r.finding === f).map((r) => r.cable ?? r.near)
      return `${FINDING_LABEL[f]}: ${names.slice(0, 4).join(', ')}${names.length > 4 ? `, and ${names.length - 4} more` : ''}`
    })
    .join('; ')
}

// The summary of a comparison, in one line: "2 of 32 cables differ: 1 missing, 1 moved."
export function diffSummary(d: Diff): string {
  if (d.differs === 0) return `No difference: the ${SOURCE_BY_ID.get(d.source)!.short.toLowerCase()} names the same ${d.total} cables.`
  const parts = FINDINGS.filter((f) => f !== 'same' && d.counts[f] > 0).map((f) => `${d.counts[f]} ${FINDING_LABEL[f]}`)
  return `${d.differs} of ${d.total} cables differ: ${parts.join(', ')}.`
}
