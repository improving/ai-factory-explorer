import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { SIM_FACTS } from '../src/catalog/failures'
import { PATH_FACTS } from '../src/catalog/paths'
import type { Failure } from '../src/simulate/failable'
import { NVL72_UG_URL } from '../src/catalog/urls'
import { traceGpus, type Trace } from '../src/routing/trace'
import { generateFabric } from '../src/topology/fabric'
import { serverOf } from '../src/topology/ids'
import { generateServer } from '../src/topology/server'

const cfg = (patch: Partial<Config>): Config => withPatch(DEFAULT_CONFIG, patch)!
const ok = (c: Config, src: string, dst: string, pxn = true, plane: 0 | 1 = 0): Trace => {
  const r = traceGpus(c, src, dst, { pxn, plane })
  if (!r.ok) throw new Error(r.reason)
  return r.trace
}
const links = (t: Trace) => t.hops.map((h) => h.link)
const ids = (t: Trace) => [t.hops[0]!.from.id, ...t.hops.map((h) => h.to.id)]

// Every part of the path is in the fabric or in the server graph of its server or tray.
function expectReal(c: Config, t: Trace) {
  const fabric = new Set(generateFabric(c).nodes.map((n) => n.id))
  for (const id of ids(t)) {
    const server = serverOf(id)
    const inServer = server !== null && generateServer(c, server).nodes.some((n) => n.id === id)
    const inRack = /^su\d+-k\d+-sw\d+\//.test(id) && generateServer(c, serverOf(t.hops[0]!.from.id)!).nodes.some((n) => n.id === id)
    expect(fabric.has(id) || inServer || inRack, id).toBe(true)
  }
}

describe('the tracer table of spec section 6 (GPU to GPU)', () => {
  it('same node: GPU → NVLink → NVSwitch → GPU, no NIC', () => {
    const t = ok(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n05/gpu5')
    expect(t.kind).toBe('same-node')
    expect(links(t)).toEqual(['nvlink', 'nvlink'])
    expect(ids(t)).toEqual(['su1-n05/gpu2', 'su1-n05/nvswitch0', 'su1-n05/gpu5'])
    expect(t.hops[0]!.fan.map((f) => f.id)).toEqual(['su1-n05/nvswitch1'])
    expectReal(DEFAULT_CONFIG, t)
  })
  it('same rail, same SU: GPU → PCIe → NIC k → leaf k → NIC k → GPU, one leaf', () => {
    const t = ok(DEFAULT_CONFIG, 'su1-n05/gpu3', 'su1-n40/gpu3')
    expect(t.kind).toBe('one-leaf')
    expect(links(t)).toEqual(['pcie', 'infiniband', 'infiniband', 'pcie'])
    expect(ids(t)).toEqual(['su1-n05/gpu3', 'su1-n05/nic3', 'su1-leaf-r3', 'su1-n40/nic3', 'su1-n40/gpu3'])
    expect(t.notes).toContain(PATH_FACTS.oneHop)
    expectReal(DEFAULT_CONFIG, t)
  })
  it('different rail, PXN off: NIC a → leaf a → spine → leaf b → NIC b, with the other spines as a fan', () => {
    const t = ok(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n40/gpu5', false)
    expect(t.kind).toBe('cross-rail')
    expect(ids(t)).toEqual(['su1-n05/gpu2', 'su1-n05/nic2', 'su1-leaf-r2', 'spine-01', 'su1-leaf-r5', 'su1-n40/nic5', 'su1-n40/gpu5'])
    expect(t.hops[2]!.fan).toHaveLength(3)
    expect(t.notes).toContain(PATH_FACTS.ecmp)
    expectReal(DEFAULT_CONFIG, t)
  })
  it('different rail, PXN on: NVLink to the GPU on the right rail, then its NIC and one leaf; no spine', () => {
    const t = ok(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n40/gpu5')
    expect(t.kind).toBe('pxn')
    expect(ids(t)).toEqual(['su1-n05/gpu2', 'su1-n05/nvswitch0', 'su1-n05/gpu5', 'su1-n05/nic5', 'su1-leaf-r5', 'su1-n40/nic5', 'su1-n40/gpu5'])
    expect(t.notes).toEqual(expect.arrayContaining([PATH_FACTS.pxn, PATH_FACTS.pxnDefault]))
    expectReal(DEFAULT_CONFIG, t)
  })
  it('different SU: leaf k (SU 1) → spine → leaf k (SU 2), with all the equal-cost spines', () => {
    const c = cfg({ suCount: 2 })
    const t = ok(c, 'su1-n05/gpu3', 'su2-n10/gpu3')
    expect(t.kind).toBe('cross-su')
    expect(ids(t)).toEqual(['su1-n05/gpu3', 'su1-n05/nic3', 'su1-leaf-r3', 'spine-01', 'su2-leaf-r3', 'su2-n10/nic3', 'su2-n10/gpu3'])
    expect(t.hops[2]!.fan).toHaveLength(7)
    expectReal(c, t)
  })
  it('dual plane: the trace takes the plane of the option, at 400 Gb/s for each plane', () => {
    const c = cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 })
    const a = ok(c, 'su1-n05/gpu3', 'su1-n40/gpu3', true, 0)
    const b = ok(c, 'su1-n05/gpu3', 'su1-n40/gpu3', true, 1)
    expect(a.hops[1]!.to.label).toMatch(/plane A/)
    expect(b.hops[1]!.to.label).toMatch(/plane B/)
    expect(a.hops[1]).toMatchObject({ link: 'ethernet', plane: 0, bandwidth: { value: 400 } })
    expect(a.notes).toContain(PATH_FACTS.dualPlane)
    expectReal(c, a)
    expectReal(c, b)
  })
  it('NVL72, same rack: NVLink through a switch tray, with the 17 other chips as a fan', () => {
    const c = cfg({ platform: 'gb300-nvl72', suCount: 2 })
    const t = ok(c, 'su1-n05/gpu1', 'su1-n12/gpu2')
    expect(t.kind).toBe('nvl72-rack')
    expect(ids(t)).toEqual(['su1-n05/gpu1', 'su1-k1-sw1/chip0', 'su1-n12/gpu2'])
    expect(t.hops[0]!.fan).toHaveLength(17)
    expect(t.hops[0]!.checks.map((x) => x.label)).toContain('nvidia-imex-ctl -H -N')
    expectReal(c, t)
  })
  it('NVL72, another rack: the InfiniBand compute fabric', () => {
    const c = cfg({ platform: 'gb300-nvl72', suCount: 2 })
    const t = ok(c, 'su1-n05/gpu1', 'su2-n10/gpu1')
    expect(t.kind).toBe('nvl72-fabric')
    expect(links(t)).toEqual(['pcie', 'infiniband', 'infiniband', 'infiniband', 'infiniband', 'pcie'])
  })
})

describe('the other fabrics', () => {
  it('HGX Enterprise RA: rails 0 and 4 share a leaf, so PXN off still takes one leaf, across SUs of one group', () => {
    const c = cfg({ build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', planes: 'dual', suCount: 8, cooling: 'liquid' })
    const t = ok(c, 'su1-n01/gpu0', 'su2-n01/gpu4', false)
    expect(t.kind).toBe('one-leaf')
    expect(t.hops[1]!.to.id).toBe(t.hops[2]!.from.id)
    expectReal(c, t)
  })
  it('top-of-rack: two servers of one top-of-rack leaf take one leaf for every rail', () => {
    const c = cfg({ topology: 'tor' })
    const t = ok(c, 'su1-n01/gpu0', 'su1-n02/gpu7', false)
    expect(t.kind).toBe('one-leaf')
    expectReal(c, t)
  })
})

describe('the bottleneck and the refusals', () => {
  it('is the first hop with the lowest sourced bandwidth; PCIe has no sourced bandwidth', () => {
    const t = ok(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n40/gpu5')
    expect(t.hops[2]!.bandwidth.status).toBe('not-sourced')
    expect(t.bottleneck).toBe(3) // NIC 5 → leaf r5, 800 Gb/s
    expect(t.hops[0]!.bandwidth).toMatchObject({ value: 7200, status: 'derived' })
  })
  it('refuses the same GPU, and a part that is not a GPU', () => {
    expect(traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n05/gpu2')).toMatchObject({ ok: false, reason: /same GPU/ })
    expect(traceGpus(DEFAULT_CONFIG, 'su1-n05/nic2', 'su1-n05/gpu2')).toMatchObject({ ok: false })
  })
})

describe('the trace fixes of the final review', () => {
  it('says that the NVSwitch chips carry an NVLink hop in parallel; they are not a choice', () => {
    const t = ok(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n05/gpu5')
    expect(t.notes).toContain(PATH_FACTS.nvlinkParallel)
    expect(ok(DEFAULT_CONFIG, 'su1-n05/gpu3', 'su1-n40/gpu3').notes).not.toContain(PATH_FACTS.nvlinkParallel)
  })
  it('cites the NVL72 user guide for the halving of the NVLink bandwidth (both directions)', () => {
    const t = ok(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n05/gpu5')
    expect(t.hops[0]!.bandwidth.source).toBe(NVL72_UG_URL)
    expect(t.hops[0]!.bandwidth.formula).toMatch(/handbook\/hardware-matrix\.md:20/)
  })
})

describe('the tracer with failures (spec section 6, last paragraph)', () => {
  const fails = (...f: Failure[]) => f
  it('takes the next spine when a spine of the path is down', () => {
    const r = traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n40/gpu5', { pxn: false, plane: 0 }, fails({ id: 'spine-01', mode: 'down' }))
    expect(r.ok && r.trace.hops[2]!.to.id).toBe('spine-02')
  })
  it('says "no path" when a rail of an end is down in single plane', () => {
    const r = traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu3', 'su1-n40/gpu3', undefined, fails({ id: 'su1-leaf-r3', mode: 'down' }))
    expect(r).toMatchObject({ ok: false, reason: /rail 3/ })
    expect(traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu3', 'su1-n40/gpu3', undefined, fails({ id: 'su1-n05/nic3', mode: 'down' })).ok).toBe(false)
  })
  it('takes the other plane at half bandwidth in dual plane', () => {
    const c = cfg({ fabric: 'spectrum-x', planes: 'dual', suCount: 4 })
    const r = traceGpus(c, 'su1-n05/gpu3', 'su1-n40/gpu3', { pxn: true, plane: 0 }, fails({ id: 'su1-leaf-pA-r3', mode: 'down' }))
    expect(r.ok && r.trace.hops[1]!.to.label).toMatch(/plane B/)
    expect(r.ok && r.trace.notes).toContain(SIM_FACTS.otherPlane)
  })
  it('turns PXN off when Fabric Manager is down on the source node, and says no path inside the node', () => {
    const fm = fails({ id: 'su1-n05/svc-fabric-manager', mode: 'down' })
    const r = traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n40/gpu5', undefined, fm)
    expect(r.ok && r.trace.kind).toBe('cross-rail')
    expect(r.ok && r.trace.notes).toContain(SIM_FACTS.pxnOff)
    expect(traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n05/gpu5', undefined, fm)).toMatchObject({ ok: false, reason: /NVLink/ })
  })
  it('says "no path" for a lost GPU at an end, and marks a degraded hop', () => {
    expect(traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n40/gpu5', undefined, fails({ id: 'su1-n40/gpu1', mode: 'xid79' })).ok).toBe(false)
    const r = traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu3', 'su1-n40/gpu3', undefined, fails({ id: 'su1-n05~r3', mode: 'degraded' }))
    expect(r.ok && r.trace.hops[1]!.degraded).toBe(true)
    expect(r.ok && r.trace.notes).toContain(SIM_FACTS.degradedHop)
  })
})

describe('the tracer agrees with the impact of the failures (final review)', () => {
  it('says "no path" from a GPU that the impact takes out (a CDU takes the SU)', () => {
    const c = cfg({ cooling: 'liquid', suCount: 2 })
    expect(traceGpus(c, 'su1-n01/gpu0', 'su2-n01/gpu0', undefined, [{ id: 'su1-cdu', mode: 'down' }]).ok).toBe(false)
  })
  it('does not go through a lost PXN sibling: PXN is off', () => {
    const r = traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n40/gpu5', undefined, [{ id: 'su1-n05/gpu5', mode: 'xid48' }])
    expect(r.ok && r.trace.kind).toBe('cross-rail')
    expect(r.ok && r.trace.notes).toContain(SIM_FACTS.pxnOff)
  })
  it('says "no NVLink path" when the destination tray has no NVLink (NVL72 IMEX), or a chip of the server is down (the scale-up domain)', () => {
    const gb = cfg({ platform: 'gb200-nvl72' })
    expect(traceGpus(gb, 'su1-n05/gpu0', 'su1-n12/gpu0', undefined, [{ id: 'su1-n12/imex', mode: 'down' }]).ok).toBe(false)
    expect(traceGpus(DEFAULT_CONFIG, 'su1-n05/gpu2', 'su1-n05/gpu5', undefined, [{ id: 'su1-n05/nvswitch0', mode: 'down' }]).ok).toBe(false)
  })
})
