import { describe, expect, it } from 'vitest'
import { CATALOG } from '../src/catalog'
import { COMPONENT_DOCS } from '../src/catalog/component-docs'
import { DELL_B300, DGX_B300, DGX_H200, GB300_TRAY } from '../src/catalog/platforms'
import { collect, factProblem, sourceProblem } from './support/sources'

describe('the catalog sources', () => {
  const { facts, sources } = collect(CATALOG)

  it('has facts to check', () => {
    expect(facts.length).toBeGreaterThan(20)
    expect(sources.length).toBeGreaterThan(30)
  })
  it.each(facts)('fact %s is well formed and its source exists', (_path, fact) => {
    expect(factProblem(fact)).toBeNull()
  })
  it.each(sources)('reference %s has a source that exists', (_path, source) => {
    expect(sourceProblem(source)).toBeNull()
  })
})


describe('DGX B300', () => {
  it('has one compute NIC for each GPU', () => {
    expect(DGX_B300.computeNic.count.value).toBe(DGX_B300.gpusPerServer.value)
  })
  it('puts each GPU on exactly one NUMA node', () => {
    expect(DGX_B300.numaGpus.value.flat().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

describe('the node parts of each platform', () => {
  it('gives the DGX B300 its PSUs, memory, and drives from the user guide', () => {
    expect(DGX_B300.psus).toMatchObject({ value: '12 × 3.3 kW, N+N redundancy', status: 'confirmed' })
    expect(DGX_B300.dimms).toMatchObject({ value: 16, status: 'derived' })
    expect(DGX_B300.nvmeData.value).toBe('8 × 3.84 TB E1.S')
    expect(DGX_B300.cpus).toMatchObject({ value: 2, status: 'confirmed' })
    expect(DGX_B300.cpuModel.value).toBe('Intel Xeon Platinum 6776P')
  })
  it('keeps the gaps: no DGX fan count, no Dell memory or drives', () => {
    expect(DGX_B300.fans.status).toBe('not-sourced')
    expect(DGX_H200.fans.status).toBe('not-sourced')
    expect(DELL_B300.fans.status).toBe('confirmed')
    expect(DELL_B300.memory.status).toBe('not-sourced')
    expect(DELL_B300.nvmeBoot.status).toBe('not-sourced')
  })
  it('marks the GB300 tray memory as assumed (the sources disagree)', () => {
    expect(GB300_TRAY.memory.status).toBe('assumed')
    expect(GB300_TRAY.dimms.value).toBeNull()
  })
})

describe('component docs', () => {
  it('has a summary for each kind', () => {
    for (const doc of Object.values(COMPONENT_DOCS)) expect(doc.summary.length).toBeGreaterThan(10)
  })
})

describe('facts from the Mokka mock profile', () => {
  // handson/profiles/b300.yaml is a hand-made mock (its header says so); it is not a primary source.
  it('are never shown as confirmed', () => {
    const mock = collect(CATALOG).facts.filter(([, f]) => f.source?.startsWith('handson/profiles/'))
    expect(mock.length).toBeGreaterThan(0)
    for (const [path, f] of mock) expect(f.status, path).not.toBe('confirmed')
  })
})
import { DESIGNS } from '../src/catalog/designs'
import { NVL72 } from '../src/catalog/nvl72'
import { PLATFORMS, platformFor } from '../src/catalog/platforms'

describe.each(PLATFORMS)('platform $key', (p) => {
  it('has one compute NIC and one compute port for each GPU', () => {
    expect(p.computeNic.count.value).toBe(p.gpusPerServer.value)
    expect(p.computePorts.value).toHaveLength(p.gpusPerServer.value)
  })
  it('puts each GPU on exactly one NUMA node', () => {
    const all = p.numaGpus.value.flat().sort((a, b) => a - b)
    expect(all).toEqual(Array.from({ length: p.gpusPerServer.value }, (_, i) => i))
  })
  it('has a design that uses it', () => {
    expect(DESIGNS.some((d) => d.platforms.includes(p.family))).toBe(true)
  })
})

describe('platformFor', () => {
  it('finds the Dell build of the B300', () => {
    expect(platformFor({ platform: 'b300', build: 'oem-hgx' }).name).toMatch(/Dell/)
  })
  it('refuses a build that does not exist', () => {
    expect(() => platformFor({ platform: 'h100', build: 'oem-hgx' })).toThrow(/No platform/)
  })
  it('shows the GB300 BlueField-3 conflict', () => {
    expect(platformFor({ platform: 'gb300-nvl72', build: 'dgx' }).frontNic.model.note).toMatch(/user guide/)
  })
})

describe('the NVL72 rack', () => {
  it('has 18 compute trays, 9 switch trays, and 18 NVSwitch chips', () => {
    expect(NVL72.computeTrays.value).toBe(18)
    expect(NVL72.switchTrays.value * NVL72.chipsPerSwitchTray.value).toBe(18)
  })
})

describe('the NVLink link speed', () => {
  it('is given in each direction on every platform that has it', () => {
    for (const p of PLATFORMS) if (p.nvlinkLinkSpeed.value !== null) expect(p.nvlinkLinkSpeed.unit, p.key).toBe('GB/s in each direction')
  })
})
