import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { generateFabric } from '../src/topology/fabric'
import { fabricElements } from '../src/views/fabricView'

const g1 = generateFabric(DEFAULT_CONFIG)
const g8 = generateFabric({ ...DEFAULT_CONFIG, suCount: 8 })
const nodesOf = (els: ReturnType<typeof fabricElements>) => els.filter((e) => e.group === 'nodes')
const edgesOf = (els: ReturnType<typeof fabricElements>) => els.filter((e) => e.group === 'edges')

describe('fabricElements', () => {
  it('keeps 8 SU under 1500 elements with all SUs closed, and with one SU open', () => {
    expect(fabricElements(g8, new Set()).length).toBeLessThan(1500)
    expect(fabricElements(g8, new Set([1])).length).toBeLessThan(1500)
  })

  it('names the rail in each leaf label, so the rail does not depend on colour', () => {
    const leaves = nodesOf(fabricElements(g1, new Set())).filter((e) => e.data.kind === 'leaf')
    expect(leaves).toHaveLength(8)
    for (const leaf of leaves) expect(leaf.data.label).toContain(`rail ${leaf.data.rail}`)
  })

  it('gives a closed SU one bundle of 72 cables to each of its 8 leaves', () => {
    const bundles = edgesOf(fabricElements(g1, new Set())).filter((e) => e.data.source === 'su1')
    expect(bundles).toHaveLength(8)
    for (const b of bundles) expect(b.data.count).toBe(72)
  })

  it('shows the 576 cables of an open SU, each with its rail', () => {
    const cables = edgesOf(fabricElements(g1, new Set([1]))).filter((e) => e.data.kind === 'cable')
    expect(cables).toHaveLength(576)
    for (const c of cables) expect(c.data.rail).toBeTypeOf('number')
  })

  it('bundles the leaf-spine cables of an open SU by switch pair', () => {
    const pairs = edgesOf(fabricElements(g1, new Set([1]))).filter((e) => e.data.kind === 'bundle' && String(e.data.target).startsWith('spine'))
    expect(pairs).toHaveLength(8 * 4)
    expect(pairs.reduce((sum, p) => sum + Number(p.data.count), 0)).toBe(576)
  })

  it('has unique ids, edges between elements that exist, and a position for each node that is not an open SU', () => {
    const els = fabricElements(g8, new Set([2]))
    const ids = els.map((e) => e.data.id)
    expect(new Set(ids).size).toBe(ids.length)
    const nodeIds = new Set(nodesOf(els).map((e) => e.data.id))
    for (const e of edgesOf(els)) expect(nodeIds.has(e.data.source) && nodeIds.has(e.data.target)).toBe(true)
    for (const n of nodesOf(els)) if (!(n.data.kind === 'su' && n.classes?.includes('expanded'))) expect(n.position).toBeDefined()
  })
})

describe('the fabric layout', () => {
  it.each([1, 2, 4, 8, 18])('%i SU fits a screen: at most 4 times wider than high', (suCount) => {
    const g = generateFabric({ ...DEFAULT_CONFIG, suCount })
    const pos = fabricElements(g, new Set()).flatMap((e) => (e.position ? [e.position] : []))
    const xs = pos.map((p) => p.x)
    const ys = pos.map((p) => p.y)
    const ratio = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))
    expect(ratio).toBeLessThanOrEqual(4)
  })
})
import { withPatch } from '../src/config/rules'

const elementsOf = (patch: Parameters<typeof withPatch>[1], open: number[] = []) =>
  fabricElements(generateFabric(withPatch(DEFAULT_CONFIG, patch)!), new Set(open))

describe('fabricElements for the other designs', () => {
  it('Spectrum-X: plane B leaves are one row below plane A', () => {
    const leaves = elementsOf({ fabric: 'spectrum-x' }).filter((e) => e.data.kind === 'leaf')
    const a = leaves.find((e) => e.data.id === 'su1-leaf-pA-r3')!
    const b = leaves.find((e) => e.data.id === 'su1-leaf-pB-r3')!
    expect(b.position!.y).toBeGreaterThan(a.position!.y)
    expect(b.position!.x).toBe(a.position!.x)
    expect(b.data.label).toContain('plane B rail 3')
  })
  it('Enterprise RA: a two-rail leaf has the class of each rail', () => {
    const leaf = elementsOf({ build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 8 }).find((e) => e.data.id === 'su1-leaf-pA-r0+4')!
    expect(leaf.classes).toContain('rail-0')
    expect(leaf.classes).toContain('rail-4')
  })
  it('top-of-rack: a leaf has no rail class', () => {
    const leaf = elementsOf({ topology: 'tor' }).find((e) => e.data.kind === 'leaf')!
    expect(leaf.classes).toContain('tor')
    expect(leaf.classes).not.toMatch(/rail-/)
  })
  it('GB200: one box closed; 18 trays open', () => {
    expect(elementsOf({ platform: 'gb200-nvl72' })).toHaveLength(1)
    expect(elementsOf({ platform: 'gb200-nvl72' }, [1]).filter((e) => e.data.kind === 'server')).toHaveLength(18)
  })
  it('GB300: 2 SU with one SU open stays under 1500 elements', () => {
    expect(elementsOf({ platform: 'gb300-nvl72' }, [1]).length).toBeLessThan(1500)
  })
})
