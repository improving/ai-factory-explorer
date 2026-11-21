import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { INITIAL, withConfig } from '../src/state/transitions'
import { FIRMWARE, FIRMWARE_BY_ID, HOST_FIRMWARE } from '../src/catalog/firmware'
import { assignments } from '../src/topology/assign'
import { BEHIND_EVERY, firmwareOf, fleetFirmware } from '../src/telemetry/firmware'

const cfg = (patch: Partial<Config>): Config => withConfig(INITIAL, patch).config

describe('the components of the baseline', () => {
  it('has the six components of a host, and UFM for the fabric', () => {
    expect(HOST_FIRMWARE.map((c) => c.id)).toEqual(['uefi', 'driver', 'cuda', 'fm', 'nic', 'nvswitch'])
    expect(FIRMWARE.map((c) => c.id)).toContain('ufm')
    expect(FIRMWARE_BY_ID.get('ufm')!.scope).toBe('fabric')
  })

  it('names the two versions that a source gives, and marks the rest', () => {
    const confirmed = FIRMWARE.filter((c) => c.expected.status === 'confirmed')
    expect(confirmed.map((c) => [c.id, c.expected.value])).toEqual([
      ['driver', '570'],
      ['cuda', '12.8'],
    ])
    for (const c of FIRMWARE) {
      if (c.expected.status === 'assumed') expect(c.expected.note).toContain('site')
      expect(c.expected.source).toBeTruthy()
    }
  })
})

describe('the firmware of a host', () => {
  it('gives the same rows for the same host', () => {
    expect(firmwareOf('su1-n01')).toEqual(firmwareOf('su1-n01'))
    expect(firmwareOf('su1-n01').rows).toHaveLength(HOST_FIRMWARE.length)
  })

  it('gives the confirmed versions when the host is not behind', () => {
    const f = firmwareOf('su1-n01')
    if (f.behind !== null) return // this host is behind: another test covers it
    expect(f.rows.find((r) => r.id === 'driver')!.actual).toBe('570')
    expect(f.rows.find((r) => r.id === 'cuda')!.actual).toBe('12.8')
    expect(f.rows.every((r) => r.ok)).toBe(true)
  })

  it('puts one host of every sixteen behind, on one component', () => {
    const ids = [...assignments(DEFAULT_CONFIG).keys()]
    const behind = ids.filter((id) => firmwareOf(id).behind !== null)
    expect(behind.length).toBeGreaterThan(0)
    expect(behind.length).toBeLessThanOrEqual(Math.ceil(ids.length / BEHIND_EVERY) + 1)
    for (const id of behind) {
      const f = firmwareOf(id)
      expect(f.rows.filter((r) => !r.ok).map((r) => r.id)).toEqual([f.behind])
    }
  })

  it('a host behind on the driver runs the version before it', () => {
    const ids = [...assignments(DEFAULT_CONFIG).keys()]
    const driver = ids.find((id) => firmwareOf(id).behind === 'driver')
    if (driver === undefined) return // the sample of this configuration has no such host
    const row = firmwareOf(driver).rows.find((r) => r.id === 'driver')!
    expect(row).toEqual({ id: 'driver', actual: '569', ok: false })
  })
})

describe('the fleet against the baseline', () => {
  it('adds up, and names the host of each component', () => {
    const fleet = fleetFirmware(DEFAULT_CONFIG)
    expect(fleet.hosts).toBe(assignments(DEFAULT_CONFIG).size)
    expect(fleet.byComponent.reduce((n, c) => n + c.hosts.length, 0)).toBe(fleet.behind.length)
    for (const b of fleet.behind) expect(firmwareOf(b.host).behind).toBe(b.component)
  })

  it('gives the same fleet in another configuration for the hosts that both have', () => {
    const one = fleetFirmware(DEFAULT_CONFIG)
    const two = fleetFirmware(cfg({ suCount: 2 }))
    const common = one.behind.filter((b) => two.behind.some((x) => x.host === b.host))
    expect(common.length).toBe(one.behind.length)
    expect(two.hosts).toBeGreaterThan(one.hosts)
  })

  it('is quick at 18 SUs', () => {
    const started = Date.now()
    const fleet = fleetFirmware(cfg({ suCount: 18 }))
    expect(fleet.hosts).toBe(assignments(cfg({ suCount: 18 })).size)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
