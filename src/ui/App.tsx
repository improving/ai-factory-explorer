import { useEffect, useMemo, useRef } from 'react'
import { platformFor } from '../catalog/platforms'
import { rackElements } from '../views/rackView'
import { decodeState, encodeState } from '../state/url'
import { stopPlay } from '../state/play'
import { useApp } from '../state/store'
import { setHop, toggleRail, up, type AppState, type ViewState } from '../state/transitions'
import { computeTrace } from '../routing/compute'
import { mergeGraphs } from '../topology/graph'
import { serverOf } from '../topology/ids'
import { traceElements } from '../views/traceView'
import { HopTable } from './HopTable'
import { SEARCH_BOX, Search } from './Search'
import { Minimap } from './Minimap'
import { HELP_DIALOG, HeaderTools } from './HeaderTools'
import { ModeSwitch } from './ModeSwitch'
import { TraceBar } from './TraceBar'
import { impactOf } from '../simulate/impact'
import { ImpactPanel } from './ImpactPanel'
import { SimBar } from './SimBar'
import { ScheduleBar } from './ScheduleBar'
import { SchedulePanel } from './SchedulePanel'
import { LoadPanel } from './LoadPanel'
import { DiagnosePanel } from './DiagnosePanel'
import { planOf } from '../schedule/plan'
import { runLoad } from '../schedule/load'
import { atOf, eventsOf } from '../telemetry/events'
import { replayAt } from '../telemetry/replay'
import { TimeBar } from './TimeBar'
import { incidentOf } from '../diagnose/incidents'
import { chainOf } from '../diagnose/verdict'
import { rackDiff } from '../topology/sources'
import { generateFabric } from '../topology/fabric'
import { computeNumbers } from '../topology/numbers'
import { generateOverview } from '../topology/overview'
import { generateServer } from '../topology/server'
import { fabricElements } from '../views/fabricView'
import { nodeElements } from '../views/nodeView'
import { overviewElements } from '../views/overviewView'
import { AppIcon } from './AppIcon'
import { Breadcrumb } from './Breadcrumb'
import { Canvas } from './Canvas'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { ConfigPanel } from './ConfigPanel'
import { Inspector } from './Inspector'
import { Library } from './Library'
import { generateRackPorts } from '../topology/rackPorts'
import { generateRacks } from '../topology/racks'
import { rackPortsElements, racksElements } from '../views/rackViews'
import { PanelHandle } from './PanelHandle'
import { PortMap } from './PortMap'
import { ZoomBar } from './ZoomBar'
import { ViewTools } from './ViewTools'
import { NumbersBar } from './NumbersBar'
import { OverlayLegend } from './OverlayLegend'
import { TopoMatrix } from './TopoMatrix'
import { portMapRows } from '../topology/rackPorts'
import { useCy } from '../state/cy'
import { useUi } from '../state/ui'
import { useLayout } from '../state/layout'
import { CollBar } from './CollBar'
import { NcclPanel } from './NcclPanel'
import { ParPanel } from './ParPanel'
import { GuideCard } from './GuideCard'
import { useReader } from '../state/reader'
import { LogicalDiagram } from './LogicalDiagram'
import { BufferStrip } from './BufferStrip'
import { collSchedule, parsePair, setCollStep } from '../state/coll'
import { channelsOf } from '../collectives/channels'
import { pairPaths } from '../collectives/load'
import { collElementsOf } from '../views/collView'

export function App() {
  const state = useApp()
  const { config, view, expanded, selected, rail, overlay, trace, failures } = state
  // Collectives mode draws the ring over the view: the schedule, and the path of each ring edge (with the failures).
  const coll = state.coll
  const collOn = state.mode === 'collectives' && coll !== null
  const parView = collOn && coll!.view === 'parallelism'
  const readerOpen = useReader((r) => r.open)
  const sched = useMemo(() => (collOn && !parView ? collSchedule(config, coll!) : null), [collOn, parView, config, coll?.collective, coll?.algorithm, coll?.scope, coll?.channel, coll?.group])
  // The channels that the canvas draws: all channels of the scope, or the one of the schedule.
  const chans = useMemo(() => {
    if (!sched || !coll) return null
    return coll.channel === 'all' ? channelsOf(config, coll.scope, sched, failures) : [{ sc: sched, paths: pairPaths(config, sched, failures) }]
  }, [sched, config, failures, coll?.channel, coll?.scope])
  const picked = coll && coll.pair !== null ? parsePair(coll.pair) : null
  const pairPath = picked ? chans?.[picked.channel]?.paths.get(picked.key) : undefined

  const fabric = useMemo(() => generateFabric(config), [config])
  // The trace of the trace view; its key changes when the path changes, not when the hop changes.
  const traceKey =
    view.level === 'trace' && trace && (trace.dst || trace.path) ? (trace.path ? `path:${trace.path}:${trace.src}` : `${trace.src}>${trace.dst}`) : ''
  const optionsKey = trace ? `${trace.options.pxn}:${trace.options.plane}` : ''
  const traced = useMemo(() => (traceKey && trace ? computeTrace(config, trace, failures) : null), [config, traceKey, optionsKey, failures])
  // The failures of the simulator: the impact, the failed elements, and the elements that they hit.
  const impact = useMemo(() => (failures.length > 0 ? impactOf(config, failures) : null), [config, failures])
  // The job of Schedule mode, and the servers that it places and blocks (the canvas draws them).
  const schedPlan = useMemo(() => (state.mode === 'schedule' && state.load.view === 'decision' ? planOf(config, state.sched) : null), [state.mode, state.load.view, config, state.sched])
  // The load of the fleet: the whole run at once, so the bar and the panel show the same numbers.
  const loadRun = useMemo(() => (state.mode === 'schedule' && state.load.view === 'load' ? runLoad(config, state.load.spec) : null), [state.mode, state.load.view, config, state.load.spec])
  const schedOk = useMemo(() => schedPlan?.chosen ?? EMPTY, [schedPlan])
  const schedBlocked = useMemo(() => schedPlan?.blocked ?? EMPTY, [schedPlan])
  // The incident of the diagnosis, and its chain (the events in time order, and the verdict).
  const chainOn = state.mode === 'simulate' && state.diag.view === 'chain'
  const incident = useMemo(() => (chainOn ? incidentOf(state.diag.incident, config, failures) : null), [chainOn, state.diag.incident, config, failures])
  const chain = useMemo(() => (incident ? chainOf(incident) : null), [incident])
  // The cables of the open rack that differ from the chosen view of the fabric: the design, the intent, or the discovery.
  const rackDiffCables = useMemo(() => {
    if (state.topoSource === 'design' || view.level !== 'rack') return EMPTY
    return rackDiff(config, view.rackId, state.topoSource)
      .rows.filter((r) => r.finding !== 'same' && r.cable !== null)
      .map((r) => r.cable!)
  }, [state.topoSource, view, config])
  const failedIds = useMemo(
    () => (chain ? (chain.verdict.node ? [chain.verdict.node] : []) : [...failures.map((f) => f.id), ...rackDiffCables]),
    [chain, failures, rackDiffCables],
  )
  const hitIds = useMemo(() => {
    if (chain) return chain.subjects.filter((s) => s !== chain.verdict.node)
    if (!impact) return []
    const gpus = [...impact.effects.keys()]
    return [...gpus, ...impact.nodes, ...(impact.affected + impact.degraded > 0 ? ['blk-pods'] : [])]
  }, [chain, impact])
  // The bottom panel of Simulate mode: the impact of the failures, or the chain of the diagnosis.
  const simPanel = state.mode === 'simulate' && (impact !== null || state.diag.view === 'chain')
  // The trace view inspects the parts of the servers of the path (the fabric and overview parts come from those graphs).
  const server = useMemo(() => {
    if (sched) return mergeGraphs(...[...new Set(sched.ranks.map((id) => serverOf(id)!))].map((id) => generateServer(config, id)))
    if (view.level === 'node') return generateServer(config, view.serverId)
    if (!traceKey || !trace) return null
    const parts = traced?.ok ? [traced.trace.hops[0]!.from, ...traced.trace.hops.map((h) => h.to)] : []
    const servers = new Set([trace.src, ...parts.map((p) => p.id)].map((id) => serverOf(id)).filter((x): x is string => x !== null))
    return mergeGraphs(...[...servers].map((id) => generateServer(config, id)))
  }, [config, view, traceKey, traced, sched])
  const numbers = useMemo(() => computeNumbers(fabric, config), [fabric, config])
  // The time view: the log of the fleet, and the state of each host at the cursor (null when the view is off).
  const timeOn = state.time !== null
  const events = useMemo(() => (timeOn ? eventsOf(config) : []), [timeOn, config])
  const at = useMemo(() => (state.time ? replayAt(config, events, atOf(state.time.window, state.time.cursor)) : null), [state.time, config, events])
  const overview = useMemo(() => generateOverview(config, { telemetry: overlay.telemetry || view.level === 'trace' }), [config, overlay.telemetry, view.level])
  // The rack graph does not depend on the face, so a Front or Rear click does not build it again.
  const rackKey = view.level === 'racks' ? `racks:${view.su}` : view.level === 'rack' ? `rack:${view.rackId}` : ''
  const racks = useMemo(() => {
    if (rackKey.startsWith('racks:')) return generateRacks(config, Number(rackKey.slice('racks:'.length)))
    if (rackKey.startsWith('rack:')) return generateRackPorts(config, rackKey.slice('rack:'.length))
    return null
  }, [config, rackKey])
  const isRack = platformFor(config).form === 'nvl72-tray'
  const elements = useMemo(() => {
    if (collOn && sched && chans) return collElementsOf(chans, coll!.step)
    if (view.level === 'trace') return traced?.ok ? traceElements(traced.trace) : []
    if (view.level === 'overview') return overviewElements(overview)
    if (view.level === 'racks' && racks) return racksElements(racks, view.face)
    if (view.level === 'rack' && racks) return rackPortsElements(racks, view.face)
    if (server) return isRack ? rackElements(server) : nodeElements(server)
    return fabricElements(fabric, expanded)
  }, [view, overview, racks, server, fabric, expanded, isRack, traced, collOn, sched, chans, coll?.step])
  // The trace bar takes the top of the canvas in Trace mode, so the view fits again when the mode changes.
  const barHeight = useLayout((l) => l.bar)
  const bar = state.mode !== 'explore' || timeOn ? `+tracebar${barHeight}` : ''
  const topo = !collOn && view.level === 'node' && overlay.topo && platformFor(config).form === 'hgx8' ? '+topo' : ''
  const viewKey =
    (collOn
      ? `coll:${coll!.view}:${config.design}:${config.platform}:${coll!.collective}:${coll!.algorithm}:${coll!.scope}:${coll!.channel}:${sched ? 'ring' : 'none'}${coll!.scope === 'group' && coll!.group ? `:${coll!.group.dim}${coll!.group.index}` : ''}`
      : view.level === 'overview'
      ? (overlay.telemetry ? 'overview-telemetry' : 'overview')
      : view.level === 'trace'
        ? `trace:${traceKey}:${optionsKey}:${traced?.ok ? traced.trace.hops.map((h) => h.to.id).join(',') : 'none'}` // a new configuration can change the path
        : view.level === 'node'
        ? `${config.platform}:${view.serverId}${topo}`
        : view.level === 'racks'
          ? `racks-${config.design}-${view.su}`
          : view.level === 'rack'
            ? `rack-${view.rackId}`
            : `fabric-${config.design}-${config.suCount}`) + bar

  // The history (spec 5.2: Back goes up one level). A new entry only when the user goes deeper (the overview, the
  // fabric, a server or the racks or the trace, a rack). A move up to the level of the entry below (Esc, the
  // breadcrumb) steps back in the history, so no Back press is dead later. All else replaces the entry.
  // A Back or a Forward takes only the navigation of the entry (the view, the selection, the open groups, the
  // rail); the work of the user (the configuration, the mode, the trace, the failures, the overlays) stays.
  const lastView = useRef(view)
  const lastEntry = useRef<HistoryEntry | null>(null) // the entry that shows now: a popstate compares the new entry with it
  const lastGuide = useRef(state.guide) // a guide step opens its full view: no step back in the history
  const selfBack = useRef(false) // a step up of the app (Esc, the breadcrumb): the card keeps its step
  useEffect(() => {
    const url = `#${encodeState(state)}`
    const d = depthOf(state.view)
    const prev = depthOf(lastView.current)
    lastView.current = state.view
    const guideMoved = state.guide !== lastGuide.current // a reference compare: "Show this step again" also counts
    lastGuide.current = state.guide
    const here = entryOf()
    if (d > prev) {
      history.pushState({ app: true, idx: (here?.idx ?? 0) + 1, prevDepth: prev, pushed: true } satisfies HistoryEntry, '', url)
      lastEntry.current = entryOf()
      return
    }
    if (!guideMoved && d < prev && here && here.idx > 0 && here.prevDepth === d) {
      selfBack.current = true
      history.back() // the popstate handler below keeps the work of this level and writes the URL
      return
    }
    if (url !== location.hash || !here) history.replaceState({ app: true, idx: here?.idx ?? 0, prevDepth: here?.prevDepth ?? null, pushed: here?.pushed ?? false } satisfies HistoryEntry, '', url)
    lastEntry.current = entryOf()
  }, [state])

  // The address bar and the Back button change the hash; replaceState above does not fire these events.
  useEffect(() => {
    const onHash = (e: Event) => {
      // A Back or a Forward fires popstate, then hashchange: the popstate does the work. A typed URL or a link
      // has no entry of the app: it gives the full state.
      if (e.type === 'hashchange' && entryOf()) return
      stopPlay() // a trace that a URL opens does not play
      const now = useApp.getState()
      const decoded = decodeState(location.hash)
      // Keep the work only for a step between the levels that the app pushed: a Back from a pushed entry, or a
      // Forward to one. A step to or from a typed URL is a step between pages: the full state of the entry.
      const to = entryOf()
      const from = lastEntry.current
      const level = e.type === 'popstate' && to && from && ((from.pushed && to.idx < from.idx) || (to.pushed && to.idx > from.idx))
      const keepGuide = selfBack.current
      selfBack.current = false
      const next = level ? keepWork(decoded, now, keepGuide) : decoded
      lastEntry.current = to
      lastView.current = next.view // a Back is not a new level: the effect above must not push again
      if (encodeState(next) !== encodeState(now)) now.set(() => next)
    }
    // A Back to an entry that pushState made fires popstate; a hash change fires hashchange (the second one finds no change).
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return // the help dialog takes its own keys (Esc closes it)
      // "/" works also from a select (a scenario list keeps the focus after a pick).
      if (e.key === '/' && e.target instanceof HTMLSelectElement) {
        e.preventDefault()
        document.getElementById(SEARCH_BOX)?.focus()
        return
      }
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return
      const { set } = useApp.getState()
      if (e.key === '/') {
        e.preventDefault() // the key would type "/" into the box
        document.getElementById(SEARCH_BOX)?.focus()
      } else if (e.key === '?') {
        e.preventDefault()
        ;(document.getElementById(HELP_DIALOG) as HTMLDialogElement | null)?.showModal()
      } else if (e.key === 'Escape') set(up)
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const step = e.key === 'ArrowRight' ? 1 : -1
        stopPlay()
        set((s) => (s.mode === 'collectives' && s.coll ? (s.coll.view === 'collective' ? setCollStep(s, s.coll.step + step) : s) : s.view.level === 'trace' && s.trace ? setHop(s, s.trace.hop + step) : s))
      }
      else if ((e.key === '+' || e.key === '=' || e.key === '-') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const cy = useCy.getState().cy
        if (cy) cy.zoom({ level: cy.zoom() * (e.key === '-' ? 1 / 1.25 : 1.25), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
      } else if (/^[0-7]$/.test(e.key)) set((s) => toggleRail(s, Number(e.key)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The bottom panel (the port map, the hop table, the impact panel) and its height; a size change fits the view
  // again in its own effect (fitKey), not with the viewKey, which replaces all elements.
  const bottom = collOn ? sched !== null || parView : view.level === 'rack' || view.level === 'trace' || Boolean(simPanel) || state.mode === 'schedule'
  const panelH = useUi((u) => u.panel) // limited to the height of main - 240 px (the bars and the canvas) where it is used (a stored value can be too large)
  // An empty port map takes one line: no handle, and the canvas, the zoom bar, and the legend end 64 px above the bottom.
  const emptyPorts = useMemo(() => !collOn && view.level === 'rack' && !simPanel && portMapRows(config, view.rackId).length === 0, [collOn, view, simPanel, config])
  // The side panels fold: the configuration on request, the inspector when nothing is selected (unless the user keeps it open).
  // Library mode takes the width of the page: the reader of a document needs it, and the canvas is not there.
  const library = state.mode === 'library'
  const cfgOpen = useUi((u) => u.config) && !library
  const inspKeep = useUi((u) => u.inspector)
  const inspOpen = !library && (inspKeep || selected !== null || collOn || (state.mode === 'simulate' && state.diag.checklist !== null)) // the busbw panel of Collectives mode is in the inspector

  return (
    <div className="app" style={{ '--cfg-w': cfgOpen ? '290px' : '36px', '--insp-w': inspOpen ? '360px' : '36px' } as React.CSSProperties}>
      <a
        className="skip"
        href="#canvas"
        onClick={(e) => {
          e.preventDefault() // the hash is the state of the app
          document.querySelector<HTMLDivElement>('[data-testid="canvas"]')?.focus()
        }}
      >
        Go to the canvas
      </a>
      <a
        className="skip skip-2"
        href="#inspector-panel"
        onClick={(e) => {
          e.preventDefault() // the hash is the state of the app
          useUi.setState({ inspector: true })
          requestAnimationFrame(() => document.getElementById('inspector-panel')?.focus())
        }}
      >
        Go to the inspector
      </a>
      <header>
        <h1>
          <AppIcon /> AI Factory Explorer
        </h1>
        <ModeSwitch />
        <Search />
        {!library && <Breadcrumb />}
        <HeaderTools />
      </header>
      <aside className="config" data-folded={!cfgOpen}>
        {cfgOpen ? (
          <>
            <button type="button" className="fold" aria-label="Hide the configuration" title="Hide the configuration" onClick={() => useUi.setState({ config: false })}>
              <ChevronLeftIcon />
            </button>
            <ConfigPanel />
          </>
        ) : (
          <button type="button" className="fold" aria-label="Show the configuration" title="Show the configuration" onClick={() => useUi.setState({ config: true })}>
            <ChevronRightIcon />
          </button>
        )}
      </aside>
      <main className={library ? 'library-main' : [bottom ? 'with-portmap' : '', topo ? 'with-topo' : '', bar ? 'with-tracebar' : '', collOn && sched ? 'with-ring' : ''].join(' ').trim() || undefined} style={{ '--tracebar-h': `${barHeight}px`, ...(emptyPorts ? { '--panel-h': '64px' } : panelH !== null && (bottom || topo) ? { '--panel-h': `min(${panelH}px, calc(100% - 240px))` } : loadRun ? { '--panel-h': '46%' } : {}) } as React.CSSProperties}>
        {library ? (
          <Library />
        ) : (
          <>
        <Canvas elements={elements} viewKey={viewKey} selected={selected} rail={rail} config={config} overlay={overlay} at={at} hop={!collOn && view.level === 'trace' && trace ? trace.hop : null} failed={failedIds} hits={hitIds} schedOk={schedOk} schedBlocked={schedBlocked} ring={collOn} />
        <ViewTools />
        <Minimap />
        <ZoomBar />
        {(bottom || topo) && !emptyPorts && <PanelHandle />}
        <TraceBar />
        <TimeBar events={events} />
        <SimBar />
        <ScheduleBar run={loadRun} />
        <CollBar />
        <GuideCard />
        <OverlayLegend at={at} />
        {collOn && sched && <LogicalDiagram sc={sched} step={coll!.step} />}
        {!collOn && view.level === 'rack' && !simPanel && <PortMap rackId={view.rackId} />}
        {!collOn && view.level === 'node' && topo && !simPanel && <TopoMatrix serverId={view.serverId} />}
        {!collOn && view.level === 'trace' && traced?.ok && trace && <HopTable trace={traced.trace} hop={trace.hop} />}
        {simPanel && !chainOn && impact && <ImpactPanel impact={impact} />}
        {chainOn && chain && incident && <DiagnosePanel chain={chain} incident={incident} />}
        {state.mode === 'schedule' && schedPlan && <SchedulePanel plan={schedPlan} />}
        {loadRun && <LoadPanel run={loadRun} />}
        {collOn && sched && (readerOpen ? <NcclPanel /> : pairPath?.ok ? <HopTable trace={pairPath.trace} hop={-1} /> : <BufferStrip sc={sched} step={coll!.step} />)}
        {parView && <ParPanel />}
          </>
        )}
      </main>
      <aside className="inspector" id="inspector-panel" tabIndex={-1} data-folded={!inspOpen}>
        {inspOpen ? (
          <>
            {selected === null && !collOn && (
              <button type="button" className="fold" aria-label="Hide the inspector" title="Hide the inspector" onClick={() => useUi.setState({ inspector: false })}>
                <ChevronRightIcon />
              </button>
            )}
            <Inspector fabric={fabric} server={server} overview={overview} racks={racks} events={events} at={at} />
          </>
        ) : (
          <button type="button" className="fold" aria-label="Show the inspector" title="Show the inspector" onClick={() => useUi.setState({ inspector: true })}>
            <ChevronLeftIcon />
          </button>
        )}
      </aside>
      {!library && (
        <footer>
          <NumbersBar numbers={numbers} />
        </footer>
      )}
    </div>
  )
}

const EMPTY: string[] = []

// The depth of a view, for the history: a deeper view gets a new entry.
function depthOf(v: ViewState): number {
  return v.level === 'overview' ? 0 : v.level === 'fabric' ? 1 : v.level === 'rack' ? 3 : 2
}

// The state of a history entry that the app made: the number of app entries below it, and the depth of the entry
// just below it. A typed or a pasted URL has no such state.
type HistoryEntry = { app: true; idx: number; prevDepth: number | null; pushed: boolean }
function entryOf(): HistoryEntry | null {
  const s = history.state as HistoryEntry | null
  return s && s.app === true ? s : null
}

// The navigation of an entry with the work of now (the configuration, the mode, the trace, the failures, the
// overlays). The URL round trip checks the result (a server that the configuration does not have goes).
// The guide: a step up of the app keeps the step of now. The browser Back and Forward take the step of the entry,
// but only in the same guide: a closed guide, or another guide, stays as it is now.
function keepWork(entry: AppState, now: AppState, keepGuide = false): AppState {
  const guide = keepGuide ? now.guide : entry.guide?.id === now.guide?.id ? entry.guide : now.guide
  return decodeState(`#${encodeState({ ...now, view: entry.view, selected: entry.selected, expanded: entry.expanded, rail: entry.rail, guide })}`)
}
