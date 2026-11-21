import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, KEYS, choicesFor } from '../src/config/config'
import { DUAL_PLANE_XDR, HGX_ONLY, NO_FABRIC, OEM_B300_ONLY, isValid, optionState, problems, withPatch } from '../src/config/rules'

const H100 = { platform: 'h100', build: 'dgx', fabric: 'ib-ndr', design: 'ndr-h100', topology: 'rail', planes: 'single', suCount: 4 } as const
const GB200 = { platform: 'gb200-nvl72', build: 'dgx', fabric: 'ib-ndr', design: 'gb200-rack', topology: 'rail', planes: 'single', suCount: 1 } as const

describe('the default configuration', () => {
  it('is valid', () => {
    expect(problems(DEFAULT_CONFIG)).toEqual([])
  })
  it('is 1 SU, full, with no spares, so it shows no site scale', () => {
    expect(DEFAULT_CONFIG.suCount).toBe(1)
    expect(DEFAULT_CONFIG.lastSuEmpty).toBe(0)
    expect(DEFAULT_CONFIG.spares).toBe(0)
  })
  it('has the 7 compute keys first, then the 31 new keys', () => {
    expect(KEYS).toHaveLength(38)
    expect(KEYS.slice(0, 7)).toEqual(['platform', 'build', 'fabric', 'design', 'topology', 'planes', 'suCount'])
  })
})

describe('optionState', () => {
  it('turns off dual plane on XDR with the RA reason', () => {
    expect(optionState(DEFAULT_CONFIG, 'planes', 'dual')).toEqual({ enabled: false, reason: DUAL_PLANE_XDR })
  })
  it('turns off the OEM build for the H100', () => {
    expect(optionState({ ...DEFAULT_CONFIG, ...H100 }, 'build', 'oem-hgx')).toEqual({ enabled: false, reason: OEM_B300_ONLY })
  })
  it('turns off top-of-rack for a rack with no fabric', () => {
    expect(optionState({ ...DEFAULT_CONFIG, ...GB200 }, 'topology', 'tor')).toEqual({ enabled: false, reason: NO_FABRIC })
  })
  it('refuses an SU count that has no RA row', () => {
    expect(optionState(DEFAULT_CONFIG, 'suCount', 3)).toEqual({ enabled: false, reason: 'The RA table has no row for 3 SU.' })
  })
  it('empties the last SU by whole racks', () => {
    expect(choicesFor(DEFAULT_CONFIG, 'lastSuEmpty').map((c) => c.value).slice(0, 3)).toEqual([0, 4, 8])
    expect(optionState(DEFAULT_CONFIG, 'lastSuEmpty', 2).enabled).toBe(false)
  })
  it('needs a UFM on InfiniBand and none on Spectrum-X', () => {
    expect(optionState(DEFAULT_CONFIG, 'ufm', 'none').enabled).toBe(false)
    const spx = withPatch(DEFAULT_CONFIG, { fabric: 'spectrum-x' })!
    expect(spx.ufm).toBe('none')
    expect(optionState(spx, 'ufm', 'ha').enabled).toBe(false)
  })
  it('keeps the NVL72 liquid-cooled and the DGX H100 air-cooled', () => {
    expect(optionState({ ...DEFAULT_CONFIG, ...GB200 }, 'cooling', 'air').enabled).toBe(false)
    expect(optionState({ ...DEFAULT_CONFIG, ...H100 }, 'cooling', 'liquid').enabled).toBe(false)
    expect(optionState(DEFAULT_CONFIG, 'cooling', 'liquid').enabled).toBe(true)
  })
  it('ties Rafay, the VMs, and the VIP to Kubernetes', () => {
    const slurm = withPatch(DEFAULT_CONFIG, { orchestration: 'slurm' })!
    expect(slurm.rafay).toBe('none')
    expect(slurm.vms).toBe('off')
    expect(slurm.lb).toBe('none')
    expect(optionState(slurm, 'rafay', 'self-hosted').enabled).toBe(false)
    const saas = withPatch(DEFAULT_CONFIG, { rafay: 'saas' })!
    expect(saas.lb).toBe('none')
  })
})

describe('withPatch', () => {
  it('repairs the switches after the patched one', () => {
    expect(withPatch(DEFAULT_CONFIG, { platform: 'h100' })).toMatchObject({ ...H100, lastSuEmpty: 0, cooling: 'air' })
    expect(withPatch(DEFAULT_CONFIG, { platform: 'gb200-nvl72' })).toMatchObject({ ...GB200, lastSuEmpty: 0, cooling: 'liquid', ufm: 'none' })
  })
  it('moves to Spectrum-X with dual plane and the 4 SU row', () => {
    expect(withPatch(DEFAULT_CONFIG, { fabric: 'spectrum-x' })).toMatchObject({ fabric: 'spectrum-x', design: 'b300-spx', planes: 'dual', suCount: 4, lastSuEmpty: 0 })
  })
  it('refuses a patched value that is not valid', () => {
    expect(withPatch(DEFAULT_CONFIG, { planes: 'dual' })).toBeNull()
    expect(withPatch(DEFAULT_CONFIG, { suCount: 3 })).toBeNull()
    expect(withPatch(DEFAULT_CONFIG, { lastSuEmpty: 2 })).toBeNull()
  })
  it('starts a new design with a full last SU, unless the patch sets it', () => {
    const half = withPatch(DEFAULT_CONFIG, { lastSuEmpty: 36 })!
    expect(withPatch(half, { platform: 'gb300-nvl72' })?.lastSuEmpty).toBe(0)
    expect(withPatch(half, { fabric: 'spectrum-x' })?.lastSuEmpty).toBe(0)
    expect(withPatch(half, { spares: 2 })?.lastSuEmpty).toBe(36)
    expect(withPatch(DEFAULT_CONFIG, { platform: 'gb300-nvl72', lastSuEmpty: 36 })?.lastSuEmpty).toBe(36)
  })
  it('keeps the new keys when the compute keys change', () => {
    const c = withPatch(DEFAULT_CONFIG, { cboxes: 8, storageFabric: 'infiniband', automation: 'netris' })!
    expect(withPatch(c, { platform: 'h100' })).toMatchObject({ cboxes: 8, storageFabric: 'infiniband', automation: 'netris' })
  })
})

describe('problems', () => {
  it('names each value that is not valid', () => {
    const bad = { ...DEFAULT_CONFIG, planes: 'dual', suCount: 3 } as const
    expect(problems(bad)).toHaveLength(2)
    expect(isValid(bad)).toBe(false)
  })
})

describe('the Enterprise RA', () => {
  it('takes the OEM HGX build only', () => {
    const spx = withPatch(DEFAULT_CONFIG, { fabric: 'spectrum-x' })!
    expect(optionState(spx, 'design', 'ent-b300')).toEqual({ enabled: false, reason: HGX_ONLY })
    expect(optionState({ ...spx, build: 'oem-hgx' }, 'design', 'ent-b300').enabled).toBe(true)
  })
})

describe('the overlay switches', () => {
  it('has generic defaults: 2 GPU tenants, a UAT tenant, half the nodes allocated, one node in each problem state, two phases, no ITSM integration', () => {
    expect(DEFAULT_CONFIG).toMatchObject({ tenants: 2, uat: 'on', allocated: 50, degraded: 1, quarantined: 1, maintenance: 1, phases: 'two', itsm: 'off' })
  })
  it('accepts every value of the new switches', () => {
    for (const key of ['tenants', 'uat', 'allocated', 'degraded', 'quarantined', 'maintenance', 'phases', 'itsm'] as const) {
      for (const c of choicesFor(DEFAULT_CONFIG, key)) expect(optionState(DEFAULT_CONFIG, key, c.value).enabled, `${key}=${c.value}`).toBe(true)
    }
  })
})
