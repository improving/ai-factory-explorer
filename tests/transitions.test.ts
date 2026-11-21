import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type Config } from '../src/config/config'
import { withPatch } from '../src/config/rules'
import { SCENARIOS } from '../src/routing/scenarios'
import { findParts } from '../src/search/search'
import { SIM_SCENARIOS, activeSimScenario, stepFailures } from '../src/simulate/scenarios'
import { generateFabric } from '../src/topology/fabric'
import { fabricElements } from '../src/views/fabricView'
import { generateRacks } from '../src/topology/racks'
import { racksElements } from '../src/views/rackViews'
import {
  EXPAND_ALL_SERVERS,
  INITIAL,
  activeScenario,
  goTo,
  type AppState,
  applyScenario,
  applySimScenario,
  clearTrace,
  closeChecklist,
  openChecklist,
  expandAll,
  fail,
  openFabric,
  openOverview,
  openRack,
  openRacks,
  openServer,
  openSu,
  openTrace,
  pickGpu,
  repair,
  resetFailures,
  select,
  setColor,
  setDiagView,
  setFace,
  setHop,
  setIncident,
  setSimStep,
  setMode,
  setPath,
  setTelemetry,
  setTopo,
  setTrace,
  setTab,
  setTopoSource,
  setTraceOptions,
  toggleLayer,
  toggleRail,
  toggleStep,
  toggleSu,
  up,
  withConfig,
} from '../src/state/transitions'
import { CURRENT_INCIDENT } from '../src/diagnose/incidents'
import { tabIdsFor } from '../src/state/tabs'

describe('withConfig', () => {
  it('refuses a configuration that is not valid', () => {
    expect(withConfig(INITIAL, { suCount: 3 })).toBe(INITIAL)
    expect(withConfig(INITIAL, { planes: 'dual' })).toBe(INITIAL)
  })

  it('goes back to the fabric when the open server is no longer there', () => {
    let s = withConfig(INITIAL, { suCount: 4 })
    s = openSu(s, 4)
    s = openServer(s, 'su4-n05')
    s = select(s, 'su4-n05/gpu3')
    s = withConfig(s, { suCount: 1 })
    expect(s.view).toEqual({ level: 'fabric' })
    expect([...s.expanded]).toEqual([])
    expect(s.selected).toBeNull()
  })

  it('keeps what is still there', () => {
    let s = withConfig(INITIAL, { suCount: 4 })
    s = openServer(s, 'su1-n05')
    s = withConfig(s, { suCount: 2 })
    expect(s.view).toEqual({ level: 'node', serverId: 'su1-n05' })
  })
})

describe('the SU and server transitions', () => {
  it('opens and closes an SU', () => {
    const s = toggleSu(INITIAL, 1)
    expect(s.expanded.has(1)).toBe(true)
    expect(toggleSu(s, 1).expanded.has(1)).toBe(false)
  })

  it('does not open an SU that is not there', () => {
    expect(toggleSu(INITIAL, 2)).toBe(INITIAL)
  })

  it('opens all SUs up to 576 servers, and does nothing above', () => {
    const eight = withConfig(INITIAL, { suCount: 8 })
    expect(EXPAND_ALL_SERVERS).toBe(576)
    expect(expandAll(eight).expanded.size).toBe(8)
    const eighteen = withConfig(INITIAL, { suCount: 18 })
    expect(expandAll(eighteen)).toBe(eighteen)
  })

  it('refuses a server that is not there', () => {
    expect(openServer(INITIAL, 'su9-n99')).toBe(INITIAL)
  })

  it('goes up from a server to its SU, open, with the server selected', () => {
    const s = up(openServer(INITIAL, 'su1-n05'))
    expect(s.view).toEqual({ level: 'fabric' })
    expect(s.expanded.has(1)).toBe(true)
    expect(s.selected).toBe('su1-n05')
  })

  it('clears the rail and the selection when it goes up from the fabric', () => {
    const s = up(toggleRail(select(INITIAL, 'spine-01'), 3))
    expect(s.rail).toBeNull()
    expect(s.selected).toBeNull()
  })
})

describe('select and toggleRail', () => {
  it('refuses an id that is not there', () => {
    expect(select(INITIAL, 'spine-99').selected).toBeNull()
  })
  it('toggles a rail, and refuses a rail that does not exist', () => {
    expect(toggleRail(INITIAL, 3).rail).toBe(3)
    expect(toggleRail(toggleRail(INITIAL, 3), 3).rail).toBeNull()
    expect(toggleRail(INITIAL, 9)).toBe(INITIAL)
  })
})

describe('platform changes, rails, and groups', () => {
  it('goes back to the fabric when the new platform has no such server', () => {
    let s = withConfig(INITIAL, { suCount: 4 })
    s = openServer(s, 'su4-n40')
    s = withConfig(s, { platform: 'h100' })
    expect(s.config.design).toBe('ndr-h100')
    expect(s.view).toEqual({ level: 'fabric' })
  })
  it('keeps a server that the new platform also has', () => {
    let s = withConfig(INITIAL, { suCount: 4 })
    s = openServer(s, 'su4-n05')
    s = withConfig(s, { platform: 'h100' })
    expect(s.view).toEqual({ level: 'node', serverId: 'su4-n05' })
  })
  it('ignores rail keys beyond the rails of the design', () => {
    const s = withConfig(INITIAL, { platform: 'gb300-nvl72' })
    expect(toggleRail(s, 5)).toBe(s)
    expect(toggleRail(s, 3).rail).toBe(3)
  })
  it('opens the group of an Enterprise SU', () => {
    let s = withConfig(INITIAL, { build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 16 })
    s = toggleSu(s, 12)
    expect([...s.expanded]).toEqual([9])
    expect([...expandAll(s).expanded]).toEqual([1, 9])
  })
  it('goes up from an Enterprise server to its open group', () => {
    let s = withConfig(INITIAL, { build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 8 })
    s = up(openServer(s, 'su5-n02'))
    expect(s.expanded.has(1)).toBe(true)
    expect(s.selected).toBe('su5-n02')
  })
})

describe('the rail after a configuration change', () => {
  it('clears a rail that the new design does not have', () => {
    let s = toggleRail(INITIAL, 6)
    s = withConfig(s, { platform: 'gb300-nvl72' })
    expect(s.rail).toBeNull()
  })
  it('keeps a rail that the new design also has', () => {
    let s = toggleRail(INITIAL, 2)
    s = withConfig(s, { platform: 'gb300-nvl72' })
    expect(s.rail).toBe(2)
  })
})

describe('the overview level', () => {
  it('goes up from an empty fabric to the overview, and clears first if something is selected', () => {
    expect(up(INITIAL).view).toEqual({ level: 'overview' })
    const s = select(INITIAL, 'spine-01')
    expect(up(s).view).toEqual({ level: 'fabric' })
    expect(up(s).selected).toBeNull()
  })
  it('has no rail highlight in the overview', () => {
    expect(openOverview(toggleRail(INITIAL, 3)).rail).toBeNull()
    const s = openOverview(INITIAL)
    expect(toggleRail(s, 3)).toBe(s)
  })
  it('drops a block selection when it opens the fabric', () => {
    const s = openFabric(select(openOverview(INITIAL), 'blk-pods'))
    expect(s.view).toEqual({ level: 'fabric' })
    expect(s.selected).toBeNull()
  })
  it('selects a block only when the configuration has it', () => {
    const s = openOverview(INITIAL)
    expect(select(s, 'blk-vast').selected).toBe('blk-vast')
    expect(select(s, 'blk-slurm').selected).toBeNull()
    const rafay = select(s, 'blk-rafay')
    expect(withConfig(rafay, { orchestration: 'slurm' }).selected).toBeNull()
  })
})

describe('selections that the topology does not have', () => {
  it('refuses a leaf that the design does not have', () => {
    const s = withConfig(INITIAL, { platform: 'gb300-nvl72' })
    expect(select(s, 'su1-leaf-r3').selected).toBeNull()
    expect(select(s, 'su1-leaf-r3a').selected).toBe('su1-leaf-r3a')
  })
  it('refuses an SU that is not the first of its group', () => {
    const s = withConfig(INITIAL, { build: 'oem-hgx', fabric: 'spectrum-x', design: 'ent-b300', suCount: 16 })
    expect(select(s, 'su2').selected).toBeNull()
    expect(select(s, 'su9').selected).toBe('su9')
  })
})

describe('selecting the cables and bundles of the fabric', () => {
  // Each select builds the fabric again, so the dual-plane case is thousands of builds: it takes about 3 s
  // here and more than 5 s on a CI runner. The timeout is the point of the test, not a slow machine.
  it.each([{}, { platform: 'gb300-nvl72' }, { fabric: 'spectrum-x', planes: 'dual' }] as Partial<Config>[])('keeps every edge of the fabric view and graph selected (%o)', { timeout: 30_000 }, (patch) => {
    const s = withConfig(INITIAL, patch)
    const fabric = generateFabric(s.config)
    const ids = [
      ...fabricElements(fabric, new Set()).filter((e) => e.group === 'edges').map((e) => e.data.id!),
      ...fabricElements(fabric, new Set([1])).filter((e) => e.group === 'edges').map((e) => e.data.id!),
      ...fabric.edges.filter((_, i) => i % 25 === 0).map((e) => e.id), // a sample: each select builds the fabric
    ]
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(select(s, id).selected, id).toBe(id)
  })
  it('drops a server cable of an empty slot', () => {
    const s = select(INITIAL, 'su1-n70~r3')
    expect(s.selected).toBe('su1-n70~r3')
    expect(withConfig(s, { lastSuEmpty: 36 }).selected).toBeNull()
  })
})

describe('the rack levels', () => {
  it('opens the racks of an SU, then one rack, on the side of its ports', () => {
    let s = openRacks(INITIAL, 1)
    expect(s.view).toEqual({ level: 'racks', su: 1, face: 'front' })
    s = openRack(s, 'su1-k2')
    expect(s.view).toEqual({ level: 'rack', su: 1, rackId: 'su1-k2', face: 'front' })
    const h100 = openRack(openRacks(withConfig(INITIAL, { platform: 'h100' }), 1), 'su1-k1')
    expect(h100.view).toMatchObject({ level: 'rack', face: 'rear' })
  })
  it('refuses an SU or a rack that the configuration does not have', () => {
    expect(openRacks(INITIAL, 2)).toBe(INITIAL)
    const s = openRacks(INITIAL, 1)
    expect(openRack(s, 'su1-k19')).toBe(s)
    expect(openRack(s, 'su2-k1')).toBe(s)
    expect(openRack(withConfig(s, { cooling: 'liquid' }), 'su1-cdu').view).toEqual({ level: 'racks', su: 1, face: 'front' })
  })
  it('goes up from a rack to the racks, then clears the selection, then goes to the fabric with the SU selected', () => {
    const racks = up(openRack(openRacks(INITIAL, 1), 'su1-net1'))
    expect(racks.view).toEqual({ level: 'racks', su: 1, face: 'front' })
    expect(racks.selected).toBe('su1-net1')
    expect(up(racks).view).toEqual(racks.view)
    expect(up(racks).selected).toBeNull()
    const fabric = up(up(racks))
    expect(fabric.view).toEqual({ level: 'fabric' })
    expect(fabric.selected).toBe('su1')
  })
  it('has no rail highlight at the racks level, and keeps it in one rack', () => {
    const s = openRacks(toggleRail(INITIAL, 3), 1)
    expect(s.rail).toBeNull()
    expect(toggleRail(s, 3)).toBe(s)
    expect(toggleRail(openRack(s, 'su1-k1'), 3).rail).toBe(3)
  })
  it('drops the selection of a rack part when it opens the fabric', () => {
    const s = openFabric(select(openRack(openRacks(INITIAL, 1), 'su1-k1'), 'su1-k1-pdu1'))
    expect(s.view).toEqual({ level: 'fabric' })
    expect(s.selected).toBeNull()
  })
  it('turns the racks to the rear and back, only in a rack level', () => {
    const s = setFace(openRacks(INITIAL, 1), 'rear')
    expect(s.view).toMatchObject({ face: 'rear' })
    expect(setFace(s, 'front').view).toMatchObject({ face: 'front' })
    expect(setFace(INITIAL, 'rear')).toBe(INITIAL)
  })
  it('leaves a rack level when the configuration takes its SU or its rack away', () => {
    const big = withConfig(INITIAL, { suCount: 8 })
    expect(withConfig(openRacks(big, 5), { suCount: 1 }).view).toEqual({ level: 'fabric' })
    const spineRack = openRack(openRacks(big, 1), 'core-k4')
    expect(withConfig(spineRack, { suCount: 1 }).view).toEqual({ level: 'racks', su: 1, face: 'front' })
  })
  it('selects the rack parts and the switch ports that the configuration has', () => {
    const s = openRack(openRacks(INITIAL, 1), 'su1-net1')
    expect(select(s, 'su1-leaf-r0/p144').selected).toBe('su1-leaf-r0/p144')
    expect(select(s, 'su1-leaf-r0/p145').selected).toBeNull()
    expect(select(s, 'su1-net1').selected).toBe('su1-net1')
    expect(select(s, 'su1-k1-pdu3').selected).toBe('su1-k1-pdu3')
    expect(select(s, 'su1-k1-pdu4').selected).toBeNull()
    expect(select(s, 'su1-cdu').selected).toBeNull()
    expect(select(withConfig(s, { cooling: 'liquid' }), 'su1-cdu').selected).toBe('su1-cdu')
  })
})

describe('the overlays', () => {
  it('sets one colour overlay at a time', () => {
    expect(setColor(INITIAL, 'owner').overlay.color).toBe('owner')
    expect(setColor(setColor(INITIAL, 'owner'), 'state').overlay.color).toBe('state')
  })
  it('hides and shows a layer, in the LAYERS order', () => {
    const s = toggleLayer(toggleLayer(INITIAL, 'oob'), 'compute')
    expect(s.overlay.hidden).toEqual(['compute', 'oob'])
    expect(toggleLayer(s, 'compute').overlay.hidden).toEqual(['oob'])
  })
  it('selects a telemetry block only when the telemetry overlay is on, and drops it when the overlay goes off', () => {
    const ov = openOverview(INITIAL)
    expect(select(ov, 'blk-prometheus').selected).toBeNull()
    const on = select(setTelemetry(ov, true), 'blk-prometheus')
    expect(on.selected).toBe('blk-prometheus')
    expect(setTelemetry(on, false).selected).toBeNull()
  })
  it('turns the topo -m matrix on and off', () => {
    expect(setTopo(INITIAL, true).overlay.topo).toBe(true)
    expect(setTopo(setTopo(INITIAL, true), false).overlay.topo).toBe(false)
  })
})

describe('the trace', () => {
  const tracing = setMode(INITIAL, 'trace')
  it('picks the source, then the destination, and opens the trace view; only GPUs are picked', () => {
    expect(pickGpu(INITIAL, 'su1-n05/gpu2')).toBe(INITIAL) // Explore mode
    expect(pickGpu(tracing, 'su1-n05/nic2')).toBe(tracing)
    const one = pickGpu(tracing, 'su1-n05/gpu2')
    expect(one.trace).toEqual({ src: 'su1-n05/gpu2', dst: null, options: { pxn: true, plane: 0 }, hop: 0, path: null })
    expect(one.view.level).toBe('fabric')
    const two = pickGpu(one, 'su1-n40/gpu5')
    expect(two.trace?.dst).toBe('su1-n40/gpu5')
    expect(two.view).toEqual({ level: 'trace' })
    expect(pickGpu(two, 'su1-n06/gpu0')).toMatchObject({ trace: { src: 'su1-n06/gpu0', dst: null }, view: { level: 'fabric' } }) // a new source
  })
  it('applies a scenario: its configuration, its GPUs, and the trace view', () => {
    const s = applyScenario(INITIAL, 'cross-su')
    expect(s.config.suCount).toBe(2)
    expect(s.mode).toBe('trace')
    expect(s.trace).toMatchObject({ src: 'su1-n05/gpu3', dst: 'su2-n10/gpu3' })
    expect(s.view).toEqual({ level: 'trace' })
    expect(applyScenario(INITIAL, 'warp')).toBe(INITIAL)
  })
  it('keeps the current hop inside the path, and goes back to hop 0 on a new option', () => {
    const s = applyScenario(INITIAL, 'pxn') // 6 hops
    expect(setHop(s, 4).trace?.hop).toBe(4)
    expect(setHop(s, 99).trace?.hop).toBe(5)
    expect(setHop(s, -1).trace?.hop).toBe(0)
    expect(setTraceOptions(setHop(s, 4), { pxn: false }).trace).toMatchObject({ hop: 0, options: { pxn: false } })
  })
  it('drops the trace when a configuration change removes its GPUs, and leaves the trace view', () => {
    const s = applyScenario(INITIAL, 'cross-su')
    const one = withConfig(s, { suCount: 1 })
    expect(one.trace).toBeNull()
    expect(one.view).toEqual({ level: 'fabric' })
    expect(withConfig(s, { platform: 'gb200-nvl72' }).trace).toBeNull()
  })
  it('goes from the trace view to the node view of the source, and clears the trace', () => {
    const s = applyScenario(INITIAL, 'pxn')
    expect(up(s)).toMatchObject({ view: { level: 'node', serverId: 'su1-n05' }, selected: 'su1-n05/gpu2' })
    expect(openTrace(up(s)).view).toEqual({ level: 'trace' })
    expect(clearTrace(s)).toMatchObject({ trace: null, view: { level: 'fabric' } })
    expect(setMode(s, 'explore')).toMatchObject({ mode: 'explore', trace: null, view: { level: 'fabric' } })
  })
  it('refuses a trace with a part that is not a GPU', () => {
    expect(setTrace(tracing, 'su1-n05/gpu2', 'spine-01')).toBe(tracing)
  })
  it('has no rail highlight in the trace view: the strip has no rail colours', () => {
    const s = applyScenario(INITIAL, 'pxn')
    expect(toggleRail(s, 2)).toBe(s)
  })
})

describe('the trace fixes of the final review', () => {
  it('selects the source GPU on the first pick, so the user sees it', () => {
    expect(pickGpu(setMode(INITIAL, 'trace'), 'su1-n05/gpu2').selected).toBe('su1-n05/gpu2')
  })
})

describe('the factory paths', () => {
  it('traces the storage path of a picked GPU with "To VAST"', () => {
    const one = pickGpu(setMode(INITIAL, 'trace'), 'su1-n05/gpu2')
    const s = setPath(one, 'storage')
    expect(s.trace).toMatchObject({ src: 'su1-n05/gpu2', dst: null, path: 'storage', hop: 0 })
    expect(s.view).toEqual({ level: 'trace' })
    expect(setPath(INITIAL, 'storage')).toBe(INITIAL) // no source
    expect(pickGpu(s, 'su1-n40/gpu5').trace).toMatchObject({ src: 'su1-n40/gpu5', path: null }) // a new GPU-to-GPU trace
  })
  it('applies a factory row: its configuration, its path, and the trace view', () => {
    const s = applyScenario(INITIAL, 'gpu-vast-bounce')
    expect(s.config.gds).toBe('off')
    expect(s.trace).toMatchObject({ path: 'storage', dst: null })
    expect(s.view).toEqual({ level: 'trace' })
    expect(setHop(s, 4).trace?.hop).toBe(4)
    expect(setHop(s, 99).trace?.hop).toBe(4) // 5 hops
  })
  it('keeps a factory trace after a configuration change, and goes up to the overview', () => {
    const s = applyScenario(INITIAL, 'user-ui')
    const slurm = withConfig(s, { orchestration: 'slurm' }) // no Rafay controller: the path goes, the trace stays with its reason
    expect(slurm).not.toBe(s)
    expect(slurm).toMatchObject({ trace: { path: 'user-ui' }, view: { level: 'trace' } })
    expect(up(s).view).toEqual({ level: 'overview' })
  })
  it('selects a path-only part and a telemetry block in the trace view', () => {
    const s = applyScenario(INITIAL, 'telemetry-itsm')
    expect(select(s, 'path-user').selected).toBe('path-user')
    expect(select(s, 'blk-prometheus').selected).toBe('blk-prometheus')
    expect(select(s, 'path-warp').selected).toBeNull()
  })
})

describe('the failures', () => {
  it('fails a part, replaces its mode, repairs it, and resets all; a bad id or mode is refused', () => {
    const one = fail(INITIAL, 'su1-leaf-r3', 'down')
    expect(one.failures).toEqual([{ id: 'su1-leaf-r3', mode: 'down' }])
    const two = fail(fail(one, 'su1-n10~r5', 'down'), 'su1-n10~r5', 'degraded')
    expect(two.failures).toEqual([
      { id: 'su1-leaf-r3', mode: 'down' },
      { id: 'su1-n10~r5', mode: 'degraded' },
    ])
    expect(repair(two, 'su1-leaf-r3').failures).toEqual([{ id: 'su1-n10~r5', mode: 'degraded' }])
    expect(resetFailures(two).failures).toEqual([])
    expect(fail(INITIAL, 'su9-leaf-r3', 'down')).toBe(INITIAL)
    expect(fail(INITIAL, 'su1-leaf-r3', 'xid79')).toBe(INITIAL)
  })
  it('drops a failure that a configuration change removes', () => {
    const s = fail(fail(withConfig(INITIAL, { suCount: 2 }), 'su2-n05/gpu1', 'xid79'), 'su1-n05/gpu1', 'xid48')
    expect(withConfig(s, { suCount: 1 }).failures).toEqual([{ id: 'su1-n05/gpu1', mode: 'xid48' }])
    expect(withConfig(fail(INITIAL, 'su1-n05/svc-nvlsm', 'down'), { platform: 'gb200-nvl72' }).failures).toEqual([]) // no NVLSM part on a tray
    const liquid = fail(withConfig(INITIAL, { cooling: 'liquid' }), 'su1-cdu', 'down')
    expect(liquid.failures).toHaveLength(1)
    expect(withConfig(liquid, { cooling: 'air' }).failures).toEqual([])
    expect(applyScenario(liquid, 'same-node').failures).toEqual([]) // a trace scenario resets the configuration to the defaults (air)
  })
  it('applies a library scenario: its configuration, its failures, the view, and Simulate mode', () => {
    const s = applySimScenario(INITIAL, 'leaf-dual')
    expect(s.config.planes).toBe('dual')
    expect(s.mode).toBe('simulate')
    expect(s.failures).toEqual([{ id: 'su1-leaf-pA-r3', mode: 'down' }])
    expect(s.view).toEqual({ level: 'fabric' })
    expect([...s.expanded]).toEqual([1])
    expect(applySimScenario(INITIAL, 'fm-stops').view).toEqual({ level: 'node', serverId: 'su1-n05' })
    expect(setMode(s, 'explore').failures).toEqual(s.failures)
  })
})

describe('goTo', () => {
  const at = (patch: Partial<Config> = {}): AppState => ({ ...INITIAL, config: withPatch(DEFAULT_CONFIG, patch)! })
  const hit = (s: AppState, q: string, id: string) => findParts(s.config, q, s.overlay.telemetry, 1000).hits.find((h) => h.id === id)!

  it('a server: opens the fabric and its group, and selects it', () => {
    const s = { ...at({ suCount: 2 }), view: { level: 'overview' } as const }
    const t = goTo(s, hit(s, 'su2 n05', 'su2-n05'))
    expect(t.view).toEqual({ level: 'fabric' })
    expect(t.selected).toBe('su2-n05')
    expect([...t.expanded]).toContain(2)
  })

  it('a block: opens the overview and selects it', () => {
    const s = at({ ufm: 'ha' })
    const t = goTo(s, hit(s, 'ufm', 'blk-ufm'))
    expect(t.view).toEqual({ level: 'overview' })
    expect(t.selected).toBe('blk-ufm')
  })

  it('a GPU: opens the node view of its server and selects it', () => {
    const s = at()
    const t = goTo(s, hit(s, 'su1 n05 gpu3', 'su1-n05/gpu3'))
    expect(t.view).toEqual({ level: 'node', serverId: 'su1-n05' })
    expect(t.selected).toBe('su1-n05/gpu3')
  })

  it('a rack device: opens the racks view of its SU and selects it', () => {
    const s = at({ suCount: 2 })
    const t = goTo(s, hit(s, 'su2-k1-pdu1', 'su2-k1-pdu1'))
    expect(t.view).toMatchObject({ level: 'racks', su: 2 })
    expect(t.selected).toBe('su2-k1-pdu1')
  })

  it('a rear device (a PDU): opens the rear face, so the canvas draws it', () => {
    for (const s of [at({ suCount: 2 }), { ...at({ suCount: 2 }), view: { level: 'racks', su: 1, face: 'front' } as const }]) {
      const t = goTo(s, hit(s, 'su2-k1-pdu1', 'su2-k1-pdu1'))
      expect(t.view).toEqual({ level: 'racks', su: 2, face: 'rear' })
      expect(racksElements(generateRacks(t.config, 2), 'rear').some((e) => e.data.id === 'su2-k1-pdu1')).toBe(true)
    }
  })

  it('a rack (both faces show it): keeps the current face', () => {
    const s = { ...at({ suCount: 2 }), view: { level: 'racks', su: 1, face: 'rear' } as const }
    expect(goTo(s, hit(s, 'su2-k1', 'su2-k1')).view).toEqual({ level: 'racks', su: 2, face: 'rear' })
  })

  it('a rail: opens the fabric and lights the rail, also when the rail is already lit', () => {
    const s = { ...at(), rail: 3 }
    const t = goTo(s, hit(s, 'rail 3', 'rail-3'))
    expect(t.view).toEqual({ level: 'fabric' })
    expect(t.rail).toBe(3)
    expect(t.selected).toBeNull()
  })

  it('keeps the mode (Simulate)', () => {
    const s = { ...at(), mode: 'simulate' as const }
    expect(goTo(s, hit(s, 'su1 n05', 'su1-n05')).mode).toBe('simulate')
  })

  it('a hit of an old configuration whose server is gone: no change', () => {
    const old = at({ suCount: 2 })
    const h = hit(old, 'su2 n05 gpu3', 'su2-n05/gpu3')
    const s = at({ suCount: 1 })
    expect(goTo(s, h)).toBe(s)
  })

  it('a runbook (a link): does not change the state', () => {
    const s = at()
    expect(goTo(s, hit(s, 'rb-03', 'RB-03'))).toBe(s)
  })
})

describe('activeScenario', () => {
  it('finds the scenario that applyScenario opened, also when two scenarios have the same ends', () => {
    for (const sc of SCENARIOS) {
      const s = applyScenario(INITIAL, sc.id)
      expect(activeScenario(s.trace, s.config)?.id, sc.id).toBe(sc.id)
    }
  })
  it('finds none for a trace that the user changed, and none with no trace', () => {
    const s = applyScenario(INITIAL, 'pxn')
    expect(activeScenario({ ...s.trace!, options: { ...s.trace!.options, pxn: !s.trace!.options.pxn } }, s.config)?.id).not.toBe('pxn')
    expect(activeScenario({ ...s.trace!, src: 'su1-n01/gpu0' }, s.config)).toBeNull()
    expect(activeScenario(null, s.config)).toBeNull()
  })
})

describe('activeSimScenario', () => {
  it('finds the scenario that applySimScenario applied, with the failures in any order', () => {
    for (const sc of SIM_SCENARIOS) {
      const s = applySimScenario(INITIAL, sc.id)
      expect(activeSimScenario([...s.failures].reverse(), s.config)?.id, sc.id).toBe(sc.id)
    }
  })
  it('finds none after a change, and none with no failure', () => {
    const s = applySimScenario(INITIAL, SIM_SCENARIOS[0]!.id)
    expect(activeSimScenario([...s.failures, { id: 'spine-01', mode: 'down' }], s.config)).toBeNull()
    expect(activeSimScenario([], s.config)).toBeNull()
    const changed = withConfig(s, { tenants: s.config.tenants === 3 ? 2 : 3 })
    expect(activeSimScenario(changed.failures, changed.config)).toBeNull() // a configuration change ends the scenario
  })
  it('starts a scenario with steps at step 0; setSimStep moves and clamps, and keeps the view', () => {
    const os = SIM_SCENARIOS.find((x) => x.id === 'os-patch')!
    const s0 = applySimScenario(INITIAL, 'os-patch')
    expect(s0.failures).toEqual(stepFailures(os, 0))
    const s1 = setSimStep(s0, 1)
    expect(s1.failures).toHaveLength(stepFailures(os, 1).length)
    expect(s1.view).toEqual(s0.view)
    expect(setSimStep(s1, 99).failures).toHaveLength(os.failures.length)
    expect(setSimStep(s0, -1)).toBe(s0)
    expect(setSimStep(applySimScenario(INITIAL, 'leaf-single'), 1).failures).toHaveLength(1) // no steps: no change
  })
})

describe('the tab of the inspector', () => {
  it('takes a tab that exists, and refuses another one', () => {
    expect(setTab(INITIAL, 'lifecycle').tab).toBe('lifecycle')
    expect(setTab(INITIAL, 'specs')).toBe(INITIAL)
    expect(setTab(INITIAL, 'no-such-tab' as never)).toBe(INITIAL)
  })

  it('keeps the Lifecycle tab for a host, and leaves it for a part that is not one', () => {
    const s = setTab(INITIAL, 'lifecycle')
    expect(select(s, 'su1-n71').tab).toBe('lifecycle') // a server
    expect(select(s, 'su1-n71/gpu2').tab).toBe('specs') // a GPU of the server
    expect(select(s, 'su1-leaf-r3').tab).toBe('specs')
    expect(select(select(s, 'su1-leaf-r3'), 'su1-n71').tab).toBe('specs') // the tab does not come back
  })

  it('gives the tabs of a part: the Lifecycle tab only for a host', () => {
    expect(tabIdsFor(true)).toEqual(['specs', 'signals', 'learn', 'owner', 'lifecycle'])
    expect(tabIdsFor(false)).toEqual(['specs', 'signals', 'learn', 'owner'])
  })
})

describe('the view of the fabric', () => {
  it('takes the three views of M3, and refuses another one', () => {
    expect(setTopoSource(INITIAL, 'intent').topoSource).toBe('intent')
    expect(setTopoSource(INITIAL, 'discovered').topoSource).toBe('discovered')
    expect(setTopoSource(INITIAL, 'design')).toBe(INITIAL)
    expect(setTopoSource(INITIAL, 'no-such-source' as never)).toBe(INITIAL)
  })
})

describe('the diagnosis', () => {
  it('opens the chain view, and keeps it when the mode changes', () => {
    const s = setDiagView(INITIAL, 'chain')
    expect(s.diag.view).toBe('chain')
    expect(setDiagView(s, 'chain')).toBe(s)
    expect(setMode(s, 'simulate').diag.view).toBe('chain')
  })

  it('takes a saved incident, and refuses an unknown one', () => {
    const s = setIncident(INITIAL, 'xid79-multinode')
    expect(s.diag.incident).toBe('xid79-multinode')
    expect(setIncident(s, 'no-such-incident')).toBe(s)
    expect(setIncident(INITIAL, CURRENT_INCIDENT).diag.incident).toBe(CURRENT_INCIDENT)
  })

  it('opens the checklist of a runbook that has one, and refuses one that does not', () => {
    expect(openChecklist(INITIAL, 'RB-03').diag.checklist).toBe('RB-03')
    expect(openChecklist(INITIAL, 'RB-05')).toBe(INITIAL)
    expect(closeChecklist(openChecklist(INITIAL, 'RB-03')).diag.checklist).toBeNull()
    expect(closeChecklist(INITIAL)).toBe(INITIAL)
  })

  it('ticks a step with the clock of the session, and untick removes it', () => {
    const s = toggleStep(INITIAL, 'RB-03', 2, '04:12:30')
    expect(s.diag.done).toEqual(['RB-03.2'])
    expect(s.diag.at).toEqual({ 'RB-03.2': '04:12:30' })
    const off = toggleStep(s, 'RB-03', 2, '04:13:00')
    expect(off.diag.done).toEqual([])
    expect(off.diag.at).toEqual({})
  })

  it('refuses a step that the checklist does not have', () => {
    expect(toggleStep(INITIAL, 'RB-03', 9)).toBe(INITIAL)
    expect(toggleStep(INITIAL, 'RB-05', 1)).toBe(INITIAL)
  })

  it('marks a step of a link as done with no clock, because the link cannot know when', () => {
    const s = toggleStep(INITIAL, 'RB-12', 1, null)
    expect(s.diag.done).toEqual(['RB-12.1'])
    expect(s.diag.at).toEqual({})
  })
})
