import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { downIds, failKind, validFailure } from '../src/simulate/failable'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!

describe('failKind', () => {
  it('finds the kind of each failable part of a DGX B300 configuration', () => {
    const c = cfg({ cooling: 'liquid' })
    expect(failKind(c, 'su1-n05/gpu2')).toBe('gpu')
    expect(failKind(c, 'su1-n05/nvswitch1')).toBe('nvswitch')
    expect(failKind(c, 'su1-n05/svc-fabric-manager')).toBe('fabric-manager')
    expect(failKind(c, 'su1-n05/svc-nvlsm')).toBe('nvlsm')
    expect(failKind(c, 'su1-n05/svc-device-plugin')).toBe('device-plugin')
    expect(failKind(c, 'su1-n05/nic3')).toBe('nic')
    expect(failKind(c, 'su1-n10~r5')).toBe('cable')
    expect(failKind(c, 'su1-leaf-r3')).toBe('leaf')
    expect(failKind(c, 'spine-01')).toBe('spine')
    expect(failKind(c, 'blk-ufm')).toBe('ufm')
    expect(failKind(c, 'blk-firewall')).toBe('firewall')
    expect(failKind(c, 'su1-n05/psu')).toBe('psu')
    expect(failKind(c, 'su1-cdu')).toBe('cdu')
    expect(failKind(c, 'su1-k1-pdu1')).toBe('pdu')
  })
  it('finds the NVL72 parts', () => {
    const gb = cfg({ platform: 'gb200-nvl72' })
    expect(failKind(gb, 'su1-k1-sw3/chip1')).toBe('nvswitch')
    expect(failKind(gb, 'su1-k1-sw3')).toBe('switch-tray')
    expect(failKind(gb, 'su1-n05/imex')).toBe('imex')
  })
  it('refuses a part that the configuration does not have, or that cannot fail', () => {
    expect(failKind(DEFAULT_CONFIG, 'su2-n05/gpu2')).toBeNull()
    expect(failKind(DEFAULT_CONFIG, 'su1-n05/gpu8')).toBeNull()
    expect(failKind(cfg({ platform: 'h100' }), 'su1-n05/svc-nvlsm')).toBeNull()
    expect(failKind(DEFAULT_CONFIG, 'su1-cdu')).toBeNull() // air cooling: no CDU
    expect(failKind(cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 }), 'blk-ufm')).toBeNull()
    expect(failKind(DEFAULT_CONFIG, 'blk-internet')).toBeNull()
    expect(failKind(DEFAULT_CONFIG, 'su1-n05')).toBeNull()
  })
})

describe('the failures', () => {
  it('accepts only a mode of the kind', () => {
    expect(validFailure(DEFAULT_CONFIG, { id: 'su1-n05/gpu2', mode: 'xid48' })).toBe(true)
    expect(validFailure(DEFAULT_CONFIG, { id: 'su1-n05/gpu2', mode: 'down' })).toBe(false)
    expect(validFailure(DEFAULT_CONFIG, { id: 'blk-ufm', mode: 'both' })).toBe(true)
  })
  it('keeps out of the down set a degraded link, the UFM failover, and one VAST CNode', () => {
    const d = downIds([
      { id: 'spine-01', mode: 'down' },
      { id: 'su1-n10~r5', mode: 'degraded' },
      { id: 'blk-ufm', mode: 'active' },
      { id: 'blk-vast', mode: 'cnode' },
      { id: 'su1-n05/gpu2', mode: 'xid48' },
    ])
    expect([...d].sort()).toEqual(['spine-01', 'su1-n05/gpu2'])
  })
})

describe('the fixes of the final review (failable)', () => {
  it('refuses an id that is not the canonical id of a part', () => {
    expect(failKind(DEFAULT_CONFIG, 'su1-n05/gpu01')).toBeNull()
    expect(failKind(DEFAULT_CONFIG, 'su01-n05/gpu1')).toBeNull()
    const gb = cfg({ platform: 'gb200-nvl72' })
    expect(failKind(gb, 'su1-k1-sw42')).toBeNull()
    expect(failKind(gb, 'su1-k1-sw01')).toBeNull()
    expect(failKind(gb, 'su1-k1-sw1/chip42')).toBeNull()
  })
  it('offers no standby failover with a single UFM unit', () => {
    const single = cfg({ ufm: 'single' })
    expect(validFailure(single, { id: 'blk-ufm', mode: 'active' })).toBe(false)
    expect(validFailure(single, { id: 'blk-ufm', mode: 'down' })).toBe(true)
    expect(validFailure(DEFAULT_CONFIG, { id: 'blk-ufm', mode: 'down' })).toBe(false)
  })
})

describe('the modes of the interview scenarios', () => {
  it('accepts the new modes on their parts, and keeps a slow part in service', () => {
    const c = DEFAULT_CONFIG
    const roce = cfg({ storageFabric: 'ethernet' }) // the default storage fabric is converged: no storage-net block
    expect(validFailure(c, { id: 'su1-n05/gpu2', mode: 'xid64' })).toBe(true)
    expect(validFailure(c, { id: 'su1-n05/gpu2', mode: 'degraded' })).toBe(true)
    expect(validFailure(roce, { id: 'blk-storage-net', mode: 'degraded' })).toBe(true)
    expect(validFailure(c, { id: 'blk-storage-net', mode: 'degraded' })).toBe(false)
    expect(validFailure(c, { id: 'blk-vast', mode: 'degraded' })).toBe(true)
    expect(validFailure(c, { id: 'su1-n05/nic2', mode: 'xid64' })).toBe(false)
    const ids = downIds([
      { id: 'su1-n05/gpu2', mode: 'xid64' },
      { id: 'su1-n06/gpu1', mode: 'degraded' },
      { id: 'blk-vast', mode: 'degraded' },
    ])
    expect([...ids]).toEqual(['su1-n05/gpu2'])
  })
})
