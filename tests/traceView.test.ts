import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { traceFactory } from '../src/routing/factory'
import { traceGpus, type Trace } from '../src/routing/trace'
import { mergeGraphs } from '../src/topology/graph'
import { generateServer } from '../src/topology/server'
import { traceElements } from '../src/views/traceView'

const trace = (c = DEFAULT_CONFIG, src = 'su1-n05/gpu2', dst = 'su1-n40/gpu5', pxn = false): Trace => {
  const r = traceGpus(c, src, dst, { pxn, plane: 0 })
  if (!r.ok) throw new Error(r.reason)
  return r.trace
}

describe('traceElements', () => {
  it('draws the path left to right, one edge for each hop, and marks the bottleneck', () => {
    const els = traceElements(trace())
    const path = els.filter((e) => e.group === 'nodes' && typeof e.classes === 'string' && e.classes.includes('trace-part'))
    expect(path.map((n) => n.data.id)).toEqual(['su1-n05/gpu2', 'su1-n05/nic2', 'su1-leaf-r2', 'spine-01', 'su1-leaf-r5', 'su1-n40/nic5', 'su1-n40/gpu5'])
    for (let i = 1; i < path.length; i++) expect(path[i]!.position!.x).toBeGreaterThan(path[i - 1]!.position!.x)
    const hops = els.filter((e) => e.group === 'edges' && typeof e.classes === 'string' && e.classes.startsWith('hop'))
    expect(hops.map((e) => e.data.id)).toEqual(['hop-0', 'hop-1', 'hop-2', 'hop-3', 'hop-4', 'hop-5'])
    expect(hops.find((e) => typeof e.classes === 'string' && e.classes.includes('bottleneck'))?.data.hop).toBe(1)
  })
  it('draws the other spines as a fan above the spine of the path', () => {
    const els = traceElements(trace())
    const fan = els.filter((e) => e.group === 'nodes' && typeof e.classes === 'string' && e.classes.includes('fan') && !e.classes.includes('more'))
    expect(fan.map((n) => n.data.id)).toEqual(['spine-02', 'spine-03', 'spine-04'])
    for (const n of fan) expect(n.position!.y).toBeLessThan(0)
  })
  it('draws at most 3 fan parts, and one "+N more" node', () => {
    const c = withPatch(DEFAULT_CONFIG, { platform: 'gb300-nvl72', suCount: 2 })!
    const els = traceElements(trace(c, 'su1-n05/gpu1', 'su1-n12/gpu2', true))
    expect(els.filter((e) => e.group === 'nodes' && e.classes === 'part nvswitch fan')).toHaveLength(3)
    expect(els.find((e) => e.data.id === 'fan-0-more')?.data.label).toBe('+14 more')
  })
  it('has unique ids, and edges between parts that it draws', () => {
    const els = traceElements(trace(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n40/gpu5', true))
    const ids = els.map((e) => e.data.id)
    expect(new Set(ids).size).toBe(ids.length)
    const nodes = new Set(els.filter((e) => e.group === 'nodes').map((e) => e.data.id))
    for (const e of els.filter((x) => x.group === 'edges')) expect(nodes.has(e.data.source) && nodes.has(e.data.target), e.data.id).toBe(true)
  })
})

describe('mergeGraphs', () => {
  it('keeps each node and edge once', () => {
    const a = generateServer(DEFAULT_CONFIG, 'su1-n05')
    const m = mergeGraphs(a, a, generateServer(DEFAULT_CONFIG, 'su1-n40'))
    expect(m.nodes).toHaveLength(a.nodes.length * 2)
    expect(m.edges).toHaveLength(a.edges.length * 2)
  })
})

describe('the factory paths in the strip', () => {
  it('draws a path-only part with the class virtual', () => {
    const r = traceFactory(DEFAULT_CONFIG, 'user-ui', 'su1-n05/gpu2')
    if (!r.ok) throw new Error(r.reason)
    const els = traceElements(r.trace)
    expect(els.find((e) => e.data.id === 'path-user')?.classes).toBe('part actor trace-part virtual')
    expect(els.find((e) => e.data.id === 'blk-rafay')?.classes).toBe('part block trace-part')
  })
})
