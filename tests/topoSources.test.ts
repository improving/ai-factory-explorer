import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { compareOf, designCables, diffNames, diffOf, diffSummary, rackDiff, sourceCables, SOURCE_IDS, SOURCE_NOTE, SOURCES } from '../src/topology/sources'
import { sourceProblem } from './support/sources'

const config = DEFAULT_CONFIG
const findings = (id: 'design' | 'intent' | 'discovered') => diffOf(config, id).rows.filter((r) => r.finding !== 'same')

describe('the three views of the fabric', () => {
  it('has the design, the intent, and the discovery of M3', () => {
    expect(SOURCE_IDS).toEqual(['design', 'intent', 'discovered'])
    expect(SOURCES.map((s) => s.short)).toEqual(['Design', 'Intent', 'Discovery'])
    for (const s of SOURCES) {
      expect(s.note).not.toBe('')
      expect(sourceProblem(s.how.source), s.id).toBeNull()
    }
  })

  it('cites the design, the as-built record, and the discovery command, and the check that this item serves', () => {
    expect(SOURCES[0]!.how.source).toMatch(/^https:\/\/docs\.nvidia\.com\//) // the reference architecture
    expect(SOURCES[1]!.how.source).toBe('handbook/runbook-catalog.md:218') // the as-built record
    expect(SOURCES[2]!.how.source).toBe('handbook/cli_utilities_layered_gist.md:104') // ibnetdiscover
    expect(sourceProblem(SOURCE_NOTE.source!)).toBeNull()
    expect(SOURCE_NOTE.status).toBe('assumed')
  })

  it('gives the cables of the design with both ends and a rail', () => {
    const cables = designCables(config)
    expect(cables).toHaveLength(1152) // 576 node-leaf and 576 leaf-spine of 1 SU
    expect(cables[0]).toMatchObject({ cable: 'su1-n01~r0', near: 'su1-n01/port-c0', far: 'su1-leaf-r0/p1', rail: 0, tier: 'node-leaf' })
    expect(new Set(cables.map((c) => c.near)).size).toBe(cables.length) // one cable for each near end
  })

  it('has no difference between the design and itself', () => {
    const d = diffOf(config, 'design')
    expect(d.differs).toBe(0)
    expect(d.counts.same).toBe(d.total)
    expect(diffSummary(d)).toBe('No difference: the design names the same 1152 cables.')
  })

  it('names the cables of each finding, for the M3 check', () => {
    expect(diffNames(diffOf(config, 'discovered'))).toBe('missing: su1-n01~r5; moved: su1-n02~r1, su1-n02~r2')
    expect(diffNames(diffOf(config, 'intent'))).toBe('missing: su1-n03~r5; wrong rail: su1-n02~r4')
    expect(diffNames(diffOf(config, 'design'))).toBe('')
  })

  it('makes one missing cable and one crossed pair in the discovery', () => {
    const d = diffOf(config, 'discovered')
    expect(d.counts).toMatchObject({ missing: 1, moved: 2, 'wrong-rail': 0, extra: 0 })
    expect(d.total).toBe(1152) // the rows are the cables of the design; one of them has no far end
    expect(diffSummary(d)).toBe('3 of 1152 cables differ: 1 missing, 2 moved.')
  })

  it('names the cable that the discovery lacks, and the two ends of the crossed pair', () => {
    const rows = findings('discovered')
    expect(rows[0]).toMatchObject({ cable: 'su1-n01~r5', near: 'su1-n01/port-c5', far: 'su1-leaf-r5/p1', sourceFar: null, finding: 'missing' })
    expect(rows[0]!.why).toContain('the discovery does not name it')
    const crossed = rows.filter((r) => r.finding === 'moved')
    expect(crossed.map((r) => r.near)).toEqual(['su1-n02/port-c1', 'su1-n02/port-c2'])
    expect(crossed.map((r) => r.far)).toEqual(['su1-leaf-r1/p2', 'su1-leaf-r2/p2'])
    expect(crossed.map((r) => r.sourceFar)).toEqual(['su1-leaf-r2/p2', 'su1-leaf-r1/p2'])
  })

  it('makes one missing cable and one wrong rail label in the intent', () => {
    const d = diffOf(config, 'intent')
    expect(d.counts).toMatchObject({ missing: 1, moved: 0, 'wrong-rail': 1, extra: 0 })
    expect(d.total).toBe(1152)
    const rows = findings('intent')
    expect(rows.map((r) => r.finding)).toEqual(['wrong-rail', 'missing'])
    expect(rows[1]!.why).toContain('a row that the LLD lacks')
    expect(rows[0]).toMatchObject({ near: 'su1-n02/port-c4', rail: 4, sourceRail: 6, finding: 'wrong-rail' })
    expect(rows[0]!.far).toBe(rows[0]!.sourceFar) // a label, not a port
  })

  it('keeps the cables of a source in the order of the design, then the extra ones', () => {
    const cables = sourceCables(config, 'discovered')
    expect(cables).toHaveLength(1151)
    expect(cables[0]!.near).toBe('su1-n01/port-c0')
    const rows = diffOf(config, 'discovered').rows
    expect(rows.slice(0, -1).every((r) => r.cable !== null)).toBe(true)
  })

  it('calls a cable that only the source has an extra', () => {
    const design = designCables(config)
    const cables = [...design.map((c) => ({ near: c.near, far: c.far, rail: null })), { near: 'su1-n72/port-c0', far: 'su1-leaf-r1/p71', rail: null }]
    const d = compareOf(design, cables, 'discovered')
    expect(d.counts.extra).toBe(1)
    expect(d.rows.find((r) => r.finding === 'extra')).toMatchObject({ cable: null, near: 'su1-n72/port-c0', sourceFar: 'su1-leaf-r1/p71' })
    expect(d.rows.at(-1)!.why).toContain('unrecorded addition')
  })

  it('keeps the example of the app free of an extra cable: the design uses every port', () => {
    expect(diffOf(config, 'discovered').counts.extra).toBe(0)
    expect(diffOf(config, 'intent').counts.extra).toBe(0)
  })

  it('gives the differences of one rack, and none for a rack that the example does not touch', () => {
    expect(rackDiff(config, 'su1-k1', 'discovered').counts).toMatchObject({ missing: 1, moved: 2 })
    expect(rackDiff(config, 'su1-k1', 'intent').counts).toMatchObject({ missing: 1, 'wrong-rail': 1 })
    expect(rackDiff(config, 'su1-k2', 'discovered').differs).toBe(0)
    // The network rack holds the far ends of the same cables, so it shows the same three differences.
    expect(rackDiff(config, 'su1-net1', 'discovered').counts).toMatchObject({ missing: 1, moved: 2 })
    expect(rackDiff(config, 'su1-k1', 'design').differs).toBe(0)
  })

})
