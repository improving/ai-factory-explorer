import { describe, expect, it } from 'vitest'
import { FACTORY_FACTS as G, VIRTUAL_PARTS } from '../src/catalog/paths'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { PATH_IDS, traceFactory, type PathId } from '../src/routing/factory'
import type { Trace } from '../src/routing/trace'
import { generateFabric } from '../src/topology/fabric'
import { serverOf } from '../src/topology/ids'
import { generateOverview } from '../src/topology/overview'
import { generateServer } from '../src/topology/server'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!
const SRC = 'su1-n05/gpu2'
const ok = (c: Config, path: PathId, src = SRC): Trace => {
  const r = traceFactory(c, path, src)
  if (!r.ok) throw new Error(r.reason)
  return r.trace
}
const ids = (t: Trace) => [t.hops[0]!.from.id, ...t.hops.map((h) => h.to.id)]

// Each part is a block of the overview (with the telemetry blocks), a part of the server or the rack of the
// source, a part of the fabric, or a path-only part.
function expectReal(c: Config, t: Trace, src = SRC) {
  const known = new Set([
    ...generateOverview(c, { telemetry: true }).nodes.map((n) => n.id),
    ...generateServer(c, serverOf(src)!).nodes.map((n) => n.id),
    ...generateFabric(c).nodes.map((n) => n.id),
    ...Object.keys(VIRTUAL_PARTS),
  ])
  for (const p of [t.hops[0]!.from, ...t.hops.map((h) => h.to), ...t.hops.flatMap((h) => h.fan)]) expect(known.has(p.id), p.id).toBe(true)
}

describe('GPU to VAST', () => {
  it('GDS on: GPU → PCIe → NIC (converged, BlueField-3) → storage leaf → CNode → DNode', () => {
    const t = ok(DEFAULT_CONFIG, 'storage')
    expect(ids(t)).toEqual([SRC, 'su1-n05/dpu0', 'blk-frontend', 'path-cnode', 'path-dnode'])
    expect(t.notes).toContain(G.gds)
    expect(t.bottleneck).toBe(1) // the front NIC: 400 Gb/s
    expect(t.hops[3]!.to.virtual).toBe(true)
    expectReal(DEFAULT_CONFIG, t)
  })
  it('GDS off: through a bounce buffer in CPU memory', () => {
    const c = cfg({ gds: 'off' })
    const t = ok(c, 'storage')
    expect(ids(t)).toEqual([SRC, 'su1-n05/cpu0', 'su1-n05/dpu0', 'blk-frontend', 'path-cnode', 'path-dnode'])
    expect(t.notes).toContain(G.bounce)
    expectReal(c, t)
  })
  it('follows the storage fabric, the front NIC of the platform, and NVLink-C2C on a Grace tray', () => {
    const ib = ok(cfg({ storageFabric: 'infiniband' }), 'storage')
    expect(ib.hops[1]).toMatchObject({ to: { id: 'blk-storage-net' }, link: 'infiniband' })
    const h100 = cfg({ platform: 'h100' })
    expect(ok(h100, 'storage').hops[0]!.to.id).toBe('su1-n05/fnic0')
    expectReal(h100, ok(h100, 'storage'))
    const gb = cfg({ platform: 'gb200-nvl72', gds: 'off' })
    expect(ok(gb, 'storage').hops[0]).toMatchObject({ link: 'c2c', to: { id: 'su1-n05/cpu1' } })
    expectReal(gb, ok(gb, 'storage'))
  })
  it('has no path on a platform with no sourced front NIC', () => {
    expect(traceFactory(cfg({ build: 'oem-hgx' }), 'storage', SRC)).toMatchObject({ ok: false, reason: /front NIC/ })
  })
})

describe('user to service', () => {
  it('the UI and API: user → internet → edge routers → firewall → the VIP → the Rafay controller (TLS offload)', () => {
    const t = ok(DEFAULT_CONFIG, 'user-ui')
    expect(ids(t)).toEqual(['path-user', 'blk-internet', 'blk-router', 'blk-firewall', 'blk-lb', 'blk-rafay'])
    expect(t.notes).toContain(G.tlsOffload)
    expect(t.bottleneck).toBe(1) // the uplink that you set
    expectReal(DEFAULT_CONFIG, t)
  })
  it('follows the load balancer and the Rafay controller of the configuration', () => {
    expect(ids(ok(cfg({ lb: 'haproxy' }), 'user-ui'))).toEqual(['path-user', 'blk-internet', 'blk-router', 'blk-firewall', 'blk-frontend', 'blk-lb', 'blk-rafay'])
    expect(ids(ok(cfg({ rafay: 'saas' }), 'user-ui'))).toEqual(['path-user', 'blk-internet', 'blk-rafay-saas'])
    expect(traceFactory(cfg({ lb: 'none' }), 'user-ui', SRC)).toMatchObject({ ok: false, reason: /VIP/ })
    expect(traceFactory(cfg({ orchestration: 'slurm' }), 'user-ui', SRC)).toMatchObject({ ok: false }) // Slurm only: no Rafay controller
  })
  it('the clusters: the Kubernetes control plane → the VIP → the Rafay controller (mTLS, TLS passthrough)', () => {
    const t = ok(DEFAULT_CONFIG, 'cluster-mtls')
    expect(ids(t)).toEqual(['blk-k8s', 'blk-control-net', 'blk-frontend', 'blk-firewall', 'blk-lb', 'blk-rafay'])
    expect(t.notes).toContain(G.tlsPassthrough)
    expectReal(DEFAULT_CONFIG, t)
    expect(traceFactory(cfg({ orchestration: 'slurm' }), 'cluster-mtls', SRC)).toMatchObject({ ok: false })
  })
})

describe('operator access', () => {
  it('to a BMC: operator → PAM → out-of-band network → BMC', () => {
    const t = ok(DEFAULT_CONFIG, 'operator-bmc')
    expect(ids(t)).toEqual(['path-operator', 'path-pam', 'blk-oob-net', 'su1-n05/bmc'])
    expectReal(DEFAULT_CONFIG, t)
    const gb = cfg({ platform: 'gb200-nvl72' })
    expect(ok(gb, 'operator-bmc').hops[2]!.to.id).toBe('su1-n05') // the tray: an NVL72 tray has no BMC part
  })
  it('kubectl: operator → PAM → the Rafay controller (ZTKA) → Kubernetes', () => {
    const t = ok(DEFAULT_CONFIG, 'operator-ztka')
    expect(ids(t)).toEqual(['path-operator', 'path-pam', 'blk-rafay', 'blk-k8s'])
    expect(t.notes).toEqual(expect.arrayContaining([G.ztka, G.ztkaFirewall]))
  })
  it('break-glass: an offline account to the BMC, with an assumed target', () => {
    const t = ok(DEFAULT_CONFIG, 'break-glass')
    expect(ids(t)).toEqual(['path-operator', 'path-breakglass', 'blk-oob-net', 'su1-n05/bmc'])
    expect(t.notes).toContain(G.breakGlassTarget)
  })
})

describe('telemetry', () => {
  it('GPU metrics: DCGM Exporter → Prometheus → Alertmanager → the ITSM; with no integration, L1 opens the ticket', () => {
    const t = ok(DEFAULT_CONFIG, 'telemetry-itsm')
    expect(ids(t)).toEqual(['su1-n05/svc-dcgm-exporter', 'blk-prometheus', 'blk-alertmanager', 'blk-itsm'])
    expect(t.notes).toContain(G.manualTicket)
    expect(ok(cfg({ itsm: 'on' }), 'telemetry-itsm').notes).not.toContain(G.manualTicket)
    expectReal(DEFAULT_CONFIG, t)
  })
  it('a BMC event: BMC → out-of-band network → Prometheus (Redfish) → Alertmanager → the SIEM', () => {
    const t = ok(DEFAULT_CONFIG, 'telemetry-siem')
    expect(ids(t)).toEqual(['su1-n05/bmc', 'blk-oob-net', 'blk-prometheus', 'blk-alertmanager', 'blk-siem'])
    expect(t.notes).toContain(G.redfish)
  })
})

describe('control', () => {
  it('the subnet manager: UFM → a leaf → a spine, with the other leaves and spines as fans', () => {
    const t = ok(DEFAULT_CONFIG, 'control-sm')
    expect(ids(t)).toEqual(['blk-ufm', 'su1-leaf-r0', 'spine-01'])
    expect(t.hops.map((h) => h.link)).toEqual(['mad', 'mad'])
    expect(t.hops[0]!.fan).toHaveLength(7)
    expect(t.hops[1]!.fan).toHaveLength(3)
    expectReal(DEFAULT_CONFIG, t)
    expect(traceFactory(cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 }), 'control-sm', SRC)).toMatchObject({ ok: false, reason: /subnet manager/ })
  })
  it('NVLink: Fabric Manager → NVLSM → the NVSwitch chips (B300); no NVLSM on H100; NVOS on an NVL72 switch tray', () => {
    expect(ids(ok(DEFAULT_CONFIG, 'control-nvlink'))).toEqual(['su1-n05/svc-fabric-manager', 'su1-n05/svc-nvlsm', 'su1-n05/nvswitch0'])
    expect(ids(ok(cfg({ platform: 'h100' }), 'control-nvlink'))).toEqual(['su1-n05/svc-fabric-manager', 'su1-n05/nvswitch0'])
    const gb = cfg({ platform: 'gb200-nvl72' })
    const t = ok(gb, 'control-nvlink')
    expect(ids(t)).toEqual(['su1-k1-sw1/nvos', 'su1-k1-sw1/chip0'])
    expect(t.hops[0]!.fan).toHaveLength(17)
    expectReal(gb, t)
  })
})

describe('every factory path', () => {
  it('has a title, and refuses a source that is not a GPU', () => {
    for (const path of PATH_IDS) {
      expect(ok(DEFAULT_CONFIG, path).title.length, path).toBeGreaterThan(5)
      expect(traceFactory(DEFAULT_CONFIG, path, 'spine-01').ok, path).toBe(false)
    }
  })
})

describe('the fixes of the final review', () => {
  it('gives the SaaS user path no site uplink and no VIP check', () => {
    const t = ok(cfg({ rafay: 'saas' }), 'user-ui')
    expect(t.bottleneck).toBeNull()
    for (const h of t.hops) expect(h.checks.map((c) => c.label).join(' '), h.to.id).not.toMatch(/VIP/)
  })
  it('names what programs the NVSwitch chips on each platform', () => {
    expect(ok(DEFAULT_CONFIG, 'control-nvlink').title).toMatch(/Fabric Manager and NVLSM/)
    expect(ok(cfg({ platform: 'h100' }), 'control-nvlink').title).not.toMatch(/NVLSM/)
    expect(ok(cfg({ platform: 'gb200-nvl72' }), 'control-nvlink').title).toMatch(/NVOS/)
  })
  it('does not call every BMC an iDRAC: the source gives the Redfish path for Dell servers', () => {
    expect(G.redfish.status).toBe('assumed')
    expect(G.redfish.value).not.toMatch(/^iDRAC/)
  })
})

describe('the factory paths with failures', () => {
  it('says "no path" through a failed block, but keeps the path after a UFM failover', () => {
    expect(traceFactory(DEFAULT_CONFIG, 'user-ui', SRC, [{ id: 'blk-firewall', mode: 'down' }])).toMatchObject({ ok: false, reason: /Firewall/ })
    expect(traceFactory(DEFAULT_CONFIG, 'control-sm', SRC, [{ id: 'blk-ufm', mode: 'active' }]).ok).toBe(true)
    expect(traceFactory(DEFAULT_CONFIG, 'control-sm', SRC, [{ id: 'blk-ufm', mode: 'both' }]).ok).toBe(false)
  })
})

describe('the storage path with failures (final review)', () => {
  it('says "no path" when the source GPU is out (Xid 79 on another GPU drains the node)', () => {
    expect(traceFactory(DEFAULT_CONFIG, 'storage', SRC, [{ id: 'su1-n05/gpu5', mode: 'xid79' }]).ok).toBe(false)
  })
})
