import { describe, expect, it } from 'vitest'
import { CATALOG } from '../src/catalog'
import { FACTORY_FACTS, HOP_CHECKS, LINK_LABEL, PATH_FACTS, VIRTUAL_PARTS } from '../src/catalog/paths'

describe('the path facts', () => {
  it('gives each link kind a label and at least one check command', () => {
    for (const kind of ['nvlink', 'pcie', 'infiniband', 'ethernet'] as const) {
      expect(LINK_LABEL[kind]).toBeTruthy()
      expect(HOP_CHECKS[kind].length, kind).toBeGreaterThan(0)
    }
    expect(HOP_CHECKS.infiniband.map((c) => c.label)).toContain('perfquery -x')
    expect(HOP_CHECKS.ethernet.map((c) => c.label)).toContain('ethtool -S <nic>')
  })
  it('marks the equal-cost spines as assumed, and the PCIe bandwidth as not sourced', () => {
    expect(PATH_FACTS.ecmp.status).toBe('assumed')
    expect(PATH_FACTS.pcieBandwidth.status).toBe('not-sourced')
    expect(PATH_FACTS.pxnDefault.value).toMatch(/default is 0/)
  })
  it('is in the catalog tree, so the source test checks it', () => {
    expect(CATALOG).toHaveProperty('paths')
    expect(CATALOG).toHaveProperty('hopChecks')
  })
})

describe('the facts of the factory paths', () => {
  it('gives each new link kind a label and a check', () => {
    for (const kind of ['c2c', 'ip', 'mad', 'software', 'nvmeof'] as const) {
      expect(LINK_LABEL[kind]).toBeTruthy()
      expect(HOP_CHECKS[kind].length, kind).toBeGreaterThan(0)
    }
  })
  it('has the path-only parts, each with a source', () => {
    expect(Object.keys(VIRTUAL_PARTS)).toEqual(['path-user', 'path-operator', 'path-pam', 'path-breakglass', 'path-cnode', 'path-dnode'])
    for (const v of Object.values(VIRTUAL_PARTS)) expect(v.fact.source).toBeTruthy()
  })
  it('marks the target of the break-glass path as assumed, and gives the two load balancers of the open decision', () => {
    expect(FACTORY_FACTS.breakGlassTarget.status).toBe('assumed')
    expect(FACTORY_FACTS.lbOpen.value).toMatch(/the firewall at L4, or HAProxy or Nginx on the control nodes/)
  })
  it('is in the catalog tree, so the source test checks it', () => {
    expect(CATALOG).toHaveProperty('factoryFacts')
    expect(CATALOG).toHaveProperty('factoryChecks')
    expect(CATALOG).toHaveProperty('virtualParts')
  })
})
