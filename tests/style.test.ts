import cytoscape from 'cytoscape'
import { describe, expect, it } from 'vitest'
import { RAIL_COLORS } from '../src/views/palette'
import { stylesheet } from '../src/views/style'

// A stylesheet block is a style block or a CSS block (cytoscape types); only style blocks have `style`.
const rule = (selector: string): Record<string, unknown> | undefined => {
  const r = stylesheet('light').find((x) => x.selector === selector)
  return r && 'style' in r ? (r.style as Record<string, unknown>) : undefined
}

describe('the canvas stylesheet', () => {
  it('fades the rest of the view to 30 %, so the context stays readable', () => {
    expect(rule('.faded')?.opacity).toBe(0.3)
  })
  it('marks a failed part with a red fill and a hit part with a dashed red border, in no rail colour', () => {
    expect(rule('node.failed')?.['background-color']).toBe('#C44E52')
    expect(rule('node.hit')?.['border-style']).toBe('dashed')
    expect(RAIL_COLORS).not.toContain(rule('node.hit')?.['border-color'])
  })
  it('does not fade a failed or a hit part', () => {
    expect(rule('.faded.failed, .faded.hit')?.opacity).toBe(1)
  })

  it('keeps a failed or a hit part inside a faded group at full opacity (a group fades only its own paint)', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: true,
      style: stylesheet('light'),
      elements: [
        { data: { id: 'p', kind: 'su' }, classes: 'su expanded faded' },
        { data: { id: 'c', parent: 'p', kind: 'server' }, classes: 'server faded failed' },
        { data: { id: 'h', parent: 'p', kind: 'server' }, classes: 'server faded hit' },
        { data: { id: 'o', parent: 'p', kind: 'server' }, classes: 'server faded' },
      ],
    })
    expect(cy.getElementById('c').effectiveOpacity()).toBe(1)
    expect(cy.getElementById('h').effectiveOpacity()).toBe(1)
    expect(cy.getElementById('o').effectiveOpacity()).toBeCloseTo(0.3)
  })

  it('gives every label a font of at least 12 px, so it shows at a zoom of 0.5 (min-zoomed-font-size 6)', () => {
    const small = stylesheet('light').filter((r) => 'style' in r && typeof (r.style as Record<string, unknown>)['font-size'] === 'number' && ((r.style as Record<string, unknown>)['font-size'] as number) < 12)
    expect(small.map((r) => r.selector)).toEqual([])
  })

  it('styles the hops of a trace: the current hop dashed and thick, the later hops less bright; a ring on the hop ends', () => {
    expect(rule('edge.hop.hop-on')?.['line-style']).toBe('dashed')
    expect(rule('edge.hop.hop-done')?.['line-style']).toBeUndefined() // a done bottleneck keeps its dashes
    expect(rule('edge.hop.hop-later')?.opacity).toBeLessThan(0.6)
    expect(rule('node.hop-end')?.['underlay-opacity']).toBe(0.3)
  })

  it('keeps the current hop thick when a selection focuses it (the rule comes after edge.focus)', () => {
    const sheet = stylesheet('light')
    const at = (sel: string) => sheet.findIndex((r) => r.selector === sel)
    expect(rule('edge.hop.hop-on.focus')?.width).toBe(7)
    expect(at('edge.hop.hop-on.focus')).toBeGreaterThan(at('edge.focus'))
  })
})
