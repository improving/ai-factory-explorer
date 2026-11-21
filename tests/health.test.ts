import { describe, expect, it } from 'vitest'
import { CLASSIFICATIONS, MAINTENANCE_CLASSES, SEVERITIES, healthClass, verdictOf } from '../src/catalog/health'

describe('the health catalog', () => {
  it('has the five severities, each one once', () => {
    expect(SEVERITIES.map((s) => s.id)).toEqual(['PASS', 'INFO', 'WARNING', 'CRITICAL', 'UNKNOWN'])
    for (const s of SEVERITIES) {
      expect(s.meaning.length, s.id).toBeGreaterThan(0)
      expect(s.action.length, s.id).toBeGreaterThan(0)
      // A severity is a vendor document, or a line of the operator documents of the portal.
      expect(s.source, s.id).toMatch(/^(https:\/\/|runbooks\/|handbook\/)/)
    }
  })

  it('has the classifications, each one once, with a source', () => {
    expect(new Set(CLASSIFICATIONS.map((c) => c.id)).size).toBe(CLASSIFICATIONS.length)
    for (const c of CLASSIFICATIONS) {
      expect(c.effect.length, c.id).toBeGreaterThan(0)
      expect(c.source, c.id).toMatch(/^(https?:\/\/|.*\.md:\d+$)/)
    }
    expect(CLASSIFICATIONS.map((c) => c.id)).toContain('PreventAllocations')
  })

  it('gives a PASS to a host in the pool, with no class and no action', () => {
    for (const state of ['available', 'allocated'] as const) {
      const v = verdictOf(state)!
      expect(v.severity).toBe('PASS')
      expect(v.classes).toEqual([])
      expect(v.action).toBe('none')
      expect(v.fact.status).toBe('assumed')
    }
  })

  it('gives a WARNING to a degraded host, and it stays in service', () => {
    const v = verdictOf('degraded')!
    expect(v.severity).toBe('WARNING')
    expect(v.classes).toEqual(['SensorWarning'])
    expect(v.action).toBe('none')
  })

  it('gives a CRITICAL to a quarantined host, and it drains', () => {
    const v = verdictOf('quarantined')!
    expect(v.severity).toBe('CRITICAL')
    expect(v.classes).toEqual(['Hardware', 'PreventAllocations'])
    expect(v.action).toBe('drain')
  })

  it('gives no verdict to a host in maintenance, and names the three classes that it carries', () => {
    expect(verdictOf('maintenance')).toBeNull()
    expect(MAINTENANCE_CLASSES).toEqual(['PreventAllocations', 'SuppressExternalAlerting', 'ExcludeFromStateMachineSla'])
  })

  it('gives the colour class of the health overlay', () => {
    expect(healthClass('available')).toBe('ov-hl-pass')
    expect(healthClass('degraded')).toBe('ov-hl-warning')
    expect(healthClass('quarantined')).toBe('ov-hl-critical')
    expect(healthClass('maintenance')).toBe('ov-hl-none')
  })
})
