import { describe, expect, it } from 'vitest'
import { LIFECYCLE, LIFECYCLE_BY_ID, MODELLED, lifecycleClass, lifecycleOf } from '../src/catalog/lifecycle'
import type { NodeState } from '../src/topology/assign'

describe('the lifecycle catalog', () => {
  it('has the nine states, each one once', () => {
    expect(LIFECYCLE.map((s) => s.id)).toEqual(['discovered', 'validated', 'baseline', 'available', 'allocated', 'in-use', 'sanitizing', 'quarantined', 'in-repair'])
    expect(new Set(LIFECYCLE.map((s) => s.id)).size).toBe(9)
  })

  it('gives every state a meaning, an entry, an exit, a gate, an evidence, and a source', () => {
    for (const s of LIFECYCLE) {
      expect(s.meaning.length, s.id).toBeGreaterThan(0)
      expect(s.entry.length, s.id).toBeGreaterThan(0)
      expect(s.exit.length, s.id).toBeGreaterThan(0)
      expect(s.gate.length, s.id).toBeGreaterThan(0)
      expect(s.evidence.length, s.id).toBeGreaterThan(0)
      expect(s.source, s.id).toMatch(/\.md:\d+$/)
    }
  })

  it('looks a state up by its id', () => {
    expect(LIFECYCLE_BY_ID.get('quarantined')?.label).toBe('Quarantined')
    expect(LIFECYCLE_BY_ID.get('in-use')?.phase).toBe('day 1')
  })

  it('maps the five counted states to the four modelled lifecycle states', () => {
    const map: [NodeState, string][] = [
      ['available', 'available'],
      ['allocated', 'in-use'],
      ['degraded', 'available'],
      ['quarantined', 'quarantined'],
      ['maintenance', 'in-repair'],
    ]
    for (const [state, id] of map) expect(lifecycleOf(state), state).toBe(id)
    expect(MODELLED).toEqual(['available', 'in-use', 'quarantined', 'in-repair'])
    for (const id of MODELLED) expect(LIFECYCLE_BY_ID.has(id), id).toBe(true)
  })

  it('gives the colour class of a state', () => {
    expect(lifecycleClass('quarantined')).toBe('ov-lc-quarantined')
    expect(lifecycleClass('in-use')).toBe('ov-lc-in-use')
  })
})
