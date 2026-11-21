import { useEffect, useLayoutEffect, useRef } from 'react'
import { validAlgorithms } from '../collectives/algorithms'
import { ALGORITHM_LABEL, COLLECTIVES, COLLECTIVE_LABEL, type Algorithm, type Collective } from '../collectives/schedule'
import { availableScopes, scopeLabel, scopeProblem, type Scope } from '../collectives/scope'
import { channelCount, collSchedule, setColl, setCollPair, setCollStep } from '../state/coll'
import { useLayout } from '../state/layout'
import { PLAY_MS, stopPlay, usePlay, type Speed } from '../state/play'
import { setCollView } from '../state/par'
import { useReader } from '../state/reader'
import { groupLabel } from '../parallel/plan'
import { useApp } from '../state/store'
import { PauseIcon, PlayIcon } from './icons'

// The controls of Collectives mode: the collective, the scope, Back, Play, Next, the speed, and the step.
export function CollBar() {
  const { mode, coll, config, set } = useApp()
  const box = useRef<HTMLDivElement>(null)
  // The bar wraps on a narrow canvas: its height goes to the layout, so the ring and the canvas start below it.
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
  const sc = coll ? collSchedule(config, coll) : null
  const total = sc?.steps.length ?? 0
  const step = coll?.step ?? 0
  const { playing, speed } = usePlay()
  const readerOpen = useReader((r) => r.open)
  // While it plays: one timer for each step; at the last step, or out of the mode, it stops.
  useEffect(() => {
    if (!playing) return
    if (mode !== 'collectives') return // the Play of another mode
    if (total === 0 || step >= total) return stopPlay()
    const t = setTimeout(
      () =>
        set((s) => {
          const next = setCollStep(s, (s.coll?.step ?? 0) + 1)
          if (next === s) stopPlay()
          return next
        }),
      PLAY_MS[speed],
    )
    return () => clearTimeout(t)
  }, [playing, speed, step, total, mode, set]) // not `sc`: collSchedule() gives a new object on each render
  if (mode !== 'collectives' || !coll) return null
  const phase = step === 0 || !sc ? 'start' : sc.steps[step - 1]!.phase
  const move = (k: number) => {
    stopPlay()
    set((s) => setCollStep(s, k))
  }
  return (
    <div className="tracebar rows" data-testid="collbar" ref={box}>
      <div className="tb-row tb-controls">
        <span className="modes" role="group" aria-label="View">
          {(['collective', 'parallelism'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={coll.view === v}
              data-testid={`coll-view-${v}`}
              onClick={() => {
                stopPlay()
                set((s) => setCollView(s, v))
              }}
            >
              {v === 'collective' ? 'Collective' : 'Parallelism'}
            </button>
          ))}
        </span>
        {coll.view === 'parallelism' ? (
          <span className="status-line">Set the plan of the job below; click a GPU to select its group.</span>
        ) : (
        <>
        <span className="group">
          <select
            data-testid="coll-collective"
            aria-label="Collective"
            value={coll.collective}
            onChange={(e) => {
              stopPlay()
              set((s) => setColl(s, { collective: e.target.value as Collective }))
            }}
          >
            {COLLECTIVES.map((c) => (
              <option key={c} value={c}>
                {COLLECTIVE_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            data-testid="coll-algorithm"
            aria-label="Algorithm"
            value={coll.algorithm}
            onChange={(e) => {
              stopPlay()
              set((s) => setColl(s, { algorithm: e.target.value as Algorithm }))
            }}
          >
            {validAlgorithms(coll.collective, coll.scope).map((a) => (
              <option key={a} value={a}>
                {ALGORITHM_LABEL[a]}
              </option>
            ))}
          </select>
          <select
            data-testid="coll-scope"
            aria-label="Scope"
            value={coll.scope}
            onChange={(e) => {
              stopPlay()
              set((s) => setColl(s, { scope: e.target.value as Scope }))
            }}
          >
            {/* The scopes of this configuration; a scope from a link that it does not have shows, disabled. */}
            {[...availableScopes(config), ...(availableScopes(config).includes(coll.scope) ? [] : [coll.scope])].map((x) => (
              <option key={x} value={x} disabled={x !== 'group' && !availableScopes(config).includes(x)}>
                {x === 'group' && coll.group ? groupLabel(coll.group) : scopeLabel(config, x)}
              </option>
            ))}
          </select>
          {channelCount(config, coll) > 1 && (
            <select
              data-testid="coll-channel"
              aria-label="Channel"
              value={String(coll.channel)}
              onChange={(e) => {
                stopPlay()
                set((s) => setColl(s, { channel: e.target.value === 'all' ? 'all' : Number(e.target.value) }))
              }}
            >
              {Array.from({ length: channelCount(config, coll) }, (_, c) => (
                <option key={c} value={c}>
                  Channel {c}
                </option>
              ))}
              <option value="all">All channels</option>
            </select>
          )}
        </span>
        {sc ? (
          <span className="group">
            <button type="button" data-testid="coll-back" disabled={step === 0} onClick={() => move(step - 1)}>
              Back
            </button>
            <span data-testid="coll-step">
              Step {step} of {total} · {phase}
            </span>
            <button type="button" data-testid="coll-next" disabled={step >= total} onClick={() => move(step + 1)}>
              Next
            </button>
            <button
              type="button"
              className="play"
              data-testid="coll-play"
              onClick={() => {
                if (playing) return stopPlay()
                if (step >= total) set((s) => setCollStep(s, 0)) // at the end, Play starts again from the start
                usePlay.setState({ playing: true })
              }}
            >
              {playing ? <PauseIcon /> : <PlayIcon />} {playing ? 'Pause' : 'Play'}
            </button>
            <select data-testid="coll-speed" aria-label="Speed" value={speed} onChange={(e) => usePlay.setState({ speed: e.target.value as Speed })}>
              <option value="fast">Fast</option>
              <option value="normal">Normal</option>
              <option value="slow">Slow</option>
            </select>
            <button type="button" data-testid="coll-reader" aria-pressed={readerOpen} onClick={() => useReader.setState((r) => ({ open: !r.open }))}>
              Read nccl-tests output
            </button>
            {coll.pair !== null && (
              <button type="button" data-testid="coll-buffers" onClick={() => set((s) => setCollPair(s, null))}>
                Show the buffers
              </button>
            )}
          </span>
        ) : (
          <span className="status-line" data-testid="coll-status">
            No ring for this scope: {scopeProblem(config, coll.scope) ?? 'the algorithm does not run on this scope.'}
          </span>
        )}
        </>
        )}
      </div>
    </div>
  )
}
