import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { computeTrace } from '../src/routing/compute'
import { SCENARIOS } from '../src/routing/scenarios'

describe('the scenario list', () => {
  it('has one row for each row of the spec table, GPU rows first, with unique ids', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'same-node',
      'same-rail',
      'cross-rail',
      'pxn',
      'cross-su',
      'dual-plane',
      'nvl72-rack',
      'nvl72-fabric',
      'gpu-vast-gds',
      'gpu-vast-bounce',
      'user-ui',
      'cluster-mtls',
      'operator-bmc',
      'operator-ztka',
      'break-glass',
      'telemetry-itsm',
      'telemetry-siem',
      'control-sm',
      'control-nvlink',
    ])
    expect(SCENARIOS.filter((s) => s.group === 'factory').every((s) => s.path !== null && s.dst === null)).toBe(true)
  })
  it.each(SCENARIOS)('$id: its configuration is valid, and its trace has the kind of the row', (s) => {
    const config = withPatch(DEFAULT_CONFIG, s.patch)
    expect(config).not.toBeNull()
    const r = computeTrace(config!, { src: s.src, dst: s.dst, options: s.options, path: s.path })
    expect(r?.ok && r.trace.kind).toBe(s.kind)
  })
  it('sets GDS for the two storage rows', () => {
    expect(SCENARIOS.find((s) => s.id === 'gpu-vast-bounce')?.patch).toEqual({ gds: 'off' })
  })
})
