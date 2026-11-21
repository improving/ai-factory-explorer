import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { NODE_STATES, assignments, stateCounts, tenantNames } from '../src/topology/assign'
import { generateFabric } from '../src/topology/fabric'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!
const servers = (c: Config) => generateFabric(c).nodes.filter((n) => n.kind === 'server').map((n) => n.id)

describe('assignments', () => {
  it('gives every server one tenant, one state, and one phase', () => {
    const a = assignments(DEFAULT_CONFIG)
    expect([...a.keys()]).toEqual(servers(DEFAULT_CONFIG))
  })
  it('gives the first rack to the UAT tenant and splits the rest between the GPU tenants', () => {
    const a = assignments(DEFAULT_CONFIG)
    expect(a.get('su1-n01')?.tenant).toBe('UAT')
    expect(a.get('su1-n04')?.tenant).toBe('UAT')
    expect(a.get('su1-n05')?.tenant).toBe('Tenant 1')
    expect(a.get('su1-n72')?.tenant).toBe('Tenant 2')
    expect(tenantNames(DEFAULT_CONFIG)).toEqual(['Tenant 1', 'Tenant 2', 'UAT'])
    expect(assignments(cfg({ uat: 'off' })).get('su1-n01')?.tenant).toBe('Tenant 1')
  })
  it('puts the problem states at the end, and allocates the given share of the other nodes', () => {
    const a = assignments(cfg({ degraded: 2, quarantined: 1, maintenance: 1 }))
    expect(a.get('su1-n72')?.state).toBe('degraded')
    expect(a.get('su1-n71')?.state).toBe('degraded')
    expect(a.get('su1-n70')?.state).toBe('quarantined')
    expect(a.get('su1-n69')?.state).toBe('maintenance')
    expect(stateCounts(cfg({ degraded: 2, quarantined: 1, maintenance: 1 }))).toEqual({ available: 34, allocated: 34, degraded: 2, quarantined: 1, maintenance: 1 })
  })
  it('never gives one tray two states when the counts are larger than the trays', () => {
    const c = cfg({ platform: 'gb200-nvl72', degraded: 8, quarantined: 8, maintenance: 8 })
    const counts = stateCounts(c)
    expect(NODE_STATES.reduce((sum, s) => sum + counts[s], 0)).toBe(18)
    expect(counts).toMatchObject({ degraded: 8, quarantined: 8, maintenance: 2 })
  })
  it('puts the first half of the racks in phase 1', () => {
    const a = assignments(DEFAULT_CONFIG) // 18 racks: racks 1-9 in phase 1
    expect(a.get('su1-n36')?.phase).toBe(1)
    expect(a.get('su1-n37')?.phase).toBe(2)
    expect(assignments(cfg({ phases: 'one' })).get('su1-n72')?.phase).toBe(1)
  })
  it('follows a config change, and gives each SU one phase from 2 SU', () => {
    const big = cfg({ suCount: 8 })
    expect(assignments(big).get('su8-n72')?.phase).toBe(2)
    expect(assignments(big).get('su4-n72')?.phase).toBe(1)
    expect(assignments(big).get('su5-n01')?.phase).toBe(2)
    expect(assignments(cfg({ platform: 'gb200-nvl72' })).has('su1-n72')).toBe(false)
  })
})

describe('one NVL72 rack (18 trays, 1 SU)', () => {
  const gb = cfg({ platform: 'gb200-nvl72' })
  it('leaves trays for each GPU tenant: the UAT tenant takes no more than an equal share', () => {
    const tenants = [...assignments(gb).values()].map((a) => a.tenant)
    for (const t of tenantNames(gb)) expect(tenants.filter((x) => x === t).length, t).toBeGreaterThan(0)
    expect(tenants.filter((x) => x === 'UAT')).toHaveLength(6)
  })
  it('shows two phases: the first half of the trays is phase 1', () => {
    const a = assignments(gb)
    expect(a.get('su1-n09')?.phase).toBe(1)
    expect(a.get('su1-n10')?.phase).toBe(2)
  })
})
