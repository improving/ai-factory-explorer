import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateFabric } from '../src/topology/fabric'
import { ALL_COLOR_CLASSES, colorClass, hiddenNetworks, legendOf } from '../src/views/overlays'
import { lifecycleClass, lifecycleOf } from '../src/catalog/lifecycle'
import type { HostAt } from '../src/telemetry/replay'
import { fabricElements } from '../src/views/fabricView'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!

describe('colorClass', () => {
  it('colours a part by its owner', () => {
    expect(colorClass(DEFAULT_CONFIG, 'owner', { id: 'su1-n01', kind: 'server' })).toBe('ov-own-partner')
    expect(colorClass(DEFAULT_CONFIG, 'owner', { id: 'blk-ups', kind: 'block', role: 'ups' })).toBe('ov-own-facility')
    expect(colorClass(DEFAULT_CONFIG, 'owner', { id: 'su1-cdu', kind: 'cdu' })).toBe('ov-own-facility')
  })
  it('colours only the servers and trays by tenant, state, and phase', () => {
    expect(colorClass(DEFAULT_CONFIG, 'tenant', { id: 'su1-n01', kind: 'server' })).toBe('ov-ten-uat')
    expect(colorClass(DEFAULT_CONFIG, 'tenant', { id: 'su1-n05', kind: 'server' })).toBe('ov-ten-1')
    expect(colorClass(DEFAULT_CONFIG, 'state', { id: 'su1-n72', kind: 'server' })).toBe('ov-st-degraded')
    expect(colorClass(DEFAULT_CONFIG, 'phase', { id: 'su1-n72', kind: 'server' })).toBe('ov-ph-2')
    expect(colorClass(DEFAULT_CONFIG, 'tenant', { id: 'su1-leaf-r0', kind: 'leaf' })).toBeNull()
    expect(colorClass(DEFAULT_CONFIG, 'none', { id: 'su1-n01', kind: 'server' })).toBeNull()
  })
  it('gives no class to a server that the configuration does not have', () => {
    expect(colorClass(cfg({ lastSuEmpty: 36 }), 'state', { id: 'su1-n72', kind: 'server' })).toBeNull()
    expect(colorClass(cfg({ suCount: 8 }), 'state', { id: 'su8-n72', kind: 'server' })).not.toBeNull()
    expect(colorClass(DEFAULT_CONFIG, 'state', { id: 'su8-n72', kind: 'server' })).toBeNull() // after 8 SU → 1 SU
  })
  it('keeps the light fill of a compound parent in the owner overlay, and fills the spare pool in the state overlay', () => {
    expect(colorClass(DEFAULT_CONFIG, 'owner', { id: 'su1', kind: 'su' })).toBeNull()
    expect(colorClass(DEFAULT_CONFIG, 'owner', { id: 'su1-k1', kind: 'rack' })).toBeNull()
    expect(colorClass(cfg({ spares: 4 }), 'state', { id: 'blk-spares', kind: 'block', role: 'spares' })).toBe('ov-st-spare')
  })
  it('colours a host by its lifecycle state and by its health verdict', () => {
    expect(colorClass(DEFAULT_CONFIG, 'lifecycle', { id: 'su1-n72', kind: 'server' })).toBe('ov-lc-available')
    expect(colorClass(DEFAULT_CONFIG, 'lifecycle', { id: 'su1-n71', kind: 'server' })).toBe('ov-lc-quarantined')
    expect(colorClass(DEFAULT_CONFIG, 'lifecycle', { id: 'su1-n70', kind: 'server' })).toBe('ov-lc-in-repair')
    expect(colorClass(DEFAULT_CONFIG, 'health', { id: 'su1-n71', kind: 'server' })).toBe('ov-hl-critical')
    expect(colorClass(DEFAULT_CONFIG, 'health', { id: 'su1-n70', kind: 'server' })).toBe('ov-hl-none')
    expect(colorClass(DEFAULT_CONFIG, 'health', { id: 'su1-leaf-r0', kind: 'leaf' })).toBeNull()
  })
  it('lists every class that it can give', () => {
    for (const c of ['ov-own-partner', 'ov-ten-uat', 'ov-ten-8', 'ov-st-maintenance', 'ov-ph-2', 'ov-lc-quarantined', 'ov-hl-critical']) expect(ALL_COLOR_CLASSES.split(' ')).toContain(c)
  })
})

describe('the legend', () => {
  it('gives the node states with their counts, which add up to the servers', () => {
    const items = legendOf(DEFAULT_CONFIG, 'state')
    expect(items.map((i) => i.label)).toEqual(['available', 'allocated', 'degraded', 'quarantined', 'maintenance', 'spare (outside the fabric)'])
    expect(items.reduce((s, i) => s + (i.count ?? 0), 0)).toBe(72)
    expect(legendOf(cfg({ spares: 4 }), 'state').at(-1)?.count).toBe(4)
  })
  it('lists the tenants with GPUs and, with no count, the tenants with no GPU', () => {
    const items = legendOf(DEFAULT_CONFIG, 'tenant')
    expect(items.map((i) => i.label)).toEqual(['Tenant 1', 'Tenant 2', 'UAT', 'NOC (no GPU)', 'Management (no GPU)', 'Storage (no GPU)'])
    expect(items.find((i) => i.label === 'UAT')?.count).toBe(4)
  })
  it('gives the lifecycle states with their counts, which add up to the servers', () => {
    const items = legendOf(DEFAULT_CONFIG, 'lifecycle')
    expect(items.map((i) => i.label)).toEqual(['Available', 'In use', 'Quarantined', 'In repair or maintenance', 'spare (outside the fabric)'])
    expect(items.reduce((s, i) => s + (i.count ?? 0), 0)).toBe(72)
    expect(items.find((i) => i.label === 'Quarantined')?.count).toBe(1)
  })
  it('gives the severities with their counts, the hosts in maintenance, and the spare pool', () => {
    const items = legendOf(DEFAULT_CONFIG, 'health')
    expect(items.map((i) => i.label)).toEqual(['Pass', 'Info', 'Warning', 'Critical', 'Unknown', 'in maintenance (no verdict)', 'spare (outside the fabric)'])
    expect(items.reduce((s, i) => s + (i.count ?? 0), 0)).toBe(72)
    expect(items.find((i) => i.label === 'Critical')?.count).toBe(1)
    expect(items.find((i) => i.label === 'Unknown')?.count).toBe(0)
  })
  it('gives only the owners that colour a part', () => {
    const cls = legendOf(DEFAULT_CONFIG, 'owner').map((i) => i.cls)
    expect(cls).toContain('ov-own-enterprise')
    expect(cls).not.toContain('ov-own-oem')
  })
})

describe('the layer filter', () => {
  it('hides the networks of a layer', () => {
    expect([...hiddenNetworks(['in-band', 'nvlink'])].sort()).toEqual(['c2c', 'converged', 'in-band', 'management', 'north-south', 'nvlink'])
  })
  it('finds the compute cables and bundles of the fabric view, with the groups closed and open', () => {
    for (const open of [new Set<number>(), new Set([1])]) {
      const edges = fabricElements(generateFabric(DEFAULT_CONFIG), open).filter((e) => e.group === 'edges')
      expect(edges.length).toBeGreaterThan(0)
      for (const e of edges) expect(e.data.network, e.data.id).toBe('compute')
    }
  })
  it('hides the memory links with PCIe, and the node services on their own', () => {
    expect([...hiddenNetworks(['pcie'])].sort()).toEqual(['memory', 'pcie'])
    expect([...hiddenNetworks(['services'])]).toEqual(['service'])
  })
})

describe('the colour overlay at the cursor of the time view', () => {
  const at = (patch: Partial<HostAt>): Map<string, HostAt> => new Map([['su1-n01', { state: 'available', xids: 0, flaps: 0, throttles: 0, ...patch }]])

  it('colours a host by its state at the cursor, not by the state of today', () => {
    expect(colorClass(DEFAULT_CONFIG, 'state', { id: 'su1-n01', kind: 'server' })).toBe('ov-st-allocated')
    expect(colorClass(DEFAULT_CONFIG, 'state', { id: 'su1-n01', kind: 'server' }, at({ state: 'maintenance' }))).toBe('ov-st-maintenance')
    expect(colorClass(DEFAULT_CONFIG, 'lifecycle', { id: 'su1-n01', kind: 'server' }, at({ state: 'maintenance' }))).toBe(lifecycleClass(lifecycleOf('maintenance')))
    expect(colorClass(DEFAULT_CONFIG, 'health', { id: 'su1-n01', kind: 'server' }, at({ state: 'maintenance' }))).toBe('ov-hl-none')
    // The same verdict as the host that the configuration quarantines.
    expect(colorClass(DEFAULT_CONFIG, 'health', { id: 'su1-n01', kind: 'server' }, at({ state: 'quarantined' }))).toBe(colorClass(DEFAULT_CONFIG, 'health', { id: 'su1-n71', kind: 'server' }))
  })

  it('keeps the tenant and the phase of the configuration', () => {
    expect(colorClass(DEFAULT_CONFIG, 'tenant', { id: 'su1-n01', kind: 'server' }, at({ state: 'maintenance' }))).toBe('ov-ten-uat')
    expect(colorClass(DEFAULT_CONFIG, 'phase', { id: 'su1-n01', kind: 'server' }, at({ state: 'maintenance' }))).toBe('ov-ph-1')
  })

  it('counts the legend at the cursor', () => {
    const today = legendOf(DEFAULT_CONFIG, 'state').find((i) => i.cls === 'ov-st-maintenance')!
    expect(today.count).toBe(1) // the configuration puts one host in maintenance
    const moved = new Map([
      ['su1-n01', { state: 'maintenance', xids: 0, flaps: 0, throttles: 0 }],
      ['su1-n72', { state: 'available', xids: 0, flaps: 0, throttles: 0 }],
    ]) as Map<string, HostAt>
    const counts = legendOf(DEFAULT_CONFIG, 'state', moved)
    expect(counts.find((i) => i.cls === 'ov-st-maintenance')!.count).toBe(2) // su1-n01 at the cursor, su1-n70 of the configuration
    expect(counts.find((i) => i.cls === 'ov-st-degraded')!.count).toBe(0) // su1-n72 is available at the cursor
    expect(legendOf(DEFAULT_CONFIG, 'state').find((i) => i.cls === 'ov-st-degraded')!.count).toBe(1)
  })

  it('gives the same colours without a cursor', () => {
    expect(colorClass(DEFAULT_CONFIG, 'state', { id: 'su1-n72', kind: 'server' }, null)).toBe('ov-st-degraded')
    expect(legendOf(DEFAULT_CONFIG, 'state', null)).toEqual(legendOf(DEFAULT_CONFIG, 'state'))
  })
})
