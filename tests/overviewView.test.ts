import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { generateOverview } from '../src/topology/overview'
import { overviewElements } from '../src/views/overviewView'

const els = (patch: Partial<Config>) => overviewElements(generateOverview(withPatch(DEFAULT_CONFIG, patch)!))
const ALL: Partial<Config> = {
  storageFabric: 'ethernet',
  automation: 'netris',
  ceph: 'on',
  linstor: 'on',
  clusterManager: 'bcm',
  orchestration: 'both',
  spares: 8,
  cooling: 'liquid',
}

describe('overviewElements', () => {
  it('has 45 elements for the default factory', () => {
    expect(els({})).toHaveLength(45)
  })
  it.each([{}, ALL, { rafay: 'saas' }, { platform: 'gb200-nvl72' }] as Partial<Config>[])('gives each block its own position (%o)', (patch) => {
    const spots = els(patch)
      .filter((e) => e.group === 'nodes')
      .map((n) => `${n.position!.x},${n.position!.y}`)
    expect(new Set(spots).size).toBe(spots.length)
  })
  it('labels each link with what flows on it, and classes it by network', () => {
    for (const e of els(ALL).filter((x) => x.group === 'edges')) {
      expect(e.data.label).toBeTruthy()
      expect(e.classes).toContain(`ov ${e.data.network}`)
    }
  })
  it('keeps the role of each block in its data', () => {
    const vast = els({}).find((e) => e.data.id === 'blk-vast')!
    expect(vast.data.role).toBe('vast')
    expect(vast.classes).toBe('block vast')
  })
  it('gives each telemetry block its own position', () => {
    const els = overviewElements(generateOverview(DEFAULT_CONFIG, { telemetry: true }))
    const spots = els.filter((e) => e.group === 'nodes').map((n) => `${n.position!.x},${n.position!.y}`)
    expect(new Set(spots).size).toBe(spots.length)
  })
})
