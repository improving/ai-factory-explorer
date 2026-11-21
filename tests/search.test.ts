import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { findParts } from '../src/search/search'

const cfg = (patch: Partial<Config> = {}): Config => withPatch(DEFAULT_CONFIG, patch)!
const ids = (c: Config, q: string, telemetry = false) => findParts(c, q, telemetry).hits.map((h) => h.id)

describe('findParts', () => {
  it('finds nothing for an empty query', () => {
    expect(findParts(cfg(), '  ', false)).toEqual({ hits: [], total: 0 })
  })

  it('finds a server by its id, with or without the zeros and the dash', () => {
    const c = cfg({ suCount: 2 })
    expect(ids(c, 'su2 n05')[0]).toBe('su2-n05')
    expect(ids(c, 'su2-n05')[0]).toBe('su2-n05')
    expect(ids(c, 'su2 n5')[0]).toBe('su2-n05')
    expect(findParts(c, 'su2 n05', false).hits[0]!.where).toEqual({ level: 'fabric', su: 2 })
  })

  it('finds the UFM block, which opens the overview', () => {
    const hit = findParts(cfg({ ufm: 'ha' }), 'ufm', false).hits[0]!
    expect(hit.id).toBe('blk-ufm')
    expect(hit.where).toEqual({ level: 'overview' })
  })

  it('"rail 3" gives the rail highlight first, then the leaves of rail 3', () => {
    const { hits } = findParts(cfg(), 'rail 3', false)
    expect(hits[0]).toMatchObject({ id: 'rail-3', rail: 3, where: { level: 'fabric', su: null } })
    expect(hits.some((h) => h.id === 'su1-leaf-r3')).toBe(true)
    expect(hits.some((h) => h.id === 'su1-leaf-r2')).toBe(false)
  })

  it('finds the parts of one server only when the query names the server', () => {
    expect(ids(cfg(), 'gpu3')).toEqual([])
    const hit = findParts(cfg(), 'su1 n05 gpu3', false).hits.find((h) => h.id === 'su1-n05/gpu3')
    expect(hit?.where).toEqual({ level: 'node', serverId: 'su1-n05' })
  })

  it('a server that does not exist gives no server parts and does not throw', () => {
    expect(ids(cfg(), 'su9 n05 gpu3')).toEqual([])
  })

  it('finds a rack and a rack device, which open the racks view of their SU', () => {
    const c = cfg({ suCount: 2 })
    expect(findParts(c, 'su2-k1', false).hits[0]).toMatchObject({ id: 'su2-k1', where: { level: 'racks', su: 2 } })
    expect(findParts(c, 'su2-k1-pdu1', false).hits[0]).toMatchObject({ id: 'su2-k1-pdu1', where: { level: 'racks', su: 2 } })
  })

  it('a spine rack (all SUs) opens the racks view of SU 1', () => {
    const hit = findParts(cfg(), 'core-k1', false).hits[0]!
    expect(hit).toMatchObject({ id: 'core-k1', where: { level: 'racks', su: 1 } })
  })

  it('finds a telemetry block only when the telemetry overlay is on', () => {
    expect(ids(cfg(), 'prometheus', false)).toEqual([])
    expect(ids(cfg(), 'prometheus', true)).toContain('blk-prometheus')
  })

  it('gives at most the limit, and the total', () => {
    const r = findParts(cfg({ suCount: 4 }), 'su', false, 10)
    expect(r.hits).toHaveLength(10)
    expect(r.total).toBeGreaterThan(10)
  })

  it('shows each id once', () => {
    const all = findParts(cfg(), 'su1', false, 10_000).hits.map((h) => h.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('finds a written runbook by its id, its title, or a row that it covers', () => {
    const c = cfg()
    expect(findParts(c, 'rb-03', false).hits[0]).toMatchObject({ id: 'RB-03', kind: 'runbook', where: { level: 'link', source: 'runbooks/RB-03-gpu-ecc-xid-thermal-power-silent-wrong.md:18' } })
    expect(ids(c, 'rb 3')).toContain('RB-03')
    expect(ids(c, 'nccl')).toContain('RB-02')
    expect(ids(c, 'g1')).toContain('RB-03')
  })

  it('finds the parts of the open server first, with no server name in the query', () => {
    expect(findParts(cfg(), 'gpu 2', false, 10, 'su1-n05').hits[0]?.id).toBe('su1-n05/gpu2')
    expect(findParts(cfg(), 'nvswitch', false, 10, 'su1-n05').hits[0]?.id).toBe('su1-n05/nvswitch0')
    // No open server: no part of a server, and the documents of the Library still match.
    expect(findParts(cfg(), 'gpu 2', false).hits.filter((h) => h.where.level === 'node')).toEqual([])
    const hits = findParts(cfg(), 'su1 n05 gpu', false, 50, 'su1-n05').hits
    expect(new Set(hits.map((h) => h.id)).size).toBe(hits.length) // each part once
  })

  it('in an NVL72 tray view, the parts of the open tray come before the other trays of the rack', () => {
    const c = cfg({ platform: 'gb300-nvl72', suCount: 2 })
    expect(findParts(c, 'gpu 2', false, 10, 'su1-n05').hits[0]?.id).toBe('su1-n05/gpu2')
  })

  it('finds a document of the Library, and a section of one', () => {
    const doc = findParts(cfg(), 'command reference', false, 10).hits.find((h) => h.kind === 'document')
    expect(doc?.id).toBe('doc-hb-command-reference')
    expect(doc?.where).toEqual({ level: 'link', source: 'handbook/command-reference.md' })
    const section = findParts(cfg(), 'first 5 minutes', false, 20).hits.find((h) => h.kind === 'section')
    expect(section?.id).toBe('doc-rb-01#3-first-5-minutes')
    expect(section?.where).toMatchObject({ level: 'link', source: 'runbooks/RB-01-nvlink-fabric-fm-imex.md:49' })
  })

  it('keeps a part of the fabric above a document of the same words', () => {
    const first = findParts(cfg(), 'ufm', false, 10).hits[0]
    expect(first?.kind).not.toBe('document')
    expect(first?.kind).not.toBe('section')
  })

  it('caps the sections of one document, so that a long document does not flood the list', () => {
    const sections = findParts(cfg(), 'lab', false, 400).hits.filter((h) => h.kind === 'section' && h.id.startsWith('doc-lab-simai-simccl#'))
    expect(sections.length).toBeLessThanOrEqual(50)
  })
})
