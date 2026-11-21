import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, KEYS } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { validFailure, type Failure } from '../src/simulate/failable'
import { impactOf } from '../src/simulate/impact'
import { SIM_SCENARIOS, activeSimStep, stepFailures, type SimScenario } from '../src/simulate/scenarios'

describe('the scenario library (spec 7.4)', () => {
  it('has the rows of the spec, with unique ids', () => {
    expect(SIM_SCENARIOS.map((s) => s.id)).toEqual([
      'fm-stops',
      'link-ber',
      'ufm-failover',
      'leaf-single',
      'leaf-dual',
      'spine-down',
      'rafay-down',
      'pod-no-gpu',
      'allreduce-40',
      'partly-degraded',
      'xid79',
      'xid64-rma',
      'gpu-slow',
      'pfc-storm',
      'vast-slow',
      'os-patch',
      'rack-power-storm',
      'cdu-drain',
    ])
  })
  it.each(SIM_SCENARIOS)('$id: its configuration is valid, and each failure is a part of it', (s) => {
    const config = withPatch(DEFAULT_CONFIG, s.patch)
    expect(config).not.toBeNull()
    for (const f of s.failures) expect(validFailure(config!, f), f.id).toBe(true)
    expect(impactOf(config!, s.failures).incidents).toHaveLength(s.failures.length)
  })
  it('gives each scenario, and each step, a unique set of failures and configuration', () => {
    // Each step of a scenario with steps is a failure set too: activeSimStep returns the first match.
    // The key is the resulting configuration, as activeSimStep compares it: `{}` and `{ cooling: 'air' }` are the same key.
    const key = (s: SimScenario, fs: Failure[]) => {
      const c = withPatch(DEFAULT_CONFIG, s.patch)
      return JSON.stringify([c === null ? null : KEYS.map((k) => c[k]), fs.map((f) => `${f.id}:${f.mode}`).sort()])
    }
    const keys = SIM_SCENARIOS.flatMap((s) => (s.steps ? s.steps.map((_, i) => key(s, stepFailures(s, i))) : [key(s, s.failures)]))
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('tells the story of the compound scenarios', () => {
    for (const id of ['ufm-failover', 'os-patch', 'rack-power-storm', 'cdu-drain']) expect(SIM_SCENARIOS.find((s) => s.id === id)!.narrative?.length, id).toBeGreaterThan(0)
  })
})

const STEPS: SimScenario = {
  id: 'test-steps',
  label: 'a test',
  patch: {},
  failures: [
    { id: 'su1-n01/svc-driver', mode: 'down' },
    { id: 'su1-n02/svc-driver', mode: 'down' },
  ],
  server: null,
  open: [],
  steps: [
    { note: 'one', failures: [{ id: 'su1-n01/svc-driver', mode: 'down' }] },
    { note: 'two', failures: [{ id: 'su1-n02/svc-driver', mode: 'down' }] },
  ],
}

describe('the steps of a scenario', () => {
  it('gives the failures of the steps up to a step', () => {
    expect(stepFailures(STEPS, 0)).toEqual([{ id: 'su1-n01/svc-driver', mode: 'down' }])
    expect(stepFailures(STEPS, 1)).toHaveLength(2)
    expect(stepFailures(STEPS, 9)).toHaveLength(2) // clamped
  })
  it.each(SIM_SCENARIOS.filter((s) => s.steps))('$id: each step adds failures, none twice, and the steps make the failures', (s) => {
    const all = s.steps!.flatMap((x) => x.failures)
    for (const x of s.steps!) expect(x.failures.length, x.note).toBeGreaterThan(0)
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length)
    expect(all.map((f) => `${f.id}:${f.mode}`).sort()).toEqual(s.failures.map((f) => `${f.id}:${f.mode}`).sort())
  })
  it('finds the active step from the failures; nothing for a part of a step', () => {
    const os = SIM_SCENARIOS.find((s) => s.id === 'os-patch')!
    expect(activeSimStep(stepFailures(os, 0), DEFAULT_CONFIG)).toEqual({ scenario: os, step: 0 })
    expect(activeSimStep(os.failures, DEFAULT_CONFIG)).toEqual({ scenario: os, step: os.steps!.length - 1 })
    expect(activeSimStep(stepFailures(os, 1).slice(1), DEFAULT_CONFIG)).toBeNull()
    const leaf = SIM_SCENARIOS.find((s) => s.id === 'leaf-single')!
    expect(activeSimStep(leaf.failures, DEFAULT_CONFIG)).toEqual({ scenario: leaf, step: null })
  })
})
