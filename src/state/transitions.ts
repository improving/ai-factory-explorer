import { raRow } from '../catalog/designs'
import { DEFAULT_CONFIG, KEYS, type Config } from '../config/config'
import { withPatch } from '../config/rules'
import { designOf, generateFabric } from '../topology/fabric'
import { elementExists, serverExists, serverOf, suId, suOf } from '../topology/ids'
import { generateOverview } from '../topology/overview'
import { platformFor } from '../catalog/platforms'
import { portFaceOf, switchPortFacts, type Face } from '../catalog/racks'
import { switchOf } from '../topology/ports'
import { layoutOf, rackOf, racksOfSu } from '../topology/racks'
import { type FailMode } from '../catalog/failures'
import { validFailure, type Failure } from '../simulate/failable'
import { SIM_SCENARIOS, activeSimStep, stepFailures } from '../simulate/scenarios'
import { LAYERS, NO_OVERLAY, type ColorOverlay, type LayerId, type Overlay } from '../views/overlays'
import { DEFAULT_JOB, type Job } from '../schedule/plan'
import { DEFAULT_LOAD, NODE_CHOICES, RATE_CHOICES, SEED_MAX, TICKS, nearest, type LoadSpec } from '../schedule/load'
import { SPAN, WINDOW_MIN, atOf, type WindowId } from '../telemetry/events'
import { CURRENT_INCIDENT, INCIDENT_BY_ID, incidentOf } from '../diagnose/incidents'
import { checklistOf, stepKey } from '../catalog/checklists'
import { isHost } from '../catalog/lifecycle'
import { SOURCE_BY_ID, type SourceId } from '../topology/sources'
import { TAB_IDS, type TabId } from './tabs'
import type { RunbookId } from '../catalog/runbooks'
import { gpuEnd } from '../routing/ends'
import { SCENARIOS, type Scenario } from '../routing/scenarios'
import { VIRTUAL_PARTS } from '../catalog/paths'
import { computeTrace } from '../routing/compute'
import type { PathId } from '../routing/factory'
import { DEFAULT_TRACE_OPTIONS, type TraceOptions } from '../routing/trace'
import type { Hit } from '../search/search'
import { DEFAULT_COLL, fitColl, type CollState } from './coll'

export type ViewState =
  | { level: 'overview' }
  | { level: 'fabric' }
  | { level: 'node'; serverId: string }
  | { level: 'racks'; su: number; face: Face }
  | { level: 'rack'; su: number; rackId: string; face: Face }
  | { level: 'trace' }

export type Mode = 'explore' | 'trace' | 'simulate' | 'collectives' | 'schedule' | 'library'
// A trace: the source GPU, the destination GPU (null while the user picks it, and for a factory path), the options,
// the current hop, and the factory path (null for a GPU-to-GPU trace).
export type TraceState = { src: string; dst: string | null; options: TraceOptions; hop: number; path: PathId | null }

// The diagnosis of Simulate mode: the bottom panel (the impact or the chain), the incident, the open checklist,
// the steps that are done, and the clock of each tick (the session clock, which stays out of the URL).
export type DiagView = 'impact' | 'chain'
export type DiagState = { view: DiagView; incident: string; checklist: RunbookId | null; done: string[]; at: Record<string, string> }
export const DEFAULT_DIAG: DiagState = { view: 'impact', incident: CURRENT_INCIDENT, checklist: null, done: [], at: {} }

// The time view of the canvas: the window of the log, and the cursor in minutes from the start of the window.
export type TimeView = { window: WindowId; cursor: number }
export const DEFAULT_TIME: TimeView = { window: '24h', cursor: WINDOW_MIN['24h'] }

// The load of Schedule mode: the decision path of one job, or the load of the fleet over 30 minutes.
export type SchedView = 'decision' | 'load'
export type LoadState = { view: SchedView; spec: LoadSpec; cursor: number }
export const DEFAULT_LOAD_STATE: LoadState = { view: 'decision', spec: DEFAULT_LOAD, cursor: 0 }

export type AppState = {
  config: Config
  view: ViewState
  expanded: ReadonlySet<number> // the first SU of each open group
  selected: string | null
  rail: number | null
  overlay: Overlay
  mode: Mode
  sched: Job
  load: LoadState // the view of Schedule mode, the load spec, and the cursor of the run
  time: TimeView | null // the window of the log of the fleet, and the cursor; null when the time view is off
  topoSource: SourceId // the view of the fabric: the design, the site intent, or the discovery
  tab: TabId // the tab of the inspector
  diag: DiagState
  trace: TraceState | null
  failures: Failure[]
  coll: CollState | null // Collectives mode only
  guide: { id: string; step: number } | null // the open guide and its step (from 1)
  doc: string | null // Library mode: the open document, by its id in content/docs.ts
  sec: string | null // Library mode: the section of the document, by the slug of its heading
  docFrom: Mode | null // the mode that the reader came from: the return path (it stays out of the URL)
}

export const INITIAL: AppState = { config: DEFAULT_CONFIG, view: { level: 'fabric' }, expanded: new Set(), selected: null, rail: null, overlay: NO_OVERLAY, mode: 'explore', sched: DEFAULT_JOB, load: DEFAULT_LOAD_STATE, time: null, topoSource: 'design', tab: 'specs', diag: DEFAULT_DIAG, trace: null, failures: [], coll: null, guide: null, doc: null, sec: null, docFrom: null }

// Above 576 servers or trays (8 SU of B300 XDR), all groups open is too large to draw.
export const EXPAND_ALL_SERVERS = 576

const FABRIC: ViewState = { level: 'fabric' }

export const serverCount = (config: Config): number => raRow(designOf(config), config.suCount)?.nodes ?? 0

// The first SU of the group that holds `su`: the key of an open group.
export function groupSu(config: Config, su: number): number {
  const g = designOf(config).susPerGroup
  return Math.floor((su - 1) / g) * g + 1
}

// The ids that only the fabric can confirm: a group, a leaf, a spine, and their cables (the id alone
// does not say if the design has that leaf, or if a server slot is empty).
const FABRIC_ID = /^su\d+$|-leaf-|^spine-\d+$|^su\d+-n\d+~/

// A rack, a CDU, or a part that only the rack layout has (a PDU, a power shelf, a manifold, an NVL72 switch tray).
const RACK_ID = /^(su\d+-(k\d+|net\d+|cdu)|core-k\d+)(-(pdu\d+|ps\d+|sw\d+|manifold))?$/

// A block exists when the overview has it; a bundle of the fabric view when both of its ends exist
// (an uplink anchor stands for its group); a fabric part or cable when the fabric has it; anything
// else when the topology has it.
function exists(config: Config, id: string, telemetry = false): boolean {
  if (id.startsWith('path-')) return id in VIRTUAL_PARTS
  if (id.startsWith('blk-')) return generateOverview(config, { telemetry }).nodes.some((n) => n.id === id)
  if (/\/p\d+$/.test(id)) {
    const [dev, port] = id.split('/') as [string, string]
    const sw = switchOf(config, dev)
    const n = Number(port.slice(1))
    return sw !== null && exists(config, dev) && n >= 1 && n <= sw.ports.value
  }
  if (RACK_ID.test(id)) {
    const layout = layoutOf(config)
    return layout.spot.has(id) || layout.racks.some((r) => r.id === id)
  }
  if (id.includes('=>')) return id.split('=>').every((end) => exists(config, end.replace(/-uplinks$/, '')))
  if (FABRIC_ID.test(id)) {
    const fabric = generateFabric(config)
    return fabric.nodes.some((n) => n.id === id) || fabric.edges.some((e) => e.id === id)
  }
  return elementExists(config, id)
}

// The view that a new configuration keeps: a level whose server, SU, or rack is gone goes up.
function viewFor(config: Config, v: ViewState): ViewState {
  switch (v.level) {
    case 'node':
      return serverExists(config, v.serverId) ? v : FABRIC
    case 'racks':
      return v.su <= config.suCount ? v : FABRIC
    case 'rack':
      if (v.su > config.suCount) return FABRIC
      return racksOfSu(config, v.su).some((r) => r.id === v.rackId) ? v : { level: 'racks', su: v.su, face: v.face }
    default:
      return v
  }
}

// Each transition returns the same object when it changes nothing, so a refused change is easy to test.
export function withConfig(s: AppState, patch: Partial<Config>): AppState {
  const config = withPatch(s.config, patch)
  if (config === null) return s
  const keep = s.trace !== null && gpuEnd(config, s.trace.src) !== null && (s.trace.dst === null || gpuEnd(config, s.trace.dst) !== null)
  const trace = keep ? { ...s.trace!, hop: 0 } : null
  const view = s.view.level === 'trace' && (trace === null || (trace.dst === null && trace.path === null)) ? FABRIC : viewFor(config, s.view)
  const expanded = new Set([...s.expanded].filter((su) => su <= config.suCount && groupSu(config, su) === su))
  const selected = s.selected !== null && exists(config, s.selected, s.overlay.telemetry) ? s.selected : null
  const rail = s.rail !== null && s.rail < designOf(config).rails.value ? s.rail : null
  const coll = s.coll ? fitColl(config, { ...s.coll, step: 0, pair: null }) : null
  return { ...s, config, view, expanded, selected, rail, trace, coll, failures: s.failures.filter((f) => validFailure(config, f)) }
}

export function toggleSu(s: AppState, su: number): AppState {
  if (su < 1 || su > s.config.suCount) return s
  const key = groupSu(s.config, su)
  const expanded = new Set(s.expanded)
  if (expanded.has(key)) expanded.delete(key)
  else expanded.add(key)
  return { ...s, expanded }
}

export function openSu(s: AppState, su: number): AppState {
  if (su < 1 || su > s.config.suCount) return s
  return s.expanded.has(groupSu(s.config, su)) ? s : toggleSu(s, su)
}

export function expandAll(s: AppState): AppState {
  if (serverCount(s.config) > EXPAND_ALL_SERVERS) return s
  const g = designOf(s.config).susPerGroup
  return { ...s, expanded: new Set(Array.from({ length: s.config.suCount / g }, (_, i) => i * g + 1)) }
}

export function collapseAll(s: AppState): AppState {
  return { ...s, expanded: new Set() }
}

export function openServer(s: AppState, id: string): AppState {
  if (!serverExists(s.config, id)) return s
  return { ...s, view: { level: 'node', serverId: id }, selected: null }
}

// The overview has no rails: the rail highlight would dim every block.
export function openOverview(s: AppState): AppState {
  return { ...s, view: { level: 'overview' }, selected: null, rail: null }
}

// A block of the overview, or a part of a rack level, is not in the fabric, so its selection goes.
export function openFabric(s: AppState): AppState {
  const away = s.view.level === 'racks' || s.view.level === 'rack' || s.selected?.startsWith('blk-')
  return { ...s, view: FABRIC, selected: away ? null : s.selected }
}

const faceOf = (v: ViewState): Face => (v.level === 'racks' || v.level === 'rack' ? v.face : 'front')

// The racks level has no rail colours, so the rail highlight would dim every rack.
export function openRacks(s: AppState, su: number): AppState {
  if (!Number.isInteger(su) || su < 1 || su > s.config.suCount) return s
  return { ...s, view: { level: 'racks', su, face: faceOf(s.view) }, selected: null, rail: null }
}

// A rack of the SU that the racks level shows; the face turns to the side of the rack's ports.
export function openRack(s: AppState, rackId: string): AppState {
  const rack = rackOf(s.config, rackId)
  if (!rack || rack.role === 'cdu') return s // the CDU has no ports
  const shown = s.view.level === 'racks' || s.view.level === 'rack' ? s.view.su : rack.su
  if (!racksOfSu(s.config, shown).some((r) => r.id === rackId)) return s
  const d = designOf(s.config)
  const face: Face =
    rack.role === 'compute' ? portFaceOf(platformFor(s.config)).value : switchPortFacts(rack.role === 'network' ? d.leafSwitch : d.spineSwitch).face.value
  return { ...s, view: { level: 'rack', su: shown, rackId, face }, selected: null }
}

export function setFace(s: AppState, face: Face): AppState {
  if ((s.view.level !== 'racks' && s.view.level !== 'rack') || s.view.face === face) return s
  return { ...s, view: { ...s.view, face } }
}

// Esc: from a server to its fabric; in the fabric, first clear the rail and the selection, then go up
// to the factory overview; in the overview, clear the rail and the selection.
export function up(s: AppState): AppState {
  // Collectives mode: first the selected pair (the buffers come back), then the selection; the view stays.
  if (s.mode === 'collectives') {
    if (s.coll && s.coll.pair !== null) return { ...s, coll: { ...s.coll, pair: null } }
    return s.selected !== null ? { ...s, selected: null } : s
  }
  if (s.view.level === 'trace') {
    if (s.trace?.path) return { ...s, view: { level: 'overview' }, selected: null } // a factory path goes through the overview
    const server = s.trace ? serverOf(s.trace.src) : null
    return server ? { ...s, view: { level: 'node', serverId: server }, selected: s.trace!.src } : { ...s, view: FABRIC }
  }
  if (s.view.level === 'node') {
    const id = s.view.serverId
    return { ...openSu(s, suOf(id)!), view: FABRIC, selected: id }
  }
  if (s.view.level === 'rack') return { ...s, view: { level: 'racks', su: s.view.su, face: s.view.face }, selected: s.view.rackId, rail: null }
  // As in the fabric: first clear the selection, then go up.
  if (s.view.level === 'racks') return s.selected !== null ? { ...s, selected: null } : { ...s, view: FABRIC, selected: suId(groupSu(s.config, s.view.su)) }
  if (s.view.level === 'fabric' && s.rail === null && s.selected === null) return openOverview(s)
  return { ...s, rail: null, selected: null }
}

export function select(s: AppState, id: string | null): AppState {
  if (id !== null && !exists(s.config, id, s.overlay.telemetry || s.view.level === 'trace')) return { ...s, selected: null }
  // The Lifecycle tab needs a host: a part that is not one shows the first tab.
  const tab = s.tab === 'lifecycle' && !isHost(s.config, id) ? 'specs' : s.tab
  return { ...s, selected: id, tab }
}

// Search: open the view that shows the part, then select it. A rail result lights the rail in the fabric.
export function goTo(s: AppState, hit: Hit): AppState {
  // Collectives mode draws over the view: a search that finds the part goes back to Explore mode to show it.
  if (s.mode === 'collectives') {
    const base = setMode(s, 'explore')
    const r = goTo(base, hit)
    return r === base ? s : r
  }
  const w = hit.where
  if (w.level === 'link') return s // a runbook opens in a new tab (Search)
  if (hit.rail !== undefined) {
    if (hit.rail < 0 || hit.rail >= designOf(s.config).rails.value) return s
    return { ...openFabric(s), selected: null, rail: hit.rail }
  }
  const opened =
    w.level === 'overview' ? openOverview(s)
    : w.level === 'fabric' ? (w.su === null ? openFabric(s) : openSu(openFabric(s), w.su))
    : w.level === 'node' ? openServer(s, w.serverId)
    : openRacks(s, w.su)
  if (opened.view.level !== w.level) return s // the server or the SU is not in this configuration
  // A PDU or a manifold shows only on the rear face of the elevation.
  const turned = w.level === 'racks' && layoutOf(s.config).spot.get(hit.id)?.face === 'rear' ? setFace(opened, 'rear') : opened
  const next = select(turned, hit.id)
  return next.selected === hit.id ? next : s
}

export function toggleRail(s: AppState, rail: number): AppState {
  if (s.view.level === 'overview' || s.view.level === 'racks' || s.view.level === 'trace') return s
  if (s.mode === 'collectives') return s // the ring parts have no rail class: a lit rail would dim them all
  if (!Number.isInteger(rail) || rail < 0 || rail >= designOf(s.config).rails.value) return s
  return { ...s, rail: s.rail === rail ? null : rail }
}

export function setColor(s: AppState, color: ColorOverlay): AppState {
  return s.overlay.color === color ? s : { ...s, overlay: { ...s.overlay, color } }
}

// The hidden layers stay in LAYERS order, so the URL of one set of layers is always the same.
export function toggleLayer(s: AppState, layer: LayerId): AppState {
  const on = new Set(s.overlay.hidden)
  if (on.has(layer)) on.delete(layer)
  else on.add(layer)
  return { ...s, overlay: { ...s.overlay, hidden: LAYERS.map((l) => l.id).filter((id) => on.has(id)) } }
}

const TELEMETRY_BLOCKS = ['blk-prometheus', 'blk-alertmanager', 'blk-itsm', 'blk-siem']

export function setTelemetry(s: AppState, telemetry: boolean): AppState {
  if (s.overlay.telemetry === telemetry) return s
  const selected = !telemetry && s.selected !== null && TELEMETRY_BLOCKS.includes(s.selected) ? null : s.selected
  return { ...s, overlay: { ...s.overlay, telemetry }, selected }
}

// The nvidia-smi topo -m matrix below the node view of an HGX server.
export function setTopo(s: AppState, topo: boolean): AppState {
  return s.overlay.topo === topo ? s : { ...s, overlay: { ...s.overlay, topo } }
}

// Trace mode starts with no trace; Collectives mode starts with the default collective; another mode drops the trace,
// the collective, and the trace view.
export function setMode(s: AppState, mode: Mode): AppState {
  if (s.mode === mode) return s
  if (mode === 'trace') return { ...s, mode, trace: null, coll: null }
  const view = s.view.level === 'trace' ? FABRIC : s.view
  if (mode === 'collectives') return { ...s, mode, trace: null, coll: fitColl(s.config, DEFAULT_COLL), view, selected: null, rail: null }
  if (mode === 'schedule') return { ...s, mode, trace: null, coll: null, view, selected: null, rail: null, expanded: new Set(Array.from({ length: s.config.suCount }, (_, i) => i + 1)) }
  return { ...s, mode, trace: null, coll: null, view }
}

// Library mode: the reader of a document. A read from a panel keeps the mode that it came from, so the
// reader can go back to the view that it left; a link that opens a document has no return path.
export function openDoc(s: AppState, doc: string, sec: string | null = null): AppState {
  const docFrom = s.mode === 'library' ? s.docFrom : s.mode
  if (s.mode === 'library' && s.doc === doc && s.sec === sec) return s
  return { ...s, mode: 'library', doc, sec, docFrom }
}

// Back to the view that the reader left. A link with no return path goes to Explore.
export function closeDoc(s: AppState): AppState {
  return { ...s, mode: s.docFrom ?? 'explore', doc: null, sec: null, docFrom: null }
}

// The job of Schedule mode. The controls clamp the values, so a URL cannot ask for a negative job.
export function setSched(s: AppState, patch: Partial<Job>): AppState {
  const next = { ...s.sched, ...patch }
  next.gpus = Math.min(4096, Math.max(1, Math.round(next.gpus)))
  next.segments = Math.min(4, Math.max(1, Math.round(next.segments)))
  return { ...s, sched: next }
}

// The view of Schedule mode: the decision path of one job, or the load of the fleet.
export function setSchedView(s: AppState, view: SchedView): AppState {
  if (s.load.view === view) return s
  return { ...s, load: { ...s.load, view } }
}

// The spec of the load run. The node count and the rate are choices of the panel, and a link takes the nearest one,
// so a bad URL cannot ask for a fleet that the panel cannot show.
export function setLoadSpec(s: AppState, patch: Partial<LoadSpec>): AppState {
  const next = { ...s.load.spec, ...patch }
  const seed = Number.isFinite(next.seed) ? Math.min(SEED_MAX, Math.max(0, Math.round(next.seed))) : DEFAULT_LOAD.seed
  const spec: LoadSpec = { seed, nodes: nearest(NODE_CHOICES, next.nodes), perMinute: nearest(RATE_CHOICES, next.perMinute) }
  if (spec.seed === s.load.spec.seed && spec.nodes === s.load.spec.nodes && spec.perMinute === s.load.spec.perMinute) return s
  return { ...s, load: { ...s.load, spec } }
}

// The cursor of the run: a tick of the 30 minutes. It stays out of the decision view.
export function setLoadCursor(s: AppState, cursor: number): AppState {
  const t = Math.min(TICKS - 1, Math.max(0, Math.round(Number.isFinite(cursor) ? cursor : 0)))
  return t === s.load.cursor ? s : { ...s, load: { ...s.load, cursor: t } }
}

// The time view: off, or a window of the log at a cursor. The end of the window is the state of today.
export function setTime(s: AppState, view: TimeView | null): AppState {
  if (view === null) return s.time === null ? s : { ...s, time: null }
  return { ...s, time: { window: view.window, cursor: Math.min(WINDOW_MIN[view.window], Math.max(0, Math.round(view.cursor))) } }
}

// Another window keeps the clock when it can: the cursor is the minute of the log, and a minute outside the new
// window stops at its end.
export function setTimeWindow(s: AppState, window: WindowId): AppState {
  if (s.time === null || s.time.window === window) return s
  const at = atOf(s.time.window, s.time.cursor)
  const cursor = Math.min(WINDOW_MIN[window], Math.max(0, at - (SPAN - WINDOW_MIN[window])))
  return { ...s, time: { window, cursor } }
}

export function setTimeCursor(s: AppState, cursor: number): AppState {
  if (s.time === null) return s
  const c = Math.min(WINDOW_MIN[s.time.window], Math.max(0, Math.round(Number.isFinite(cursor) ? cursor : 0)))
  return c === s.time.cursor ? s : { ...s, time: { ...s.time, cursor: c } }
}

// The tab of the inspector: a guide step or a link opens it.
export function setTab(s: AppState, tab: TabId): AppState {
  if (!TAB_IDS.includes(tab)) return s
  return s.tab === tab ? s : { ...s, tab }
}

// The view of the fabric: the reference design, the site intent, or the discovery.
export function setTopoSource(s: AppState, id: SourceId): AppState {
  if (!SOURCE_BY_ID.has(id)) return s
  return s.topoSource === id ? s : { ...s, topoSource: id }
}

// The bottom panel of Simulate mode: the impact of the failures, or the chain of the diagnosis.
export function setDiagView(s: AppState, view: DiagView): AppState {
  if (s.diag.view === view) return s
  const next = { ...s, diag: { ...s.diag, view } }
  return view === 'chain' ? openSubjects(next) : next
}

// The incident of the diagnosis: a saved incident, or the failures of the simulator.
export function setIncident(s: AppState, id: string): AppState {
  if (id !== CURRENT_INCIDENT && !INCIDENT_BY_ID.has(id)) return s
  if (s.diag.incident === id) return s
  return openSubjects({ ...s, diag: { ...s.diag, incident: id } })
}

// The groups of the servers of the chain open, so the canvas shows the parts that the chain names.
function openSubjects(s: AppState): AppState {
  const incident = incidentOf(s.diag.incident, s.config, s.failures)
  if (!incident) return s
  const expanded = new Set(s.expanded)
  for (const e of incident.events) {
    const su = suOf(serverOf(e.subject ?? '') ?? e.subject ?? '')
    if (su !== null && su <= s.config.suCount) expanded.add(groupSu(s.config, su))
  }
  return { ...s, expanded }
}

// The checklist of a runbook that has one.
export function openChecklist(s: AppState, id: RunbookId): AppState {
  if (!checklistOf(id)) return s
  return s.diag.checklist === id ? s : { ...s, diag: { ...s.diag, checklist: id } }
}

export function closeChecklist(s: AppState): AppState {
  return s.diag.checklist === null ? s : { ...s, diag: { ...s.diag, checklist: null } }
}

// The clock of a tick, from the clock of the machine: HH:MM:SS.
const nowClock = (): string => new Date().toTimeString().slice(0, 8)

// One step of the open checklist: done or not. The clock of a tick is the session clock; a step that a link
// marks as done has no clock, because the link cannot know when it was done.
export function toggleStep(s: AppState, id: RunbookId, n: number, clock: string | null = nowClock()): AppState {
  if (!checklistOf(id)?.some((x) => x.n === n)) return s
  const key = stepKey(id, n)
  const on = s.diag.done.includes(key)
  const done = on ? s.diag.done.filter((k) => k !== key) : [...s.diag.done, key]
  const at = { ...s.diag.at }
  if (on || clock === null) delete at[key]
  else at[key] = clock
  return { ...s, diag: { ...s.diag, done, at } }
}

// The GPUs, the options, and the factory path of a trace; the view does not change. A part that is not a GPU of the
// configuration is refused.
export function setTrace(s: AppState, src: string, dst: string | null, options: TraceOptions = DEFAULT_TRACE_OPTIONS, path: PathId | null = null): AppState {
  if (!gpuEnd(s.config, src) || (dst !== null && !gpuEnd(s.config, dst))) return s
  return { ...s, mode: 'trace', coll: null, trace: { src, dst, options, hop: 0, path } }
}

export function openTrace(s: AppState): AppState {
  if (!s.trace || (s.trace.dst === null && s.trace.path === null)) return s
  return { ...s, view: { level: 'trace' }, selected: null, rail: null }
}

// "To VAST" (or another factory path) from the picked source GPU.
export function setPath(s: AppState, path: PathId): AppState {
  if (!s.trace) return s
  return openTrace(setTrace(s, s.trace.src, null, s.trace.options, path))
}

// A GPU click in Trace mode: the first one is the source; the second one is the destination, and the trace view opens.
export function pickGpu(s: AppState, id: string): AppState {
  if (s.mode !== 'trace' || !gpuEnd(s.config, id)) return s
  if (!s.trace || s.trace.dst !== null || s.trace.path !== null) {
    const t = setTrace(s, id, null)
    if (t === s) return s
    // The source is selected, so the user sees it; a new source leaves the path of the old trace.
    return { ...t, selected: id, view: t.view.level === 'trace' ? FABRIC : t.view }
  }
  if (id === s.trace.src) return s
  return openTrace(setTrace(s, s.trace.src, id, s.trace.options))
}

// A row of the tracer table: its configuration (from the defaults), its GPUs and options, and the trace view.
export function applyScenario(s: AppState, id: string): AppState {
  const sc = SCENARIOS.find((x) => x.id === id)
  const config = sc ? withPatch(DEFAULT_CONFIG, sc.patch) : null
  if (!sc || !config) return s
  return openTrace(setTrace({ ...s, config, expanded: new Set(), selected: null, rail: null, failures: s.failures.filter((f) => validFailure(config, f)) }, sc.src, sc.dst, sc.options, sc.path))
}

// The scenario of a trace, so the list shows it: the same ends, path, options, and configuration
// (cross-rail and pxn differ only in PXN; same-rail and dual-plane only in the configuration). Null for a trace that the user made or changed.
export function activeScenario(trace: TraceState | null, config: Config): Scenario | null {
  if (!trace) return null
  return (
    SCENARIOS.find((sc) => {
      const c = withPatch(DEFAULT_CONFIG, sc.patch)
      const same = (Object.keys(sc.options) as (keyof TraceOptions)[]).every((k) => sc.options[k] === trace.options[k])
      return c !== null && same && sc.src === trace.src && sc.dst === trace.dst && sc.path === trace.path && KEYS.every((k) => c[k] === config[k])
    }) ?? null
  )
}

export function setTraceOptions(s: AppState, patch: Partial<TraceOptions>): AppState {
  if (!s.trace) return s
  return { ...s, trace: { ...s.trace, options: { ...s.trace.options, ...patch }, hop: 0 } }
}

// The current hop of the trace, kept inside the path.
export function setHop(s: AppState, hop: number): AppState {
  if (!s.trace || !Number.isInteger(hop)) return s
  const r = computeTrace(s.config, s.trace, s.failures) // the hops that the trace bar shows (with the failures)
  if (!r) return s
  if (!r.ok) return s
  const h = Math.max(0, Math.min(r.trace.hops.length - 1, hop))
  return h === s.trace.hop ? s : { ...s, trace: { ...s.trace, hop: h } }
}

export function clearTrace(s: AppState): AppState {
  if (!s.trace) return s
  return { ...s, trace: null, view: s.view.level === 'trace' ? FABRIC : s.view }
}

// A failure of the simulator: one for each element; a new mode replaces the old one.
export function fail(s: AppState, id: string, mode: FailMode): AppState {
  if (!validFailure(s.config, { id, mode })) return s
  return { ...s, failures: [...s.failures.filter((f) => f.id !== id), { id, mode }] }
}

export function repair(s: AppState, id: string): AppState {
  return s.failures.some((f) => f.id === id) ? { ...s, failures: s.failures.filter((f) => f.id !== id) } : s
}

export function resetFailures(s: AppState): AppState {
  return s.failures.length === 0 ? s : { ...s, failures: [] }
}

// A row of the scenario library: its configuration (from the defaults), its failures, its view, and Simulate mode.
export function applySimScenario(s: AppState, id: string): AppState {
  const sc = SIM_SCENARIOS.find((x) => x.id === id)
  const config = sc ? withPatch(DEFAULT_CONFIG, sc.patch) : null
  if (!sc || !config) return s
  const view: ViewState = sc.server ? { level: 'node', serverId: sc.server } : FABRIC
  return {
    ...s,
    config,
    mode: 'simulate',
    trace: null,
    coll: null,
    selected: null,
    rail: null,
    view,
    expanded: new Set(sc.open),
    failures: stepFailures(sc, 0).filter((f) => validFailure(config, f)),
  }
}

// The step of the active scenario with steps: its failures replace the failures. The view and the configuration stay.
export function setSimStep(s: AppState, step: number): AppState {
  const a = activeSimStep(s.failures, s.config)
  if (!a || a.step === null || !Number.isInteger(step)) return s
  const n = Math.max(0, Math.min(a.scenario.steps!.length - 1, step))
  if (n === a.step) return s
  return { ...s, failures: stepFailures(a.scenario, n).filter((f) => validFailure(s.config, f)) }
}
