import { describe, expect, it } from 'vitest'
import { CATALOG } from '../src/catalog'
import { FAIL_RULES, SIM_FACTS } from '../src/catalog/failures'

describe('the failure rules', () => {
  it('has a rule for each failure kind of spec 7.1 that the topology has', () => {
    expect(Object.keys(FAIL_RULES)).toEqual([
      'gpu', 'nvswitch', 'switch-tray', 'fabric-manager', 'nvlsm', 'imex', 'driver', 'device-plugin', 'nic', 'cable',
      'leaf', 'spine', 'storage-net', 'ufm', 'psu', 'bmc', 'cdu', 'pdu', 'vast', 'rafay', 'lb', 'firewall', 'dns', 'ntp',
    ])
  })
  it('gives each mode an effect with a source, a first command, and a severity floor', () => {
    for (const [kind, rule] of Object.entries(FAIL_RULES)) {
      const modes = Object.entries(rule.modes)
      expect(modes.length, kind).toBeGreaterThan(0)
      for (const [mode, m] of modes) {
        // A confirmed effect names its source; an assumed one names the note that says what it depends on.
        expect(m!.effect.source ?? m!.effect.note, `${kind}:${mode}`).toBeTruthy()
        expect(m!.command.source, `${kind}:${mode}`).toBeTruthy()
        expect([1, 2, 3, 4]).toContain(m!.floor)
      }
    }
  })
  it('has the modes of the spec: Xid 79, 48, 64, and a slow GPU; a cable down or degraded; the active UFM unit or both', () => {
    expect(Object.keys(FAIL_RULES.gpu.modes)).toEqual(['xid79', 'xid48', 'xid64', 'degraded'])
    expect(Object.keys(FAIL_RULES.cable.modes)).toEqual(['down', 'degraded'])
    expect(Object.keys(FAIL_RULES.ufm.modes)).toEqual(['active', 'both', 'down']) // down: a single UFM unit
    expect(Object.keys(FAIL_RULES['storage-net'].modes)).toEqual(['down', 'degraded'])
    expect(Object.keys(FAIL_RULES.vast.modes)).toEqual(['cnode', 'degraded'])
  })
  it('links the new modes to their catalogue rows', () => {
    expect(FAIL_RULES.gpu.modes.xid64!.runbook!.label).toMatch(/^G2:/)
    expect(FAIL_RULES.gpu.modes.degraded!.runbook!.label).toMatch(/^G8:/)
    expect(FAIL_RULES['storage-net'].modes.degraded!.runbook!.label).toMatch(/^N6:/)
    expect(FAIL_RULES.vast.modes.degraded!.runbook!.label).toMatch(/^V1:/)
  })
  it('marks the rules that the repository does not state as assumed', () => {
    expect(FAIL_RULES['fabric-manager'].modes.down!.effect.status).toBe('assumed')
    expect(FAIL_RULES.leaf.modes.down!.effect.status).toBe('assumed')
    expect(FAIL_RULES.imex.modes.down!.effect.status).toBe('confirmed')
    expect(SIM_FACTS.p1.status).toBe('assumed')
  })
  it('is in the catalog tree, so the source test checks it', () => {
    expect(CATALOG).toHaveProperty('failRules')
    expect(CATALOG).toHaveProperty('simFacts')
  })
})
