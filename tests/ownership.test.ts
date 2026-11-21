import { describe, expect, it } from 'vitest'
import { CATALOG } from '../src/catalog'
import { SITE_REQUIREMENTS } from '../src/catalog/fact'
import { BLOCK_ROLES } from '../src/catalog/factory'
import { OWNERS, TOOL_LAYERS, escalationOf, layersOf, ownerOf } from '../src/catalog/ownership'
import { DEFAULT_CONFIG } from '../src/config/config'
import { withPatch } from '../src/config/rules'

describe('ownerOf', () => {
  it('gives the cluster parts to the partner, the building to the facility team, and the edge to the enterprise network', () => {
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'server' }).id).toBe('partner')
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'leaf' }).id).toBe('partner')
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'block', role: 'ups' }).id).toBe('facility')
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'block', role: 'dns' }).id).toBe('enterprise')
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'block', role: 'rafay-saas' }).id).toBe('rafay')
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'block', role: 'itsm' }).id).toBe('customer-it')
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'rack', rackRole: 'cdu' }).id).toBe('facility')
  })
  it('gives the VIP to the owner of the device that holds it', () => {
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'block', role: 'lb' }).id).toBe('enterprise') // the firewall at L4
    expect(ownerOf(withPatch(DEFAULT_CONFIG, { lb: 'haproxy' })!, { kind: 'block', role: 'lb' }).id).toBe('partner')
  })
  it('marks the open VAST decision as assumed', () => {
    expect(ownerOf(DEFAULT_CONFIG, { kind: 'block', role: 'vast' })).toMatchObject({ id: 'vast', fact: { status: 'assumed' } })
  })
  it('has an owner for every block role', () => {
    for (const role of BLOCK_ROLES) expect(OWNERS[ownerOf(DEFAULT_CONFIG, { kind: 'block', role }).id], role).toBeDefined()
  })
  it('names the OEM escalation for hardware only', () => {
    expect(escalationOf({ kind: 'gpu' })?.value).toMatch(/OEM/)
    expect(escalationOf({ kind: 'block', role: 'dns' })).toBeNull()
  })
  it('names the OEM escalation for the PSUs, the fans, and the DIMMs', () => {
    for (const kind of ['psu', 'fan', 'dimm'] as const) expect(escalationOf({ kind })?.value, kind).toMatch(/OEM/)
  })
})

describe('layersOf', () => {
  it('puts a leaf on the layer of its fabric', () => {
    expect(layersOf(DEFAULT_CONFIG, { kind: 'leaf' })).toEqual(['infiniband'])
    expect(layersOf(withPatch(DEFAULT_CONFIG, { fabric: 'spectrum-x', planes: 'dual', suCount: 4 })!, { kind: 'leaf' })).toEqual(['ethernet'])
  })
  it('puts the control-plane VIP on the layer of the device that holds it', () => {
    expect(layersOf(DEFAULT_CONFIG, { kind: 'block', role: 'lb' })).toEqual(['edge']) // the firewall at L4
    expect(layersOf(withPatch(DEFAULT_CONFIG, { lb: 'haproxy' })!, { kind: 'block', role: 'lb' })).toEqual(['kubernetes'])
  })
  it('puts a server on the hardware, GPU, and cluster layers', () => {
    expect(layersOf(DEFAULT_CONFIG, { kind: 'server' })).toEqual(['hardware', 'gpu', 'cluster'])
  })
  it('marks the operator levels of the site requirements as proposed', () => {
    const fromTable = Object.values(TOOL_LAYERS).filter((l) => l.operatedBy.status === 'confirmed' && l.operatedBy.source === SITE_REQUIREMENTS)
    expect(fromTable).toHaveLength(8)
    for (const layer of fromTable) expect(layer.operatedBy.note ?? '', layer.label).toMatch(/proposed/)
  })
})

describe('the catalog tree', () => {
  it('has the owners and the tool layers, so the source test checks them', () => {
    expect(CATALOG).toHaveProperty('owners')
    expect(CATALOG).toHaveProperty('toolLayers')
  })
})
