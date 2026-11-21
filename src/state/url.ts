import { DEFAULT_CONFIG, KEYS, choicesFor, type Config } from '../config/config'
import { INITIAL, fail, openChecklist, openDoc, openOverview, openRack, openRacks, openServer, openSu, openTrace, select, setColor, setDiagView, setFace, setHop, setIncident, setLoadCursor, setLoadSpec, setMode, setTime, setTimeCursor, setSched, setSchedView, setTelemetry, setTopo, setTab, setTopoSource, setTrace, toggleLayer, toggleRail, toggleStep, withConfig, DEFAULT_DIAG, DEFAULT_LOAD_STATE, type AppState } from './transitions'
import { DEFAULT_LOAD } from '../schedule/load'
import { WINDOW_MIN, type WindowId } from '../telemetry/events'
import { DEFAULT_JOB, QUEUE_BY_ID, type Gang, type Level, type Priority, type QueueId } from '../schedule/plan'
import { COLOR_OVERLAYS, LAYERS } from '../views/overlays'
import { PATH_IDS } from '../routing/factory'
import type { FailMode } from '../catalog/failures'
import type { RunbookId } from '../catalog/runbooks'
import type { SourceId } from '../topology/sources'
import type { TabId } from './tabs'
import { decodeColl, decodePar, encodeColl, encodePar } from './coll'
import { GUIDES } from '../guides/guides'
import { docById } from '../docs/content'

const param = (key: keyof Config) => (key === 'suCount' ? 'su' : key)

// Only the keys that differ from the defaults, so a link stays short and an old link still opens.
export function encodeState(s: AppState): string {
  const p = new URLSearchParams()
  for (const key of KEYS) if (s.config[key] !== DEFAULT_CONFIG[key]) p.set(param(key), String(s.config[key]))
  if (s.expanded.size > 0) p.set('open', [...s.expanded].sort((a, b) => a - b).join(','))
  if (s.view.level === 'overview') p.set('view', 'overview')
  if (s.view.level === 'racks' || s.view.level === 'rack') {
    p.set('racks', String(s.view.su))
    p.set('face', s.view.face)
  }
  if (s.view.level === 'rack') p.set('rack', s.view.rackId)
  if (s.view.level === 'node') p.set('server', s.view.serverId)
  if (s.selected !== null) p.set('sel', s.selected)
  if (s.rail !== null) p.set('rail', String(s.rail))
  if (s.overlay.color !== 'none') p.set('color', s.overlay.color)
  if (s.overlay.hidden.length > 0) p.set('hide', s.overlay.hidden.join(','))
  if (s.overlay.telemetry) p.set('telemetry', '1')
  if (s.overlay.topo) p.set('topo', '1')
  if (s.failures.length > 0) p.set('fail', s.failures.map((f) => `${f.id}:${f.mode}`).join(','))
  if (s.mode !== 'explore') p.set('mode', s.mode)
  if (s.doc !== null) p.set('doc', s.doc)
  if (s.sec !== null) p.set('sec', s.sec)
  if (s.mode === 'schedule' || s.sched !== DEFAULT_JOB) p.set('sc', [s.sched.queue, s.sched.gpus, s.sched.priority, s.sched.gang, s.sched.required, s.sched.preferred, s.sched.segments].join('.'))
  if (s.load.view === 'load') {
    p.set('sv', 'load')
    const { seed, nodes, perMinute } = s.load.spec
    if (seed !== DEFAULT_LOAD.seed || nodes !== DEFAULT_LOAD.nodes || perMinute !== DEFAULT_LOAD.perMinute) p.set('ld', `${seed}.${nodes}.${perMinute}`)
    if (s.load.cursor > 0) p.set('lt', String(s.load.cursor))
  }
  if (s.time) {
    p.set('tw', s.time.window)
    if (s.time.cursor < WINDOW_MIN[s.time.window]) p.set('t', String(s.time.cursor))
  }
  if (s.topoSource !== 'design') p.set('tsrc', s.topoSource)
  if (s.tab !== 'specs') p.set('itab', s.tab)
  if (s.diag.view !== DEFAULT_DIAG.view) p.set('dv', s.diag.view)
  if (s.diag.incident !== DEFAULT_DIAG.incident) p.set('inc', s.diag.incident)
  if (s.diag.checklist !== null) p.set('ck', s.diag.checklist)
  if (s.diag.done.length > 0) p.set('cd', [...s.diag.done].sort().join(','))
  if (s.coll) p.set('coll', encodeColl(s.coll))
  if (s.coll?.view === 'parallelism') p.set('cview', 'par')
  if (s.coll && (s.coll.view === 'parallelism' || s.coll.scope === 'group')) p.set('par', encodePar(s.coll.par))
  if (s.trace) {
    p.set('trace', s.trace.dst === null ? s.trace.src : `${s.trace.src},${s.trace.dst}`)
    if (!s.trace.options.pxn) p.set('pxn', '0')
    if (s.trace.options.plane === 1) p.set('plane', 'b')
    if (s.trace.hop > 0) p.set('hop', String(s.trace.hop))
    if (s.trace.path) p.set('path', s.trace.path)
  }
  if (s.view.level === 'trace') p.set('view', 'trace')
  if (s.guide) p.set('guide', `${s.guide.id}.${s.guide.step}`)
  return p.toString()
}

// Each value goes through the same transitions as a click, so a bad value is dropped, not trusted.
// The order matters: the configuration first (in KEYS order), then what is open, then the view and the selection.
export function decodeState(hash: string): AppState {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  let s = INITIAL
  for (const key of KEYS) {
    const raw = p.get(param(key))
    const choice = choicesFor(s.config, key).find((c) => String(c.value) === raw)
    if (choice) s = withConfig(s, { [key]: choice.value } as Partial<Config>)
  }
  for (const part of (p.get('open') ?? '').split(',')) {
    const su = Number(part)
    if (part !== '' && Number.isInteger(su)) s = openSu(s, su)
  }
  const color = COLOR_OVERLAYS.find((c) => c.id === p.get('color'))
  if (color) s = setColor(s, color.id)
  for (const part of (p.get('hide') ?? '').split(',')) {
    const layer = LAYERS.find((l) => l.id === part)
    if (layer) s = toggleLayer(s, layer.id)
  }
  if (p.get('telemetry') === '1') s = setTelemetry(s, true)
  if (p.get('topo') === '1') s = setTopo(s, true)
  const ends = (p.get('trace') ?? '').split(',').filter((x) => x !== '')
  if (p.get('mode') === 'simulate') s = setMode(s, 'simulate')
  if (p.get('mode') === 'schedule') s = setMode(s, 'schedule')
  const sc = (p.get('sc') ?? '').split('.')
  if (sc.length === 7) {
    const [queue, gpus, priority, gang, required, preferred, segments] = sc
    const levels: Level[] = ['any', 'su', 'rack', 'node']
    s = setSched(s, {
      ...(QUEUE_BY_ID.has(queue as QueueId) ? { queue: queue as QueueId } : {}),
      ...(Number(gpus) > 0 ? { gpus: Number(gpus) } : {}),
      ...(priority === 'train' || priority === 'build' ? { priority: priority as Priority } : {}),
      ...(gang === 'all' || gang === 'half' ? { gang: gang as Gang } : {}),
      ...(levels.includes(required as Level) ? { required: required as Level } : {}),
      ...(levels.includes(preferred as Level) ? { preferred: preferred as Level } : {}),
      ...(Number(segments) > 0 ? { segments: Number(segments) } : {}),
    })
    if (s.mode !== 'schedule') s = setMode(s, 'schedule')
  }
  if (p.get('sv') === 'load') {
    s = setSchedView(s, 'load')
    if (s.mode !== 'schedule') s = setMode(s, 'schedule')
    const ld = (p.get('ld') ?? '').split('.')
    if (ld.length === 3) s = setLoadSpec(s, { seed: Number(ld[0]), nodes: Number(ld[1]), perMinute: Number(ld[2]) })
    const lt = p.get('lt')
    if (lt !== null && lt !== '') s = setLoadCursor(s, Number(lt))
  }
  if (p.get('mode') === 'trace' || ends.length > 0) s = setMode(s, 'trace')
  if (p.get('mode') === 'collectives' && ends.length === 0) s = decodeColl(decodePar(setMode(s, 'collectives'), p.get('par'), p.get('cview') === 'par'), p.get('coll'))
  for (const part of (p.get('fail') ?? '').split(',')) {
    const i = part.lastIndexOf(':')
    if (i > 0) s = fail(s, part.slice(0, i), part.slice(i + 1) as FailMode)
  }
  const tw = p.get('tw')
  if (tw === '24h' || tw === '7d') {
    s = setTime(s, { window: tw as WindowId, cursor: WINDOW_MIN[tw as WindowId] })
    const t = p.get('t')
    if (t !== null && t !== '') s = setTimeCursor(s, Number(t))
  }
  const itab = p.get('itab')
  if (itab) s = setTab(s, itab as TabId)
  const tsrc = p.get('tsrc')
  if (tsrc) s = setTopoSource(s, tsrc as SourceId)
  // The diagnosis: the panel, the incident, the checklist, and the steps that a link marks as done (no clock).
  if (p.get('dv') === 'chain') s = setDiagView(s, 'chain')
  const inc = p.get('inc')
  if (inc) s = setIncident(s, inc)
  const ck = p.get('ck')
  if (ck) s = openChecklist(s, ck as RunbookId)
  for (const part of (p.get('cd') ?? '').split(',')) {
    const m = /^(RB-\d\d)\.(\d+)$/.exec(part)
    if (m) s = toggleStep(s, m[1] as RunbookId, Number(m[2]), null)
  }
  const path = PATH_IDS.find((x) => x === p.get('path')) ?? null
  if (ends.length > 0) s = setTrace(s, ends[0]!, path ? null : (ends[1] ?? null), { pxn: p.get('pxn') !== '0', plane: p.get('plane') === 'b' ? 1 : 0 }, path)
  const server = p.get('server')
  if (server) s = openServer(s, server)
  else if (p.get('view') === 'overview') s = openOverview(s)
  else if (p.get('view') === 'trace') s = openTrace(s)
  else if (Number(p.get('racks')) > 0) {
    s = openRacks(s, Number(p.get('racks')))
    const rack = p.get('rack')
    if (rack) s = openRack(s, rack)
    const face = p.get('face')
    if (face === 'front' || face === 'rear') s = setFace(s, face)
  }
  const hop = Number(p.get('hop'))
  if (hop > 0) s = setHop(s, hop)
  const sel = p.get('sel')
  if (sel) s = select(s, sel)
  const rail = p.get('rail')
  if (rail !== null && rail !== '') s = toggleRail(s, Number(rail))
  // The Library: a mode, a document, and a section. A document that the portal does not carry is
  // dropped, so a stale link opens the list.
  if (p.get('mode') === 'library') {
    s = setMode(s, 'library')
    const doc = p.get('doc')
    if (doc && docById(doc)) s = openDoc(s, doc, p.get('sec'))
  }
  // The guide: an id and a step that exist; the view comes from the other parameters.
  const g = /^([a-z]+)\.(\d+)$/.exec(p.get('guide') ?? '')
  const steps = g ? GUIDES.find((x) => x.id === g[1])?.steps.length : undefined
  if (g && steps && Number(g[2]) >= 1 && Number(g[2]) <= steps) s = { ...s, guide: { id: g[1]!, step: Number(g[2]) } }
  return s
}
