import { useEffect, useLayoutEffect, useRef } from 'react'
import { SCENARIOS } from '../routing/scenarios'
import { useLayout } from '../state/layout'
import { PLAY_MS, stopPlay, usePlay, type Speed } from '../state/play'
import { computeTrace } from '../routing/compute'
import type { PathId } from '../routing/factory'
import { useApp } from '../state/store'
import { activeScenario, applyScenario, clearTrace, openTrace, setHop, setPath, setTraceOptions } from '../state/transitions'
import { TracePicker } from './TracePicker'
import { PauseIcon, PlayIcon } from './icons'
import { designOf } from '../topology/fabric'

// The factory paths that go through the server of the source GPU (its NIC, its BMC, its exporter, its Fabric Manager).
const SERVER_PATHS: PathId[] = ['storage', 'operator-bmc', 'break-glass', 'telemetry-itsm', 'telemetry-siem', 'control-nvlink']

// The controls of Trace mode: a scenario, the GPUs that the user picked, PXN, the plane, Next and Back, and Play.
export function TraceBar() {
  const { mode, trace, config, view, failures, set } = useApp()
  const box = useRef<HTMLDivElement>(null)
  // The bar wraps on a narrow canvas: its height goes to the layout, so the canvas starts below it.
  useLayoutEffect(() => {
    const el = box.current
    const setBar = useLayout.getState().setBar
    if (!el) return
    const measure = () => setBar(Math.ceil(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
      setBar(0)
    }
  }, [mode])
  const result = trace ? computeTrace(config, trace, failures) : null
  const hops = result?.ok ? result.trace.hops.length : 0
  const { playing, speed } = usePlay()
  const hop = trace?.hop ?? 0
  const active = mode === 'trace' && view.level === 'trace' && hops > 0
  // While it plays: one timer for each hop; on the last hop, or out of the trace view, it stops.
  useEffect(() => {
    if (!playing) return
    if (mode !== 'trace') return // the Play of another mode (ModeSwitch stops Play when the mode changes)
    if (!active || hop >= hops - 1) return stopPlay()
    const t = setTimeout(
      () =>
        set((s) => {
          const next = setHop(s, (s.trace?.hop ?? 0) + 1)
          if (next === s) stopPlay() // no next hop: stop, so the button does not stay on Pause
          return next
        }),
      PLAY_MS[speed],
    )
    return () => clearTimeout(t)
  }, [playing, speed, hop, hops, active, mode, set])
  if (mode !== 'trace') return null
  const status = !trace
    ? 'Click a source GPU in a node view, select one here, or select a scenario.'
    : !result
      ? `Source: ${trace.src}. Click a destination GPU, or trace its storage path.`
      : !result.ok
        ? result.reason
        : trace.path
          ? `${result.trace.title}${SERVER_PATHS.includes(trace.path) ? ` (from ${trace.src.split('/')[0]})` : ''}`
          : `${trace.src} → ${trace.dst}: ${result.trace.title}`
  return (
    <div className="tracebar rows" data-testid="tracebar" ref={box}>
      {/* Row 1: the scenario and the status. Row 2: the controls, in fixed groups. */}
      <div className="tb-row">
        <select
          data-testid="trace-scenario"
          value={activeScenario(trace, config)?.id ?? ''}
          onChange={(e) => {
            const id = e.target.value
            if (!id) return
            set((s) => applyScenario(s, id))
            usePlay.setState({ playing: true }) // a scenario plays at once
          }}
        >
          <option value="">Scenario…</option>
          {(['gpu', 'factory'] as const).map((group) => (
            <optgroup key={group} label={group === 'gpu' ? 'GPU to GPU' : 'Factory paths'}>
              {SCENARIOS.filter((sc) => sc.group === group).map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="status-line" data-testid="trace-status" aria-live="polite" title={status}>
          {status}
        </span>
      </div>
      <div className="tb-row tb-controls">
        {(!trace || (trace.dst === null && trace.path === null)) && <TracePicker />}
        <span className="group">
          {view.level === 'trace' && trace && hops > 0 && (
            <>
              <button
                type="button"
                data-testid="trace-back"
                disabled={trace.hop === 0}
                onClick={() => {
                  stopPlay()
                  set((s) => setHop(s, (s.trace?.hop ?? 0) - 1))
                }}
              >
                Back
              </button>
              <span data-testid="trace-hop">
                Hop {trace.hop + 1} of {hops}
              </span>
              <button
                type="button"
                data-testid="trace-next"
                disabled={trace.hop >= hops - 1}
                onClick={() => {
                  stopPlay()
                  set((s) => setHop(s, (s.trace?.hop ?? 0) + 1))
                }}
              >
                Next
              </button>
              <button
                type="button"
                className="play"
                data-testid="trace-play"
                onClick={() => {
                  if (playing) return stopPlay()
                  if (trace.hop >= hops - 1) set((s) => setHop(s, 0)) // at the end, Play starts again from hop 1
                  usePlay.setState({ playing: true })
                }}
              >
                {playing ? <PauseIcon /> : <PlayIcon />} {playing ? 'Pause' : 'Play'}
              </button>
              <select data-testid="trace-speed" aria-label="Speed" value={speed} onChange={(e) => usePlay.setState({ speed: e.target.value as Speed })}>
                <option value="fast">Fast</option>
                <option value="normal">Normal</option>
                <option value="slow">Slow</option>
              </select>
            </>
          )}
        </span>
        <span className="group">
          {!trace?.path && (
            <>
              <label>
                <input type="checkbox" data-testid="trace-pxn" checked={trace?.options.pxn ?? true} disabled={!trace} onChange={(e) => set((s) => setTraceOptions(s, { pxn: e.target.checked }))} /> PXN
              </label>
              {designOf(config).planes === 'dual' && (
                <select
                  data-testid="trace-plane"
                  value={trace?.options.plane ?? 0}
                  disabled={!trace}
                  onChange={(e) =>
                    set((s) =>
                      setTraceOptions(s, {
                        plane: e.target.value === '1' ? 1 : 0,
                      }),
                    )
                  }
                >
                  <option value={0}>Plane A</option>
                  <option value={1}>Plane B</option>
                </select>
              )}
            </>
          )}
        </span>
        <span className="group">
          {trace && trace.dst === null && trace.path === null && (
            <button type="button" data-testid="trace-to-vast" onClick={() => set((s) => setPath(s, 'storage'))}>
              To VAST
            </button>
          )}
          {view.level !== 'trace' && (trace?.dst || trace?.path) && (
            <button type="button" data-testid="trace-show" onClick={() => set(openTrace)}>
              Show the path
            </button>
          )}
          {trace && (
            <button
              type="button"
              data-testid="trace-clear"
              onClick={() => {
                stopPlay()
                set(clearTrace)
              }}
            >
              Clear
            </button>
          )}
        </span>
      </div>
    </div>
  )
}
