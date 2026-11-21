import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateServer } from '../src/topology/server'
import { rackElements } from '../src/views/rackView'

const els = rackElements(generateServer(withPatch(DEFAULT_CONFIG, { platform: 'gb200-nvl72' })!, 'su1-n05'))
const nodes = els.filter((e) => e.group === 'nodes')

describe('rackElements (GB200 NVL72)', () => {
  it('has 1773 elements: 297 parts and 1476 links', () => {
    expect(nodes).toHaveLength(297)
    expect(els).toHaveLength(1773)
  })
  it('gives each part that is not a container its own position', () => {
    const spots = nodes.filter((n) => n.position).map((n) => `${n.position!.x},${n.position!.y}`)
    expect(spots).toHaveLength(297 - 1 - 18 - 9)
    expect(new Set(spots).size).toBe(spots.length)
  })
  it('only has edges between elements that exist', () => {
    const ids = new Set(nodes.map((n) => n.data.id))
    for (const e of els.filter((x) => x.group === 'edges')) expect(ids.has(e.data.source) && ids.has(e.data.target)).toBe(true)
  })
  it('draws the switch trays between the compute trays', () => {
    const y = (id: string) => nodes.find((n) => n.data.id === id)!.position!.y
    expect(y('su1-k1-sw1/chip0')).toBeGreaterThan(y('su1-n10/gpu0'))
    expect(y('su1-k1-sw9/chip0')).toBeLessThan(y('su1-n11/gpu0'))
  })
})
