import { describe, expect, it } from 'vitest'
import { DELL_B300, DGX_B200, DGX_B300, DGX_H100, GB200_TRAY } from '../src/catalog/platforms'
import { NODE_SERVICES, serviceOf, servicesFor } from '../src/catalog/services'

describe('the node services', () => {
  it('gives NVLSM to B200 and B300 only, and Fabric Manager to every HGX server', () => {
    expect(servicesFor(DGX_B300)).toEqual(['driver', 'fabric-manager', 'nvlsm', 'container-toolkit', 'device-plugin', 'dcgm-exporter', 'mig-manager'])
    expect(servicesFor(DELL_B300)).toContain('nvlsm')
    expect(servicesFor(DGX_B200)).toContain('nvlsm')
    expect(servicesFor(DGX_H100)).toEqual(['driver', 'fabric-manager', 'container-toolkit', 'device-plugin', 'dcgm-exporter', 'mig-manager'])
  })
  it('gives IMEX, not Fabric Manager, to an NVL72 compute tray', () => {
    expect(servicesFor(GB200_TRAY)).toEqual(['driver', 'imex', 'container-toolkit', 'device-plugin', 'dcgm-exporter', 'mig-manager'])
  })
  it('finds the service of a part id', () => {
    expect(serviceOf('su1-n05/svc-fabric-manager')?.label).toBe('Fabric Manager')
    expect(serviceOf('su1-n05/svc-warp')).toBeNull()
    expect(serviceOf('su1-n05/gpu0')).toBeNull()
  })
  it('cites a source for each service', () => {
    for (const s of Object.values(NODE_SERVICES)) expect(s.fact.source, s.id).toMatch(/^https:\/\//)
  })
})
