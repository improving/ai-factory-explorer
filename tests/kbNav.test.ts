import { describe, expect, it } from 'vitest'
import type cytoscape from 'cytoscape'
import { DEFAULT_CONFIG } from '../src/config/config'
import { fabricElements } from '../src/views/fabricView'
import { generateFabric } from '../src/topology/fabric'
import { announceOf, nextIndex, partsOf } from '../src/ui/kbNav'

const elements = fabricElements(generateFabric(DEFAULT_CONFIG), new Set([1]))
const parts = partsOf(elements)

describe('the parts of a view', () => {
  it('gives the nodes, in the order of the drawing', () => {
    expect(parts.length).toBeGreaterThan(70)
    expect(parts[0]!.kind).toBe('spine')
    expect(parts.some((p) => p.kind === 'server')).toBe(true)
    expect(parts.some((p) => p.id === 'su1-n01')).toBe(true)
  })

  it('leaves out the cables, which are read from their ends', () => {
    const edges = elements.filter((e) => e.group === 'edges')
    expect(edges.length).toBeGreaterThan(0)
    expect(parts.some((p) => edges.some((e) => e.data.id === p.id))).toBe(false)
  })

  it('gives the label of a part, and its id when it has no label', () => {
    const el: cytoscape.ElementDefinition[] = [
      { group: 'nodes', data: { id: 'su1-n01', label: 'n01', kind: 'server' } },
      { group: 'nodes', data: { id: 'su1-n02' } },
    ]
    expect(partsOf(el)).toEqual([
      { id: 'su1-n01', label: 'n01', kind: 'server' },
      { id: 'su1-n02', label: 'su1-n02', kind: 'part' },
    ])
  })

  it('an empty view has no part', () => {
    expect(partsOf([])).toEqual([])
  })
})

describe('the step of the ring', () => {
  it('moves forward and back, and stops at the ends', () => {
    expect(nextIndex(-1, 3, 1)).toBe(0) // the first Tab
    expect(nextIndex(-1, 3, -1)).toBe(2) // the first Shift+Tab, from the top
    expect(nextIndex(0, 3, 1)).toBe(1)
    expect(nextIndex(2, 3, 1)).toBe(-1) // past the last part: the canvas lets the Tab go
    expect(nextIndex(0, 3, -1)).toBe(-1)
  })

  it('a view of one part leaves the canvas on the second Tab', () => {
    expect(nextIndex(-1, 1, 1)).toBe(0)
    expect(nextIndex(0, 1, 1)).toBe(-1)
  })

  it('an empty view has no step', () => {
    expect(nextIndex(-1, 0, 1)).toBe(-1)
  })
})

describe('the announcement of a part', () => {
  it('gives the name, the kind, and the position', () => {
    expect(announceOf({ id: 'su1-n05', label: 'n05', kind: 'server' }, 2, 72)).toBe('n05, a server, 3 of 72')
  })
})
